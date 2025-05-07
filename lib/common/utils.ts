import chalk from 'chalk';
import { VcCoverageData } from '../types';

export function logDebug(moduleName: string, message: string, ...args: any[]) {
  if (process.env.DEBUG) {
    console.log(`[${moduleName}] ${message}`, ...args);
  }
}

export function logError(moduleName: string, message: string, ...args: any[]) {
  console.error(`[${moduleName}] ${message}`, ...args);
}

// 为百分比添加颜色
export function colorizePercentage(percentage: number): string {  
  let colorText;
  if (percentage === 100) {
    // 100% 覆盖率，绿色加粗
    colorText = chalk.bold.green(`${percentage}%`);
  } else if (percentage >= 80) {
    // 80%+ 覆盖率，绿色
    colorText = chalk.green(`${percentage}%`);
  } else if (percentage >= 50) {
    // 50%+ 覆盖率，黄色
    colorText = chalk.bold.yellow(`${percentage}%`);
  } else {
    // 低于 50%，红色
    colorText = chalk.bold.red(`${percentage}%`);
  }
  return colorText.padEnd(13);
} 

export function roundPercentage(current: number, total: number): number {
  return total > 0 ? Math.round((current / total) * 100) : 100;
}

export function getTotalData(allCoverageData: VcCoverageData[]) {
  const data = {
    props: {
      total: 0,
      covered: 0,
    },
    emits: {
      total: 0,
      covered: 0
    },
    slots: {
      total: 0,
      covered: 0
    },
    exposes: {
      total: 0,
      covered: 0
    }
  }
  for (const item of allCoverageData) {
    if (item.props.total > 0) {
      data.props.total += item.props.total
      data.props.covered += item.props.covered
    }
    if (item.emits.total > 0) {
      data.emits.total += item.emits.total
      data.emits.covered += item.emits.covered
    }
    if (item.slots.total > 0) {
      data.slots.total += item.slots.total
      data.slots.covered += item.slots.covered
    }
    if (item.exposes.total > 0) {
      data.exposes.total += item.exposes.total
      data.exposes.covered += item.exposes.covered
    }
  }
  return data
}

// 将update:modelValue转换为onUpdate:modelValue
export function toEventName(str: string) {
  if (str.startsWith('on')) {
    return str
  }
  return `on${str.charAt(0).toUpperCase()}${str.slice(1)}`
}