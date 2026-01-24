export interface VcCoverageOptions {
  format?: ('cli' | 'html' | 'json')[]
  outputDir?: string
  openBrowser?: boolean
  include?: string | string[]
  exclude?: string | string[]
  strict?: boolean
  onFinished?: (data: VcCoverageData[]) => void
}

export interface ComponentCoverage {
  props: Array<{ name: string; covered: boolean }>
  emits: Array<{ name: string; covered: boolean }>
  slots: Array<{ name: string; covered: boolean }>
  exposes: Array<{ name: string; covered: boolean }>
}

export type ReportFormat = 'cli' | 'html' | 'json' 


export type PropVariantType = 'literal' | 'string' | 'number' | 'boolean' | 'function' | 'object' | 'undefined' | 'null'

export interface PropVariant {
  type: PropVariantType
  value: string | number | boolean | null | undefined
}

export interface PropWithVariants {
  name: string
  variants?: PropVariant[]
}

export interface PropValue {
  propName: string
  value: string | number | boolean | null | undefined
  type: 'literal' | 'string' | 'number' | 'boolean' | 'function' | 'object' | 'undefined' | 'null'
}

export interface VcData {
  props: string[],
  propsWithVariants?: PropWithVariants[]
  propValues?: PropValue[]
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

export interface PropDetail {
  name: string
  covered: boolean
  variant?: string  // e.g., 'primary', 'string', 'true'
  propName?: string  // original prop name when this is a variant
}

export interface VcCoverageData {
  name: string;
  file: string;
  total: number;
  covered: number;
  props: {
    total: number;
    covered: number;
    details: Array<PropDetail>;
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