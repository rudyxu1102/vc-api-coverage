import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import SlotsAnalyzer from '../../lib/analyzer/slots-analyzer'
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

  it('should analyze scoped slots', () => {
    const code = `
      <script setup lang="ts">
      const items = [{ text: 'Hello' }]
      const count = 5
      defineSlots<{
        item: () => VNode[];
        footer: () => VNode[];
      }>()
      </script>

      <template>
        <div>
          <slot name="item"></slot>
          <slot name="footer"></slot>
        </div>
      </template>
    `
    const slots = new SlotsAnalyzer('/fake/component/Button.tsx', code).analyze()
    expect(slots).toEqual(['item', 'footer'])
  })

  it('should return empty array for component without slots', () => {
    const code = `
      <template>
        <div>No slots here</div>
      </template>
    `
    const slots = new SlotsAnalyzer('/fake/component/Button.tsx', code).analyze()
    expect(slots).toEqual([])
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
    const slots = new SlotsAnalyzer('/fake/component/Button.tsx', code).analyze()
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
    const slots = new SlotsAnalyzer(filePath, code).analyze()
    
    // 需要验证结果包含所有插槽
    expect(slots).toContain('header')
    expect(slots).toContain('footer')
    expect(slots).toContain('default')
    expect(slots.length).toBe(3) // header, footer, default
  })

}) 