import ComponentAnalyzer from "../../src/analyzer/ComponentAnalyzer";
import { Project, ts } from "ts-morph";
import { describe, it, expect } from "vitest";

describe('ComponentAnalyzer', () => {
  it('should analyze props of the component', () => {
    const project = new Project({
      compilerOptions: {
        target: ts.ScriptTarget.ESNext, 
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.Preserve,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
      },
    });
    const code = `
        import { defineComponent } from 'vue';

        export default defineComponent({
            name: 'Button',
            props: {
                type: { type: String, default: 'default' },
            },
        });
    `;
    const sourceFile = project.createSourceFile('./button.tsx', code);
    const analyzer = new ComponentAnalyzer(sourceFile);
    const result = analyzer.analyze();
    expect(result.props).toStrictEqual(['type'])
  });

  it('should analyze slots of the component', () => {
    const project = new Project({
      compilerOptions: {
        target: ts.ScriptTarget.ESNext, 
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.Preserve,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
      },
    });
    const code = `
        import { defineComponent, VNode, SlotsType } from 'vue';

        export default defineComponent({
            name: 'Button',
            slots: Object as SlotsType<{
                default: () => VNode,
            }>,
        });
    `;
    const sourceFile = project.createSourceFile('./button.tsx', code);
    const analyzer = new ComponentAnalyzer(sourceFile);
    const result = analyzer.analyze();
    expect(result.slots).toStrictEqual(['default'])
  });

  it('should analyze expose of the component', () => {
    const project = new Project({
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.Preserve,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
      },
    });
    const code = `
        import { defineComponent } from 'vue';

        export default defineComponent({
            name: 'Button',
            expose: ['name', 'age'] as string[],
        });
    `;
    const sourceFile = project.createSourceFile('./button.tsx', code);
    const analyzer = new ComponentAnalyzer(sourceFile);
    const result = analyzer.analyze();
    expect(result.exposes).toStrictEqual(['name', 'age'])
  });

  it('should analyze expose of the component', () => {
    const project = new Project({
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.Preserve,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
      },
    });
    const code = `
        import { defineComponent } from 'vue';

        const Button = defineComponent({
            name: 'Button',
            expose: ['name', 'age'] as string[],
        });
        export default Button;

    `;
    const sourceFile = project.createSourceFile('./button.tsx', code);
    const analyzer = new ComponentAnalyzer(sourceFile);
    const result = analyzer.analyze();
    expect(result.exposes).toStrictEqual(['name', 'age'])
  });

  it('should analyze expose of the component', () => {
    const project = new Project({
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.Preserve,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
      },
    });
    const commonCode = `
        export const clickName = 'clickInfo';
    `;
    project.createSourceFile('./common.ts', commonCode);
    const code = `
        import { defineComponent } from 'vue';
        import { clickName } from './common.ts';
        enum ButtonExpose {
            scrollTo = 'scrollTo',
        }
        const Button = defineComponent({
            name: 'Button',
            expose: [
              ButtonExpose.scrollTo, 
              clickName,
              'submit'
            ] as string[],
        });
        export default Button;

    `;
    const sourceFile = project.createSourceFile('./button.tsx', code);
    const analyzer = new ComponentAnalyzer(sourceFile);
    const result = analyzer.analyze();
    expect(result.exposes).toStrictEqual(['scrollTo', 'clickInfo', 'submit'])
  });

  describe('Strict Mode', () => {
    it('should extract variants for literal union types', () => {
      const project = new Project({
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.Preserve,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
        },
      });
      const code = `
        import { defineComponent, PropType } from 'vue';

        export default defineComponent({
          name: 'Button',
          props: {
            variant: {
              type: String as PropType<'primary' | 'secondary' | 'tertiary'>,
              default: 'primary'
            },
          },
        });
      `;
      const sourceFile = project.createSourceFile('./button.tsx', code);
      const analyzer = new ComponentAnalyzer(sourceFile, true); // Enable strict mode
      const result = analyzer.analyze();

      expect(result.props).toStrictEqual(['variant']);
      expect(result.propsWithVariants).toBeDefined();
      expect(result.propsWithVariants?.length).toBe(1);
      expect(result.propsWithVariants?.[0].name).toBe('variant');
      expect(result.propsWithVariants?.[0].variants).toEqual([
        { type: 'literal', value: 'primary' },
        { type: 'literal', value: 'secondary' },
        { type: 'literal', value: 'tertiary' }
      ]);
    });

    it('should extract boolean variants (only true, skip false)', () => {
      const project = new Project({
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.Preserve,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
        },
      });
      const code = `
        import { defineComponent } from 'vue';

        export default defineComponent({
          name: 'Button',
          props: {
            disabled: { type: Boolean, default: false },
          },
        });
      `;
      const sourceFile = project.createSourceFile('./button.tsx', code);
      const analyzer = new ComponentAnalyzer(sourceFile, true);
      const result = analyzer.analyze();

      expect(result.props).toStrictEqual(['disabled']);
      expect(result.propsWithVariants).toBeDefined();
      expect(result.propsWithVariants?.length).toBe(1);
      expect(result.propsWithVariants?.[0].name).toBe('disabled');
      expect(result.propsWithVariants?.[0].variants).toEqual([
        { type: 'literal', value: true }
      ]);
    });

    it('should extract variants for mixed union types', () => {
      const project = new Project({
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.Preserve,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
        },
      });
      const code = `
        import { defineComponent, PropType } from 'vue';

        export default defineComponent({
          name: 'Input',
          props: {
            value: {
              type: [String, Number] as PropType<string | number>,
              default: ''
            },
          },
        });
      `;
      const sourceFile = project.createSourceFile('./input.tsx', code);
      const analyzer = new ComponentAnalyzer(sourceFile, true);
      const result = analyzer.analyze();

      expect(result.props).toStrictEqual(['value']);
      expect(result.propsWithVariants).toBeDefined();
      expect(result.propsWithVariants?.length).toBe(1);
      expect(result.propsWithVariants?.[0].name).toBe('value');
      expect(result.propsWithVariants?.[0].variants).toEqual([
        { type: 'string', value: 'string' },
        { type: 'number', value: 'number' }
      ]);
    });

    it('should filter out undefined from optional props', () => {
      const project = new Project({
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.Preserve,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
        },
      });
      const code = `
        import { defineComponent, PropType } from 'vue';

        export default defineComponent({
          name: 'Button',
          props: {
            size: {
              type: String as PropType<'sm' | 'md' | 'lg'>,
              default: 'md'
            },
          },
        });
      `;
      const sourceFile = project.createSourceFile('./button.tsx', code);
      const analyzer = new ComponentAnalyzer(sourceFile, true);
      const result = analyzer.analyze();

      expect(result.propsWithVariants?.[0].variants).toEqual([
        { type: 'literal', value: 'sm' },
        { type: 'literal', value: 'md' },
        { type: 'literal', value: 'lg' }
      ]);
      // Should not include undefined variant
      expect(result.propsWithVariants?.[0].variants?.some(v => v.type === 'undefined')).toBe(false);
    });

    it('should not extract variants when strict mode is disabled', () => {
      const project = new Project({
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.Preserve,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
        },
      });
      const code = `
        import { defineComponent, PropType } from 'vue';

        export default defineComponent({
          name: 'Button',
          props: {
            variant: {
              type: String as PropType<'primary' | 'secondary'>,
              default: 'primary'
            },
          },
        });
      `;
      const sourceFile = project.createSourceFile('./button.tsx', code);
      const analyzer = new ComponentAnalyzer(sourceFile, false); // Disable strict mode
      const result = analyzer.analyze();

      expect(result.props).toStrictEqual(['variant']);
      expect(result.propsWithVariants).toBeUndefined();
    });

    it('should handle false literal in boolean union (filtered)', () => {
      const project = new Project({
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.Preserve,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
        },
      });
      const code = `
        import { defineComponent } from 'vue';

        export default defineComponent({
          name: 'Button',
          props: {
            disabled: { type: Boolean, default: false },
            loading: { type: Boolean, default: false }
          },
        });
      `;
      const sourceFile = project.createSourceFile('./button.tsx', code);
      const analyzer = new ComponentAnalyzer(sourceFile, true);
      const result = analyzer.analyze();

      expect(result.props).toContain('disabled');
      expect(result.props).toContain('loading');
      expect(result.propsWithVariants).toBeDefined();

      // All boolean props should only have 'true' variant (false is filtered)
      result.propsWithVariants?.forEach(prop => {
        if (prop.variants) {
          expect(prop.variants.every(v => v.value !== false)).toBe(true);
        }
      });
    });

    it('should handle mixed literal and primitive union types', () => {
      const project = new Project({
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.Preserve,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
        },
      });
      const code = `
        import { defineComponent, PropType } from 'vue';

        export default defineComponent({
          name: 'Button',
          props: {
            width: {
              type: [String, Number] as PropType<'auto' | number>,
            },
          },
        });
      `;
      const sourceFile = project.createSourceFile('./button.tsx', code);
      const analyzer = new ComponentAnalyzer(sourceFile, true);
      const result = analyzer.analyze();

      expect(result.props).toStrictEqual(['width']);
      expect(result.propsWithVariants).toBeDefined();
      expect(result.propsWithVariants?.[0].variants?.length).toBeGreaterThan(0);
    });

    it('should handle complex union types with function', () => {
      const project = new Project({
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.Preserve,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
        },
      });
      const code = `
        import { defineComponent, PropType } from 'vue';

        export default defineComponent({
          name: 'Button',
          props: {
            value: {
              type: [String, Function] as PropType<string | (() => string)>
            },
          },
        });
      `;
      const sourceFile = project.createSourceFile('./button.tsx', code);
      const analyzer = new ComponentAnalyzer(sourceFile, true);
      const result = analyzer.analyze();

      expect(result.props).toStrictEqual(['value']);
      expect(result.propsWithVariants).toBeDefined();
      expect(result.propsWithVariants?.[0].variants?.length).toBe(2);
      expect(result.propsWithVariants?.[0].variants).toContainEqual({ type: 'string', value: 'string' });
      expect(result.propsWithVariants?.[0].variants).toContainEqual({ type: 'function', value: 'function' });
    });

    it('should handle null in union types (filtered out)', () => {
      const project = new Project({
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.Preserve,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
        },
      });
      const code = `
        import { defineComponent, PropType } from 'vue';

        export default defineComponent({
          name: 'Button',
          props: {
            value: {
              type: String as PropType<'a' | 'b' | null>,
            },
          },
        });
      `;
      const sourceFile = project.createSourceFile('./button.tsx', code);
      const analyzer = new ComponentAnalyzer(sourceFile, true);
      const result = analyzer.analyze();

      expect(result.props).toStrictEqual(['value']);
      expect(result.propsWithVariants).toBeDefined();
      // null should be filtered out
      expect(result.propsWithVariants?.[0].variants?.every(v => v.type !== 'null')).toBe(true);
      expect(result.propsWithVariants?.[0].variants?.length).toBe(2); // only 'a' and 'b'
    });

    it('should handle number literal union types', () => {
      const project = new Project({
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.Preserve,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
        },
      });
      const code = `
        import { defineComponent, PropType } from 'vue';

        export default defineComponent({
          name: 'Button',
          props: {
            level: {
              type: Number as PropType<1 | 2 | 3>,
              default: 1
            },
          },
        });
      `;
      const sourceFile = project.createSourceFile('./button.tsx', code);
      const analyzer = new ComponentAnalyzer(sourceFile, true);
      const result = analyzer.analyze();

      expect(result.props).toStrictEqual(['level']);
      expect(result.propsWithVariants).toBeDefined();
      expect(result.propsWithVariants?.[0].variants).toEqual([
        { type: 'literal', value: 1 },
        { type: 'literal', value: 2 },
        { type: 'literal', value: 3 }
      ]);
    });
  });
});