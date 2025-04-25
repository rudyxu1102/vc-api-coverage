import { describe, it, expect } from 'vitest'
import { generateCliReport } from '../../lib/reporter/cli-reporter'
import type { ComponentCoverage } from '../../lib/types'

describe('cli-reporter', () => {
  it('should generate CLI report for full coverage', () => {
    const coverage: ComponentCoverage = {
      props: [
        { name: 'title', covered: true },
        { name: 'count', covered: true }
      ],
      emits: [
        { name: 'change', covered: true },
        { name: 'submit', covered: true }
      ],
      slots: [
        { name: 'header', covered: true },
        { name: 'footer', covered: true }
      ],
      exposes: [
        { name: 'reset', covered: true },
        { name: 'validate', covered: true }
      ]
    }

    const report = generateCliReport(coverage, 'src/components/MyComponent.vue')
    expect(report).toContain('MyComponent.vue')
    expect(report).toContain('100%')
    expect(report).not.toContain('❌')
  })

  it('should generate CLI report for partial coverage', () => {
    const coverage: ComponentCoverage = {
      props: [
        { name: 'title', covered: true },
        { name: 'count', covered: false }
      ],
      emits: [
        { name: 'change', covered: true },
        { name: 'submit', covered: false }
      ],
      slots: [
        { name: 'header', covered: false },
        { name: 'footer', covered: true }
      ],
      exposes: [
        { name: 'reset', covered: true },
        { name: 'validate', covered: false }
      ]
    }

    const report = generateCliReport(coverage, 'src/components/MyComponent.vue')
    expect(report).toContain('MyComponent.vue')
    expect(report).toContain('50%')
    expect(report).toContain('❌')
    expect(report).toContain('✅')
  })

  it('should generate CLI report for no coverage', () => {
    const coverage: ComponentCoverage = {
      props: [
        { name: 'title', covered: false },
        { name: 'count', covered: false }
      ],
      emits: [
        { name: 'change', covered: false },
        { name: 'submit', covered: false }
      ],
      slots: [],
      exposes: []
    }

    const report = generateCliReport(coverage, 'src/components/MyComponent.vue')
    expect(report).toContain('MyComponent.vue')
    expect(report).toContain('0%')
    expect(report).toContain('❌')
    expect(report).not.toContain('✅')
  })

  it('should handle empty component', () => {
    const coverage: ComponentCoverage = {
      props: [],
      emits: [],
      slots: [],
      exposes: []
    }

    const report = generateCliReport(coverage, 'src/components/EmptyComponent.vue')
    expect(report).toContain('EmptyComponent.vue')
    expect(report).toContain('No API found')
  })
}) 