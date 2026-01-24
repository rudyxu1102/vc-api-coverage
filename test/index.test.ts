import { describe, it, expect } from 'vitest'
import vcApiCoverage, { VcCoverageReporter } from '../src/index'
import type { VcCoverageOptions } from '../src/index'

describe('index', () => {
  it('should export default function', () => {
    expect(vcApiCoverage).toBeDefined()
    expect(typeof vcApiCoverage).toBe('function')
  })

  it('should create reporter with default options', () => {
    const reporter = vcApiCoverage()
    expect(reporter).toBeInstanceOf(VcCoverageReporter)
  })

  it('should create reporter with custom options', () => {
    const options: VcCoverageOptions = {
      format: ['json'],
      outputDir: 'custom-dir',
      openBrowser: true
    }
    const reporter = vcApiCoverage(options)
    expect(reporter).toBeInstanceOf(VcCoverageReporter)
  })

  it('should export VcCoverageReporter class', () => {
    expect(VcCoverageReporter).toBeDefined()
    const reporter = new VcCoverageReporter()
    expect(reporter).toBeInstanceOf(VcCoverageReporter)
  })

  it('should create reporter with empty options', () => {
    const reporter = vcApiCoverage({})
    expect(reporter).toBeInstanceOf(VcCoverageReporter)
  })
})
