import { describe, it, expect } from 'vitest'
import { matchTestCoverage } from '../../lib/matcher/test-coverage-matcher'
import type { ComponentAnalysis } from '../../lib/matcher/test-coverage-matcher'

describe('test-coverage-matcher', () => {
  it('should match props coverage in test file', () => {
    const analysis: ComponentAnalysis = {
      props: ['title', 'count', 'isActive'],
      emits: [],
      slots: [],
      exposes: []
    }

    const testCode = `
      describe('MyComponent', () => {
        it('should render title', () => {
          const wrapper = mount(MyComponent, {
            props: {
              title: 'Hello'
            }
          })
        })

        it('should handle count', () => {
          const wrapper = mount(MyComponent, {
            props: {
              count: 42
            }
          })
        })
      })
    `

    const coverage = matchTestCoverage(analysis, testCode)
    expect(coverage.props).toEqual([
      { name: 'title', covered: true },
      { name: 'count', covered: true },
      { name: 'isActive', covered: false }
    ])
  })

  it('should match emits coverage in test file', () => {
    const analysis: ComponentAnalysis = {
      props: [],
      emits: ['change', 'submit', 'cancel'],
      slots: [],
      exposes: []
    }

    const testCode = `
      describe('MyComponent', () => {
        it('should emit change event', async () => {
          const wrapper = mount(MyComponent)
          await wrapper.find('input').trigger('input')
          expect(wrapper.emitted('change')).toBeTruthy()
        })

        it('should emit submit event', async () => {
          const wrapper = mount(MyComponent)
          await wrapper.find('form').trigger('submit')
          expect(wrapper.emitted('submit')).toBeTruthy()
        })
      })
    `

    const coverage = matchTestCoverage(analysis, testCode)
    expect(coverage.emits).toEqual([
      { name: 'change', covered: true },
      { name: 'submit', covered: true },
      { name: 'cancel', covered: false }
    ])
  })

  it('should match slots coverage in test file', () => {
    const analysis: ComponentAnalysis = {
      props: [],
      emits: [],
      slots: ['header', 'default', 'footer'],
      exposes: []
    }

    const testCode = `
      describe('MyComponent', () => {
        it('should render header slot', () => {
          const wrapper = mount(MyComponent, {
            slots: {
              header: '<h1>Header</h1>'
            }
          })
        })

        it('should render default slot', () => {
          const wrapper = mount(MyComponent, {
            slots: {
              default: '<div>Content</div>'
            }
          })
        })
      })
    `

    const coverage = matchTestCoverage(analysis, testCode)
    expect(coverage.slots).toEqual([
      { name: 'header', covered: true },
      { name: 'default', covered: true },
      { name: 'footer', covered: false }
    ])
  })

  it('should match expose coverage in test file', () => {
    const analysis: ComponentAnalysis = {
      props: [],
      emits: [],
      slots: [],
      exposes: ['reset', 'submit', 'validate']
    }

    const testCode = `
      describe('MyComponent', () => {
        it('should expose reset method', () => {
          const wrapper = mount(MyComponent)
          expect(wrapper.vm.reset).toBeDefined()
          wrapper.vm.reset()
        })

        it('should expose submit method', async () => {
          const wrapper = mount(MyComponent)
          await wrapper.vm.submit()
        })
      })
    `

    const coverage = matchTestCoverage(analysis, testCode)
    expect(coverage.exposes).toEqual([
      { name: 'reset', covered: true },
      { name: 'submit', covered: true },
      { name: 'validate', covered: false }
    ])
  })

  it('should handle empty analysis and test file', () => {
    const analysis: ComponentAnalysis = {
      props: [],
      emits: [],
      slots: [],
      exposes: []
    }

    const testCode = `
      describe('MyComponent', () => {
        it('should render', () => {
          const wrapper = mount(MyComponent)
          expect(wrapper.exists()).toBe(true)
        })
      })
    `

    const coverage = matchTestCoverage(analysis, testCode)
    expect(coverage).toEqual({
      props: [],
      emits: [],
      slots: [],
      exposes: []
    })
  })
}) 