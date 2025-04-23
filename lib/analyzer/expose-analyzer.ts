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
    CallExpression(path: NodePath<t.CallExpression>) {
      // 查找 defineExpose({...})
      if (
        t.isIdentifier(path.node.callee, { name: 'defineExpose' }) &&
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
            console.warn('[expose-analyzer] Spread syntax in defineExpose is not fully supported yet.');
          }
        });

        // 假设一个组件只有一个 defineExpose 调用
        path.stop();
      }
    },
  });

  return exposes;
} 