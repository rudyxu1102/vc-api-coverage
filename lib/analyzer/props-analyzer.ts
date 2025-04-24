import * as parser from '@babel/parser';
import traverseFunction, { NodePath } from '@babel/traverse';
const traverse = (traverseFunction as any).default || traverseFunction; // 处理 ESM/CJS 兼容性
import * as t from '@babel/types'; // 引入 @babel/types

export interface PropInfo {
  name: string;
  // 可以稍后添加更多信息，例如类型、是否必需、默认值等
}

export function analyzeProps(code: string): PropInfo[] {
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'], // 启用 TypeScript 和 JSX 解析
  });

  const props: PropInfo[] = [];
  let foundDefineComponent = false; // 添加标志避免重复处理

  traverse(ast, {
    CallExpression(path: NodePath<t.CallExpression>) { // 添加类型注解
      // 识别 defineComponent({...})
      if (
        !foundDefineComponent && // 确保只处理第一个 defineComponent
        t.isIdentifier(path.node.callee, { name: 'defineComponent' }) &&
        path.node.arguments.length > 0 &&
        t.isObjectExpression(path.node.arguments[0])
      ) {
        foundDefineComponent = true; // 标记已找到
        const componentDefinition = path.node.arguments[0];

        // 在 componentDefinition 中查找 props 选项
        const propsProperty = componentDefinition.properties.find(
          (prop): prop is t.ObjectProperty => // 类型守卫
            t.isObjectProperty(prop) &&
            t.isIdentifier(prop.key, { name: 'props' })
        );

        if (propsProperty && t.isObjectExpression(propsProperty.value)) {
          // 遍历 props 对象字面量
          propsProperty.value.properties.forEach((prop) => {
            if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
              props.push({ name: prop.key.name });
            } else if (t.isObjectProperty(prop) && t.isStringLiteral(prop.key)) {
              // 处理字符串字面量作为 key 的情况，虽然不常见于 props
              props.push({ name: prop.key.value });
            }
            // 可以扩展支持 SpreadElement 等其他情况，但暂时简化
          });
        }
        // 可以在这里停止遍历，如果确定一个文件只有一个主要组件定义
        // path.stop();
      }

      // TODO: 实现对 defineProps 的识别逻辑
      // 例如：寻找 defineProps<...>() 或 withDefaults(defineProps<...>(), ...)
    },
  });

  return props;
} 