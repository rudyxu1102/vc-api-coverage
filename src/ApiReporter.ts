import type { Reporter } from 'vitest/reporters'
import type { TestModule } from 'vitest/node'
import path from 'path';
import open from 'open';
import _ from 'lodash';
import { minimatch } from 'minimatch';
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
      strict: false,
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

  private shouldIncludeFile(filePath: string): boolean {
    const { include, exclude } = this.options;

    // 如果设置了 include，检查文件是否匹配 include 模式
    if (include) {
      const includePatterns = Array.isArray(include) ? include : [include];
      const matchesInclude = includePatterns.some(pattern =>
        minimatch(filePath, pattern, { matchBase: true })
      );
      if (!matchesInclude) {
        return false;
      }
    }

    // 如果设置了 exclude，检查文件是否匹配 exclude 模式
    if (exclude) {
      const excludePatterns = Array.isArray(exclude) ? exclude : [exclude];
      const matchesExclude = excludePatterns.some(pattern =>
        minimatch(filePath, pattern, { matchBase: true })
      );
      if (matchesExclude) {
        return false;
      }
    }

    return true;
  }

  onTestModuleEnd(testModule: TestModule) {

    const sourceFile = this.project.addSourceFileAtPath(testModule.moduleId)

    const res = new TestUnitAnalyzer(sourceFile, this.project, this.options.strict).analyze()
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

  private isVariantCovered(propName: string, variant: any, propValues: any[]): boolean {
    // Find if this prop was tested with the specific variant value/type
    for (const propValue of propValues) {
      if (propValue.propName !== propName) continue

      // Literal type: must match exact value
      if (variant.type === 'literal') {
        if (propValue.type === 'literal' && propValue.value === variant.value) {
          return true
        }
      } else {
        // Non-literal type (string, number, function, object, etc.)
        // Just need to match the type
        if (propValue.type === variant.type) {
          return true
        }
      }
    }

    return false
  }

  analyzerComponent() {
    for (const path in this.unitData) {
      // 检查文件是否应该被包含
      if (!this.shouldIncludeFile(path)) {
        continue;
      }

      const sourceFile = this.project.addSourceFileAtPath(path)
      // 分析组件API
      const analyzer = new ComponentAnalyzer(sourceFile, this.options.strict)
      const { props, propsWithVariants, slots, exposes } = analyzer.analyze()
      this.compData[path] = {
        props: Array.from(props),
        propsWithVariants,
        slots: Array.from(slots),
        exposes: Array.from(exposes),
      }
    }
  }

  mergeData(unitData: Record<string, VcData>, compData: Record<string, VcData>): VcCoverageData[] {
    const res: VcCoverageData[] = []

    // 使用处理后的数据
    for (const path in unitData) {
      // 检查文件是否应该被包含
      if (!this.shouldIncludeFile(path)) {
        continue;
      }

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
      
      // Handle props - with strict mode support
      if (this.options.strict && comp.propsWithVariants && comp.propsWithVariants.length > 0) {
        // Strict mode: expand props with variants
        for (const propWithVariants of comp.propsWithVariants) {
          if (!propWithVariants.variants || propWithVariants.variants.length === 0) {
            // No variants, treat as normal prop
            info.props.total += 1
            info.props.details.push({
              name: propWithVariants.name,
              covered: unit.props?.includes(propWithVariants.name) || false
            })
          } else {
            // Has variants, check each one
            for (const variant of propWithVariants.variants) {
              const variantKey = String(variant.value)
              const isCovered = this.isVariantCovered(propWithVariants.name, variant, unit.propValues || [])

              info.props.total += 1
              info.props.details.push({
                name: `${propWithVariants.name}[${variantKey}]`,
                covered: isCovered,
                variant: variantKey,
                propName: propWithVariants.name
              })
            }
          }
        }

        // Add props that don't have variants
        const propsWithVariantsNames = new Set(comp.propsWithVariants.map(p => p.name))
        for (const propName of comp.props) {
          if (!propsWithVariantsNames.has(propName)) {
            info.props.total += 1
            info.props.details.push({
              name: propName,
              covered: unit.props?.includes(propName) || false
            })
          }
        }
      } else {
        // Normal mode: just check if prop is used
        info.props.total += comp.props.length
        info.props.details = comp.props.map(p => ({ name: p, covered: unit.props?.includes(p) || false }))
      }

      info.slots.total += comp.slots.length
      info.exposes.total += comp.exposes.length
      info.slots.details = comp.slots.length > 0 ? comp.slots.map(s => ({ name: s, covered: unit.slots?.includes(s) || false })) : unit.slots?.map(s => ({ name: s, covered: true })) || []
      info.exposes.details = comp.exposes.map(e => ({ name: e, covered: unit.exposes?.includes(e) || false }))
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
      if(!coverage) continue
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
