import * as parser from '@babel/parser';
import traverseFunction, { NodePath } from '@babel/traverse';
const traverse = (traverseFunction as any).default || traverseFunction;
import * as t from '@babel/types';
import { PropInfo } from '../analyzer/props-analyzer.js';
import { EmitInfo } from '../analyzer/emits-analyzer.js';
import { SlotInfo } from '../analyzer/slots-analyzer.js';
import { ExposeInfo } from '../analyzer/expose-analyzer.js';

// 输入接口：包含组件分析结果
export interface ComponentAnalysis {
  props: PropInfo[];
  emits: EmitInfo[];
  slots: SlotInfo[];
  exposes: ExposeInfo[];
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
        // TODO: 需要更精确地匹配 Component 参数，可能需要 componentIdentifier
        const optionsArgument = path.node.arguments[1];
        if (t.isObjectExpression(optionsArgument)) {
          // 查找 props
          const propsProperty = optionsArgument.properties.find(
            (prop): prop is t.ObjectProperty => t.isObjectProperty(prop) && t.isIdentifier(prop.key, { name: 'props' })
          );
          if (propsProperty && t.isObjectExpression(propsProperty.value)) {
            propsProperty.value.properties.forEach(p => {
              if (t.isObjectProperty(p) && t.isIdentifier(p.key)) foundProps.add(p.key.name);
              else if (t.isObjectProperty(p) && t.isStringLiteral(p.key)) foundProps.add(p.key.value);
              // 暂不处理 shorthand, spread
            });
          }

          // 查找 slots
          const slotsProperty = optionsArgument.properties.find(
            (prop): prop is t.ObjectProperty => t.isObjectProperty(prop) && t.isIdentifier(prop.key, { name: 'slots' })
          );
          if (slotsProperty && t.isObjectExpression(slotsProperty.value)) {
            slotsProperty.value.properties.forEach(s => {
              if (t.isObjectProperty(s) && t.isIdentifier(s.key)) foundSlots.add(s.key.name);
              else if (t.isObjectProperty(s) && t.isStringLiteral(s.key)) foundSlots.add(s.key.value);
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
         if (t.isCallExpression(arg) && t.isMemberExpression(arg.callee) && t.isIdentifier(arg.callee.property, {name: 'emitted'})) {
             // ...toHaveProperty('eventName')
             let currentPath: NodePath | null = path;
             while(currentPath && currentPath.parentPath) {
                if(t.isMemberExpression(currentPath.parent) && t.isIdentifier(currentPath.parent.property, {name: 'toHaveProperty'})) {
                    const parentCall = currentPath.parentPath.parentPath; // expect(...).toHaveProperty(...) is CallExpression
                    if (parentCall && t.isCallExpression(parentCall.node) && parentCall.node.arguments.length > 0 && t.isStringLiteral(parentCall.node.arguments[0])) {
                        foundEmits.add(parentCall.node.arguments[0].value);
                        break;
                    }
                }
                currentPath = currentPath.parentPath;
                // 防止无限循环或遍历过多层级
                if (currentPath.key === 'body' || currentPath.key === 'program') break; 
             }
         }
      }

      // 3. 查找 wrapper.vm.method()
      // wrapper.vm?.method()
      if (t.isMemberExpression(path.node.callee) || t.isOptionalMemberExpression(path.node.callee)) {
         const callee = path.node.callee;
         if (t.isIdentifier(callee.property)) {
            // 检查是否是 .vm.method 或者 .vm?.method
            let baseObject = callee.object;
            if (t.isMemberExpression(baseObject) || t.isOptionalMemberExpression(baseObject)) {
                if(t.isIdentifier(baseObject.property, {name: 'vm'})) {
                    // 假设 baseObject.object 是 wrapper
                    foundExposes.add(callee.property.name);
                }
            }
         }
      }
    },
  });

  // 4. 对比分析结果和找到的使用情况
  const propsCoverage = analysis.props.map(p => ({
    name: p.name,
    covered: foundProps.has(p.name),
  }));
  const emitsCoverage = analysis.emits.map(e => ({
    name: e.name,
    covered: foundEmits.has(e.name),
  }));
  const slotsCoverage = analysis.slots.map(s => ({
    name: s.name,
    covered: foundSlots.has(s.name),
  }));
  const exposesCoverage = analysis.exposes.map(ex => ({
    name: ex.name,
    covered: foundExposes.has(ex.name),
  }));

  return {
    props: propsCoverage,
    emits: emitsCoverage,
    slots: slotsCoverage,
    exposes: exposesCoverage,
  };
} 