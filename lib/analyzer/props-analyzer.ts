import traverse from '@babel/traverse'
import * as t from '@babel/types'
import type { ParseResult } from '@babel/parser'
import type { File } from '@babel/types'
import { parseComponent } from './shared-parser'
import * as fs from 'fs'
import * as path from 'path'
import { 
  ImportInfo, 
  collectImportDeclarations, 
  findExportedObjectAndImports, 
  processObjectProperties, 
  processIdentifierReference 
} from '../common/import-analyzer'
import { logDebug } from '../common/utils'

export function analyzeProps(code: string, parsedAst?: ParseResult<File>, filePath?: string): string[] {
  // 使用Set来避免重复属性
  const propsSet = new Set<string>()
  const ast = parsedAst || parseComponent(code).ast

  // 保存找到的导入声明，用于后续解析
  const importDeclarations: Record<string, ImportInfo> = {}
  collectImportDeclarations(ast, importDeclarations)

  traverse(ast, {
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
          
          // 使用通用函数处理标识符引用
          processIdentifierReference(
            nodePath.node.value, 
            nodePath, 
            propsSet, 
            importDeclarations, 
            filePath,
            processImportedProps
          )
        } else if (t.isObjectExpression(nodePath.node.value)) {
          // 直接处理内联对象
          processObjectProperties(nodePath.node.value.properties, propsSet, filePath, importDeclarations, 'props', processImportedProps)
        }
      }
    },
  })

  // 转换Set为数组返回
  return Array.from(propsSet)
}

// 处理导入的 props
function processImportedProps(
  importInfo: ImportInfo,
  filePath: string,
  propsSet: Set<string> | string[]
): void {
  const importSource = importInfo.source;
  const importedName = importInfo.importedName;
  
  try {
    // 解析导入的文件路径
    const currentDir = path.dirname(filePath);
    const importFilePath = path.resolve(currentDir, importSource + (importSource.endsWith('.ts') ? '' : '.ts'));
    
    logDebug(`Trying to resolve imported props from ${importFilePath}, imported name: ${importedName}`);
    
    // 读取并解析导入文件
    if (fs.existsSync(importFilePath)) {
      const importedCode = fs.readFileSync(importFilePath, 'utf-8');
      const importedAst = parseComponent(importedCode).ast;
      
      // 从导入的文件中找到对应的导出变量
      const [exportedPropsObject, nestedImportDeclarations] = findExportedObjectAndImports(importedAst, importedName);
      
      if (exportedPropsObject && t.isObjectExpression(exportedPropsObject)) {
        // 递归处理导入文件中的对象属性，包括可能的展开运算符
        processObjectProperties(exportedPropsObject.properties, propsSet, importFilePath, nestedImportDeclarations, 'props', processImportedProps);
      }
    } else {
      logDebug(`Import file not found: ${importFilePath}`);
    }
  } catch (error) {
    console.error(`[props-analyzer] Error analyzing imported props:`, error);
  }
} 