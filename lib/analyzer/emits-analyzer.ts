import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { NodePath } from '@babel/traverse';
import type { ParseResult } from '@babel/parser';
import type { File } from '@babel/types';
import { parseComponent } from './shared-parser';
import * as fs from 'fs';
import * as path from 'path';
import { 
  ImportInfo, 
  collectImportDeclarations, 
  findExportedObjectAndImports, 
  processArrayElements,
  processObjectProperties,
  processIdentifierReference
} from './import-analyzer';

function logDebug(message: string, ...args: any[]) {
  if (process.env.DEBUG) {
    console.log(`[emits-analyzer] ${message}`, ...args);
  }
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
            processObjectProperties(emitsProperty.value.properties, emits, filePath, importDeclarations, 'emits', processImportedEmits);
          }
          // 处理 emits 为变量引用的情况
          else if (t.isIdentifier(emitsProperty.value)) {
            processIdentifierReference(
              emitsProperty.value, 
              path, 
              emits, 
              importDeclarations, 
              filePath, 
              'emits', 
              processImportedEmits
            );
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
            processObjectProperties(emitsProperty.value.properties, emits, filePath, importDeclarations, 'emits', processImportedEmits);
          } else if (t.isIdentifier(emitsProperty.value)) {
            processIdentifierReference(
              emitsProperty.value, 
              path, 
              emits, 
              importDeclarations, 
              filePath, 
              'emits', 
              processImportedEmits
            );
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

// 处理导入的 emits
function processImportedEmits(
  importInfo: ImportInfo, 
  filePath: string, 
  emits: string[] | Set<string>
): void {
  const importSource = importInfo.source;
  const importedName = importInfo.importedName;
  
  try {
    const currentDir = path.dirname(filePath);
    const importFilePath = path.resolve(currentDir, importSource + (importSource.endsWith('.ts') ? '' : '.ts'));
    
    logDebug(`Trying to resolve imported emits from ${importFilePath}, imported name: ${importedName}`);
    
    if (fs.existsSync(importFilePath)) {
      const importedCode = fs.readFileSync(importFilePath, 'utf-8');
      const importedAst = parseComponent(importedCode).ast;
      
      // 从导入的文件中找到对应的导出变量
      const [exportedEmitsObject, nestedImportDeclarations] = findExportedObjectAndImports(
        importedAst, 
        importedName,
      );
      
      if (exportedEmitsObject) {
        if (t.isArrayExpression(exportedEmitsObject)) {
          processArrayElements(exportedEmitsObject.elements, emits);
        } else if (t.isObjectExpression(exportedEmitsObject)) {
          processObjectProperties(exportedEmitsObject.properties, emits, importFilePath, nestedImportDeclarations, 'emits', processImportedEmits);
        }
      } else {
        logDebug(`Could not find export named ${importedName} in ${importFilePath}`);
      }
    } else {
      logDebug(`Import file not found: ${importFilePath}`);
    }
  } catch (error) {
    console.error(`[emits-analyzer] Error analyzing imported emits:`, error);
  }
} 