import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { analyzeProps } from '../../lib/analyzer/props-analyzer'
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

describe('props-analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

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

  it('should analyze props with inline object declaration', () => {
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

  it('should analyze props with variable reference', () => {
    const code = `
      const props = {
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
      export default {
        props,
      }
    `
    const props = analyzeProps(code)
    expect(props).toEqual(['message', 'count', 'flag'])
  })

  it('should analyze props imported from another file', () => {
    // 模拟导入文件内容
    const mockImportedFileContent = `
      export const buttonProps = {
        label: { type: String, required: true },
        size: { type: String, default: 'md' },
        disabled: { type: Boolean, default: false },
      }
    `

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(mockImportedFileContent)

    const code = `
      import { buttonProps } from './props'
      
      export default defineComponent({
        name: 'MyButton',
        props: buttonProps,
      })
    `

    const filePath = '/fake/component/Button.tsx'
    const props = analyzeProps(code, undefined, filePath)

    // 验证
    expect(path.dirname).toHaveBeenCalledWith(filePath)
    expect(path.resolve).toHaveBeenCalledWith('/fake/path', './props.ts')
    expect(fs.readFileSync).toHaveBeenCalled()
    expect(props).toEqual(['label', 'size', 'disabled'])
  })

  it('should analyze nested imported props with spread operator', () => {
    // 模拟基础props和特定props的导入
    const mockCommonPropsContent = `
      export const commonProps = {
        loading: { type: Boolean, default: false },
      }
    `

    const mockButtonPropsContent = `
      import { commonProps } from './common'
      
      export const buttonProps = {
        ...commonProps,
        label: { type: String, required: true },
        size: { type: String, default: 'md' },
      }
    `

    // 第一次调用返回buttonProps文件内容，第二次调用返回commonProps文件内容
    vi.mocked(fs.existsSync)
      .mockReturnValueOnce(true)  // 第一个文件存在
      .mockReturnValueOnce(true)  // 第二个文件存在

    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(mockButtonPropsContent)  // 读取第一个文件
      .mockReturnValueOnce(mockCommonPropsContent)  // 读取第二个文件

    vi.mocked(path.resolve)
      .mockReturnValueOnce('/fake/path/props.ts')
      .mockReturnValueOnce('/fake/path/common.ts')

    const code = `
      import { buttonProps } from './props'
      
      export default defineComponent({
        name: 'MyButton',
        props: buttonProps,
      })
    `

    const filePath = '/fake/component/Button.tsx'
    const props = analyzeProps(code, undefined, filePath)

    // 验证调用了两次文件读取，一次读取buttonProps，一次读取commonProps
    expect(fs.existsSync).toHaveBeenCalledTimes(2)
    expect(fs.readFileSync).toHaveBeenCalledTimes(2)
    expect(path.resolve).toHaveBeenCalledTimes(2)

    // 验证结果包含所有属性，包括从commonProps导入的
    expect(props).toContain('loading')  // 从commonProps导入
    expect(props).toContain('label')    // 直接在buttonProps中定义
    expect(props).toContain('size')     // 直接在buttonProps中定义
    expect(props.length).toBe(3)
  })

  it('should analyze typescript with as', () => {
    const code = `
      const buttonProps = {
        loading: Boolean,
        disabled: Boolean,
      } as const
      export default {
        props: buttonProps
      }
    `
    const props = analyzeProps(code)
    expect(props).toEqual(['loading', 'disabled'])
  })

  it('should analyze typescript with spread', () => {
    const code = `
      const buttonProps = {
        loading: Boolean,
        disabled: Boolean,
      } as const
      export default {
        props: {
          ...buttonProps,
          size: String,
        }
      }
    `
    const props = analyzeProps(code)
    expect(props).toEqual(['loading', 'disabled', 'size'])
  })

  it('should analyze typescript with spread from imported file', () => {
    // 模拟导入文件内容
    const mockImportedFileContent = `
      export const buttonProps = {
        label: { type: String, required: true },
        disabled: { type: Boolean, default: false },
      }
    `

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(mockImportedFileContent)
    const code = `
      import { buttonProps } from './props'
      export default {
        props: {
          ...buttonProps,
          size: String,
        }
      }
    `
    const filePath = '/fake/component/Button.tsx'
    const props = analyzeProps(code, undefined, filePath)

    // // 验证fs.readFileSync被调用
    expect(fs.readFileSync).toHaveBeenCalled()
    expect(props).toEqual(['label', 'disabled', 'size'])
  })

  it('should analyze typescript with spread from imported file 2', () => {
    // 模拟导入文件内容
    const mockImportedFileContent = `
     export const buttonProps = {
       label: { type: String, required: true },
       disabled: { type: Boolean, default: false },
     } as const
   `

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(mockImportedFileContent)
    const code = `
     import { buttonProps } from './props'
     const buttonProps2 = {
      ...buttonProps,
      size: {
        type: String,
        default: 'md',
      },
     }
     export default {
       props: buttonProps2
     }
   `
    const filePath = '/fake/component/Button.tsx'
    const props = analyzeProps(code, undefined, filePath)

    // // 验证fs.readFileSync被调用
    expect(fs.readFileSync).toHaveBeenCalled()
    expect(props).toEqual(['label', 'disabled', 'size'])
  })

  it('should analyze typescript with lodash function', () => {
    // 模拟导入文件内容
    const mockImportedFileContent = `
     export const buttonProps = {
       label: { type: String, required: true },
       disabled: { type: Boolean, default: false },
       type: String
     } as const
   `

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(mockImportedFileContent)
    const code = `
     import { pick } from 'lodash'
     import { buttonProps } from './props'
     const buttonProps2 = pick(buttonProps, ['label', 'disabled'])
     export default {
       props: buttonProps2
     }
   `
    const filePath = '/fake/component/Button.tsx'
    const props = analyzeProps(code, undefined, filePath)

    // // 验证fs.readFileSync被调用
    expect(fs.readFileSync).toHaveBeenCalled()
    expect(props).toEqual(['label', 'disabled'])
  })
}) 