import { describe, it, expect } from 'vitest'
import { analyzeSlots } from '../../lib/analyzer/slots-analyzer'

describe('slots-analyzer', () => {
  it('should analyze slots in Vue SFC template', () => {
    const code = `
      <template>
        <div>
          <slot name="header"></slot>
          <slot></slot>
          <slot name="footer">
            <p>Default footer content</p>
          </slot>
        </div>
      </template>
    `
    const slots = analyzeSlots(code)
    expect(slots).toEqual(['header', 'default', 'footer'])
  })

  it('should analyze slots in render function', () => {
    const code = `
      export default {
        render() {
          return h('div', [
            this.$slots.header?.(),
            this.$slots.default?.(),
            this.$slots.footer?.()
          ])
        }
      }
    `
    const slots = analyzeSlots(code)
    expect(slots).toEqual(['header', 'default', 'footer'])
  })

  it('should analyze slots in setup script', () => {
    const code = `
      <script setup>
      import { useSlots } from 'vue'
      
      const slots = useSlots()
      const hasHeader = !!slots.header
      const hasFooter = !!slots.footer
      </script>
    `
    const slots = analyzeSlots(code)
    expect(slots).toEqual(['header', 'footer'])
  })

  it('should analyze scoped slots', () => {
    const code = `
      <script setup>
      const items = [{ text: 'Hello' }]
      const count = 5
      </script>

      <template>
        <div>
          <slot name="item"></slot>
          <slot name="footer"></slot>
        </div>
      </template>
    `
    const slots = analyzeSlots(code)
    expect(slots).toEqual(['item', 'footer'])
  })

  it('should return empty array for component without slots', () => {
    const code = `
      <template>
        <div>No slots here</div>
      </template>
    `
    const slots = analyzeSlots(code)
    expect(slots).toEqual([])
  })

  it('should analyze slots in TSX component', () => {
    const code = `
      export default {
        render() {
          return h('div', [
            this.$slots.header?.(),
            this.$slots.default?.(),
            this.$slots.footer?.()
          ])
        }
      }
    `
    const slots = analyzeSlots(code)
    expect(slots).toEqual(['header', 'default', 'footer'])
  }) 
}) 