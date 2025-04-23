import * as parser from '@babel/parser';
import traverseFunction, { NodePath } from '@babel/traverse';
const traverse = (traverseFunction as any).default || traverseFunction; // 处理 ESM/CJS 兼容性
import * as t from '@babel/types';

export interface EmitInfo {
  name: string;
  // 可选：来源 (defineEmits/defineComponent), 参数类型等
}

export function analyzeEmits(code: string): EmitInfo[] {
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });

  const emits: EmitInfo[] = [];
  let foundDefineComponentEmits = false;

  // 优先查找 defineComponent 中的 emits
  traverse(ast, {
    CallExpression(path: NodePath<t.CallExpression>) {
      if (
        !foundDefineComponentEmits &&
        t.isIdentifier(path.node.callee, { name: 'defineComponent' }) &&
        path.node.arguments.length > 0 &&
        t.isObjectExpression(path.node.arguments[0])
      ) {
        const componentDefinition = path.node.arguments[0];
        const emitsProperty = componentDefinition.properties.find(
          (prop): prop is t.ObjectProperty =>
            t.isObjectProperty(prop) &&
            (t.isIdentifier(prop.key, { name: 'emits' }) ||
             t.isStringLiteral(prop.key, { value: 'emits' }))
        );

        if (emitsProperty) {
          foundDefineComponentEmits = true;
          // 处理 emits: ['event1', 'event2']
          if (t.isArrayExpression(emitsProperty.value)) {
            emitsProperty.value.elements.forEach((element) => {
              if (t.isStringLiteral(element)) {
                emits.push({ name: element.value });
              }
            });
          } 
          // 处理 emits: { click: null, 'update:modelValue': validator }
          else if (t.isObjectExpression(emitsProperty.value)) {
             emitsProperty.value.properties.forEach((prop) => {
               if (t.isObjectProperty(prop)) {
                  if (t.isIdentifier(prop.key)) {
                     emits.push({ name: prop.key.name });
                  } else if (t.isStringLiteral(prop.key)) {
                     emits.push({ name: prop.key.value });
                  }
               }
               // SpreadElement 暂不处理
             });
          }
          path.stop(); // 找到 defineComponent 的 emits 后停止第一轮遍历
        }
      }
    },
  });

  // 如果未在 defineComponent 中找到，则查找 defineEmits 调用
  if (!foundDefineComponentEmits) {
    traverse(ast, {
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        // 查找 const emit = defineEmits(...)
        if (
          path.node.init &&
          t.isCallExpression(path.node.init) &&
          t.isIdentifier(path.node.init.callee, { name: 'defineEmits' })
        ) {
          const callExpr = path.node.init;
          parseDefineEmitsCall(callExpr, emits);
          path.stop(); // 找到后停止遍历
        }
      },
      ExpressionStatement(path: NodePath<t.ExpressionStatement>) {
         // 查找 defineEmits(...) standalone
         if (
            t.isCallExpression(path.node.expression) &&
            t.isIdentifier(path.node.expression.callee, { name: 'defineEmits' })
         ) {
            parseDefineEmitsCall(path.node.expression, emits);
            path.stop(); // 找到后停止遍历
         }
      }
    });
  }

  return emits;
}

// 辅助函数：解析 defineEmits 调用
function parseDefineEmitsCall(callExpr: t.CallExpression, emits: EmitInfo[]) {
  // 处理 defineEmits(['event1', 'event2'])
  if (callExpr.arguments.length > 0 && t.isArrayExpression(callExpr.arguments[0])) {
    callExpr.arguments[0].elements.forEach((element) => {
      if (t.isStringLiteral(element)) {
        emits.push({ name: element.value });
      }
    });
  } 
  // 处理 defineEmits<{ (e: 'event1'): void; (e: 'event2', id: number): void }>()
  else if (callExpr.typeParameters && callExpr.typeParameters.params.length > 0) {
    const typeParam = callExpr.typeParameters.params[0];
    // 处理类型字面量 { (e: 'event1'): void; ... }
    if (t.isTSTypeLiteral(typeParam)) {
      typeParam.members.forEach((member) => {
        // 处理调用签名 (e: 'event1'): void
        if (t.isTSCallSignatureDeclaration(member) && member.parameters.length > 0) {
          const firstParam = member.parameters[0];
          // 参数是标识符且有字面量类型注解 (e: 'event1')
          if (t.isIdentifier(firstParam) && firstParam.typeAnnotation && t.isTSTypeAnnotation(firstParam.typeAnnotation)) {
             if(t.isTSLiteralType(firstParam.typeAnnotation.typeAnnotation) && t.isStringLiteral(firstParam.typeAnnotation.typeAnnotation.literal)) {
                emits.push({ name: firstParam.typeAnnotation.typeAnnotation.literal.value });
             }
          }
        }
      });
    }
    // 可能需要处理 TSTypeReference 等其他情况
  }
  // defineEmits() 无参数或类型参数，暂时忽略
} 