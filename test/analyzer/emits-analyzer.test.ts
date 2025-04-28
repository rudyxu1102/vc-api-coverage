import { describe, it, expect } from 'vitest'
import { analyzeEmits } from '../../lib/analyzer/emits-analyzer'

describe('emits-analyzer', () => {
  it('should analyze emits in Vue SFC with type declaration', () => {
    const code = `
      <script setup lang="ts">
      defineEmits<{
        (e: 'change', value: string): void
        (e: 'update', id: number): void
        (e: 'delete'): void
      }>()
      </script>
    `
    const emits = analyzeEmits(code)
    expect(emits).toEqual(['change', 'update', 'delete'])
  })

  it('should analyze emits in TSX component', () => {
    const code = `
      export default defineComponent({
        emits: ['submit', 'cancel', 'error'],
        setup(props, { emit }) {
          emit('submit')
        }
      })
    `
    const emits = analyzeEmits(code)
    expect(emits).toEqual(['submit', 'cancel', 'error'])
  })

  it('should analyze emits with runtime validation', () => {
    const code = `
      export default {
        emits: {
          submit: (payload) => {
            return payload.email && payload.password
          },
          'update:modelValue': null,
          change: null
        }
      }
    `
    const emits = analyzeEmits(code)
    expect(emits).toEqual(['submit', 'update:modelValue', 'change'])
  })

  it('should analyze emits with runtime validation', () => {
    const code = `
      const emits = ['submit', 'update:modelValue', 'change']
      export default {
        emits,
      }
    `
    const emits = analyzeEmits(code)
    expect(emits).toEqual(['submit', 'update:modelValue', 'change'])
  })

  it('should return empty array for component without emits', () => {
    const code = `
      <script setup>
      // no emits
      </script>
    `
    const emits = analyzeEmits(code)
    expect(emits).toEqual([])
  })
}) 