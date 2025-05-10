import type { Reporter } from 'vitest/reporters'
import type { TestModule, Vitest } from 'vitest/node'
import path from 'path';
import open from 'open';
import _ from 'lodash';
import PropsAnalyzer from '../lib/analyzer/props-analyzer';
import EmitsAnalyzer from '../lib/analyzer/emits-analyzer';
import SlotsAnalyzer from '../lib/analyzer/slots-analyzer';
import ExposeAnalyzer from '../lib/analyzer/expose-analyzer';
import { generateCliReport } from '../lib/reporter/cli-reporter';
import { HTMLReporter } from '../lib/reporter/html-reporter';
import { JSONReporter } from '../lib/reporter/json-reporter';
import { VcCoverageOptions, ReportFormat } from '../lib/types';
import type { VcCoverageData, VcData } from '../lib/types';
import TestUnitAnalyzer from '../lib/analyzer/test-units-analyzer';
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
    const res = new TestUnitAnalyzer(testModule.moduleId, code, vitenode as unknown as ViteDevServer).analyze()
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
      
      // 增加防御性检查确保 map 和 sourcesContent 存在
      const sourceMap = module?.transformResult?.map as SourceMap;
      const code = sourceMap?.sourcesContent?.[0] || '';
      
      if (!code) {
        console.warn(`[vc-api-coverage] Warning: Could not find source code for ${path}`);
        continue; // 如果没有源代码，跳过此文件
      }
        
      // 分析组件API
      const props = new PropsAnalyzer(path, code).analyze();
      const emits = new EmitsAnalyzer(path, code).analyze()
      const slots = new SlotsAnalyzer(path, code).analyze();
      const exposes = new ExposeAnalyzer(path, code).analyze()
      this.compData[path] = {
        props,
        emits: emits.map(e => toEventName(e)),
        slots,
        exposes
      }
    }
  }

  // 有一些prop命名为onXxx，但是需要从emits中移除
  dealPropsEmits(compData: VcData, unitData: VcData) {
    const propsDetails = []
    const emitsDetails = []
    for (const emit of unitData.emits) {
      if (compData.props.includes(emit)) {
        propsDetails.push(emit)
      } else if (compData.emits.includes(emit)) {
        emitsDetails.push(emit)
      }
    }
    for (const prop of unitData.props) {
      if (!compData.emits.includes(prop) && compData.props.includes(prop)) {
        propsDetails.push(prop)
      }
    }
    return { propsDetails, emitsDetails }
  }

  mergeData(unitData: Record<string, VcData>, compData: Record<string, VcData>): VcCoverageData[] {
    const res: VcCoverageData[] = [] 
    
    // 预处理 unitData，将 index.ts 文件替换为实际组件文件
    const processedUnitData: Record<string, VcData> = {};
    
    // 处理每个测试单元路径
    for (const path in unitData) {
      // 检查是否是 index.ts 文件
      if (path.endsWith('/index.ts') || path.endsWith('/index')) {
        // 尝试查找该目录下的真实组件文件
        const dirPath = path.replace(/\/index(\.ts)?$/, '');
        const possibleComponentFiles = Object.keys(compData).filter(p => 
          p.startsWith(dirPath) && !p.endsWith('/index.ts') && !p.endsWith('/index')
        );
        
        if (possibleComponentFiles.length > 0) {
          // 如果找到了可能的组件文件，使用第一个（通常只有一个）
          const realComponentPath = possibleComponentFiles[0];
          processedUnitData[realComponentPath] = unitData[path];
        } else {
          // 找不到真实组件文件，保留原路径
          processedUnitData[path] = unitData[path];
        }
      } else {
        // 不是 index.ts 文件，直接保留
        processedUnitData[path] = unitData[path];
      }
    }
    
    // 使用处理后的数据
    for (const path in processedUnitData) {
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
      const unit = processedUnitData[path]
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
