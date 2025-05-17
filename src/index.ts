import VcCoverageReporter from './ApiReporter';
import type { VcCoverageOptions } from './types';

// 导出默认函数
export default function vcApiCoverage(options: VcCoverageOptions = {}) {
  return new VcCoverageReporter(options);
}

// 导出类型和reporter供直接使用
export { VcCoverageReporter };
export type { VcCoverageOptions }; 