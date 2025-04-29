import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { NodePath } from '@babel/traverse';
import type { ParseResult } from '@babel/parser';
import type { File } from '@babel/types';
import { parseComponent } from './shared-parser';
import * as fs from 'fs';
import * as path from 'path';

function logDebug(message: string, ...args: any[]) {
  if (process.env.DEBUG) {
    console.log(`[emits-analyzer] ${message}`, ...args);
  }
}

interface ImportInfo {
  source: string;
  importedName: string;
}

export function analyzeEmits(code: string, parsedAst?: ParseResult<File>, filePath?: string): string[] {
  const ast = parsedAst || parseComponent(code).ast;
  const emits: string[] = [];
  let foundDefineComponentEmits = false;

  // 收集导入声明
  const importDeclarations: Record<string, ImportInfo> = {};
  collectImportDeclarations(ast, importDeclarations);

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
            processArrayElements(emitsProperty.value.elements, emits);
          } 
          // 处理 emits: { click: null, 'update:modelValue': validator }
          else if (t.isObjectExpression(emitsProperty.value)) {
            processObjectProperties(emitsProperty.value.properties, emits);
          }
          // 处理 emits 为变量引用的情况
          else if (t.isIdentifier(emitsProperty.value)) {
            processIdentifierReference(emitsProperty.value, path, emits, importDeclarations, filePath);
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
            processObjectProperties(emitsProperty.value.properties, emits);
          } else if (t.isIdentifier(emitsProperty.value)) {
            processIdentifierReference(emitsProperty.value, path, emits, importDeclarations, filePath);
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
            processArrayElements(path.node.arguments[0].elements, emits);
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

// 收集导入声明
function collectImportDeclarations(ast: File, importDeclarations: Record<string, ImportInfo>) {
  traverse(ast, {
    ImportDeclaration(path) {
      const source = path.node.source.value;
      path.node.specifiers.forEach(specifier => {
        if (t.isImportSpecifier(specifier)) {
          // 处理命名导入: import { buttonEmits } from './props'
          const importedName = t.isIdentifier(specifier.imported) ? specifier.imported.name : specifier.imported.value;
          const localName = specifier.local.name;
          importDeclarations[localName] = { source, importedName };
        } else if (t.isImportDefaultSpecifier(specifier)) {
          // 处理默认导入: import buttonEmits from './props'
          importDeclarations[specifier.local.name] = { source, importedName: 'default' };
        }
      });
    }
  });
}

// 处理数组元素
function processArrayElements(elements: Array<t.Expression | t.SpreadElement | null>, emits: string[]) {
  elements.forEach((element) => {
    if (t.isStringLiteral(element)) {
      emits.push(element.value);
    }
  });
}

// 处理对象属性
function processObjectProperties(properties: (t.ObjectProperty | t.ObjectMethod | t.SpreadElement)[], emits: string[]) {
  properties.forEach((prop) => {
    if (t.isObjectProperty(prop)) {
      if (t.isIdentifier(prop.key)) {
        emits.push(prop.key.name);
      } else if (t.isStringLiteral(prop.key)) {
        emits.push(prop.key.value);
      }
    }
  });
}

// 处理变量引用
function processIdentifierReference(
  identifier: t.Identifier,
  path: NodePath,
  emits: string[],
  importDeclarations: Record<string, ImportInfo>,
  filePath?: string
) {
  const varName = identifier.name;
  
  // 先检查本地绑定
  const binding = path.scope.getBinding(varName);
  if (binding && t.isVariableDeclarator(binding.path.node)) {
    const init = binding.path.node.init;
    if (t.isArrayExpression(init)) {
      processArrayElements(init.elements, emits);
    } else if (t.isObjectExpression(init)) {
      processObjectProperties(init.properties, emits);
    }
  } 
  // 如果是导入的变量
  else if (importDeclarations[varName] && filePath) {
    processImportedEmits(importDeclarations[varName], filePath, emits);
  }
}

// 处理导入的 emits
function processImportedEmits(importInfo: ImportInfo, filePath: string, emits: string[]) {
  const importSource = importInfo.source;
  const importedName = importInfo.importedName;
  
  try {
    const currentDir = path.dirname(filePath);
    const importFilePath = path.resolve(currentDir, importSource + (importSource.endsWith('.ts') ? '' : '.ts'));
    
    logDebug(`Trying to resolve imported emits from ${importFilePath}, imported name: ${importedName}`);
    
    if (fs.existsSync(importFilePath)) {
      const importedCode = fs.readFileSync(importFilePath, 'utf-8');
      const importedAst = parseComponent(importedCode).ast;
      
      // 收集导入文件中的导入声明
      const nestedImportDeclarations: Record<string, ImportInfo> = {};
      collectImportDeclarations(importedAst, nestedImportDeclarations);
      
      // 查找导出的变量
      let found = false;
      
      traverse(importedAst, {
        // 处理 export const buttonEmits = ['click', 'hover']
        ExportNamedDeclaration(path) {
          if (found) return;
          
          if (t.isVariableDeclaration(path.node.declaration)) {
            const declarations = path.node.declaration.declarations;
            for (const decl of declarations) {
              if (t.isIdentifier(decl.id) && decl.id.name === importedName) {
                if (t.isArrayExpression(decl.init)) {
                  processArrayElements(decl.init.elements, emits);
                  found = true;
                  path.stop();
                } else if (t.isObjectExpression(decl.init)) {
                  processObjectProperties(decl.init.properties, emits);
                  found = true;
                  path.stop();
                }
              }
            }
          }
        },
        
        // 处理 export { buttonEmits }
        ExportSpecifier(path) {
          if (found) return;
          
          if (t.isIdentifier(path.node.exported) && path.node.exported.name === importedName) {
            const localName = path.node.local.name;
            const binding = path.scope.getBinding(localName);
            
            if (binding && t.isVariableDeclarator(binding.path.node)) {
              if (t.isArrayExpression(binding.path.node.init)) {
                processArrayElements(binding.path.node.init.elements, emits);
                found = true;
                path.stop();
              } else if (t.isObjectExpression(binding.path.node.init)) {
                processObjectProperties(binding.path.node.init.properties, emits);
                found = true;
                path.stop();
              }
            }
          }
        },
        
        // 处理 export default ['click', 'hover']
        ExportDefaultDeclaration(path) {
          if (found || importedName !== 'default') return;
          
          if (t.isArrayExpression(path.node.declaration)) {
            processArrayElements(path.node.declaration.elements, emits);
            found = true;
            path.stop();
          } else if (t.isObjectExpression(path.node.declaration)) {
            processObjectProperties(path.node.declaration.properties, emits);
            found = true;
            path.stop();
          }
        }
      });
      
      if (!found) {
        logDebug(`Could not find export named ${importedName} in ${importFilePath}`);
      }
    } else {
      logDebug(`Import file not found: ${importFilePath}`);
    }
  } catch (error) {
    console.error(`[emits-analyzer] Error analyzing imported emits:`, error);
  }
} 