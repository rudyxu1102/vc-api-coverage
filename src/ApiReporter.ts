import type { Reporter } from 'vitest/reporters'
import type { TestModule } from 'vitest/node'
import path from 'path';
import open from 'open';
import _ from 'lodash';
import ComponentAnalyzer from './analyzer/ComponentAnalyzer';
import { generateCliReport } from './reporter/CliReporter';
import { HTMLReporter } from './reporter/HtmlReporter';
import { JSONReporter } from './reporter/JsonReporter';
import { VcCoverageOptions, ReportFormat } from './types';
import type { VcCoverageData, VcData } from './types';
import TestUnitAnalyzer from './analyzer/UnitTestAnalyzer';
import { Project, ts } from 'ts-morph';

export default class VcCoverageReporter implements Reporter {
  private options: VcCoverageOptions;
  private htmlReporter: HTMLReporter;
  private jsonReporter: JSONReporter;
  private coverageData: Array<VcCoverageData> = [];
  private unitData: Record<string, VcData> = {};
  private compData: Record<string, VcData> = {};
  private project: Project;
  private onFinishedCallback?: (data: VcCoverageData[]) => void;


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
    if (options.onFinished) {
      this.onFinishedCallback = options.onFinished 
    }
  }

  onTestModuleEnd(testModule: TestModule) {

    const sourceFile = this.project.addSourceFileAtPath(testModule.moduleId)

    const res = new TestUnitAnalyzer(sourceFile, this.project).analyze()
    if (!res) {
      console.warn(`[vc-api-coverage] Warning: No test unit data found for ${testModule.moduleId}`);
      return;
    }
    for (const fullPath in res) {
      let info: VcData = {
        props: [],
        slots: [],
        exposes: [],
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
      // 分析组件API
      const analyzer = new ComponentAnalyzer(sourceFile)
      const { props, slots, exposes } = analyzer.analyze()
      this.compData[path] = {
        props: Array.from(props),
        slots: Array.from(slots),
        exposes: Array.from(exposes),
      }
    }
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
        total: 0,
        covered: 0,
        props: {
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
      
      info.props.total += comp.props.length
      info.slots.total += comp.slots.length
      info.exposes.total += comp.exposes.length
      info.props.details = comp.props.map(p => ({ name: p, covered: unit.props.includes(p) }))
      info.slots.details = comp.slots.length > 0 ? comp.slots.map(s => ({ name: s, covered: unit.slots.includes(s) })) : unit.slots.map(s => ({ name: s, covered: true }))
      info.exposes.details = comp.exposes.map(e => ({ name: e, covered: unit.exposes.includes(e) }))
      info.props.covered = info.props.details.filter(d => d.covered).length
      info.slots.covered = info.slots.details.filter(d => d.covered).length
      info.exposes.covered = info.exposes.details.filter(d => d.covered).length
      info.total = info.props.total + info.slots.total + info.exposes.total
      info.covered = info.props.covered + info.slots.covered + info.exposes.covered
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
    this.onFinishedCallback?.(this.coverageData)
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
