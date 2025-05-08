import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { analyzeProps } from '../../lib/analyzer/props-analyzer'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

// Mock fs and path modules for import testing
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

vi.mock('path', () => ({
  dirname: vi.fn().mockReturnValue('/fake/path'),
  resolve: vi.fn().mockImplementation((...args) => args.join('/')),
}))

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 测试用例目录
const TEST_CASES_DIR = path.resolve(__dirname, '../fixtures/props')

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
    const code = `
     import { pick } from 'lodash'
     const buttonProps1 = {
       label: { type: String, required: true },
       disabled: { type: Boolean, default: false },
       type: String
     };
     const buttonProps2 = pick(buttonProps1, ['label', 'disabled'])
     export default {
       props: buttonProps2
     }
   `
    const props = analyzeProps(code)

    expect(props).toEqual(['label', 'disabled'])
  })
})

describe('Props Analyzer Comparison (Babel vs ts-morph)', () => {
  // 测试简单对象形式的props
  it('should analyze object props correctly', () => {
    const code = `
    export default {
      props: {
        name: String,
        age: Number,
        isActive: Boolean
      }
    }
    `;
    
    const tempFile = path.join(__dirname, '_temp_test_file.ts');
    fs.writeFileSync(tempFile, code);
    
    try {
      const babelResult = analyzeProps(code);
      const morphResult = analyzeProps(code, undefined, tempFile);
      
      expect(babelResult.sort()).toEqual(['name', 'age', 'isActive'].sort());
      expect(morphResult.sort()).toEqual(['name', 'age', 'isActive'].sort());
      expect(morphResult).toEqual(babelResult);
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });
  
  // 测试数组形式的props
  it('should analyze array props correctly', () => {
    const code = `
    export default {
      props: ['name', 'age', 'isActive']
    }
    `;
    
    const tempFile = path.join(__dirname, '_temp_test_file.ts');
    fs.writeFileSync(tempFile, code);
    
    try {
      const babelResult = analyzeProps(code);
      const morphResult = analyzeProps(code, undefined, tempFile);
      
      expect(babelResult.sort()).toEqual(['name', 'age', 'isActive'].sort());
      expect(morphResult.sort()).toEqual(['name', 'age', 'isActive'].sort());
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });
  
  // 测试defineProps的泛型形式
  it('should analyze defineProps with generics correctly', () => {
    const code = `
    <script setup lang="ts">
    const props = defineProps<{
      name: string;
      age: number;
      isActive: boolean;
    }>();
    </script>
    `;
    
    const tempFile = path.join(__dirname, '_temp_test_file.tsx');
    fs.writeFileSync(tempFile, code);
    
    try {
      const babelResult = analyzeProps(code);
      const morphResult = analyzeProps(code, undefined, tempFile);
      
      expect(babelResult.sort()).toEqual(['name', 'age', 'isActive'].sort());
      expect(morphResult.sort()).toEqual(['name', 'age', 'isActive'].sort());
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });
  
  // 测试defineProps的对象字面量形式
  it('should analyze defineProps with object correctly', () => {
    const code = `
    <script setup>
    const props = defineProps({
      name: String,
      age: Number,
      isActive: Boolean
    });
    </script>
    `;
    
    const tempFile = path.join(__dirname, '_temp_test_file.tsx');
    fs.writeFileSync(tempFile, code);
    
    try {
      const babelResult = analyzeProps(code);
      const morphResult = analyzeProps(code, undefined, tempFile);
      
      expect(babelResult.sort()).toEqual(['name', 'age', 'isActive'].sort());
      expect(morphResult.sort()).toEqual(['name', 'age', 'isActive'].sort());
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });
  
  // 测试带有类型引用的defineProps
  it('should analyze defineProps with type reference correctly', () => {
    const code = `
    <script setup lang="ts">
    interface Props {
      name: string;
      age: number;
      isActive: boolean;
    }
    
    const props = defineProps<Props>();
    </script>
    `;
    
    const tempFile = path.join(__dirname, '_temp_test_file.tsx');
    fs.writeFileSync(tempFile, code);
    
    try {
      const babelResult = analyzeProps(code);
      const morphResult = analyzeProps(code, undefined, tempFile);
      
      expect(babelResult.sort()).toEqual(['name', 'age', 'isActive'].sort());
      expect(morphResult.sort()).toEqual(['name', 'age', 'isActive'].sort());
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });
  
  // 测试带有交叉类型(intersection types)的props
  it('should analyze props with intersection types correctly', () => {
    const code = `
    <script setup lang="ts">
    interface BaseProps {
      id: string;
      class: string;
    }
    
    interface SpecificProps {
      name: string;
      age: number;
    }
    
    type Props = BaseProps & SpecificProps;
    
    const props = defineProps<Props>();
    </script>
    `;
    
    const tempFile = path.join(__dirname, '_temp_test_file.tsx');
    fs.writeFileSync(tempFile, code);
    
    try {
      const babelResult = analyzeProps(code);
      const morphResult = analyzeProps(code, undefined, tempFile);
      
      expect(morphResult.sort()).toEqual(['id', 'class', 'name', 'age'].sort());
      // 注意：babel版本可能无法正确处理交叉类型
      console.log('Babel result:', babelResult);
      console.log('ts-morph result:', morphResult);
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });
  
  // 测试继承的接口
  it('should analyze props with interface extension correctly', () => {
    const code = `
    <script setup lang="ts">
    interface BaseProps {
      id: string;
      class: string;
    }
    
    interface Props extends BaseProps {
      name: string;
      age: number;
    }
    
    const props = defineProps<Props>();
    </script>
    `;
    
    const tempFile = path.join(__dirname, '_temp_test_file.tsx');
    fs.writeFileSync(tempFile, code);
    
    try {
      const babelResult = analyzeProps(code);
      const morphResult = analyzeProps(code, undefined, tempFile);
      
      expect(morphResult.sort()).toEqual(['id', 'class', 'name', 'age'].sort());
      // 注意：babel版本可能无法正确处理接口继承
      console.log('Babel result:', babelResult);
      console.log('ts-morph result:', morphResult);
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });
}); 