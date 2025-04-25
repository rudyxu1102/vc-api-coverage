export interface VcCoverageOptions {
  format?: ('cli' | 'html' | 'json')[]
  outputDir?: string
  openBrowser?: boolean
  include?: string | string[]
}

export interface ComponentCoverage {
  props: Array<{ name: string; covered: boolean }>
  emits: Array<{ name: string; covered: boolean }>
  slots: Array<{ name: string; covered: boolean }>
  exposes: Array<{ name: string; covered: boolean }>
}

export type ReportFormat = 'cli' | 'html' | 'json' 