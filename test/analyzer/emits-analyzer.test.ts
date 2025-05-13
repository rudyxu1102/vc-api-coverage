import { describe, it, expect, vi } from 'vitest'
import EmitsAnalyzer from '../../lib/analyzer/emits-analyzer'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { Project } from 'ts-morph'

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const tempFile = path.join(__dirname, '_temp_test_file.tsx')

// Mock fs and path modules for import testing
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

describe('Emits Analyzer', () => {
  // 测试对象形式的emits
  it('should analyze object emits correctly', () => {
    const code = `
    export default defineComponent({
      emits: {
        submit: null,
        change: (value) => typeof value === 'string',
        'update:modelValue': null
      }
    })
    `
    const project = new Project();
    const sourceFile = project.createSourceFile('./_temp_test_file.tsx', code);
    const morphResult = new EmitsAnalyzer(sourceFile, project).analyze()
    expect(morphResult.sort()).toEqual(['submit', 'change', 'update:modelValue'].sort())
  })

  // 测试数组形式的emits
  it('should analyze array emits correctly', () => {
    const code = `
    export default defineComponent({
      emits: ['submit', 'change', 'update:modelValue']
    })
    `
    const project = new Project();
    const sourceFile = project.createSourceFile('./_temp_test_file.tsx', code);
    const morphResult = new EmitsAnalyzer(sourceFile, project).analyze()
    expect(morphResult.sort()).toEqual(['submit', 'change', 'update:modelValue'].sort())
  })
  
  // 测试defineEmits的类型声明形式
  it('should analyze defineEmits with type declaration correctly', () => {
    const code = `
    const emit = defineEmits<{
      (e: 'submit', formData: object): void
      (e: 'change', value: string): void
      (e: 'update:modelValue', value: string): void
    }>();
    `
    const project = new Project();
    const sourceFile = project.createSourceFile('./_temp_test_file.tsx', code);
    const morphResult = new EmitsAnalyzer(sourceFile, project).analyze()
    expect(morphResult.sort()).toEqual(['submit', 'change', 'update:modelValue'].sort())
  })
  
  // 测试defineEmits的数组形式
  it('should analyze defineEmits with array correctly', () => {
    const code = `
    const emit = defineEmits(['submit', 'change', 'update:modelValue']);
    `
    const project = new Project();
    const sourceFile = project.createSourceFile('./_temp_test_file.tsx', code);
    const morphResult = new EmitsAnalyzer(sourceFile, project).analyze()
    expect(morphResult.sort()).toEqual(['submit', 'change', 'update:modelValue'].sort())
  })
  
  // 测试defineEmits的对象形式
  it('should analyze defineEmits with object correctly', () => {
    const code = `
    const emit = defineEmits({
      submit: null,
      change: (value) => typeof value === 'string',
      'update:modelValue': null
    });
    `
    const project = new Project();
    const sourceFile = project.createSourceFile('./_temp_test_file.tsx', code);
    const morphResult = new EmitsAnalyzer(sourceFile, project).analyze()
    expect(morphResult.sort()).toEqual(['submit', 'change', 'update:modelValue'].sort())
  })
  
  // 测试defineComponent中的emits
  it('should analyze defineComponent emits correctly', () => {
    const code = `
    export default defineComponent({
      name: 'MyComponent',
      emits: ['submit', 'change', 'update:modelValue'],
      setup(props, { emit }) {
        emit('submit');
      }
    });
    `
    const project = new Project();
    const sourceFile = project.createSourceFile('./_temp_test_file.tsx', code);
    const morphResult = new EmitsAnalyzer(sourceFile, project).analyze()
    expect(morphResult.sort()).toEqual(['submit', 'change', 'update:modelValue'].sort())
  })
  
  // 测试变量引用的emits
  it('should analyze emits with variable reference correctly', () => {
    const code = `
    const componentEmits = ['submit', 'change', 'update:modelValue'];
    
    export default defineComponent({
      emits: componentEmits
    });
    `
    const project = new Project();
    const sourceFile = project.createSourceFile('./_temp_test_file.tsx', code);
    const morphResult = new EmitsAnalyzer(sourceFile, project).analyze()
    expect(morphResult.sort()).toEqual(['submit', 'change', 'update:modelValue'].sort())
  })
  
  // 测试导入的emits
  // it('should analyze imported emits correctly', () => {
  //   const mockImportedFileContent = `
  //     export const buttonEmits = ['click', 'focus', 'blur'];
  //   `
  //   vi.mocked(fs.existsSync).mockReturnValue(true)
  //   vi.mocked(fs.readFileSync).mockReturnValueOnce(mockImportedFileContent)
    
  //   const code = `
  //   <script setup>
  //   import { buttonEmits } from '../components/button-events';
    
  //   const emit = defineEmits(buttonEmits);
  //   </script>
  //   `
  //   const morphResult = new EmitsAnalyzer(tempFile, code).analyze()
  //   expect(morphResult.sort()).toEqual(['click', 'focus', 'blur'].sort())
  // })
  
  // 测试导入的对象形式emits
  // it('should analyze imported object emits correctly', () => {
  //   const mockImportedFileContent = `
  //     export const formEmits = {
  //       submit: null,
  //       reset: null,
  //       validate: (valid) => typeof valid === 'boolean'
  //     };
  //   `
  //   vi.mocked(fs.existsSync).mockReturnValue(true)
  //   vi.mocked(fs.readFileSync).mockReturnValueOnce(mockImportedFileContent)
    
  //   const code = `
  //   <script setup>
  //   import { formEmits } from '../components/form-events';
    
  //   const emit = defineEmits(formEmits);
  //   </script>
  //   `
  //   const morphResult = new EmitsAnalyzer(tempFile, code).analyze()
  //   expect(morphResult.sort()).toEqual(['submit', 'reset', 'validate'].sort())
  // })
  
  // 测试嵌套的变量引用
  // it('should analyze nested variable references correctly', () => {
  //   const code = `
  //   const baseEmits = ['change', 'input'];
  //   const componentEmits = [...baseEmits, 'submit', 'reset'];
    
  //   export default defineComponent({
  //     emits: componentEmits
  //   });
  //   `;
  //   const project = new Project();
  //   const sourceFile = project.createSourceFile('./_temp_test_file.tsx', code);
  //   const morphResult = new EmitsAnalyzer(sourceFile, project).analyze();
  //   expect(morphResult.sort()).toEqual(['change', 'input', 'submit', 'reset'].sort());
  // })
  
  // 测试无emits的组件
  it('should return empty array for component without emits', () => {
    const code = `
    export default defineComponent({
      props: {
        name: String
      }
    });
    `
    const project = new Project();
    const sourceFile = project.createSourceFile('./_temp_test_file.tsx', code);
    const morphResult = new EmitsAnalyzer(sourceFile, project).analyze()
    expect(morphResult).toEqual([])
  })
}) 