import type { Reporter, Vitest, File, TaskResultPack } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import fg from 'fast-glob';
import chalk from 'chalk';

import { analyzeProps } from '../lib/analyzer/props-analyzer.js';
import { analyzeEmits } from '../lib/analyzer/emits-analyzer.js';
import { analyzeSlots } from '../lib/analyzer/slots-analyzer.js';
import { analyzeExpose } from '../lib/analyzer/expose-analyzer.js';
import { matchTestCoverage, ComponentAnalysis } from '../lib/matcher/test-coverage-matcher.js';
import { generateCliReport } from '../lib/reporter/cli-reporter.js';

// 默认组件文件匹配模式
const DEFAULT_INCLUDE = ['src/**/*.vue', 'src/**/*.tsx', 'src/**/*.ts'];
// 默认测试文件后缀
const DEFAULT_TEST_SUFFIXES = ['.spec.ts', '.test.ts', '.spec.tsx', '.test.tsx'];

export default class VcCoverageReporter implements Reporter {
  private ctx!: Vitest;
  private options: any;
  private allReports: string[] = [];

  constructor(options: any = {}) {
    this.options = options;
  }

  onInit(ctx: Vitest): void {
    this.ctx = ctx;
    console.log('\n[vc-coverage-reporter] Initialized.');
  }

  async onFinished(_files?: File[], _errors?: unknown[]): Promise<void> {
    console.log('[vc-coverage-reporter] Generating coverage report...');
    if (!this.ctx || !this.ctx.config) {
      console.error(chalk.red('[vc-coverage-reporter] Error: Vitest context or config is not available.'));
      return;
    }
    const rootDir = this.ctx.config.root;
    console.log(`[vc-coverage-reporter] Vitest root directory: ${rootDir}`); // 打印 rootDir

    const includeOption = this.options.include || DEFAULT_INCLUDE;
    // 将 include 模式转换为相对于 rootDir 的模式
    const absoluteIncludePatterns = Array.isArray(includeOption)
      ? includeOption.map(pattern => path.join(rootDir, pattern))
      : [path.join(rootDir, includeOption)];

    console.log(`[vc-coverage-reporter] Searching for component files using patterns: ${JSON.stringify(absoluteIncludePatterns)}`);

    const componentFiles = await fg(absoluteIncludePatterns, {
      // cwd: rootDir, // 使用绝对模式时，cwd 可以省略或按需设置
      ignore: [
        '**/node_modules/**',
        '**/*.d.ts',
        path.join(rootDir, '**/dist/**'), // 确保忽略 dist
        ...DEFAULT_TEST_SUFFIXES.map(suffix => path.join(rootDir, `**/*${suffix}`)) // 忽略测试文件
      ],
      absolute: true,
      onlyFiles: true, // 确保只匹配文件
    });

    console.log(`[vc-coverage-reporter] Found ${componentFiles.length} component files.`); // 打印找到的文件数

    if (componentFiles.length === 0) {
      // console.log('[vc-coverage-reporter] No component files found matching patterns:', absoluteIncludePatterns); // 已在上面打印
      return;
    }

    for (const componentPath of componentFiles) {
      const relativeComponentPath = path.relative(rootDir, componentPath); // 用于查找测试和报告
      const testPath = await this.findTestFile(componentPath); // findTestFile 基于 componentPath 操作

      if (!testPath) {
        console.warn(chalk.yellow(`[vc-coverage-reporter] Skipping: No test file found for ${relativeComponentPath}`));
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
        const report = generateCliReport(coverage, relativeComponentPath); // 报告中使用相对路径
        this.allReports.push(report);

      } catch (error: any) {
        console.error(chalk.red(`[vc-coverage-reporter] Error processing file ${relativeComponentPath}:`), error.message);
      }
    }

    // 4. 打印所有报告
    if (this.allReports.length > 0) {
      console.log('\n' + this.allReports.join('\n'));
    } else {
      console.log('[vc-coverage-reporter] No reports generated (after filtering).');
    }

    // TODO: 实现 JSON 报告输出逻辑
    // if (this.options.outputJson) { ... }

    console.log('[vc-coverage-reporter] Report generation finished.');
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