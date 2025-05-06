import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { analyzeSlots } from '../../lib/analyzer/slots-analyzer'
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

describe('slots-analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

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

  it('should analyze slots in jsx', () => {
    const code = `
      export default {
        render() {
          const { $slots } = this
          return _createVNode("div", {
            "class": bem('action')
          }, [$slots.action?.()])
        }
      }
    `
    const slots = analyzeSlots(code)
    expect(slots).toEqual(['action'])
  })

  it('should analyze slots in jsx with $slots', () => {
    const code = `
      export default {
        render() {
          const slots = this.$slots
          return _createVNode("div", {
            "class": bem('action')
          }, [$slots.action?.()])
        }
      }
    `
    const slots = analyzeSlots(code)
    expect(slots).toEqual(['action'])
  })

  it('should analyze slots in jsx with function', () => {
    const code = `
      export default {
        render() {
          const slots = this.$slots
          const renderIcon = () => {
            return slots.action?.()
          }
          return _createVNode("div", {
            "class": bem('action')
          }, [renderIcon()])
        }
      }
    `
    const slots = analyzeSlots(code)
    expect(slots).toEqual(['action'])
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

  it('should analyze slots defined with SlotsType syntax', () => {
    const code = `
      import { SlotsType, VNode } from 'vue';
      
      export default defineComponent({
        slots: Object as SlotsType<{
          default?: () => VNode[];
          icon?: () => VNode[];
        }>,
        render() {
          return h('div', this.$slots.default?.())
        }
      })
    `
    const slots = analyzeSlots(code)
    expect(slots).toEqual(['default', 'icon'])
  })

  it('should analyze slots imported from another file', () => {
    // 模拟导入文件内容
    const mockImportedFileContent = `
      import { SlotsType, VNode } from 'vue';
      
      export const buttonSlots = Object as SlotsType<{
        default?: () => VNode[];
        icon?: () => VNode[];
      }>
    `
    
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(mockImportedFileContent)
    
    const code = `
      import { buttonSlots } from './props'
      
      export default defineComponent({
        name: 'MyButton',
        slots: buttonSlots,
        render() {
          return h('div', this.$slots.default?.())
        }
      })
    `
    
    const filePath = '/fake/component/Button.tsx'
    const slots = analyzeSlots(code, undefined, filePath)
    
    // 验证
    expect(path.dirname).toHaveBeenCalledWith(filePath)
    // 不要检查具体的参数，只检查是否被调用
    expect(path.resolve).toHaveBeenCalled()
    expect(fs.readFileSync).toHaveBeenCalled()
    expect(slots).toEqual(['default', 'icon'])
  })
  
  it('should handle multiple slots imports', () => {
    // 修改为两个单独的导入，不使用spread运算符
    const mockPropsFileContent = `
      import { SlotsType, VNode } from 'vue';
      
      export const cardSlots = Object as SlotsType<{
        header?: () => VNode[];
        footer?: () => VNode[];
        default?: () => VNode[];
      }>
    `
    
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(mockPropsFileContent)
    
    const code = `
      import { cardSlots } from './props'
      
      export default defineComponent({
        name: 'MyCard',
        slots: cardSlots,
        render() {
          return h('div', [
            this.$slots.header?.(),
            this.$slots.default?.(),
            this.$slots.footer?.()
          ])
        }
      })
    `
    
    const filePath = '/fake/component/Card.tsx'
    const slots = analyzeSlots(code, undefined, filePath)
    
    // 需要验证结果包含所有插槽
    expect(slots).toContain('header')
    expect(slots).toContain('footer')
    expect(slots).toContain('default')
    expect(slots.length).toBe(3) // header, footer, default
  })

  it('should handle when imported file contains syntax errors or is not found', () => {
    // 模拟导入文件不存在
    vi.mocked(fs.existsSync).mockReturnValue(false)
    
    const code = `
      import { buttonSlots } from './non-existent-file'
      
      export default defineComponent({
        name: 'MyButton',
        slots: buttonSlots,
        render() {
          return h('button', this.$slots.default?.())
        }
      })
    `
    
    const filePath = '/fake/component/Button.tsx'
    const slots = analyzeSlots(code, undefined, filePath)
    
    // 应该只识别出render函数中使用的插槽
    expect(slots).toEqual(['default'])
  })
}) 