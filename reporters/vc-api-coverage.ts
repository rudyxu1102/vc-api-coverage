import type { Reporter } from 'vitest/reporters'
import type { TestModule } from 'vitest/node'
import path from 'path';
import open from 'open';
import _ from 'lodash';
import ComponentAnalyzer from '../lib/analyzer/component-analyzer';
import { generateCliReport } from '../lib/reporter/cli-reporter';
import { HTMLReporter } from '../lib/reporter/html-reporter';
import { JSONReporter } from '../lib/reporter/json-reporter';
import { VcCoverageOptions, ReportFormat } from '../lib/types';
import type { VcCoverageData, VcData } from '../lib/types';
import TestUnitAnalyzer from '../lib/analyzer/test-units-analyzer';
import { Project, ts } from 'ts-morph';

export default class VcCoverageReporter implements Reporter {
  private options: VcCoverageOptions;
  private htmlReporter: HTMLReporter;
  private jsonReporter: JSONReporter;
  private coverageData: Array<VcCoverageData> = [];
  private unitData: Record<string, VcData> = {};
  private compData: Record<string, VcData> = {};
  private project: Project;

  constructor(options: VcCoverageOptions = {}) {
    this.options = {
      format: ['cli', 'html', 'json'],
      outputDir: 'coverage',
      openBrowser: false,
      ...options
    };

    this.htmlReporter = new HTMLReporter(this.options.outputDir);
    this.jsonReporter = new JSONReporter(this.options.outputDir);
    this.project = new Project({
      compilerOptions: {
        target: ts.ScriptTarget.ESNext, 
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.Preserve,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
      },
    });
  }

  onTestModuleEnd(testModule: TestModule) {

    const sourceFile = this.project.addSourceFileAtPath(testModule.moduleId)

    const res = new TestUnitAnalyzer(sourceFile, this.project).analyze()
    for (const fullPath in res) {
      let info: VcData = {
        props: [],
        emits: [],
        slots: [],
        exposes: []
      }
      if (this.unitData[fullPath]) {
        info = this.unitData[fullPath]
      } 
      this.unitData[fullPath] = _.mergeWith({}, info, res[fullPath], (objValue: unknown, srcValue: unknown) => {
        if (Array.isArray(objValue) && Array.isArray(srcValue)) {
          return Array.from(new Set([...objValue, ...srcValue]));
        }
        return objValue || srcValue;
      })
    }
  }

  analyzerComponent() {
    for (const path in this.unitData) {
      let sourceFile = this.project.addSourceFileAtPath(path)
      if (path.endsWith('.vue')) {
        const sourceCode = sourceFile.getText()
        const scriptContent = sourceCode.match(/<script>([\s\S]*?)<\/script>/)?.[1]
        if (scriptContent) {
          sourceFile = this.project.createSourceFile(path, scriptContent, { overwrite: true })
        }
      }
      // 分析组件API
      const analyzer = new ComponentAnalyzer(sourceFile)
      const { props, slots, exposes, emits } = analyzer.analyze()
      this.compData[path] = {
        props: Array.from(props),
        emits: Array.from(emits),
        slots: Array.from(slots),
        exposes: Array.from(exposes)
      }
    }
  }

  // 有一些prop命名为onXxx，但是需要从emits中移除
  dealPropsEmits(compData: VcData, unitData: VcData) {
    const propsDetails = []
    const emitsDetails = []
    // 处理测试中的emits
    for (const emit of unitData.emits) {
      if (compData.props.includes(emit)) {
        // 如果emit名在组件prop定义中存在，则视为prop使用
        propsDetails.push(emit)
      } else if (compData.emits.includes(emit)) {
        // 否则如果在组件emit定义中存在，则视为emit使用
        emitsDetails.push(emit)
      }
    }
    
    // 处理测试中的props
    for (const prop of unitData.props) {
      // 防止重复添加，只有当prop不是emit且是组件中定义的prop时才添加
      if (!propsDetails.includes(prop) && compData.props.includes(prop)) {
        propsDetails.push(prop)
      }
    }

    return { propsDetails, emitsDetails }
  }

  mergeData(unitData: Record<string, VcData>, compData: Record<string, VcData>): VcCoverageData[] {
    const res: VcCoverageData[] = [] 
    
    // 使用处理后的数据
    for (const path in unitData) {
      // 如果compData中不存在该路径的组件数据，跳过该路径
      if (!compData[path]) {
        console.warn(`[vc-api-coverage] Warning: No component data found for ${path}`);
        continue;
      }
      
      const info: VcCoverageData = {
        name: '',
        file: '',
        props: {
          total: 0,
          covered: 0,
          details: []
        },
        emits: {
          total: 0,
          covered: 0,
          details: []
        },
        slots: {
          total: 0,
          covered: 0,
          details: []
        },
        exposes: {
          total: 0,
          covered: 0,
          details: []
        }
      }
      const unit = unitData[path]
      const comp = compData[path]
      info.name = path.split('/').slice(-2).join('/') || ''
      info.file = path
      
      const { propsDetails, emitsDetails } = this.dealPropsEmits(comp, unit)
      
      info.props.total += comp.props.length
      info.props.covered += propsDetails.length
      info.emits.total += comp.emits.length
      info.emits.covered += emitsDetails.length
      info.slots.total += comp.slots.length
      info.slots.covered += unit.slots.length
      info.exposes.total += comp.exposes.length
      info.exposes.covered += unit.exposes.filter(e => comp.exposes.includes(e)).length
      info.props.details = comp.props.map(p => ({ name: p, covered: propsDetails.includes(p) }))
      info.emits.details = comp.emits.map(e => ({ name: e, covered: emitsDetails.includes(e) }))
      info.slots.details = comp.slots.map(s => ({ name: s, covered: unit.slots.includes(s) }))
      info.exposes.details = comp.exposes.map(e => ({ name: e, covered: unit.exposes.includes(e) }))
      res.push(info)
    }
    
    res.sort((a, b) => a.name.localeCompare(b.name))
    return res
  }

  onCoverage(coverage: unknown) {
    this.analyzerComponent()
    this.coverageData = this.mergeData(this.unitData, this.compData)
    this.analyzeFromCoverage(coverage)
    this.genReport()
  }

  checkFromCoverage(coverage: any, name: string) {
    const info = coverage.fnMap
    for (const key in info) {
      if (info[key].name === name) {
        return coverage.f[key] > 0
      }
    }
    return false
  }

  analyzeFromCoverage(coverage: unknown) {
    const data = (coverage as any).data
    for (const item of this.coverageData) {
      const coverage = data[item.file]
      for (const method of item.exposes.details) {
        if (this.checkFromCoverage(coverage, method.name) && !method.covered) {
          method.covered = true
          item.exposes.covered += 1
        }
      }
    }
  }

  async genReport(): Promise<void> {
    const format = this.options.format || [];
    const shouldGenerateFormat = (f: ReportFormat) => format.includes(f);

    if (shouldGenerateFormat('cli')) {
      // 计算总体覆盖率
      const report = generateCliReport(this.coverageData);
      
      console.log('\n' + report);
    }

    if (shouldGenerateFormat('html')) {
      this.htmlReporter.setCoverageData(this.coverageData);
      await this.htmlReporter.generateReport();
      if (this.options.openBrowser) {
        const htmlPath = path.join(process.cwd(), this.options.outputDir || 'coverage-api', 'index.html');
        await open(htmlPath);
      }
    }

    if (shouldGenerateFormat('json')) {
      this.jsonReporter.setCoverageData(this.coverageData);
      await this.jsonReporter.generateReport();
    }

    console.log('[vc-api-coverage] Report generation finished.');
  }

}
