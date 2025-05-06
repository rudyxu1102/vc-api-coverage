import chalk from 'chalk';

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

