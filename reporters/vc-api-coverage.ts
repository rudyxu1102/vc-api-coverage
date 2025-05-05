import type { RunnerTestFile as File, RunnerTaskResultPack as TaskResultPack } from 'vitest';
import type { Reporter } from 'vitest/reporters'
import type { TestModule, Vitest } from 'vitest/node'
import { promises as fs } from 'fs';
import path from 'path';
import fg from 'fast-glob';
import chalk from 'chalk';
import open from 'open';
import _ from 'lodash';
import { analyzeProps } from '../lib/analyzer/props-analyzer';
import { analyzeEmits } from '../lib/analyzer/emits-analyzer';
import { analyzeSlots } from '../lib/analyzer/slots-analyzer';
import { analyzeExpose } from '../lib/analyzer/expose-analyzer';
import { matchTestCoverage, ComponentAnalysis, type TestCoverage } from '../lib/matcher/test-coverage-matcher';
import { generateCliReport } from '../lib/reporter/cli-reporter';
import { HTMLReporter } from '../lib/reporter/html-reporter';
import { JSONReporter } from '../lib/reporter/json-reporter';
import { VcCoverageOptions, ReportFormat } from '../lib/types';
import { parseComponent } from '../lib/common/shared-parser';
import type { VcCoverageData, VcData } from '../lib/types';
import { analyzeTestUnits } from '../lib/analyzer/test-units-analyzer';

// 默认组件文件匹配模式
const DEFAULT_INCLUDE = ['src/**/*.vue', 'src/**/*.tsx', 'src/**/*.ts'];
// 默认测试文件后缀
const DEFAULT_TEST_SUFFIXES = ['.spec.ts', '.test.ts', '.spec.tsx', '.test.tsx'];


export default class VcCoverageReporter implements Reporter {
  private ctx!: Vitest;
  private options: VcCoverageOptions;
  private htmlReporter: HTMLReporter;
  private jsonReporter: JSONReporter;
  private coverageData: Array<VcCoverageData> = [];
  private unitData: Record<string, VcData> = {};

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

  private mergeCoverage(a: TestCoverage, b: TestCoverage): TestCoverage {
    const result: TestCoverage = {
      props: [], emits: [], slots: [], exposes: []
    };
    
    // 为每个API类型合并覆盖率信息
    (['props', 'emits', 'slots', 'exposes'] as const).forEach(key => {
      // 创建名称到覆盖状态的映射
      const coveredMap = new Map<string, boolean>();
      
      // 从两个覆盖率对象收集覆盖状态
      [...a[key], ...b[key]].forEach(item => {
        // 如果名称已存在且已被覆盖，或者当前项被覆盖，则标记为已覆盖
        coveredMap.set(item.name, coveredMap.get(item.name) || item.covered);
      });
      
      // 转换回数组格式
      result[key] = [...new Set([...a[key], ...b[key]].map(item => item.name))]
        .map(name => ({ name, covered: coveredMap.get(name) || false }));
    });
    
    return result;
  }

  onTestModuleEnd(testModule: TestModule) {
    const vitenode = testModule.project.vite
    const cache = vitenode.moduleGraph.getModuleById(testModule.moduleId)
    const code = cache?.transformResult?.code || ''
    const res = analyzeTestUnits(code)
    
    for (const path in res) {
      if (this.unitData[path]) {
        this.unitData[path] = _.mergeWith({}, this.unitData[path], res[path], (objValue: unknown, srcValue: unknown) => {
          if (Array.isArray(objValue) && Array.isArray(srcValue)) {
            return Array.from(new Set([...objValue, ...srcValue]));
          }
          return srcValue;
        })
      } else {
        this.unitData[path] = _.mergeWith({}, {
          props: [],
          emits: [],
          slots: [],
          exposes: []
        }, res[path])
      }
    }
    console.log(this.unitData)
  }

  async onFinished(_files?: File[], _errors?: unknown[]): Promise<void> {
    console.log('[vc-api-coverage] Generating coverage report...');
    if (!this.ctx || !this.ctx.config) {
      console.error(chalk.red('[vc-api-coverage] Error: Vitest context or config is not available.'));
      return;
    }
    const rootDir = this.ctx.config.root;
    console.log(`[vc-api-coverage] Vitest root directory: ${rootDir}`);

    const includeOption = this.options.include || DEFAULT_INCLUDE;
    const absoluteIncludePatterns = Array.isArray(includeOption)
      ? includeOption.map(pattern => path.join(rootDir, pattern))
      : [path.join(rootDir, includeOption)];

    console.log(`[vc-api-coverage] Searching for component files using patterns: ${JSON.stringify(absoluteIncludePatterns)}`);

    const componentFiles = await fg(absoluteIncludePatterns, {
      ignore: [
        '**/node_modules/**',
        '**/*.d.ts',
        path.join(rootDir, '**/dist/**'),
        ...DEFAULT_TEST_SUFFIXES.map(suffix => path.join(rootDir, `**/*${suffix}`))
      ],
      absolute: true,
      onlyFiles: true,
    });

    console.log(`[vc-api-coverage] Found ${componentFiles.length} component files.`);

    if (componentFiles.length === 0) {
      return;
    }

    for (const componentPath of componentFiles) {
      const relativeComponentPath = path.relative(rootDir, componentPath);
      const testPaths = await this.findTestFiles(componentPath);
      // 后缀名
      const suffix = path.extname(componentPath);

      // 检查是否是一个组件文件，忽略一些明显的非组件文件
      const isInclude = [
        '.tsx', '.vue',
      ].some(pattern => suffix.includes(pattern));

      if (!isInclude) {
        continue;
      }

      try {
        // 分析组件代码
        const componentCode = await fs.readFile(componentPath, 'utf-8');
        
        // 1. 分析组件 API - 使用共享的 AST
        const parsedContent = parseComponent(componentCode);
        
        // 分析组件API
        const props = analyzeProps(componentCode, parsedContent.ast, componentPath);  // 传入文件路径
        const emits = analyzeEmits(componentCode, parsedContent.ast, componentPath);
        const slots = analyzeSlots(componentCode, parsedContent, componentPath);
        const exposes = analyzeExpose(componentCode, parsedContent.ast, componentPath);
        const analysis: ComponentAnalysis = { props, emits, slots, exposes };
        
        // 2. 匹配测试覆盖（如果有测试文件）
        let coverage: TestCoverage = {
          props: props.map(p => ({ name: p, covered: false })),
          emits: emits.map(e => ({ name: e, covered: false })),
          slots: slots.map(s => ({ name: s, covered: false })),
          exposes: exposes.map(ex => ({ name: ex, covered: false }))
        }; 
        if (testPaths.length > 0) {
          for (const testPath of testPaths) {
            const testCode = await fs.readFile(testPath, 'utf-8');
            const res = matchTestCoverage(analysis, testCode);
            coverage =  this.mergeCoverage(coverage, res);
          }
        } else {
          console.warn(chalk.yellow(`[vc-api-coverage] No test file found for ${relativeComponentPath}, reporting API without coverage`));
        }

        // 3. 收集覆盖率数据
        this.coverageData.push({
          name: path.basename(relativeComponentPath),
          file: relativeComponentPath,
          props: {
            total: coverage.props.length,
            covered: coverage.props.filter(p => p.covered).length,
            details: coverage.props
          },
          emits: {
            total: coverage.emits.length,
            covered: coverage.emits.filter(e => e.covered).length,
            details: coverage.emits
          },
          slots: {
            total: coverage.slots.length,
            covered: coverage.slots.filter(s => s.covered).length,
            details: coverage.slots
          },
          exposes: {
            total: coverage.exposes.length,
            covered: coverage.exposes.filter(e => e.covered).length,
            details: coverage.exposes
          }
        });

      } catch (error: any) {
        console.error(chalk.red(`[vc-api-coverage] Error processing file ${relativeComponentPath}:`), error.message);
      }
    }

    // 4. 根据配置生成不同格式的报告
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
        const htmlPath = path.join(process.cwd(), this.options.outputDir || 'coverage', 'index.html');
        await open(htmlPath);
      }
    }

    if (shouldGenerateFormat('json')) {
      this.jsonReporter.setCoverageData(this.coverageData);
      await this.jsonReporter.generateReport();
    }

    console.log('[vc-api-coverage] Report generation finished.');
  }

  // 辅助函数：寻找测试文件
  private async findTestFiles(componentPath: string): Promise<string[]> {
    const parsedPath = path.parse(componentPath);
    const dirName = parsedPath.dir;
    const testFiles = await this.ctx.globTestFiles([`${dirName}`])
    const potentialTestPaths: string[] = [];
    for (const testFile of testFiles) {
      const filePath = testFile[1];
      potentialTestPaths.push(filePath)
    }
    return potentialTestPaths;
  }

  // 其他 Reporter 方法 (可以为空或添加日志)
  onUserConsoleLog(_log: { content: string; taskId?: string | undefined; time: number; type: 'stdout' | 'stderr'; }): void {}
  onTaskUpdate(_packs: TaskResultPack[]): void {}
  onWatcherStart(_files?: File[] | undefined, _errors?: unknown[] | undefined): void {}
  onWatcherRerun(_files: string[], _trigger?: string | undefined): void {}
  onServerRestart(_reason?: string | undefined): void {}
  onCollected(_files?: File[] | undefined): void {}
  onProcessTerminated(_signal: string, _code: number | null): void {}
}
