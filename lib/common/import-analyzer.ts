import traverse from '@babel/traverse'
import * as t from '@babel/types'
import type { NodePath } from '@babel/traverse'
import type { File } from '@babel/types'
import { logDebug } from './utils'

export interface ImportInfo {
  source: string;
  importedName: string;
}

/**
 * 收集AST中的所有导入声明
 */
export function collectImportDeclarations(ast: File, importDeclarations: Record<string, ImportInfo>) {
  traverse(ast, {
    ImportDeclaration(path) {
      const source = path.node.source.value;
      path.node.specifiers.forEach(specifier => {
        if (t.isImportSpecifier(specifier)) {
          // 处理命名导入: import { name } from './module'
          const importedName = t.isIdentifier(specifier.imported) ? specifier.imported.name : specifier.imported.value;
          const localName = specifier.local.name;
          importDeclarations[localName] = { source, importedName };
        } else if (t.isImportDefaultSpecifier(specifier)) {
          // 处理默认导入: import name from './module'
          importDeclarations[specifier.local.name] = { source, importedName: 'default' };
        }
      });
    }
  });
}

/**
 * 在导入的文件 AST 中查找导出的对象和其中的导入声明
 */
export function findExportedObjectAndImports(
  ast: File, 
  exportName: string,
): [t.ObjectExpression | t.ArrayExpression | t.TSAsExpression | null, Record<string, ImportInfo>] {
  let result: t.ObjectExpression | t.ArrayExpression | t.TSAsExpression | null = null;
  const nestedImportDeclarations: Record<string, ImportInfo> = {};
  
  // 先收集导入声明
  collectImportDeclarations(ast, nestedImportDeclarations);
  
  // 然后查找导出对象
  traverse(ast, {
    // 处理 export const name = { ... } 或 export const name = [ ... ] 或 export const name = Object as ...
    ExportNamedDeclaration(nodePath) {
      if (t.isVariableDeclaration(nodePath.node.declaration)) {
        const declarations = nodePath.node.declaration.declarations;
        for (const decl of declarations) {
          if (
            t.isIdentifier(decl.id) && 
            decl.id.name === exportName && 
            (t.isObjectExpression(decl.init) || t.isArrayExpression(decl.init) || t.isTSAsExpression(decl.init))
          ) {
            result = decl.init as t.ObjectExpression | t.ArrayExpression | t.TSAsExpression;
            nodePath.stop();
            return;
          }
        }
      }
    },
    
    // 处理 const name = { ... }; export { name }
    ExportSpecifier(nodePath) {
      if (t.isIdentifier(nodePath.node.exported) && nodePath.node.exported.name === exportName) {
        const localName = nodePath.node.local.name;
        const binding = nodePath.scope.getBinding(localName);
        
        if (binding && t.isVariableDeclarator(binding.path.node)) {
          if (
            t.isObjectExpression(binding.path.node.init) || 
            t.isArrayExpression(binding.path.node.init) ||
            t.isTSAsExpression(binding.path.node.init)
          ) {
            result = binding.path.node.init as t.ObjectExpression | t.ArrayExpression | t.TSAsExpression;
            nodePath.stop();
            return;
          }
        }
      }
    },
    
    // 处理 export default { ... } 或 export default [ ... ]
    ExportDefaultDeclaration(nodePath) {
      if (exportName === 'default') {
        if (
          t.isObjectExpression(nodePath.node.declaration) || 
          t.isArrayExpression(nodePath.node.declaration) ||
          t.isTSAsExpression(nodePath.node.declaration)
        ) {
          result = nodePath.node.declaration as t.ObjectExpression | t.ArrayExpression | t.TSAsExpression;
          nodePath.stop();
          return;
        }
      }
    }
  });
  
  return [result, nestedImportDeclarations];
}

/**
 * 处理对象属性中的标识符引用
 */
export function processIdentifierReference(
  identifier: t.Identifier,
  path: NodePath,
  collection: string[] | Set<string>,
  importDeclarations: Record<string, ImportInfo>,
  filePath?: string,
  processFunction?: (importInfo: ImportInfo, filePath: string, collection: string[] | Set<string>) => void
) {
  const varName = identifier.name;
  
  // 先检查本地绑定
  const binding = path.scope.getBinding(varName);
  if (binding && t.isVariableDeclarator(binding.path.node)) {
    const init = binding.path.node.init;
    if (t.isArrayExpression(init)) {
      init.elements.forEach(element => {
        if (t.isStringLiteral(element)) {
          addToCollection(collection, element.value);
        } else if (t.isIdentifier(element)) {
          addToCollection(collection, element.name);
        }
      });
    } else if (t.isObjectExpression(init)) {
      init.properties.forEach(prop => {
        if (t.isObjectProperty(prop)) {
          if (t.isIdentifier(prop.key)) {
            addToCollection(collection, prop.key.name);
          } else if (t.isStringLiteral(prop.key)) {
            addToCollection(collection, prop.key.value);
          }
        }
      });
    }
  } 
  // 如果是导入的变量，且提供了处理函数
  else if (importDeclarations[varName] && filePath && processFunction) {
    processFunction(importDeclarations[varName], filePath, collection);
  }
}

/**
 * 处理数组元素
 */
export function processArrayElements(elements: Array<t.Expression | t.SpreadElement | null>, collection: string[] | Set<string>) {
  elements.forEach((element) => {
    if (t.isStringLiteral(element)) {
      addToCollection(collection, element.value);
    } else if (t.isIdentifier(element)) {
      addToCollection(collection, element.name);
    }
  });
}

/**
 * 处理对象属性
 */
export function processObjectProperties(
  properties: (t.ObjectProperty | t.ObjectMethod | t.SpreadElement)[],
  collection: string[] | Set<string>,
  filePath?: string,
  importDeclarations?: Record<string, ImportInfo>,
  moduleType: 'props' | 'emits' | 'expose' = 'props',
  processFunction?: (importInfo: ImportInfo, filePath: string, collection: string[] | Set<string>) => void
) {
  for (const prop of properties) {
    if (t.isObjectProperty(prop)) {
      if (t.isIdentifier(prop.key)) {
        addToCollection(collection, prop.key.name);
      } else if (t.isStringLiteral(prop.key)) {
        addToCollection(collection, prop.key.value);
      }
    } else if (t.isSpreadElement(prop) && t.isIdentifier(prop.argument) && importDeclarations && filePath) {
      // 处理 ...spreadVar 形式的展开导入
      const spreadVarName = prop.argument.name;
      logDebug(moduleType, `Found spread variable: ${spreadVarName}`);
      
      // 先检查是否是导入的变量
      if (importDeclarations[spreadVarName] && processFunction) {
        processFunction(importDeclarations[spreadVarName], filePath, collection);
      } else {
        // 如果不是导入的变量，可能是当前文件中定义的变量
        // 尝试找到这个变量的定义
        const scope = prop.loc ? { start: prop.loc.start, end: prop.loc.end } : undefined;
        if (scope) {
          try {
            traverse(prop, {
              VariableDeclarator(nodePath) {
                if (t.isIdentifier(nodePath.node.id) && nodePath.node.id.name === spreadVarName) {
                  if (t.isObjectExpression(nodePath.node.init)) {
                    processObjectProperties(nodePath.node.init.properties, collection, filePath, importDeclarations, moduleType, processFunction);
                  }
                }
              }
            });
          } catch (error) {
            // 如果遍历出错，忽略这个错误
            logDebug(moduleType, `Error traversing spread element: ${error}`);
          }
        }
      }
    }
  }
}

/**
 * 将元素添加到集合中，处理数组和Set的情况
 */
export function addToCollection(collection: string[] | Set<string>, item: string) {
  if (collection instanceof Set) {
    collection.add(item);
  } else if (Array.isArray(collection) && !collection.includes(item)) {
    collection.push(item);
  }
} 