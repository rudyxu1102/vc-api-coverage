import traverse from '@babel/traverse'
import * as t from '@babel/types'
import type { ParseResult } from '@babel/parser'
import type { File } from '@babel/types'
import { parseComponent } from './shared-parser'
import * as fs from 'fs'
import * as path from 'path'

function logDebug(message: string, ...args: any[]) {
  if (process.env.DEBUG) {
    console.log(`[props-analyzer] ${message}`, ...args);
  }
}

interface ImportInfo {
  source: string;
  importedName: string;
}

export function analyzeProps(code: string, parsedAst?: ParseResult<File>, filePath?: string): string[] {
  // 使用Set来避免重复属性
  const propsSet = new Set<string>()
  const ast = parsedAst || parseComponent(code).ast

  // 保存找到的导入声明，用于后续解析
  const importDeclarations: Record<string, ImportInfo> = {}

  traverse(ast, {
    // 收集导入声明，以便后续需要时解析
    ImportDeclaration(nodePath) {
      const source = nodePath.node.source.value
      nodePath.node.specifiers.forEach(specifier => {
        if (t.isImportSpecifier(specifier)) {
          // 处理命名导入: import { buttonProps } from './props'
          const importedName = t.isIdentifier(specifier.imported) ? specifier.imported.name : specifier.imported.value
          const localName = specifier.local.name
          importDeclarations[localName] = { source, importedName }
        } else if (t.isImportDefaultSpecifier(specifier)) {
          // 处理默认导入: import buttonProps from './props'
          importDeclarations[specifier.local.name] = { source, importedName: 'default' }
        }
      })
    },

    // 处理 defineProps<{...}>() 形式
    CallExpression(nodePath) {
      if (t.isIdentifier(nodePath.node.callee) && nodePath.node.callee.name === 'defineProps') {
        if (nodePath.node.typeParameters?.params[0]) {
          const typeAnnotation = nodePath.node.typeParameters.params[0]
          if (t.isTSTypeLiteral(typeAnnotation)) {
            typeAnnotation.members.forEach(member => {
              if (t.isTSPropertySignature(member) && t.isIdentifier(member.key)) {
                propsSet.add(member.key.name)
              }
            })
          }
        }
      }
    },

    // 处理 props: ['prop1', 'prop2'] 形式和 props: variableName 形式
    ObjectProperty(nodePath) {
      if (
        t.isIdentifier(nodePath.node.key) &&
        nodePath.node.key.name === 'props'
      ) {
        if (t.isArrayExpression(nodePath.node.value)) {
          nodePath.node.value.elements.forEach(element => {
            if (t.isStringLiteral(element)) {
              propsSet.add(element.value)
            }
          })
        } else if (t.isIdentifier(nodePath.node.value)) {
          const propsVarName = nodePath.node.value.name
          logDebug(`Found props variable reference: ${propsVarName}`)
          
          // 1. 尝试在当前文件中解析变量定义
          const binding = nodePath.scope.getBinding(propsVarName)
          if (binding && t.isVariableDeclarator(binding.path.node)) {
            const init = binding.path.node.init
            if (t.isObjectExpression(init)) {
              processObjectProperties(init.properties, propsSet, filePath, importDeclarations)
            }
          } 
          // 2. 如果在当前文件中找不到定义，尝试处理导入的变量
          else if (importDeclarations[propsVarName] && filePath) {
            const importInfo = importDeclarations[propsVarName]
            processImportedProps(importInfo, filePath, propsSet, importDeclarations)
          }
        } else if (t.isObjectExpression(nodePath.node.value)) {
          // 直接处理内联对象
          processObjectProperties(nodePath.node.value.properties, propsSet, filePath, importDeclarations)
        }
      }
    },

    // 防止重复处理，我们移除对props对象的直接处理
    // 因为ObjectProperty处理器已经处理了props对象
  })

  // 转换Set为数组返回
  return Array.from(propsSet)
}

// 处理对象属性，包括展开运算符
function processObjectProperties(
  properties: (t.ObjectProperty | t.ObjectMethod | t.SpreadElement)[],
  propsSet: Set<string>,
  filePath?: string,
  importDeclarations?: Record<string, ImportInfo>
) {
  for (const prop of properties) {
    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
      propsSet.add(prop.key.name)
    } else if (t.isSpreadElement(prop) && t.isIdentifier(prop.argument) && importDeclarations && filePath) {
      // 处理 ...commonProps 形式的展开导入
      const spreadVarName = prop.argument.name
      logDebug(`Found spread variable: ${spreadVarName}`)
      
      // 不尝试在当前文件中查找变量，直接检查导入声明
      if (importDeclarations[spreadVarName]) {
        const importInfo = importDeclarations[spreadVarName]
        processImportedProps(importInfo, filePath, propsSet, importDeclarations)
      }
    }
  }
}

// 处理导入的 props
function processImportedProps(
  importInfo: ImportInfo,
  filePath: string,
  propsSet: Set<string>,
  _importDeclarations: Record<string, ImportInfo> // 使用下划线前缀表示intentionally unused
) {
  const importSource = importInfo.source
  const importedName = importInfo.importedName
  
  try {
    // 解析导入的文件路径
    const currentDir = path.dirname(filePath)
    const importFilePath = path.resolve(currentDir, importSource + (importSource.endsWith('.ts') ? '' : '.ts'))
    
    logDebug(`Trying to resolve imported props from ${importFilePath}, imported name: ${importedName}`)
    
    // 读取并解析导入文件
    if (fs.existsSync(importFilePath)) {
      const importedCode = fs.readFileSync(importFilePath, 'utf-8')
      const importedAst = parseComponent(importedCode).ast
      
      // 从导入的文件中找到对应的导出变量
      const [exportedPropsObject, nestedImportDeclarations] = findExportedObjectAndImports(importedAst, importedName)
      
      if (exportedPropsObject && t.isObjectExpression(exportedPropsObject)) {
        // 递归处理导入文件中的对象属性，包括可能的展开运算符
        processObjectProperties(exportedPropsObject.properties, propsSet, importFilePath, nestedImportDeclarations)
      }
    } else {
      logDebug(`Import file not found: ${importFilePath}`)
    }
  } catch (error) {
    console.error(`[props-analyzer] Error analyzing imported props:`, error)
  }
}

// 在导入的文件 AST 中查找导出的对象和其中的导入声明
function findExportedObjectAndImports(ast: File, exportName: string): [t.ObjectExpression | null, Record<string, ImportInfo>] {
  let result: t.ObjectExpression | null = null
  const nestedImportDeclarations: Record<string, ImportInfo> = {}
  
  // 先收集导入声明
  traverse(ast, {
    ImportDeclaration(nodePath) {
      const source = nodePath.node.source.value
      nodePath.node.specifiers.forEach(specifier => {
        if (t.isImportSpecifier(specifier)) {
          const importedName = t.isIdentifier(specifier.imported) ? specifier.imported.name : specifier.imported.value
          const localName = specifier.local.name
          nestedImportDeclarations[localName] = { source, importedName }
        } else if (t.isImportDefaultSpecifier(specifier)) {
          nestedImportDeclarations[specifier.local.name] = { source, importedName: 'default' }
        }
      })
    }
  })
  
  // 然后查找导出对象
  traverse(ast, {
    // 处理 export const buttonProps = { ... }
    ExportNamedDeclaration(nodePath) {
      if (t.isVariableDeclaration(nodePath.node.declaration)) {
        const declarations = nodePath.node.declaration.declarations
        for (const decl of declarations) {
          if (t.isIdentifier(decl.id) && decl.id.name === exportName && t.isObjectExpression(decl.init)) {
            result = decl.init
            nodePath.stop()
            return
          }
        }
      }
    },
    
    // 处理 const buttonProps = { ... }; export { buttonProps }
    ExportSpecifier(nodePath) {
      if (t.isIdentifier(nodePath.node.exported) && nodePath.node.exported.name === exportName) {
        const localName = nodePath.node.local.name
        const binding = nodePath.scope.getBinding(localName)
        
        if (binding && t.isVariableDeclarator(binding.path.node) && t.isObjectExpression(binding.path.node.init)) {
          result = binding.path.node.init
          nodePath.stop()
          return
        }
      }
    },
    
    // 处理 export default { ... }
    ExportDefaultDeclaration(nodePath) {
      if (exportName === 'default' && t.isObjectExpression(nodePath.node.declaration)) {
        result = nodePath.node.declaration
        nodePath.stop()
        return
      }
    }
  })
  
  return [result, nestedImportDeclarations]
} 