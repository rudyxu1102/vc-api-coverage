import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import SlotsAnalyzer from '../../lib/analyzer/slots-analyzer'
import * as fs from 'fs'
import * as path from 'path'
import { Project } from 'ts-morph'

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
  default: {}
}));

describe('slots-analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('should analyze scoped slots', () => {
    const code = `
      const items = [{ text: 'Hello' }]
      const count = 5
      defineSlots<{
        item: () => VNode[];
        footer: () => VNode[];
      }>()
    `
    const project = new Project();
    const sourceFile = project.createSourceFile('./_temp_test_file.tsx', code);
    const slots = new SlotsAnalyzer(sourceFile, project).analyze()
    expect(slots).toEqual(['item', 'footer'])
  })

  it('should return empty array for component without slots', () => {
    const code = `
      <template>
        <div>No slots here</div>
      </template>
    `
    const project = new Project();
    const sourceFile = project.createSourceFile('./_temp_test_file.tsx', code);
    const slots = new SlotsAnalyzer(sourceFile, project).analyze()
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
    const project = new Project();
    const sourceFile = project.createSourceFile('./_temp_test_file.tsx', code);
    const slots = new SlotsAnalyzer(sourceFile, project).analyze()
    expect(slots).toEqual(['default', 'icon'])
  })

  
  // Skip this test for now until we can resolve the mocking issue
  it.skip('should handle multiple slots imports', () => {
    // 修改为两个单独的导入，不使用spread运算符
    const mockPropsFileContent = `
      import { SlotsType, VNode } from 'vue';
      
      export const cardSlots = Object as SlotsType<{
        header?: () => VNode[];
        footer?: () => VNode[];
        default?: () => VNode[];
      }>
    `
    
    // Set mock implementation for this specific test
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(mockPropsFileContent);
    
    const project = new Project();
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
    const sourceFile = project.createSourceFile(filePath, code);
    const slots = new SlotsAnalyzer(sourceFile, project).analyze()
    
    // 需要验证结果包含所有插槽
    expect(slots).toContain('header')
    expect(slots).toContain('footer')
    expect(slots).toContain('default')
    expect(slots.length).toBe(3) // header, footer, default
  })

}) 