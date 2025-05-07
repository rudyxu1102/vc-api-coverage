import traverse from '@babel/traverse'
import * as t from '@babel/types'
import type { NodePath } from '@babel/traverse'
import type { ParseResult } from '@babel/parser'
import type { File } from '@babel/types'
import { parseComponent } from '../common/shared-parser'
import * as fs from 'fs'
import * as path from 'path'
import { 
  ImportInfo, 
  collectImportDeclarations, 
  findExportedObjectAndImports, 
  processObjectProperties, 
  processIdentifierReference 
} from '../common/import-analyzer'
import { logDebug, logError } from '../common/utils'

const moduleName = 'props-analyzer';
/**
 * Props 分析器类，包含不同的分析策略
 */
class PropsAnalyzer {
  private propsSet: Set<string> = new Set<string>();
  private importDeclarations: Record<string, ImportInfo> = {};
  private filePath?: string;
  private ast: ParseResult<File>;

  constructor(ast: ParseResult<File>, filePath?: string) {
    this.filePath = filePath;
    this.ast = ast;
    collectImportDeclarations(ast, this.importDeclarations);
  }

  /**
   * 分析并返回组件的 props
   */
  analyze(ast: ParseResult<File>): string[] {
    traverse(ast, {
      CallExpression: this.analyzeDefineProps.bind(this),
      ObjectProperty: this.analyzePropsProperty.bind(this),
    });

    return Array.from(this.propsSet);
  }

  /**
   * 分析 defineProps<{...}>() 形式
   */
  private analyzeDefineProps(nodePath: NodePath<t.CallExpression>): void {
    if (t.isIdentifier(nodePath.node.callee) && nodePath.node.callee.name === 'defineProps') {
      if (nodePath.node.typeParameters?.params[0]) {
        const typeAnnotation = nodePath.node.typeParameters.params[0];
        if (t.isTSTypeLiteral(typeAnnotation)) {
          typeAnnotation.members.forEach(member => {
            if (t.isTSPropertySignature(member) && t.isIdentifier(member.key)) {
              this.propsSet.add(member.key.name);
            }
          });
        }
      }
    }
  }

  /**
   * 分析 props 对象属性
   */
  private analyzePropsProperty(nodePath: NodePath<t.ObjectProperty>): void {
    if (
      t.isIdentifier(nodePath.node.key) &&
      nodePath.node.key.name === 'props'
    ) {
      if (t.isArrayExpression(nodePath.node.value)) {
        this.analyzeArrayProps(nodePath.node.value);
      } else if (t.isIdentifier(nodePath.node.value)) {
        this.analyzeIdentifierProps(nodePath.node.value, nodePath);
      } else if (t.isObjectExpression(nodePath.node.value)) {
        this.analyzeObjectProps(nodePath.node.value);
      }
    }
  }

  /**
   * 分析 props: ['prop1', 'prop2'] 形式
   */
  private analyzeArrayProps(arrayExpr: t.ArrayExpression): void {
    arrayExpr.elements.forEach(element => {
      if (t.isStringLiteral(element)) {
        this.propsSet.add(element.value);
      }
    });
  }

  /**
   * 处理展开操作符
   */
  private processSpreadElement(element: t.SpreadElement): void {
    if (t.isIdentifier(element.argument)) {
      const spreadName = element.argument.name;
      // 检查是否为导入的标识符
      const importInfo = this.importDeclarations[spreadName];
      if (importInfo && this.filePath) {
        // 处理导入的props
        processImportedProps(importInfo, this.filePath, this.propsSet);
      } else {
        // 查找本地绑定
        const binding = this.findBindingInAST(spreadName);
        if (binding && t.isVariableDeclarator(binding.node) && binding.node.init) {
          if (t.isObjectExpression(binding.node.init)) {
            // 处理本地对象中的属性
            this.processLocalObject(binding.node.init);
          } else if (t.isTSAsExpression(binding.node.init) && t.isObjectExpression(binding.node.init.expression)) {
            // 处理 as const 或其他类型断言
            this.processLocalObject(binding.node.init.expression);
          }
        }
      }
    }
  }

  /**
   * 处理本地对象表达式
   */
  private processLocalObject(objectExpr: t.ObjectExpression): void {
    // 处理对象中的展开操作符
    objectExpr.properties.forEach(prop => {
      if (t.isSpreadElement(prop)) {
        this.processSpreadElement(prop);
      }
    });
    
    // 处理对象的普通属性
    processObjectProperties(
      objectExpr.properties,
      this.propsSet,
      this.filePath,
      this.importDeclarations,
      'props',
      processImportedProps
    );
  }

  /**
   * 分析 props: variableName 形式
   */
  private analyzeIdentifierProps(identifier: t.Identifier, nodePath: NodePath<t.ObjectProperty>): void {
    const propsVarName = identifier.name;
    logDebug(moduleName, `Found props variable reference: ${propsVarName}`);
    
    // 先尝试在AST中找到该变量的绑定
    const binding = this.findBindingInAST(propsVarName);
    if (binding && t.isVariableDeclarator(binding.node) && binding.node.init) {
      // 如果变量是在当前文件中定义的
      if (t.isObjectExpression(binding.node.init)) {
        this.processLocalObject(binding.node.init);
        return;
      } else if (t.isTSAsExpression(binding.node.init) && t.isObjectExpression(binding.node.init.expression)) {
        this.processLocalObject(binding.node.init.expression);
        return;
      }
    }
    
    // 使用通用函数处理标识符引用
    processIdentifierReference(
      identifier, 
      nodePath, 
      this.propsSet, 
      this.importDeclarations, 
      this.filePath,
      processImportedProps
    );
  }

  /**
   * 分析 props: { prop1: Type, prop2: Type } 形式
   */
  private analyzeObjectProps(objectExpr: t.ObjectExpression): void {
    // 处理对象中的所有属性，包括展开操作符
    objectExpr.properties.forEach(prop => {
      if (t.isSpreadElement(prop)) {
        this.processSpreadElement(prop);
      }
    });
    
    // 处理普通属性
    processObjectProperties(
      objectExpr.properties, 
      this.propsSet, 
      this.filePath, 
      this.importDeclarations, 
      'props', 
      processImportedProps
    );
  }
  
  /**
   * 在AST中找到变量的绑定
   */
  private findBindingInAST(name: string): NodePath<t.VariableDeclarator> | null {
    let binding: NodePath<t.VariableDeclarator> | null = null;
    
    // 使用全局AST遍历查找变量绑定
    traverse(this.ast as unknown as File, {
      VariableDeclarator(path) {
        if (t.isIdentifier(path.node.id) && path.node.id.name === name) {
          binding = path;
          path.stop(); // 找到后停止遍历
        }
      }
    });
    
    return binding;
  }
}

// 入口函数
export function analyzeProps(code: string, parsedAst?: ParseResult<File>, filePath?: string): string[] {
  const ast = parsedAst || parseComponent(code).ast;
  const analyzer = new PropsAnalyzer(ast, filePath);
  return analyzer.analyze(ast);
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
    logDebug(moduleName, `Trying to resolve imported props from ${importFilePath}, imported name: ${importedName}`);
    
    // 读取并解析导入文件
    if (fs.existsSync(importFilePath)) {
      const importedCode = fs.readFileSync(importFilePath, 'utf-8');
      const importedAst = parseComponent(importedCode).ast;
      
      // 从导入的文件中找到对应的导出变量
      const [exportedPropsObject, nestedImportDeclarations] = findExportedObjectAndImports(importedAst, importedName);
      
      if (exportedPropsObject) {
        if (t.isObjectExpression(exportedPropsObject)) {
          // 递归处理导入文件中的对象属性，包括可能的展开运算符
          processObjectProperties(exportedPropsObject.properties, propsSet, importFilePath, nestedImportDeclarations, 'props', processImportedProps);
        } else if (t.isTSAsExpression(exportedPropsObject) && t.isObjectExpression(exportedPropsObject.expression)) {
          // 处理带有类型断言的对象 (如 'as const')
          processObjectProperties(exportedPropsObject.expression.properties, propsSet, importFilePath, nestedImportDeclarations, 'props', processImportedProps);
        }
      }
    } else {
      logDebug(moduleName, `Import file not found: ${importFilePath}`);
    }
  } catch (error) {
    logError(moduleName, `Error analyzing imported props:`, error);
  }
} 