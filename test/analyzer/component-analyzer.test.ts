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
});