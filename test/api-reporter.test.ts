import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import VcCoverageReporter from '../src/ApiReporter'
import type { VcCoverageOptions } from '../src/types'

describe('VcCoverageReporter', () => {
  let reporter: VcCoverageReporter

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with default options', () => {
      reporter = new VcCoverageReporter()
      expect(reporter).toBeDefined()
    })

    it('should initialize with custom options', () => {
      const options: VcCoverageOptions = {
        format: ['json'],
        outputDir: 'custom-coverage',
        openBrowser: true
      }
      reporter = new VcCoverageReporter(options)
      expect(reporter).toBeDefined()
    })

    it('should initialize with onFinished callback', () => {
      const onFinished = vi.fn()
      const options: VcCoverageOptions = {
        onFinished
      }
      reporter = new VcCoverageReporter(options)
      expect(reporter).toBeDefined()
    })

    it('should initialize with include pattern', () => {
      const options: VcCoverageOptions = {
        include: ['**/*.vue']
      }
      reporter = new VcCoverageReporter(options)
      expect(reporter).toBeDefined()
    })

    it('should initialize with exclude pattern', () => {
      const options: VcCoverageOptions = {
        exclude: ['**/node_modules/**']
      }
      reporter = new VcCoverageReporter(options)
      expect(reporter).toBeDefined()
    })
  })

  describe('shouldIncludeFile', () => {
    it('should include file when no filters are set', () => {
      reporter = new VcCoverageReporter()
      const result = (reporter as any).shouldIncludeFile('/path/to/Component.vue')
      expect(result).toBe(true)
    })

    it('should include file matching include pattern', () => {
      reporter = new VcCoverageReporter({
        include: ['**/*.vue']
      })
      const result = (reporter as any).shouldIncludeFile('/path/to/Component.vue')
      expect(result).toBe(true)
    })

    it('should exclude file not matching include pattern', () => {
      reporter = new VcCoverageReporter({
        include: ['**/*.vue']
      })
      const result = (reporter as any).shouldIncludeFile('/path/to/Component.tsx')
      expect(result).toBe(false)
    })

    it('should include file matching multiple include patterns', () => {
      reporter = new VcCoverageReporter({
        include: ['**/*.vue', '**/*.tsx']
      })
      const result = (reporter as any).shouldIncludeFile('/path/to/Component.tsx')
      expect(result).toBe(true)
    })

    it('should exclude file matching exclude pattern', () => {
      reporter = new VcCoverageReporter({
        exclude: ['**/node_modules/**']
      })
      const result = (reporter as any).shouldIncludeFile('/path/node_modules/Component.vue')
      expect(result).toBe(false)
    })

    it('should exclude file matching multiple exclude patterns', () => {
      reporter = new VcCoverageReporter({
        exclude: ['**/node_modules/**', '**/dist/**']
      })
      const result = (reporter as any).shouldIncludeFile('/path/dist/Component.vue')
      expect(result).toBe(false)
    })

    it('should handle single string include pattern', () => {
      reporter = new VcCoverageReporter({
        include: '**/*.vue'
      })
      const result = (reporter as any).shouldIncludeFile('/path/to/Component.vue')
      expect(result).toBe(true)
    })

    it('should handle single string exclude pattern', () => {
      reporter = new VcCoverageReporter({
        exclude: '**/node_modules/**'
      })
      const result = (reporter as any).shouldIncludeFile('/path/node_modules/Component.vue')
      expect(result).toBe(false)
    })
  })

  describe('mergeData', () => {
    it('should merge unit and component data', () => {
      reporter = new VcCoverageReporter()
      const unitData = {
        '/path/Component.vue': {
          props: ['prop1'],
          slots: ['slot1'],
          exposes: ['method1']
        }
      }
      const compData = {
        '/path/Component.vue': {
          props: ['prop1', 'prop2'],
          slots: ['slot1'],
          exposes: ['method1', 'method2']
        }
      }
      const result = reporter.mergeData(unitData, compData)
      expect(result).toHaveLength(1)
      expect(result[0].props.total).toBe(2)
      expect(result[0].props.covered).toBe(1)
      expect(result[0].slots.total).toBe(1)
      expect(result[0].slots.covered).toBe(1)
      expect(result[0].exposes.total).toBe(2)
      expect(result[0].exposes.covered).toBe(1)
    })

    it('should skip files without component data', () => {
      reporter = new VcCoverageReporter()
      const unitData = {
        '/path/Component.vue': {
          props: ['prop1'],
          slots: [],
          exposes: []
        }
      }
      const compData = {}
      const result = reporter.mergeData(unitData, compData)
      expect(result).toHaveLength(0)
      expect(console.warn).toHaveBeenCalledWith('[vc-api-coverage] Warning: No component data found for /path/Component.vue')
    })

    it('should handle empty slots in component data', () => {
      reporter = new VcCoverageReporter()
      const unitData = {
        '/path/Component.vue': {
          props: [],
          slots: ['default'],
          exposes: []
        }
      }
      const compData = {
        '/path/Component.vue': {
          props: [],
          slots: [],
          exposes: []
        }
      }
      const result = reporter.mergeData(unitData, compData)
      expect(result).toHaveLength(1)
      expect(result[0].slots.details).toHaveLength(1)
      expect(result[0].slots.details[0].name).toBe('default')
      expect(result[0].slots.details[0].covered).toBe(true)
    })

    it('should sort results by name', () => {
      reporter = new VcCoverageReporter()
      const unitData = {
        '/path/ComponentB.vue': {
          props: [],
          slots: [],
          exposes: []
        },
        '/path/ComponentA.vue': {
          props: [],
          slots: [],
          exposes: []
        }
      }
      const compData = {
        '/path/ComponentB.vue': {
          props: [],
          slots: [],
          exposes: []
        },
        '/path/ComponentA.vue': {
          props: [],
          slots: [],
          exposes: []
        }
      }
      const result = reporter.mergeData(unitData, compData)
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('path/ComponentA.vue')
      expect(result[1].name).toBe('path/ComponentB.vue')
    })

    it('should respect include filter', () => {
      reporter = new VcCoverageReporter({
        include: ['**/ComponentA.vue']
      })
      const unitData = {
        '/path/ComponentA.vue': {
          props: [],
          slots: [],
          exposes: []
        },
        '/path/ComponentB.vue': {
          props: [],
          slots: [],
          exposes: []
        }
      }
      const compData = {
        '/path/ComponentA.vue': {
          props: [],
          slots: [],
          exposes: []
        },
        '/path/ComponentB.vue': {
          props: [],
          slots: [],
          exposes: []
        }
      }
      const result = reporter.mergeData(unitData, compData)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('path/ComponentA.vue')
    })
  })


  describe('genReport', () => {
    it('should generate CLI report', async () => {
      reporter = new VcCoverageReporter({
        format: ['cli']
      })
      ;(reporter as any).coverageData = []
      await reporter.genReport()
      expect(console.log).toHaveBeenCalled()
    })

    it('should generate JSON report', async () => {
      reporter = new VcCoverageReporter({
        format: ['json'],
        outputDir: 'coverage-test'
      })
      ;(reporter as any).coverageData = []
      await reporter.genReport()
      expect(console.log).toHaveBeenCalledWith('[vc-api-coverage] Report generation finished.')
    })

    it('should generate HTML report', async () => {
      reporter = new VcCoverageReporter({
        format: ['html'],
        outputDir: 'coverage-test',
        openBrowser: false
      })
      ;(reporter as any).coverageData = []
      await reporter.genReport()
      expect(console.log).toHaveBeenCalledWith('[vc-api-coverage] Report generation finished.')
    })

    it('should generate all report formats', async () => {
      reporter = new VcCoverageReporter({
        format: ['cli', 'html', 'json'],
        outputDir: 'coverage-test'
      })
      ;(reporter as any).coverageData = []
      await reporter.genReport()
      expect(console.log).toHaveBeenCalled()
    })

    it('should handle empty format array', async () => {
      reporter = new VcCoverageReporter({
        format: []
      })
      ;(reporter as any).coverageData = []
      await reporter.genReport()
      expect(console.log).toHaveBeenCalledWith('[vc-api-coverage] Report generation finished.')
    })
  })

  describe('Strict Mode', () => {
    it('should initialize with strict mode enabled', () => {
      reporter = new VcCoverageReporter({ strict: true })
      expect(reporter).toBeDefined()
    })

    it('should merge data with strict mode and expand variants', () => {
      reporter = new VcCoverageReporter({ strict: true })

      const unitData = {
        '/test/Button.tsx': {
          props: ['variant'],
          propValues: [
            { propName: 'variant', value: 'primary', type: 'literal' as const },
            { propName: 'variant', value: 'secondary', type: 'literal' as const }
          ],
          slots: [],
          exposes: []
        }
      }

      const compData = {
        '/test/Button.tsx': {
          props: ['variant'],
          propsWithVariants: [
            {
              name: 'variant',
              variants: [
                { type: 'literal' as const, value: 'primary' },
                { type: 'literal' as const, value: 'secondary' },
                { type: 'literal' as const, value: 'tertiary' }
              ]
            }
          ],
          slots: [],
          exposes: []
        }
      }

      const result = (reporter as any).mergeData(unitData, compData)

      expect(result).toHaveLength(1)
      expect(result[0].props.total).toBe(3) // 3 variants
      expect(result[0].props.covered).toBe(2) // only primary and secondary tested
      expect(result[0].props.details).toHaveLength(3)
      expect(result[0].props.details[0].name).toBe('variant[primary]')
      expect(result[0].props.details[0].covered).toBe(true)
      expect(result[0].props.details[1].name).toBe('variant[secondary]')
      expect(result[0].props.details[1].covered).toBe(true)
      expect(result[0].props.details[2].name).toBe('variant[tertiary]')
      expect(result[0].props.details[2].covered).toBe(false)
    })

    it('should merge data with strict mode and boolean variants', () => {
      reporter = new VcCoverageReporter({ strict: true })

      const unitData = {
        '/test/Button.tsx': {
          props: ['disabled'],
          propValues: [
            { propName: 'disabled', value: true, type: 'literal' as const }
          ],
          slots: [],
          exposes: []
        }
      }

      const compData = {
        '/test/Button.tsx': {
          props: ['disabled'],
          propsWithVariants: [
            {
              name: 'disabled',
              variants: [
                { type: 'literal' as const, value: true }
              ]
            }
          ],
          slots: [],
          exposes: []
        }
      }

      const result = (reporter as any).mergeData(unitData, compData)

      expect(result[0].props.total).toBe(1) // only true variant
      expect(result[0].props.covered).toBe(1)
      expect(result[0].props.details[0].name).toBe('disabled[true]')
      expect(result[0].props.details[0].covered).toBe(true)
    })

    it('should merge data with strict mode and mixed type variants', () => {
      reporter = new VcCoverageReporter({ strict: true })

      const unitData = {
        '/test/Input.tsx': {
          props: ['value'],
          propValues: [
            { propName: 'value', value: 'hello', type: 'string' as const },
            { propName: 'value', value: 42, type: 'number' as const }
          ],
          slots: [],
          exposes: []
        }
      }

      const compData = {
        '/test/Input.tsx': {
          props: ['value'],
          propsWithVariants: [
            {
              name: 'value',
              variants: [
                { type: 'string' as const, value: 'string' },
                { type: 'number' as const, value: 'number' }
              ]
            }
          ],
          slots: [],
          exposes: []
        }
      }

      const result = (reporter as any).mergeData(unitData, compData)

      expect(result[0].props.total).toBe(2)
      expect(result[0].props.covered).toBe(2)
      expect(result[0].props.details[0].name).toBe('value[string]')
      expect(result[0].props.details[0].covered).toBe(true)
      expect(result[0].props.details[1].name).toBe('value[number]')
      expect(result[0].props.details[1].covered).toBe(true)
    })

    it('should merge data with strict mode and props without variants', () => {
      reporter = new VcCoverageReporter({ strict: true })

      const unitData = {
        '/test/Button.tsx': {
          props: ['label', 'variant'],
          propValues: [
            { propName: 'variant', value: 'primary', type: 'literal' as const }
          ],
          slots: [],
          exposes: []
        }
      }

      const compData = {
        '/test/Button.tsx': {
          props: ['label', 'variant'],
          propsWithVariants: [
            {
              name: 'variant',
              variants: [
                { type: 'literal' as const, value: 'primary' }
              ]
            }
          ],
          slots: [],
          exposes: []
        }
      }

      const result = (reporter as any).mergeData(unitData, compData)

      // label doesn't have variants, so it's tracked normally
      // variant has variants
      expect(result[0].props.total).toBe(2)
      expect(result[0].props.details.some((d: any) => d.name === 'label')).toBe(true)
      expect(result[0].props.details.some((d: any) => d.name === 'variant[primary]')).toBe(true)
    })

    it('should handle isVariantCovered with literal types', () => {
      reporter = new VcCoverageReporter({ strict: true })

      const variant = { type: 'literal' as const, value: 'primary' }
      const propValues = [
        { propName: 'variant', value: 'primary', type: 'literal' as const }
      ]

      const isCovered = (reporter as any).isVariantCovered('variant', variant, propValues)
      expect(isCovered).toBe(true)
    })

    it('should handle isVariantCovered with non-literal types', () => {
      reporter = new VcCoverageReporter({ strict: true })

      const variant = { type: 'string' as const, value: 'string' }
      const propValues = [
        { propName: 'value', value: 'hello', type: 'string' as const }
      ]

      const isCovered = (reporter as any).isVariantCovered('value', variant, propValues)
      expect(isCovered).toBe(true)
    })

    it('should return false for uncovered variants', () => {
      reporter = new VcCoverageReporter({ strict: true })

      const variant = { type: 'literal' as const, value: 'tertiary' }
      const propValues = [
        { propName: 'variant', value: 'primary', type: 'literal' as const }
      ]

      const isCovered = (reporter as any).isVariantCovered('variant', variant, propValues)
      expect(isCovered).toBe(false)
    })

    it('should match literal string values to String type variants', () => {
      reporter = new VcCoverageReporter({ strict: true })

      // String type variant should accept string literal values
      const variant = { type: 'string' as const, value: 'string' }
      const propValues = [
        { propName: 'content', value: 'Some content', type: 'literal' as const }
      ]

      const isCovered = (reporter as any).isVariantCovered('content', variant, propValues)
      expect(isCovered).toBe(true)
    })

    it('should match literal number values to Number type variants', () => {
      reporter = new VcCoverageReporter({ strict: true })

      // Number type variant should accept number literal values
      const variant = { type: 'number' as const, value: 'number' }
      const propValues = [
        { propName: 'count', value: 42, type: 'literal' as const }
      ]

      const isCovered = (reporter as any).isVariantCovered('count', variant, propValues)
      expect(isCovered).toBe(true)
    })

    it('should match literal boolean values to Boolean type variants', () => {
      reporter = new VcCoverageReporter({ strict: true })

      // Boolean type variant should accept boolean literal values
      const variant = { type: 'boolean' as const, value: 'boolean' }
      const propValues = [
        { propName: 'flag', value: true, type: 'literal' as const }
      ]

      const isCovered = (reporter as any).isVariantCovered('flag', variant, propValues)
      expect(isCovered).toBe(true)
    })

    it('should match function values to object type variants (Vue Function prop type)', () => {
      reporter = new VcCoverageReporter({ strict: true })

      // Vue's Function prop type is recognized as 'object' by TypeScript
      // But actual function values are extracted as 'function' type
      const variant = { type: 'object' as const, value: 'object' }
      const propValues = [
        { propName: 'content', value: 'function', type: 'function' as const }
      ]

      const isCovered = (reporter as any).isVariantCovered('content', variant, propValues)
      expect(isCovered).toBe(true)
    })

    it('should handle String and Function union type props (Vue prop type pattern)', () => {
      reporter = new VcCoverageReporter({ strict: true })

      const unitData = {
        '/test/Button.tsx': {
          props: ['content'],
          propValues: [
            { propName: 'content', value: 'Some content', type: 'literal' as const },
            { propName: 'content', value: 'function', type: 'function' as const }
          ],
          slots: [],
          exposes: []
        }
      }

      const compData = {
        '/test/Button.tsx': {
          props: ['content'],
          propsWithVariants: [
            {
              name: 'content',
              variants: [
                { type: 'string' as const, value: 'string' },
                { type: 'object' as const, value: 'object' } // Function type recognized as object
              ]
            }
          ],
          slots: [],
          exposes: []
        }
      }

      const result = (reporter as any).mergeData(unitData, compData)

      expect(result[0].props.total).toBe(2)
      expect(result[0].props.covered).toBe(2) // Both variants should be covered
      expect(result[0].props.details[0].name).toBe('content[string]')
      expect(result[0].props.details[0].covered).toBe(true) // Covered by literal string
      expect(result[0].props.details[1].name).toBe('content[object]')
      expect(result[0].props.details[1].covered).toBe(true) // Covered by function
    })
  })
})
