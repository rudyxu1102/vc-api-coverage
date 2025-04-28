import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { NodePath } from '@babel/traverse';
import type { ParseResult } from '@babel/parser';
import type { File } from '@babel/types';
import { parseComponent } from './shared-parser';

export function analyzeEmits(code: string, parsedAst?: ParseResult<File>): string[] {
  const ast = parsedAst || parseComponent(code).ast;
  const emits: string[] = [];
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
                emits.push(element.value);
              }
            });
          } 
          // 处理 emits: { click: null, 'update:modelValue': validator }
          else if (t.isObjectExpression(emitsProperty.value)) {
             emitsProperty.value.properties.forEach((prop) => {
               if (t.isObjectProperty(prop)) {
                  if (t.isIdentifier(prop.key)) {
                     emits.push(prop.key.name);
                  } else if (t.isStringLiteral(prop.key)) {
                     emits.push(prop.key.value);
                  }
               }
             });
          }
          // 处理 emits 为变量引用的情况
          else if (t.isIdentifier(emitsProperty.value)) {
            const binding = path.scope.getBinding(emitsProperty.value.name);
            if (binding && t.isVariableDeclarator(binding.path.node)) {
              const init = binding.path.node.init;
              if (t.isArrayExpression(init)) {
                init.elements.forEach((element) => {
                  if (t.isStringLiteral(element)) {
                    emits.push(element.value);
                  }
                });
              }
            }
          }
          path.stop();
        }
      }
    },

    ObjectExpression(path: NodePath<t.ObjectExpression>) {
      if (!foundDefineComponentEmits) {
        const emitsProperty = path.node.properties.find(
          (prop): prop is t.ObjectProperty =>
            t.isObjectProperty(prop) &&
            (t.isIdentifier(prop.key, { name: 'emits' }) ||
             t.isStringLiteral(prop.key, { value: 'emits' }))
        );

        if (emitsProperty && t.isObjectProperty(emitsProperty)) {
          foundDefineComponentEmits = true;
          if (t.isObjectExpression(emitsProperty.value)) {
            emitsProperty.value.properties.forEach((prop) => {
              if (t.isObjectProperty(prop)) {
                if (t.isIdentifier(prop.key)) {
                  emits.push(prop.key.name);
                } else if (t.isStringLiteral(prop.key)) {
                  emits.push(prop.key.value);
                }
              }
            });
          } else if (t.isIdentifier(emitsProperty.value)) {
            const binding = path.scope.getBinding(emitsProperty.value.name);
            if (binding && t.isVariableDeclarator(binding.path.node)) {
              const init = binding.path.node.init;
              if (t.isArrayExpression(init)) {
                init.elements.forEach((element) => {
                  if (t.isStringLiteral(element)) {
                    emits.push(element.value);
                  }
                });
              }
            }
          }
          path.stop();
        }
      }
    }
  });

  // 如果未在 defineComponent 中找到，则查找 defineEmits 调用
  if (!foundDefineComponentEmits) {
    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        if (
          t.isIdentifier(path.node.callee, { name: 'defineEmits' })
        ) {
          // 处理 defineEmits(['event1', 'event2'])
          if (path.node.arguments.length > 0 && t.isArrayExpression(path.node.arguments[0])) {
            path.node.arguments[0].elements.forEach((element) => {
              if (t.isStringLiteral(element)) {
                emits.push(element.value);
              }
            });
          }
          // 处理 defineEmits<{ (e: 'event1'): void; (e: 'event2', id: number): void }>()
          else if (path.node.typeParameters?.params[0]) {
            const typeParam = path.node.typeParameters.params[0];
            if (t.isTSTypeLiteral(typeParam)) {
              typeParam.members.forEach((member) => {
                if (t.isTSCallSignatureDeclaration(member) && member.parameters.length > 0) {
                  const firstParam = member.parameters[0];
                  if (t.isIdentifier(firstParam) && firstParam.typeAnnotation && t.isTSTypeAnnotation(firstParam.typeAnnotation)) {
                    if (t.isTSLiteralType(firstParam.typeAnnotation.typeAnnotation) && t.isStringLiteral(firstParam.typeAnnotation.typeAnnotation.literal)) {
                      emits.push(firstParam.typeAnnotation.typeAnnotation.literal.value);
                    }
                  }
                }
              });
            }
          }
          path.stop();
        }
      }
    });
  }

  return emits;
} 