import chalk from 'chalk';
import boxen from 'boxen';
import { TestCoverage, CoverageResult } from '../matcher/test-coverage-matcher.js';

function formatCoverageResults(results: CoverageResult[]): string {
  if (results.length === 0) {
    return chalk.dim('  (No items defined)');
  }
  return results
    .map(r => `  ${r.name.padEnd(15)} ${r.covered ? chalk.green('✅') : chalk.red('❌')}`)
    .join('\n');
}

function calculateCoverage(results: CoverageResult[]): { percent: number; covered: number; total: number } {
  const total = results.length;
  if (total === 0) {
    return { percent: 100, covered: 0, total: 0 }; // 或者根据需要处理为 N/A
  }
  const covered = results.filter(r => r.covered).length;
  const percent = total > 0 ? Math.round((covered / total) * 1000) / 10 : 100;
  return { percent, covered, total };
}

// 获取未覆盖的API列表
function getUncoveredAPIs(coverageData: TestCoverage): string {
  const uncoveredAPIs = [
    ...coverageData.props.filter(p => !p.covered).map(p => p.name),
    ...coverageData.emits.filter(e => !e.covered).map(e => e.name),
    ...coverageData.slots.filter(s => !s.covered).map(s => s.name),
    ...coverageData.exposes.filter(ex => !ex.covered).map(ex => ex.name)
  ];
  
  return uncoveredAPIs.join(', ');
}

// 原始的BoxenStyle报告生成
export function generateBoxenReport(coverageData: TestCoverage, componentPath: string): string {
  const propsStats = calculateCoverage(coverageData.props);
  const emitsStats = calculateCoverage(coverageData.emits);
  const slotsStats = calculateCoverage(coverageData.slots);
  const exposeStats = calculateCoverage(coverageData.exposes);

  let report = ''
  report += chalk.bold(`[Coverage Report for ${componentPath}]`) + '\n\n';

  // Check if the component has any API
  if (coverageData.props.length === 0 && coverageData.emits.length === 0 && 
      coverageData.slots.length === 0 && coverageData.exposes.length === 0) {
    report += chalk.yellow('No API found') + '\n';
    return boxen(report.trim(), {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'cyan',
      title: 'VC Coverage Reporter',
      titleAlignment: 'center'
    });
  }

  report += chalk.underline(`Props Coverage: ${propsStats.covered} / ${propsStats.total} (${propsStats.percent}%)`) + '\n';
  report += formatCoverageResults(coverageData.props) + '\n\n';

  report += chalk.underline(`Events Coverage: ${emitsStats.covered} / ${emitsStats.total} (${emitsStats.percent}%)`) + '\n';
  report += formatCoverageResults(coverageData.emits) + '\n\n';

  report += chalk.underline(`Slots Coverage: ${slotsStats.covered} / ${slotsStats.total} (${slotsStats.percent}%)`) + '\n';
  report += formatCoverageResults(coverageData.slots) + '\n\n';

  report += chalk.underline(`Methods Coverage: ${exposeStats.covered} / ${exposeStats.total} (${exposeStats.percent}%)`) + '\n';
  report += formatCoverageResults(coverageData.exposes);

  return boxen(report.trim(), {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: 'cyan',
    title: 'VC Coverage Reporter',
    titleAlignment: 'center'
  });
}

// 新的表格格式报告生成函数
export function generateCliReport(coverageData: TestCoverage, componentPath: string): string {
  const propsStats = calculateCoverage(coverageData.props);
  const emitsStats = calculateCoverage(coverageData.emits);
  const slotsStats = calculateCoverage(coverageData.slots);
  const exposeStats = calculateCoverage(coverageData.exposes);
  const uncoveredAPIs = getUncoveredAPIs(coverageData);
  
  // 检查组件是否有任何API
  if (coverageData.props.length === 0 && coverageData.emits.length === 0 && 
      coverageData.slots.length === 0 && coverageData.exposes.length === 0) {
    // 对于没有API的组件，返回特殊标记
    return `${componentPath.padEnd(20)}|   N/A   |    N/A   |   N/A   |    N/A    | No API found`;
  }
  
  // 创建表格行
  const row = `${componentPath.padEnd(20)}|  ${propsStats.covered} / ${propsStats.total}  |   ${emitsStats.covered} / ${emitsStats.total}  |   ${slotsStats.covered} / ${slotsStats.total} |   ${exposeStats.covered} / ${exposeStats.total}   | ${uncoveredAPIs}`;
  
  return row;
} 