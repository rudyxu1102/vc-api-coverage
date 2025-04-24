export type ReportFormat = 'cli' | 'html' | 'json';

export interface VcCoverageOptions {
  /**
   * File patterns to include
   * @default
   */
  include?: string[] | string;

  /**
   * Output directory for the coverage report
   * @default "coverage"
   */
  outputDir?: string;

  /**
   * Report formats
   * @default ["cli"]
   */
  format?: ReportFormat[];

  /**
   * Whether to open browser after generating report (only works when format includes 'html')
   * @default false
   */
  openBrowser?: boolean;
} 