import { describe, it, expect } from 'vitest'
import { generateCliReport } from '../../lib/reporter/cli-reporter'
import type { VcCoverageData } from '../../lib/types'

describe('cli-reporter', () => {
  it('should generate CLI report with full coverage component', () => {
    const vcCoverage: VcCoverageData = {
      name: 'MyComponent.vue',
      file: 'src/components/MyComponent.vue',
      props: {
        total: 2,
        covered: 2,
        details: [
          { name: 'title', covered: true },
          { name: 'count', covered: true }
        ]
      },
      emits: {
        total: 2,
        covered: 2,
        details: [
          { name: 'change', covered: true },
          { name: 'submit', covered: true }
        ]
      },
      slots: {
        total: 2,
        covered: 2,
        details: [
          { name: 'header', covered: true },
          { name: 'footer', covered: true }
        ]
      },
      exposes: {
        total: 2,
        covered: 2,
        details: [
          { name: 'reset', covered: true },
          { name: 'validate', covered: true }
        ]
      }
    }

    const report = generateCliReport([vcCoverage])
    expect(report).toContain('MyComponent.vue')
    expect(report).toContain('2/2')
    expect(report).not.toContain('Uncovered API')
  })

  it('should generate CLI report with partial coverage component', () => {
    const vcCoverage: VcCoverageData = {
      name: 'MyComponent.vue',
      file: 'src/components/MyComponent.vue',
      props: {
        total: 2,
        covered: 1,
        details: [
          { name: 'title', covered: true },
          { name: 'count', covered: false }
        ]
      },
      emits: {
        total: 2,
        covered: 1,
        details: [
          { name: 'change', covered: true },
          { name: 'submit', covered: false }
        ]
      },
      slots: {
        total: 2,
        covered: 1,
        details: [
          { name: 'header', covered: false },
          { name: 'footer', covered: true }
        ]
      },
      exposes: {
        total: 2,
        covered: 1,
        details: [
          { name: 'reset', covered: true },
          { name: 'validate', covered: false }
        ]
      }
    }

    const report = generateCliReport([vcCoverage])
    expect(report).toContain('MyComponent.vue')
    expect(report).toContain('1/2')
    expect(report).toContain('count')
    expect(report).toContain('submit')
    expect(report).toContain('header')
    expect(report).toContain('validate')
  })

  it('should generate CLI report with no coverage component', () => {
    const vcCoverage: VcCoverageData = {
      name: 'MyComponent.vue',
      file: 'src/components/MyComponent.vue',
      props: {
        total: 2,
        covered: 0,
        details: [
          { name: 'title', covered: false },
          { name: 'count', covered: false }
        ]
      },
      emits: {
        total: 2,
        covered: 0,
        details: [
          { name: 'change', covered: false },
          { name: 'submit', covered: false }
        ]
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
    }

    const report = generateCliReport([vcCoverage])
    expect(report).toContain('MyComponent.vue')
    expect(report).toContain('0/2')
    expect(report).toContain('title')
    expect(report).toContain('count')
    expect(report).toContain('change')
    expect(report).toContain('submit')
  })

  it('should handle empty component', () => {
    const vcCoverage: VcCoverageData = {
      name: 'EmptyComponent.vue',
      file: 'src/components/EmptyComponent.vue',
      props: {
        total: 0,
        covered: 0,
        details: []
      },
      emits: {
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
    }

    const report = generateCliReport([vcCoverage])
    expect(report).toContain('EmptyComponent.vue')
    expect(report).toContain('N/A')
    expect(report).toContain('No API found')
  })

  it('should generate a full CLI report with multiple components', () => {
    const component1: VcCoverageData = {
      name: 'Component1.vue',
      file: 'src/components/Component1.vue',
      props: {
        total: 2,
        covered: 2,
        details: [
          { name: 'prop1', covered: true },
          { name: 'prop2', covered: true }
        ]
      },
      emits: {
        total: 2,
        covered: 2,
        details: [
          { name: 'emit1', covered: true },
          { name: 'emit2', covered: true }
        ]
      },
      slots: {
        total: 1,
        covered: 1,
        details: [
          { name: 'slot1', covered: true }
        ]
      },
      exposes: {
        total: 0,
        covered: 0,
        details: []
      }
    }

    const component2: VcCoverageData = {
      name: 'Component2.vue',
      file: 'src/components/Component2.vue',
      props: {
        total: 3,
        covered: 1,
        details: [
          { name: 'propA', covered: true },
          { name: 'propB', covered: false },
          { name: 'propC', covered: false }
        ]
      },
      emits: {
        total: 1,
        covered: 0,
        details: [
          { name: 'emitA', covered: false }
        ]
      },
      slots: {
        total: 0,
        covered: 0,
        details: []
      },
      exposes: {
        total: 2,
        covered: 1,
        details: [
          { name: 'methodA', covered: true },
          { name: 'methodB', covered: false }
        ]
      }
    }

    const report = generateCliReport([component1, component2])
    
    expect(report).toContain('Components')
    expect(report).toContain('Props')
    expect(report).toContain('Emits')
    expect(report).toContain('Slots')
    expect(report).toContain('Exposes')
    expect(report).toContain('Component1.vue')
    expect(report).toContain('Component2.vue')
    expect(report).toContain('All')
    expect(report).toContain('propB')
    expect(report).toContain('propC')
    expect(report).toContain('emitA')
    expect(report).toContain('methodB')
  })
}) 