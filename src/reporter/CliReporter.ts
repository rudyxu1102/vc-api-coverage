import chalk from 'chalk';
import Table from 'cli-table3';
import type { VcCoverageData } from '../types'
import { colorizePercentage, getTotalData, roundPercentage } from '../common/utils';

// 获取未覆盖的API列表
function getUncoveredAPIs(coverageData: VcCoverageData): string {
  const uncoveredAPIs = [
    ...coverageData.props.details.filter(p => !p.covered).map(p => p.name),
    ...coverageData.slots.details.filter(s => !s.covered).map(s => s.name),
    ...coverageData.exposes.details.filter(ex => !ex.covered).map(ex => ex.name)
  ];
  
  return uncoveredAPIs.join(', ');
}

// 根据覆盖率获取颜色处理后的文本
function formatCoverageValue(covered: number, total: number): string {
  if (total === 0 && covered === 0) {
    return chalk.bold.green('0/0');
  }
  if (total === 0 && covered > 0) {
    return chalk.bold.yellow(`${covered}/N`);
  }
  const ratio = covered / total;
  
  if (ratio === 1) {
    // 100% 覆盖率，绿色加粗
    return chalk.bold.green(`${covered}/${total}`);
  } else {
    // 低于 100%，红色
    return chalk.bold.red(`${covered}/${total}`);
  }
}

// 根据百分比为组件名称添加颜色
function formatComponentName(name: string, percentage: number): string {
  if (percentage === 100) {
    return chalk.bold.green(name);
  } else if (percentage >= 80) {
    return chalk.yellow(name);
  } else {
    return chalk.red(name);
  }
}

export function generateCliReport(allCoverageData: VcCoverageData[]): string {
  const totalData = getTotalData(allCoverageData)
  // 检查是否有任何未覆盖的API
  const hasUncoveredApis = allCoverageData.some(data => {
    return data.props.details.some(p => !p.covered) ||
           data.slots.details.some(s => !s.covered) ||
           data.exposes.details.some(ex => !ex.covered);
  });

  // 检查是否有空组件（没有任何API的组件）
  const hasEmptyComponent = allCoverageData.some(data => 
    data.props.details.length === 0 && 
    data.slots.details.length === 0 && 
    data.exposes.details.length === 0
  );

  // 如果有未覆盖的API或空组件，需要添加额外的列
  const needExtraColumn = hasUncoveredApis || hasEmptyComponent;

  // 表头和列宽设置
  const tableHeaders = [
    chalk.bold('Components'),
    chalk.bold('Props/Events'),
    chalk.bold('Slots'),
    chalk.bold('Exposes'),
    chalk.bold('Uncovered APIs')
  ];

  
  // 创建表格实例
  const table = new Table({
    head: tableHeaders,
    chars: {
      'top': '═', 'top-mid': '╤', 'top-left': '╔', 'top-right': '╗',
      'bottom': '═', 'bottom-mid': '╧', 'bottom-left': '╚', 'bottom-right': '╝',
      'left': '║', 'left-mid': '╟', 'mid': '─', 'mid-mid': '┼',
      'right': '║', 'right-mid': '╢', 'middle': '│'
    },
    style: {
      head: [],  // 保持标题颜色，不应用额外样式
      border: [], // 保持边框颜色
    },
    colWidths: [null, null, null, null, 40],
    // 启用文本自动换行
    wordWrap: true,
    // 启用文本自动换行
    wrapOnWordBoundary: true,
    colAligns: ['left', 'right', 'right', 'right', 'left']
  });
  
  // 计算总体覆盖率
  const propsCoverage = roundPercentage(totalData.props.covered, totalData.props.total);
    
  const slotsCoverage = roundPercentage(totalData.slots.covered, totalData.slots.total);
  
  const exposesCoverage = roundPercentage(totalData.exposes.covered, totalData.exposes.total);
  
  const totalPercentage = roundPercentage(
    totalData.props.covered + totalData.slots.covered + totalData.exposes.covered,
    totalData.props.total + totalData.slots.total + totalData.exposes.total
  );
  
  // 添加汇总行
  const summaryRow = [
    formatComponentName('All', totalPercentage),
    colorizePercentage(propsCoverage),
    colorizePercentage(slotsCoverage),
    colorizePercentage(exposesCoverage),
  ];
  
  // 如果有未覆盖的API或空组件，添加空列
  if (needExtraColumn) {
    summaryRow.push('');
  }
  
  table.push(summaryRow);
  
  // 添加每个组件的行
  allCoverageData.forEach(data => {
    const propsStats = data.props;
    const slotsStats = data.slots;
    const exposeStats = data.exposes;
    const uncoveredAPIs = getUncoveredAPIs(data);
    
    const totalPercentage = roundPercentage(
      propsStats.covered + slotsStats.covered + exposeStats.covered,
      propsStats.total + slotsStats.total + exposeStats.total
    );
    
    // 检查组件是否有任何API
    if (data.props.details.length === 0 && data.slots.details.length === 0 && 
        data.exposes.details.length === 0) {
      // 对于没有API的组件，使用特殊标记
      const row = [
        formatComponentName(data.name, totalPercentage),
        chalk.dim('N/A'),
        chalk.dim('N/A'),
        chalk.dim('N/A')
      ];
      
      if (needExtraColumn) {
        row.push('No API found');
      }
      
      table.push(row);
    } else {
      // 正常添加行
      const row = [
        formatComponentName(data.name, totalPercentage),
        formatCoverageValue(propsStats.covered, propsStats.total),
        formatCoverageValue(slotsStats.covered, slotsStats.total),
        formatCoverageValue(exposeStats.covered, exposeStats.total)
      ];
      
      if (needExtraColumn) {
        const rowItem = uncoveredAPIs ? chalk.yellow(uncoveredAPIs): chalk.green.bold('\u{2714}')
        row.push(rowItem)
      }
      
      table.push(row);
    }
  });
  
  return table.toString();
}
