export interface VcCoverageOptions {
  format?: ('cli' | 'html' | 'json')[]
  outputDir?: string
  openBrowser?: boolean
  include?: string | string[]
  onFinished?: (data: VcCoverageData[]) => void
}

export interface ComponentCoverage {
  props: Array<{ name: string; covered: boolean }>
  emits: Array<{ name: string; covered: boolean }>
  slots: Array<{ name: string; covered: boolean }>
  exposes: Array<{ name: string; covered: boolean }>
}

export type ReportFormat = 'cli' | 'html' | 'json' 


export interface VcData {
  props: string[],
  slots: string[],
  exposes: string[],
}

export interface VcTotalData {
  props: {
    total: number,
    covered: number
  },
  slots: {
    total: number,
    covered: number
  },
  exposes: {
    total: number,
    covered: number
  }
}

export interface VcCoverageData {
  name: string;
  file: string;
  total: number;
  covered: number;
  props: {
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
}