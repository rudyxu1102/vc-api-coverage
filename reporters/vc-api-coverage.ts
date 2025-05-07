import type { Reporter } from 'vitest/reporters'
import type { TestModule, Vitest } from 'vitest/node'
import path from 'path';
import open from 'open';
import _ from 'lodash';
import { analyzeProps } from '../lib/analyzer/props-analyzer';
import { analyzeEmits } from '../lib/analyzer/emits-analyzer';
import { analyzeSlots } from '../lib/analyzer/slots-analyzer';
import { analyzeExpose } from '../lib/analyzer/expose-analyzer';
import { generateCliReport } from '../lib/reporter/cli-reporter';
import { HTMLReporter } from '../lib/reporter/html-reporter';
import { JSONReporter } from '../lib/reporter/json-reporter';
import { VcCoverageOptions, ReportFormat } from '../lib/types';
import { parseComponent } from '../lib/common/shared-parser';
import type { VcCoverageData, VcData } from '../lib/types';
import { analyzeTestUnits } from '../lib/analyzer/test-units-analyzer';
import { ViteDevServer } from 'vite';
import type { SourceMap } from 'rollup';
import { toEventName } from '../lib/common/utils';

export default class VcCoverageReporter implements Reporter {
  private ctx!: Vitest;
  private options: VcCoverageOptions;
  private htmlReporter: HTMLReporter;
  private jsonReporter: JSONReporter;
  private coverageData: Array<VcCoverageData> = [];
  private unitData: Record<string, VcData> = {};
  private compData: Record<string, VcData> = {};

  constructor(options: VcCoverageOptions = {}) {
    this.options = {
      format: ['cli', 'html', 'json'],
      outputDir: 'coverage',
      openBrowser: false,
      ...options
    };

    this.htmlReporter = new HTMLReporter(this.options.outputDir);
    this.jsonReporter = new JSONReporter(this.options.outputDir);
  }

  onInit(ctx: Vitest): void {
    this.ctx = ctx;
    console.log('\n[vc-api-coverage] Initialized.');
  }

  onTestModuleEnd(testModule: TestModule) {
    const vitenode = testModule.project.vite
    const cache = vitenode.moduleGraph.getModuleById(testModule.moduleId)
    const code = cache?.transformResult?.code || ''
    const res = analyzeTestUnits(code, vitenode as unknown as ViteDevServer)
    const rootDir = this.ctx.config.root
    for (const path in res) {
      const fullPath = `${rootDir}${path}`
      let info: VcData = {
        props: [],
        emits: [],
        slots: [],
        exposes: []
      }
      if (this.unitData[fullPath]) {
        info = this.unitData[fullPath]
      } 
      this.unitData[fullPath] = _.mergeWith({}, info, res[path], (objValue: unknown, srcValue: unknown) => {
        if (Array.isArray(objValue) && Array.isArray(srcValue)) {
          return Array.from(new Set([...objValue, ...srcValue]));
        }
        return objValue || srcValue;
      })
    }
  }

  analyzerComponent() {
    for (const path in this.unitData) {
      const module = this.ctx.vite.moduleGraph.getModuleById(path);
      const code = (module?.transformResult?.map as SourceMap).sourcesContent[0] || '';
      const parsedContent = parseComponent(code);
        
      // 分析组件API
      const props = analyzeProps(code, parsedContent.ast, path);  // 传入文件路径
      const emits = analyzeEmits(code, parsedContent.ast, path).map(e => toEventName(e));
      const slots = analyzeSlots(code, parsedContent, path);
      const exposes = analyzeExpose(code, parsedContent.ast, path)
      this.compData[path] = {
        props,
        emits,
        slots,
        exposes
      }
    }
  }

  // 有一些prop命名为onXxx，但是需要从emits中移除
  dealPropsEmits(compData: VcData, unitData: VcData) {
    const propsDetails = [...unitData.props]
    const emitsDetails = []
    for (const emit of unitData.emits) {
      if (compData.props.includes(emit)) {
        propsDetails.push(emit)
      } else {
        emitsDetails.push(emit)
      }
    }
    return { propsDetails, emitsDetails }
  }

  mergeData(unitData: Record<string, VcData>, compData: Record<string, VcData>): VcCoverageData[] {
    const res: VcCoverageData[] = [] 
    for (const path in unitData) {
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
