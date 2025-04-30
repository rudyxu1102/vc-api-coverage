import * as parser from '@babel/parser';
import traverseFunction, { NodePath } from '@babel/traverse';
const traverse = (traverseFunction as any).default || traverseFunction;
import * as t from '@babel/types';

// 输入接口：包含组件分析结果
export interface ComponentAnalysis {
  props: string[];
  emits: string[];
  slots: string[];
  exposes: string[];
}

// 输出接口：描述每个 API 的覆盖状态
export interface CoverageResult {
  name: string;
  covered: boolean;
}

export interface TestCoverage {
  props: CoverageResult[];
  emits: CoverageResult[];
  slots: CoverageResult[];
  exposes: CoverageResult[];
}

export function matchTestCoverage(
  analysis: ComponentAnalysis,
  testCode: string
): TestCoverage {
  const ast = parser.parse(testCode, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'], // 测试文件也可能用 TSX
    errorRecovery: true, // 增加容错性，避免因单个测试文件解析失败中断
  });

  const foundProps = new Set<string>();
  const foundEmits = new Set<string>();
  const foundSlots = new Set<string>();
  const foundExposes = new Set<string>();

  traverse(ast, {
    CallExpression(path: NodePath<t.CallExpression>) {
      // 1. 查找 mount(Component, { props: {...}, slots: {...} })
      if (t.isIdentifier(path.node.callee, { name: 'mount' }) && path.node.arguments.length > 1) {
        const optionsArgument = path.node.arguments[1];
        if (t.isObjectExpression(optionsArgument)) {
          // 查找 props
          const propsProperty = optionsArgument.properties.find(
            (prop): prop is t.ObjectProperty => t.isObjectProperty(prop) && t.isIdentifier(prop.key, { name: 'props' })
          );
          if (propsProperty && t.isObjectExpression(propsProperty.value)) {
            propsProperty.value.properties.forEach(p => {
              if (t.isObjectProperty(p)) {
                if (t.isIdentifier(p.key)) foundProps.add(p.key.name);
                else if (t.isStringLiteral(p.key)) foundProps.add(p.key.value);
              }
            });
          }

          // 查找 slots
          const slotsProperty = optionsArgument.properties.find(
            (prop): prop is t.ObjectProperty => t.isObjectProperty(prop) && t.isIdentifier(prop.key, { name: 'slots' })
          );
          if (slotsProperty && t.isObjectExpression(slotsProperty.value)) {
            slotsProperty.value.properties.forEach(s => {
              if (t.isObjectProperty(s)) {
                if (t.isIdentifier(s.key)) foundSlots.add(s.key.name);
                else if (t.isStringLiteral(s.key)) foundSlots.add(s.key.value);
              }
            });
          }
        }
      }

      // 2. 查找 wrapper.emitted('xxx') 或 expect(wrapper.emitted()).toHaveProperty('xxx')
      if (t.isMemberExpression(path.node.callee) && t.isIdentifier(path.node.callee.property, { name: 'emitted' })) {
        // wrapper.emitted('eventName')
        if (path.node.arguments.length > 0 && t.isStringLiteral(path.node.arguments[0])) {
          foundEmits.add(path.node.arguments[0].value);
        }
      } else if (t.isIdentifier(path.node.callee, { name: 'expect' })) {
        // expect(wrapper.emitted())...
        const arg = path.node.arguments[0];
        if (t.isCallExpression(arg) && t.isMemberExpression(arg.callee) && t.isIdentifier(arg.callee.property, { name: 'emitted' })) {
          // ...toHaveProperty('eventName')
          let currentPath: NodePath | null = path;
          while (currentPath && currentPath.parentPath) {
            if (t.isMemberExpression(currentPath.parent) && t.isIdentifier(currentPath.parent.property, { name: 'toHaveProperty' })) {
              const parentCall = currentPath.parentPath.parentPath;
              if (parentCall && t.isCallExpression(parentCall.node) && parentCall.node.arguments.length > 0 && t.isStringLiteral(parentCall.node.arguments[0])) {
                foundEmits.add(parentCall.node.arguments[0].value);
                break;
              }
            }
            currentPath = currentPath.parentPath;
            if (currentPath.key === 'body' || currentPath.key === 'program') break;
          }
        }
      }

      // 3. 查找 wrapper.vm.method() 和 (wrapper.vm as any).method()
      if (t.isMemberExpression(path.node.callee) || t.isOptionalMemberExpression(path.node.callee)) {
        const callee = path.node.callee;
        if (t.isIdentifier(callee.property)) {
          // 检查是否是 .vm.method 或者 .vm?.method
          let baseObject = callee.object;
          
          // 处理 TypeScript 的 as any 类型转换
          if (t.isTSAsExpression(baseObject)) {
            baseObject = baseObject.expression;
          }
          
          if (t.isMemberExpression(baseObject) || t.isOptionalMemberExpression(baseObject)) {
            if (t.isIdentifier(baseObject.property, { name: 'vm' })) {
              foundExposes.add(callee.property.name);
            }
          }
        }
      }
    },
    
    // 4. 处理 expect((wrapper.vm as any).method).toBeDefined() 这样的语句
    MemberExpression(path: NodePath<t.MemberExpression>) {
      if (t.isIdentifier(path.node.property, { name: 'toBeDefined' }) || 
          t.isIdentifier(path.node.property, { name: 'toBeTruthy' }) ||
          t.isIdentifier(path.node.property, { name: 'toBe' }) ||
          t.isIdentifier(path.node.property, { name: 'toEqual' })) {
        
        // 检查是否是 expect(...) 调用
        const object = path.node.object;
        if (t.isCallExpression(object) && t.isIdentifier(object.callee, { name: 'expect' })) {
          const arg = object.arguments[0];
          
          // 处理 (wrapper.vm as any).method
          if (t.isMemberExpression(arg)) {
            if (t.isIdentifier(arg.property)) {
              let baseObject = arg.object;
              
              // 处理 TypeScript 的 as any 类型转换
              if (t.isTSAsExpression(baseObject)) {
                baseObject = baseObject.expression;
              }
              
              if (t.isMemberExpression(baseObject) || t.isOptionalMemberExpression(baseObject)) {
                if (t.isIdentifier(baseObject.property, { name: 'vm' })) {
                  foundExposes.add(arg.property.name);
                }
              }
            }
          }
        }
      }
    }
  });

  // 4. 对比分析结果和找到的使用情况
  const propsCoverage = analysis.props.map(p => ({
    name: p,
    covered: foundProps.has(p),
  }));
  const emitsCoverage = analysis.emits.map(e => ({
    name: e,
    covered: foundEmits.has(e),
  }));
  const slotsCoverage = analysis.slots.map(s => ({
    name: s,
    covered: foundSlots.has(s),
  }));
  const exposesCoverage = analysis.exposes.map(ex => ({
    name: ex,
    covered: foundExposes.has(ex),
  }));

  return {
    props: propsCoverage,
    emits: emitsCoverage,
    slots: slotsCoverage,
    exposes: exposesCoverage,
  };
} 