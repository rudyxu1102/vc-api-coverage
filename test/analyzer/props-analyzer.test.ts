import { describe, it, expect, vi, afterEach } from 'vitest';
import PropsAnalyzer from '../../lib/analyzer/props-analyzer';
import { Project } from 'ts-morph';

describe('Props Analyzer', () => {
  afterEach(() => {
    vi.clearAllMocks();
  })
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
    const project = new Project();
    const sourceFile = project.createSourceFile('./_temp_test_file.tsx', code);
    const morphResult = new PropsAnalyzer(sourceFile, project).analyze();
    expect(morphResult.sort()).toEqual(['name', 'age', 'isActive'].sort());
  });

  it('should analyze object props correctly', () => {
    const code = `
    const props1 = {
      name: String,
      age: Number,
      isActive: Boolean
    } as const;
    export default {
      props: props1
    }
    `;
    const project = new Project();
    const sourceFile = project.createSourceFile('./_temp_test_file.tsx', code);
    const morphResult = new PropsAnalyzer(sourceFile, project).analyze();
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
    const project = new Project();
    const sourceFile = project.createSourceFile('./_temp_test_file.tsx', code);
    const morphResult = new PropsAnalyzer(sourceFile, project).analyze();
    expect(morphResult.sort()).toEqual(['name', 'age', 'isActive'].sort());
  });
  // 测试数组形式的props
  it('should analyze array props correctly', () => {
    const code = `
    export default {
      props: ['name', 'age', 'isActive']
    }
    `;
    const project = new Project();
    const sourceFile = project.createSourceFile('./_temp_test_file.tsx', code);
    const morphResult = new PropsAnalyzer(sourceFile, project).analyze();
    expect(morphResult.sort()).toEqual(['name', 'age', 'isActive'].sort());
  });
  
  // 测试defineProps的泛型形式
  it('should analyze defineProps with generics correctly', () => {
    const code = `
    const props = defineProps<{
      name: string;
      age: number;
      isActive: boolean;
    }>();
    `;
    const project = new Project();
    const sourceFile = project.createSourceFile('./_temp_test_file.vue', code);
    const morphResult = new PropsAnalyzer(sourceFile, project).analyze();
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
    const project = new Project();
    const sourceFile = project.createSourceFile('./_temp_test_file.vue', code);
    const morphResult = new PropsAnalyzer(sourceFile, project).analyze();
    expect(morphResult.sort()).toEqual(['name', 'age', 'isActive'].sort());
  });
  
  // 测试带有类型引用的defineProps
  it('should analyze defineProps with type reference correctly', () => {
    const code = `
    interface Props {
      name: string;
      age: number;
      isActive: boolean;
    }
    
    const props = defineProps<Props>();
    `;
    const project = new Project();
    const sourceFile = project.createSourceFile('./_temp_test_file.vue', code);
    const morphResult = new PropsAnalyzer(sourceFile, project).analyze();
    expect(morphResult.sort()).toEqual(['name', 'age', 'isActive'].sort());
  });
  
  // 测试带有交叉类型(intersection types)的props
  it('should analyze props with intersection types correctly', () => {
    const code = `
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
    `;
    const project = new Project();
    const sourceFile = project.createSourceFile('./_temp_test_file.vue', code);
    const morphResult = new PropsAnalyzer(sourceFile, project).analyze();
    expect(morphResult.sort()).toEqual(['id', 'class', 'name', 'age'].sort());
  });
  
  // 测试继承的接口
  it('should analyze props with interface extension correctly', () => {
    const code = `
    interface BaseProps {
      id: string;
      class: string;
    }
    
    interface Props extends BaseProps {
      name: string;
      age: number;
    }
    
    const props = defineProps<Props>();
    `;
    const project = new Project();
    const sourceFile = project.createSourceFile('./_temp_test_file.vue', code);
    const morphResult = new PropsAnalyzer(sourceFile, project).analyze();
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
      } as const;
    `

    
    const code = `
    import { buttonProps } from './test-import';
    
    const props = defineProps(buttonProps);
    `;
    const project = new Project();
    const sourceFile = project.createSourceFile('./_temp_test_file.vue', code);
    project.createSourceFile('./test-import.ts', mockImportedFileContent)
    const morphResult = new PropsAnalyzer(sourceFile, project).analyze();
    expect(morphResult.sort()).toEqual(['type', 'size', 'disabled', 'loading', 'icon'].sort());
  });
  
  // // 测试导入的接口类型
  // it('should analyze imported interface correctly', () => {

  //   const mockImportedFileContent = `
  //     export interface BaseProps {
  //       id: string;
  //       class: string;
  //     }

  //     export interface InputProps extends BaseProps {
  //       value: string;
  //       placeholder: string;
  //       disabled: boolean;
  //     }
  //   `
  //   const code = `
  //   import { InputProps } from '../test-instance-extend';
    
  //   const props = defineProps<InputProps>();
  //   `;
  //   vi.mocked(fs.existsSync).mockReturnValue(true)
    
  //   vi.mocked(fs.readFileSync).mockReturnValue(mockImportedFileContent)
    
  //   const project = new Project();
  //   const sourceFile = project.createSourceFile('./_temp_test_file.vue', code);
  //   const morphResult = new PropsAnalyzer(sourceFile, project).analyze();
  //   expect(morphResult.sort()).toEqual(['id', 'class', 'value', 'placeholder', 'disabled'].sort());
  // });
  
}); 