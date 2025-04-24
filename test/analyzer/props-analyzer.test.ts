import { describe, it, expect } from 'vitest'
import { analyzeProps } from '../../lib/analyzer/props-analyzer'

describe('props-analyzer', () => {
  it('should analyze props in Vue SFC', () => {
    const code = `
      <script setup lang="ts">
      defineProps<{
        title: string
        count: number
        isActive?: boolean
      }>()
      </script>
    `
    const props = analyzeProps(code)
    expect(props).toEqual(['title', 'count', 'isActive'])
  })

  it('should analyze props in TSX component', () => {
    const code = `
      export interface Props {
        name: string;
        age: number;
        optional?: string;
      }

      export default defineComponent<Props>({
        props: ['name', 'age', 'optional'],
        setup(props) {
          // ...
        }
      })
    `
    const props = analyzeProps(code)
    expect(props).toEqual(['name', 'age', 'optional'])
  })

  it('should analyze props with runtime declaration', () => {
    const code = `
      export default {
        props: {
          message: String,
          count: {
            type: Number,
            required: true
          },
          flag: {
            type: Boolean,
            default: false
          }
        }
      }
    `
    const props = analyzeProps(code)
    expect(props).toEqual(['message', 'count', 'flag'])
  })

  it('should return empty array for component without props', () => {
    const code = `
      <script setup>
      // no props
      </script>
    `
    const props = analyzeProps(code)
    expect(props).toEqual([])
  })
}) 