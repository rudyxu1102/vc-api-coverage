import * as parser from '@babel/parser';
import traverseFunction, { NodePath } from '@babel/traverse';
const traverse = (traverseFunction as any).default || traverseFunction; // 处理 ESM/CJS 兼容性
import * as t from '@babel/types';

export interface SlotInfo {
  name: string;
}

export function analyzeSlots(code: string): SlotInfo[] {
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });

  const slots: SlotInfo[] = [];
  let slotsIdentifierName: string | null = null;

  // 1. 查找 defineComponent({ setup(...) })
  traverse(ast, {
    ObjectProperty(path: NodePath<t.ObjectProperty>) {
      // 找到 setup 属性
      if (
        (t.isIdentifier(path.node.key, { name: 'setup' }) || t.isStringLiteral(path.node.key, { value: 'setup' })) &&
        (t.isFunctionExpression(path.node.value) || t.isArrowFunctionExpression(path.node.value))
      ) {
        const setupFunction = path.node.value;
        // 2. 确定 setup 函数参数中的 slots 标识符
        if (setupFunction.params.length > 1) {
          const secondParam = setupFunction.params[1];
          // 处理 setup(props, ctx) 或 setup(props, { slots }) 结构
          if (t.isIdentifier(secondParam)) { // ctx
            // 如果是 ctx，需要在函数体内查找 ctx.slots
            // 暂不处理这种情况，优先处理解构
          } else if (t.isObjectPattern(secondParam)) { // { slots, emit, ... }
            const slotsProperty = secondParam.properties.find(
              (prop): prop is t.ObjectProperty =>
                t.isObjectProperty(prop) &&
                t.isIdentifier(prop.key, { name: 'slots' }) &&
                t.isIdentifier(prop.value) // { slots: slotsIdentifier }
            );
            if (slotsProperty && t.isIdentifier(slotsProperty.value)) {
              slotsIdentifierName = slotsProperty.value.name;
            } else {
                // 处理 { slots } shorthand
                 const slotsShorthand = secondParam.properties.find(
                    (prop): prop is t.ObjectProperty =>
                        t.isObjectProperty(prop) &&
                        t.isIdentifier(prop.key, { name: 'slots' }) &&
                        prop.shorthand === true
                 );
                 if (slotsShorthand && t.isIdentifier(slotsShorthand.key)) {
                     slotsIdentifierName = slotsShorthand.key.name;
                 }
            }
          }
        }

        if (slotsIdentifierName) {
          // 3. 遍历 setup 函数体，查找 slots 的使用
          path.traverse({
            // 处理 slots.xxx
            MemberExpression(memberPath: NodePath<t.MemberExpression>) {
              if (
                t.isIdentifier(memberPath.node.object, { name: slotsIdentifierName! }) &&
                !memberPath.node.computed
              ) {
                 if (t.isIdentifier(memberPath.node.property)) {
                    const propName = memberPath.node.property.name;
                    if (!slots.some(s => s.name === propName)) {
                       slots.push({ name: propName });
                    }
                 }
              }
            },
            // 处理 slots?.xxx (OptionalMemberExpression)
            OptionalMemberExpression(memberPath: NodePath<t.OptionalMemberExpression>) {
               if (
                 t.isIdentifier(memberPath.node.object, { name: slotsIdentifierName! }) &&
                 !memberPath.node.computed
               ) {
                  if (t.isIdentifier(memberPath.node.property)) {
                     const propName = memberPath.node.property.name;
                     if (!slots.some(s => s.name === propName)) {
                        slots.push({ name: propName });
                     }
                  }
               }
            }
            // TODO: 处理 slots['xxx'] (computed: true)
          });
        }

        // 假设只有一个 setup 函数
        path.stop();
      }
    },
  });

  // TODO: 添加对 <script setup> 中 useSlots() 的分析

  return slots;
} 