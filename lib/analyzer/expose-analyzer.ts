import * as parser from '@babel/parser';
import traverseFunction, { NodePath } from '@babel/traverse';
const traverse = (traverseFunction as any).default || traverseFunction; // 处理 ESM/CJS 兼容性
import * as t from '@babel/types';

export interface ExposeInfo {
  name: string;
}

export function analyzeExpose(code: string): ExposeInfo[] {
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });

  const exposes: ExposeInfo[] = [];

  traverse(ast, {
    ObjectProperty(path: NodePath<t.ObjectProperty>) {
      // 检查是否是 expose 属性
      if (t.isIdentifier(path.node.key, { name: 'expose' })) {
        // 处理 expose: ['method1', 'method2'] 形式
        if (t.isArrayExpression(path.node.value)) {
          path.node.value.elements.forEach(element => {
            if (t.isStringLiteral(element)) {
              exposes.push({ name: element.value });
            }
          });
        }
      }
    },

    CallExpression(path: NodePath<t.CallExpression>) {
      // 查找 expose({...}) 调用
      if (
        t.isIdentifier(path.node.callee, { name: 'expose' }) &&
        path.node.arguments.length > 0 &&
        t.isObjectExpression(path.node.arguments[0])
      ) {
        const exposeObject = path.node.arguments[0];

        exposeObject.properties.forEach((prop) => {
          // 处理 { method: method } 或 { method }
          if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
            exposes.push({ name: prop.key.name });
          }
          // 处理 { 'method-name': method } (虽然不常见)
          else if (t.isObjectProperty(prop) && t.isStringLiteral(prop.key)) {
             exposes.push({ name: prop.key.value });
          }
          // 处理 { ...spread }
          else if (t.isSpreadElement(prop)) {
            // 理论上可能需要解析 spread 的来源，但暂时简化
            console.warn('[expose-analyzer] Spread syntax in expose is not fully supported yet.');
          }
        });
      }
    },
  });

  return exposes;
} 