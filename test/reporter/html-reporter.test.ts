import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest'
import { HTMLReporter } from '../../lib/reporter/html-reporter'
import { promises as fs } from 'fs'
import path from 'path'

describe('html-reporter', () => {
  const testOutputDir = './test/coverage'
  let reporter: HTMLReporter

  beforeEach(async () => {
    // Make sure the test directory exists before running tests
    try {
      await fs.mkdir(testOutputDir, { recursive: true });
    } catch (error) {
      // Ignore if directory exists
    }
    reporter = new HTMLReporter(testOutputDir)
  })

  it('should generate HTML report with coverage data', async () => {
    const coverageData = [{
      name: 'MyComponent',
      file: 'src/components/MyComponent.vue',
      props: {
        total: 2,
        covered: 2,
        details: [
          { name: 'title', covered: true },
          { name: 'count', covered: true }
        ]
      },

      slots: {
        total: 1,
        covered: 1,
        details: [
          { name: 'default', covered: true }
        ]
      },
      exposes: {
        total: 0,
        covered: 0,
        details: []
      }
    }]

    reporter.setCoverageData(coverageData)
    await reporter.generateReport()

    const htmlPath = path.join(testOutputDir, 'index.html')
    const htmlContent = await fs.readFile(htmlPath, 'utf-8')

    // 验证HTML报告包含必要的内容
    expect(htmlContent).toContain('MyComponent')
    expect(htmlContent).toContain('src/components/MyComponent.vue')
    expect(htmlContent).toContain('Props Coverage: 100%')
    expect(htmlContent).toContain('Slots Coverage: 100%')
  })

  it('should generate HTML report with empty coverage data', async () => {
    const coverageData = [{
      name: 'EmptyComponent',
      file: 'src/components/EmptyComponent.vue',
      props: {
        total: 0,
        covered: 0,
        details: []
      },
      slots: {
        total: 0,
        covered: 0,
        details: []
      },
      exposes: {
        total: 0,
        covered: 0,
        details: []
      }
    }]

    reporter.setCoverageData(coverageData)
    await reporter.generateReport()

    const htmlPath = path.join(testOutputDir, 'index.html')
    const htmlContent = await fs.readFile(htmlPath, 'utf-8')

    expect(htmlContent).toContain('EmptyComponent')
    expect(htmlContent).toContain('No API found')
  })

  it('should handle multiple components in report', async () => {
    const coverageData = [
      {
        name: 'ComponentA',
        file: 'src/components/ComponentA.vue',
        props: {
          total: 2,
          covered: 2,
          details: [
            { name: 'propA', covered: true },
            { name: 'propB', covered: true }
          ]
        },
        slots: { total: 0, covered: 0, details: [] },
        exposes: { total: 0, covered: 0, details: [] }
      },
      {
        name: 'ComponentB',
        file: 'src/components/ComponentB.vue',
        props: { total: 0, covered: 0, details: [] },
        slots: { total: 0, covered: 0, details: [] },
        exposes: { total: 0, covered: 0, details: [] }
      }
    ]

    reporter.setCoverageData(coverageData)
    await reporter.generateReport()

    const htmlPath = path.join(testOutputDir, 'index.html')
    const htmlContent = await fs.readFile(htmlPath, 'utf-8')

    expect(htmlContent).toContain('ComponentA')
    expect(htmlContent).toContain('ComponentB')
    expect(htmlContent).toContain('Props Coverage: 100%')
  })
}) 