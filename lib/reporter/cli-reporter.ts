import chalk from 'chalk';
import type { VcCoverageData } from '../types'
import { colorizePercentage, roundPercentage } from '../common/utils';

// 获取未覆盖的API列表
function getUncoveredAPIs(coverageData: VcCoverageData): string {
  const uncoveredAPIs = [
    ...coverageData.props.details.filter(p => !p.covered).map(p => p.name),
    ...coverageData.emits.details.filter(e => !e.covered).map(e => e.name),
    ...coverageData.slots.details.filter(s => !s.covered).map(s => s.name),
    ...coverageData.exposes.details.filter(ex => !ex.covered).map(ex => ex.name)
  ];
  
  return uncoveredAPIs.join(', ');
}

export function generateHeader(coverageData: VcCoverageData[]) {
  const totalProps = coverageData.reduce((acc, item) => acc + item.props.total, 0);
  const coveredProps = coverageData.reduce((acc, item) => acc + item.props.covered, 0);
  const propsCoverage = roundPercentage(coveredProps, totalProps);
  
  const totalEmits = coverageData.reduce((acc, item) => acc + item.emits.total, 0);
  const coveredEmits = coverageData.reduce((acc, item) => acc + item.emits.covered, 0);
  const emitsCoverage = roundPercentage(coveredEmits, totalEmits);
  
  const totalSlots = coverageData.reduce((acc, item) => acc + item.slots.total, 0);
  const coveredSlots = coverageData.reduce((acc, item) => acc + item.slots.covered, 0);
  const slotsCoverage = roundPercentage(coveredSlots, totalSlots);
  
  const totalExposes = coverageData.reduce((acc, item) => acc + item.exposes.total, 0);
  const coveredExposes = coverageData.reduce((acc, item) => acc + item.exposes.covered, 0);
  const exposesCoverage = roundPercentage(coveredExposes, totalExposes);
  
  // 为百分比添加颜色
  const colorProps = colorizePercentage(propsCoverage);
  const colorEmits = colorizePercentage(emitsCoverage);
  const colorSlots = colorizePercentage(slotsCoverage);
  const colorExposes = colorizePercentage(exposesCoverage);
  
  // 表格头部和分割线
  const headerLine = "------------------|---------|----------|---------|-----------|-------------------------------";
  const header = chalk.bold("Components        |   Props |  Emits   | Slots   |  Exposes  | Uncovered API");
  const totalPercentage = roundPercentage(coveredProps + coveredEmits + coveredSlots + coveredExposes, totalProps + totalEmits + totalSlots + totalExposes);
  
  // 添加总体覆盖行
  const totalRow = `${formatNameWithColor('All', totalPercentage)}|   ${colorProps}   |   ${colorEmits}    |   ${colorSlots}  |   ${colorExposes}      |`;
  return { headerLine, header, totalRow };
}

export function generateCliReport(allCoverageData: VcCoverageData[]): string {
  const { headerLine, header, totalRow } = generateHeader(allCoverageData);
  const rowReports = allCoverageData.map(coverageData => generateRowReport(coverageData));
  return [headerLine, header, totalRow, ...rowReports].join('\n');
}

// 新的表格格式报告生成函数
export function generateRowReport(coverageData: VcCoverageData): string {
  const propsStats = coverageData.props;
  const emitsStats = coverageData.emits;
  const slotsStats = coverageData.slots;
  const exposeStats = coverageData.exposes;
  const uncoveredAPIs = getUncoveredAPIs(coverageData);
  const totalPercentage = roundPercentage(propsStats.covered + emitsStats.covered + slotsStats.covered + exposeStats.covered, propsStats.total + emitsStats.total + slotsStats.total + exposeStats.total);
  const componentName = coverageData.name;
  // 检查组件是否有任何API
  if (coverageData.props.details.length === 0 && coverageData.emits.details.length === 0 && 
      coverageData.slots.details.length === 0 && coverageData.exposes.details.length === 0) {
    // 对于没有API的组件，返回特殊标记
    return `${formatNameWithColor(componentName, totalPercentage)}|   N/A   |    N/A   |   N/A   |    N/A    | No API found`;
  }
  
  // 为覆盖率添加颜色
  const colorPropsCoverage = formatCoverageWithColor(propsStats.covered, propsStats.total);
  const colorEmitsCoverage = formatCoverageWithColor(emitsStats.covered, emitsStats.total);
  const colorSlotsCoverage = formatCoverageWithColor(slotsStats.covered, slotsStats.total);
  const colorExposesCoverage = formatCoverageWithColor(exposeStats.covered, exposeStats.total);
  
  // 创建表格行
  const row = `${formatNameWithColor(componentName, totalPercentage)}|   ${colorPropsCoverage} |   ${colorEmitsCoverage}  |   ${colorSlotsCoverage} |   ${colorExposesCoverage}   | ${chalk.yellow(uncoveredAPIs)}`;
  
  return row;
}

function formatNameWithColor(name: string, percentage: number): string {
  let colorText;
  if (percentage === 100) {
    colorText = chalk.bold.green(name.padEnd(18));
  } else if (percentage >= 80) {
    colorText = chalk.green(name.padEnd(18));
  } else if (percentage >= 50) {
    colorText = chalk.yellow(name.padEnd(18));
  } else {
    colorText = chalk.red(name.padEnd(18));
  }
  return colorText.padEnd(18);
}

// 根据覆盖率添加颜色
function formatCoverageWithColor(covered: number, total: number): string {
  if (total === 0) {
    return chalk.dim('N/A');
  }
  
  const ratio = covered / total;
  let coloredText;
  
  if (ratio === 1) {
    // 100% 覆盖率，绿色加粗
    coloredText = chalk.bold.green(`${covered}/${total}`);
  } else if (ratio >= 0.8) {
    // 80%+ 覆盖率，绿色
    coloredText = chalk.green(`${covered}/${total}`);
  } else if (ratio >= 0.5) {
    // 50%+ 覆盖率，黄色
    coloredText = chalk.bold.yellow(`${covered}/${total}`);
  } else {
    // 低于 50%，红色
    coloredText = chalk.bold.red(`${covered}/${total}`);
  }
  
  return coloredText.padEnd(24);
} 