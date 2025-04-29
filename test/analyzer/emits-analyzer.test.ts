import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeEmits } from '../../lib/analyzer/emits-analyzer'
import * as fs from 'fs'
import * as path from 'path'

// Mock fs and path modules for import testing
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

vi.mock('path', () => ({
  dirname: vi.fn().mockReturnValue('/fake/path'),
  resolve: vi.fn().mockImplementation((...args) => args.join('/')),
}))

describe('emits-analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

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

  it('should analyze emits with variable reference', () => {
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

  it('should analyze emits imported from another file', () => {
    // 模拟导入文件内容
    const mockImportedFileContent = `
      export const buttonEmits = ['click', 'hover', 'focus']
    `
    
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(mockImportedFileContent)
    
    const code = `
      import { buttonEmits } from './events'
      
      export default defineComponent({
        name: 'MyButton',
        emits: buttonEmits,
      })
    `
    
    const filePath = '/fake/component/Button.tsx'
    const emits = analyzeEmits(code, undefined, filePath)
    
    // 验证
    expect(path.dirname).toHaveBeenCalledWith(filePath)
    expect(path.resolve).toHaveBeenCalledWith('/fake/path', './events.ts')
    expect(fs.readFileSync).toHaveBeenCalled()
    expect(emits).toEqual(['click', 'hover', 'focus'])
  })
}) 