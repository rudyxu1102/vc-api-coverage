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
    // 优先查找 defineComponent 中的 emits
    this.analyzeDefineComponentEmits(this.ast);

    // 如果未在 defineComponent 中找到，则查找 defineEmits 调用
    if (!this.foundDefineComponentEmits) {
      this.analyzeDefineEmits(this.ast);
    }

    return this.emits;
  }

  /**
   * 分析 defineComponent 中的 emits
   */
  private analyzeDefineComponentEmits(ast: ParseResult<File>): void {
    traverse(ast, {
      CallExpression: this.analyzeDefineComponentCall.bind(this),
      ObjectExpression: this.analyzeComponentOptions.bind(this)
    });
  }

  /**
   * 分析 defineComponent({ emits: ... }) 调用
   */
  private analyzeDefineComponentCall(path: NodePath<t.CallExpression>): void {
    if (
      !this.foundDefineComponentEmits &&
      t.isIdentifier(path.node.callee, { name: 'defineComponent' }) &&
      path.node.arguments.length > 0 &&
      t.isObjectExpression(path.node.arguments[0])
    ) {
      const componentDefinition = path.node.arguments[0];
      const emitsProperty = this.findEmitsProperty(componentDefinition.properties);
      
      if (emitsProperty) {
        this.foundDefineComponentEmits = true;
        this.processEmitsProperty(emitsProperty, path);
        path.stop();
      }
    }
  }

  /**
   * 分析组件选项对象中的 emits
   */
  private analyzeComponentOptions(path: NodePath<t.ObjectExpression>): void {
    if (!this.foundDefineComponentEmits) {
      const emitsProperty = this.findEmitsProperty(path.node.properties);
      
      if (emitsProperty) {
        this.foundDefineComponentEmits = true;
        this.processEmitsProperty(emitsProperty, path);
        path.stop();
      }
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
    // 处理 emits: ['event1', 'event2']
    if (t.isArrayExpression(emitsProperty.value)) {
      this.processArrayEmits(emitsProperty.value);
    } 
    // 处理 emits: { click: null, 'update:modelValue': validator }
    else if (t.isObjectExpression(emitsProperty.value)) {
      this.processObjectEmits(emitsProperty.value);
    }
    // 处理 emits 为变量引用的情况
    else if (t.isIdentifier(emitsProperty.value)) {
      this.processIdentifierEmits(emitsProperty.value, path);
    }
  }

  /**
   * 处理数组形式的 emits
   */
  private processArrayEmits(arrayExpr: t.ArrayExpression): void {
    processArrayElements(arrayExpr.elements, this.emits);
  }

  /**
   * 处理对象形式的 emits
   */
  private processObjectEmits(objectExpr: t.ObjectExpression): void {
    processObjectProperties(
      objectExpr.properties, 
      this.emits, 
      this.filePath, 
      this.importDeclarations, 
      'emits', 
      processImportedEmits
    );
  }

  /**
   * 处理标识符引用形式的 emits
   */
  private processIdentifierEmits(identifier: t.Identifier, path: NodePath<t.CallExpression | t.ObjectExpression>): void {
    processIdentifierReference(
      identifier, 
      path, 
      this.emits, 
      this.importDeclarations, 
      this.filePath, 
      processImportedEmits
    );
  }

  /**
   * 分析 defineEmits 调用
   */
  private analyzeDefineEmits(ast: ParseResult<File>): void {
    traverse(ast, {
      CallExpression: this.analyzeDefineEmitsCall.bind(this)
    });
  }

  /**
   * 分析 defineEmits 调用表达式
   */
  private analyzeDefineEmitsCall(path: NodePath<t.CallExpression>): void {
    if (t.isIdentifier(path.node.callee, { name: 'defineEmits' })) {
      // 处理 defineEmits(['event1', 'event2'])
      if (path.node.arguments.length > 0 && t.isArrayExpression(path.node.arguments[0])) {
        this.processArrayEmits(path.node.arguments[0]);
      }
      // 处理 defineEmits<{ (e: 'event1'): void; (e: 'event2', id: number): void }>()
      else if (path.node.typeParameters?.params[0]) {
        this.processTypeParameterEmits(path.node.typeParameters.params[0]);
      }
      path.stop();
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