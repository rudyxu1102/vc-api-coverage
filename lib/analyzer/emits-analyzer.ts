import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { NodePath } from '@babel/traverse';
import type { ParseResult } from '@babel/parser';
import type { File } from '@babel/types';
import { parseComponent } from '../common/shared-parser';
import * as fs from 'fs';
import * as path from 'path';
import { 
  ImportInfo, 
  collectImportDeclarations, 
  findExportedObjectAndImports, 
  processArrayElements,
  processObjectProperties,
  processIdentifierReference
} from '../common/import-analyzer';
import { logDebug, logError } from '../common/utils';

const moduleName = 'emits-analyzer';
/**
 * Emits 分析器类，包含不同的分析策略
 */
class EmitsAnalyzer {
  private emits: string[] = [];
  private importDeclarations: Record<string, ImportInfo> = {};
  private filePath?: string;
  private foundDefineComponentEmits: boolean = false;
  private ast: ParseResult<File>;

  constructor(ast: ParseResult<File>, filePath?: string) {
    this.filePath = filePath;
    this.ast = ast;
    collectImportDeclarations(ast, this.importDeclarations);
  }

  /**
   * 分析并返回组件的 emits
   */
  analyze(): string[] {
    // 分析 defineComponent 和 defineEmits
    traverse(this.ast, {
      CallExpression: this.visitCallExpression.bind(this),
      ObjectExpression: this.visitObjectExpression.bind(this)
    });

    return this.emits;
  }

  /**
   * 处理CallExpression节点
   */
  private visitCallExpression(path: NodePath<t.CallExpression>): void {
    if (this.foundDefineComponentEmits) return;
    
    const { node } = path;
    
    // 处理 defineComponent({ emits: ... })
    if (t.isIdentifier(node.callee, { name: 'defineComponent' }) && 
        node.arguments.length > 0 && 
        t.isObjectExpression(node.arguments[0])) {
      const componentDefinition = node.arguments[0];
      const emitsProperty = this.findEmitsProperty(componentDefinition.properties);
      
      if (emitsProperty) {
        this.foundDefineComponentEmits = true;
        this.processEmitsProperty(emitsProperty, path);
        path.stop();
      }
    }
    
    // 处理 defineEmits 调用
    else if (t.isIdentifier(node.callee, { name: 'defineEmits' })) {
      // 处理 defineEmits(['event1', 'event2'])
      if (node.arguments.length > 0 && t.isArrayExpression(node.arguments[0])) {
        processArrayElements(node.arguments[0].elements, this.emits);
      }
      // 处理 defineEmits<{ (e: 'event1'): void; (e: 'event2', id: number): void }>()
      else if (node.typeParameters?.params[0]) {
        this.processTypeParameterEmits(node.typeParameters.params[0]);
      }
      path.stop();
    }
  }

  /**
   * 处理ObjectExpression节点
   */
  private visitObjectExpression(path: NodePath<t.ObjectExpression>): void {
    if (this.foundDefineComponentEmits) return;
    
    const emitsProperty = this.findEmitsProperty(path.node.properties);
    
    if (emitsProperty) {
      this.foundDefineComponentEmits = true;
      this.processEmitsProperty(emitsProperty, path);
      path.stop();
    }
  }

  /**
   * 从属性列表中找到 emits 属性
   */
  private findEmitsProperty(properties: Array<t.ObjectMethod | t.ObjectProperty | t.SpreadElement>): t.ObjectProperty | null {
    const emitsProperty = properties.find(
      (prop): prop is t.ObjectProperty =>
        t.isObjectProperty(prop) &&
        (t.isIdentifier(prop.key, { name: 'emits' }) ||
         t.isStringLiteral(prop.key, { value: 'emits' }))
    );
    return emitsProperty || null;
  }

  /**
   * 处理 emits 属性
   */
  private processEmitsProperty(
    emitsProperty: t.ObjectProperty, 
    path: NodePath<t.CallExpression | t.ObjectExpression>
  ): void {
    const value = emitsProperty.value;
    
    // 处理 emits: ['event1', 'event2']
    if (t.isArrayExpression(value)) {
      processArrayElements(value.elements, this.emits);
    } 
    // 处理 emits: { click: null, 'update:modelValue': validator }
    else if (t.isObjectExpression(value)) {
      processObjectProperties(
        value.properties, 
        this.emits, 
        this.filePath, 
        this.importDeclarations, 
        'emits', 
        processImportedEmits
      );
    }
    // 处理 emits 为变量引用的情况
    else if (t.isIdentifier(value)) {
      processIdentifierReference(
        value, 
        path, 
        this.emits, 
        this.importDeclarations, 
        this.filePath, 
        processImportedEmits
      );
    }
  }

  /**
   * 处理类型参数形式的 emits
   */
  private processTypeParameterEmits(typeParam: t.TSType): void {
    if (t.isTSTypeLiteral(typeParam)) {
      typeParam.members.forEach((member) => {
        if (t.isTSCallSignatureDeclaration(member) && member.parameters.length > 0) {
          const firstParam = member.parameters[0];
          if (t.isIdentifier(firstParam) && firstParam.typeAnnotation && t.isTSTypeAnnotation(firstParam.typeAnnotation)) {
            if (t.isTSLiteralType(firstParam.typeAnnotation.typeAnnotation) && 
                t.isStringLiteral(firstParam.typeAnnotation.typeAnnotation.literal)) {
              this.emits.push(firstParam.typeAnnotation.typeAnnotation.literal.value);
            }
          }
        }
      });
    }
  }
}

// 入口函数
export function analyzeEmits(code: string, parsedAst?: ParseResult<File>, filePath?: string): string[] {
  const ast = parsedAst || parseComponent(code).ast;
  const analyzer = new EmitsAnalyzer(ast, filePath);
  return analyzer.analyze();
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
    
    logDebug(moduleName, `Trying to resolve imported emits from ${importFilePath}, imported name: ${importedName}`);
    
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
        logDebug(moduleName, `Could not find export named ${importedName} in ${importFilePath}`);
      }
    } else {
      logDebug(moduleName, `Import file not found: ${importFilePath}`);
    }
  } catch (error) {
    logError(moduleName, `Error analyzing imported emits:`, error);
  }
} 