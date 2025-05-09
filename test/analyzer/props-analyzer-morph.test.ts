import { describe, it, expect, vi } from 'vitest';
import PropsAnalyzer from '../../lib/analyzer/props-analyzer-morph';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempFile = path.join(__dirname, '_temp_test_file.tsx');
// Mock fs and path modules for import testing
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

describe('Props Analyzer', () => {
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
    
    const morphResult = new PropsAnalyzer(tempFile, code).analyze();
    expect(morphResult.sort()).toEqual(['name', 'age', 'isActive'].sort());
  });

  it('should analyze object props correctly', () => {
    const code = `
    export default {
      props: {
        name: String,
        age: Number,
        isActive: Boolean
      } as const
    }
    `;
    
    const morphResult = new PropsAnalyzer(tempFile, code).analyze();
    expect(morphResult.sort()).toEqual(['name', 'age', 'isActive'].sort());
  });

  // 测试简单对象形式的props
  it('should analyze object props correctly', () => {
    const code = `
    const props1 = {
      name: String,
      age: Number,
    }
    export default {
      props: {
        ...props1,
        isActive: Boolean
      }
    }
    `;
    
    const morphResult = new PropsAnalyzer(tempFile, code).analyze();
    expect(morphResult.sort()).toEqual(['name', 'age', 'isActive'].sort());
  });
  // 测试数组形式的props
  it('should analyze array props correctly', () => {
    const code = `
    export default {
      props: ['name', 'age', 'isActive']
    }
    `;
    
    const morphResult = new PropsAnalyzer(tempFile, code).analyze();
    expect(morphResult.sort()).toEqual(['name', 'age', 'isActive'].sort());
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
    
    const morphResult = new PropsAnalyzer(tempFile, code).analyze();
    expect(morphResult.sort()).toEqual(['name', 'age', 'isActive'].sort());
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
    
    const morphResult = new PropsAnalyzer(tempFile, code).analyze();
    expect(morphResult.sort()).toEqual(['name', 'age', 'isActive'].sort());
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
    
    const morphResult = new PropsAnalyzer(tempFile, code).analyze();
    expect(morphResult.sort()).toEqual(['name', 'age', 'isActive'].sort());
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
    
    const morphResult = new PropsAnalyzer(tempFile, code).analyze();
    expect(morphResult.sort()).toEqual(['id', 'class', 'name', 'age'].sort());
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
    
    const morphResult = new PropsAnalyzer(tempFile, code).analyze();
    expect(morphResult.sort()).toEqual(['id', 'class', 'name', 'age'].sort());
  });
  
  // 测试导入的props对象
  it('should analyze imported props object correctly', () => {
    const mockImportedFileContent = `
      export const buttonProps = {
        type: String,
        size: {
          type: String,
          default: 'medium'
        },
        disabled: Boolean,
        loading: Boolean,
        icon: String
      };
    `

   vi.mocked(fs.readFileSync).mockReturnValueOnce(mockImportedFileContent)
    
    const code = `
    <script setup lang="ts">
    import { buttonProps } from '../fixtures/props/imported-props';
    
    const props = defineProps(buttonProps);
    </script>
    `;
    
    const morphResult = new PropsAnalyzer(tempFile, code).analyze();
    expect(morphResult.sort()).toEqual(['type', 'size', 'disabled', 'loading', 'icon'].sort());
  });
  
  // 测试导入的接口类型
  it('should analyze imported interface correctly', () => {

    const mockImportedFileContent = `
      export interface BaseProps {
        id: string;
        class: string;
      }

      export interface InputProps extends BaseProps {
        value: string;
        placeholder: string;
        disabled: boolean;
      }
    `
    const code = `
    <script setup lang="ts">
    import { InputProps } from '../fixtures/props/imported-props';
    
    const props = defineProps<InputProps>();
    </script>
    `;
    vi.mocked(fs.readFileSync).mockReturnValueOnce(mockImportedFileContent)
    
    const morphResult = new PropsAnalyzer(tempFile, code).analyze();
    expect(morphResult.sort()).toEqual(['id', 'class', 'value', 'placeholder', 'disabled'].sort());
  });
  
}); 