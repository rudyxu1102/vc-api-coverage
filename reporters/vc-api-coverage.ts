import type { Reporter, Vitest, File, TaskResultPack } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import fg from 'fast-glob';
import chalk from 'chalk';
import open from 'open';

import { analyzeProps } from '../lib/analyzer/props-analyzer.js';
import { analyzeEmits } from '../lib/analyzer/emits-analyzer.js';
import { analyzeSlots } from '../lib/analyzer/slots-analyzer.js';
import { analyzeExpose } from '../lib/analyzer/expose-analyzer.js';
import { matchTestCoverage, ComponentAnalysis } from '../lib/matcher/test-coverage-matcher.js';
import { generateCliReport } from '../lib/reporter/cli-reporter.js';
import { HTMLReporter } from '../lib/reporter/html-reporter.js';
import { JSONReporter } from '../lib/reporter/json-reporter.js';
import { VcCoverageOptions, ReportFormat } from '../lib/types.js';

// 默认组件文件匹配模式
const DEFAULT_INCLUDE = ['src/**/*.vue', 'src/**/*.tsx', 'src/**/*.ts'];
// 默认测试文件后缀
const DEFAULT_TEST_SUFFIXES = ['.spec.ts', '.test.ts', '.spec.tsx', '.test.tsx'];

export default class VcCoverageReporter implements Reporter {
  private ctx!: Vitest;
  private options: VcCoverageOptions;
  private allReports: string[] = [];
  private htmlReporter: HTMLReporter;
  private jsonReporter: JSONReporter;
  private coverageData: Array<{
    name: string;
    file: string;
    props: {
      total: number;
      covered: number;
      details: Array<{ name: string; covered: boolean }>;
    };
    emits: {
      total: number;
      covered: number;
      details: Array<{ name: string; covered: boolean }>;
    };
    slots: {
      total: number;
      covered: number;
      details: Array<{ name: string; covered: boolean }>;
    };
    exposes: {
      total: number;
      covered: number;
      details: Array<{ name: string; covered: boolean }>;
    };
  }> = [];

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
      const testPath = await this.findTestFile(componentPath);

      if (!testPath) {
        console.warn(chalk.yellow(`[vc-api-coverage] Skipping: No test file found for ${relativeComponentPath}`));
        continue;
      }

      try {
        const componentCode = await fs.readFile(componentPath, 'utf-8');
        const testCode = await fs.readFile(testPath, 'utf-8');

        // 1. 分析组件 API
        const props = analyzeProps(componentCode);
        const emits = analyzeEmits(componentCode);
        const slots = analyzeSlots(componentCode);
        const exposes = analyzeExpose(componentCode);
        const analysis: ComponentAnalysis = { props, emits, slots, exposes };

        // 2. 匹配测试覆盖
        const coverage = matchTestCoverage(analysis, testCode);

        // 3. 生成并存储报告
        const report = generateCliReport(coverage, relativeComponentPath);
        this.allReports.push(report);

        // 4. 收集覆盖率数据
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

    // 5. 根据配置生成不同格式的报告
    const format = this.options.format || [];
    const shouldGenerateFormat = (f: ReportFormat) => format.includes(f);

    if (shouldGenerateFormat('cli') && this.allReports.length > 0) {
      console.log('\n' + this.allReports.join('\n'));
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
  private async findTestFile(componentPath: string): Promise<string | null> {
    const parsedPath = path.parse(componentPath);
    const baseNameWithoutExt = parsedPath.name;
    const dirName = parsedPath.dir;

    const potentialTestPaths: string[] = [];

    // 1. 同目录下，不同后缀
    DEFAULT_TEST_SUFFIXES.forEach(suffix => {
      potentialTestPaths.push(path.join(dirName, `${baseNameWithoutExt}${suffix}`));
    });

    // 2. 同目录下 __tests__ 子目录
    DEFAULT_TEST_SUFFIXES.forEach(suffix => {
      potentialTestPaths.push(path.join(dirName, '__tests__', `${baseNameWithoutExt}${suffix}`));
      potentialTestPaths.push(path.join(dirName, 'tests', `${baseNameWithoutExt}${suffix}`)); // 也检查 tests 目录
    });

    // 3. 上一级目录的 __tests__ 子目录 (针对 src/components/Button/index.tsx -> src/components/Button/__tests__/Button.spec.ts)
    const parentDir = path.dirname(dirName);
    DEFAULT_TEST_SUFFIXES.forEach(suffix => {
      potentialTestPaths.push(path.join(parentDir, '__tests__', `${baseNameWithoutExt}${suffix}`));
      potentialTestPaths.push(path.join(parentDir, 'tests', `${baseNameWithoutExt}${suffix}`));
    });

    for (const testPath of potentialTestPaths) {
      try {
        await fs.access(testPath); // 检查文件是否存在且可访问
        return testPath;
      } catch {
        // 文件不存在或不可访问，继续尝试下一个
      }
    }

    return null; // 未找到
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