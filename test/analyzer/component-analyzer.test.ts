import ComponentAnalyzer from "../../lib/analyzer/component-analyzer";
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
            expose: ['name', 'age'],
        });
    `;
    const sourceFile = project.createSourceFile('./button.tsx', code);
    const analyzer = new ComponentAnalyzer(sourceFile);
    const result = analyzer.analyze();
    expect(result.exposes).toStrictEqual(['name', 'age'])
  });

  it('should analyze array emits of the component', () => {
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
            emits: ['click', 'change'],
        });
    `;
    const sourceFile = project.createSourceFile('./button.tsx', code);
    const analyzer = new ComponentAnalyzer(sourceFile);
    const result = analyzer.analyze();
    expect(result.emits).toStrictEqual(['onClick', 'onChange'])
  });

  it('should analyze object emits of the component', () => {
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
            emits: {
                click: (value: string) => true,
                change: (value: string) => true,
            },
        });
    `;
    const sourceFile = project.createSourceFile('./button.tsx', code);
    const analyzer = new ComponentAnalyzer(sourceFile);
    const result = analyzer.analyze();
    expect(result.emits).toStrictEqual(['onClick', 'onChange'])
  });

  it('should analyze empty emits of the component', () => {
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
    expect(result.emits).toStrictEqual([])
  });
  
  it('should analyze enum emits of the component', () => {
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
        enum ButtonEvent {
            InfoClick = 'testInfoClick',
        }
        export default defineComponent({
            name: 'Button',
            emits: {
                [ButtonEvent.InfoClick]: (event: MouseEvent) => true,
            },
        });
    `;
    const sourceFile = project.createSourceFile('./button.tsx', code);
    const analyzer = new ComponentAnalyzer(sourceFile);
    const result = analyzer.analyze();
    expect(result.emits).toStrictEqual(['onTestInfoClick'])
  });

});