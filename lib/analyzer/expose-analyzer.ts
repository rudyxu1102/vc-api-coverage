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
  processArrayElements,
  processObjectProperties,
  processIdentifierReference
} from '../common/import-analyzer'
import { logDebug, logError } from '../common/utils'

const moduleName = 'expose-analyzer';

export interface ExposeInfo {
  name: string;
}

/**
 * Expose 分析器类，包含不同的分析策略
 */
class ExposeAnalyzer {
  private exposed: Map<string, { isOptions: boolean }> = new Map();
  private exposeOrder: string[] = [];
  private importDeclarations: Record<string, ImportInfo> = {};
  private filePath?: string;
  private code: string;
  private inSetupContext: boolean = false;
  private hasExplicitExpose: boolean = false;
  private hasOptionsExpose: boolean = false;

  constructor(code: string, ast: ParseResult<File>, filePath?: string) {
    this.code = code;
    this.filePath = filePath;
    collectImportDeclarations(ast, this.importDeclarations);
  }

  /**
   * 分析并返回组件的 exposed 属性
   */
  analyze(ast: ParseResult<File>): string[] {
    logDebug(moduleName, 'Analyzing code', this.code);
    
    // 先尝试快速分析特定模式
    this.analyzeExposeContextCalls();
    this.analyzeExposeArrayOption();
    
    // 如果快速分析没有找到结果，则进行详细的 AST 分析
    if (!this.hasExplicitExpose && !this.hasOptionsExpose) {
      this.traverseAST(ast);
    }

    // 返回分析结果
    if (this.hasExplicitExpose) {
      return this.getExposedProperties(false);
    }
    
    if (this.hasOptionsExpose) {
      return this.getExposedProperties(true);
    }
    
    // 没有显式的 expose，应该返回空数组
    // 在 Vue 3 中，setup() 返回的属性只在组件内部可用，不会暴露给父组件
    return [];
  }

  /**
   * 获取暴露的属性列表
   */
  private getExposedProperties(isOptions: boolean): string[] {
    return this.exposeOrder.filter(name => 
      this.exposed.has(name) && this.exposed.get(name)?.isOptions === isOptions
    );
  }

  /**
   * 快速分析：查找 expose 上下文调用，如 expose({...})
   */
  private analyzeExposeContextCalls(): void {
    const hasExposeContextCall = this.code.includes('expose({') && 
                                (this.code.includes('setup(props, { expose })') || 
                                 this.code.includes('{ expose }') || 
                                 this.code.includes('context.expose'));
    if (!hasExposeContextCall) return;
    
    logDebug(moduleName, 'Detected expose context call');
    const matches = this.code.match(/expose\(\s*\{([^}]+)\}\s*\)/g);
    
    if (matches && matches.length > 0) {
      logDebug(moduleName, 'Found expose calls', matches);
      for (const match of matches) {
        const propsStr = match.replace(/expose\(\s*\{/, '').replace(/\}\s*\)/, '');
        const propMatches = propsStr.match(/(\w+),?/g);
        
        if (propMatches) {
          for (const prop of propMatches) {
            const cleanProp = prop.replace(/,/g, '').trim();
            if (cleanProp) {
              this.addExposedProperty(cleanProp, false);
              this.hasExplicitExpose = true;
            }
          }
        }
      }
    }
  }

  /**
   * 快速分析：查找 expose 选项数组
   */
  private analyzeExposeArrayOption(): void {
    const exposeArrayMatch = this.code.match(/expose\s*:\s*(?:\[\s*(['"][\w\s]+['"]|[\w\s]+),?\s*(['"][\w\s]+['"]|[\w\s]+)?\s*\]|(\w+))/g);
    if (!exposeArrayMatch) return;
    
    for (const match of exposeArrayMatch) {
      if (match.includes('[')) {
        const cleanMatch = match.replace(/expose\s*:\s*\[\s*/, '').replace(/\s*\]/, '');
        const exposeItems = cleanMatch.split(',').map(item => item.trim().replace(/['"]/g, ''));
        
        for (const item of exposeItems) {
          if (item) {
            this.addExposedProperty(item, true);
            this.hasOptionsExpose = true;
          }
        }
      } else {
        // 处理变量引用
        const variableName = match.replace(/expose\s*:\s*/, '');
        const variableMatch = this.code.match(new RegExp(`const\\s+${variableName}\\s*=\\s*\\[([^\\]]+)\\]`));
        
        if (variableMatch) {
          const exposeItems = variableMatch[1].split(',').map(item => item.trim().replace(/['"]/g, ''));
          for (const item of exposeItems) {
            if (item) {
              this.addExposedProperty(item, true);
              this.hasOptionsExpose = true;
            }
          }
        }
      }
    }
  }

  /**
   * 详细的 AST 遍历分析
   */
  private traverseAST(ast: ParseResult<File>): void {
    traverse(ast, {
      Program: this.analyzeProgram.bind(this),
      VariableDeclarator: this.analyzeExposeVariables.bind(this),
      ObjectProperty: this.analyzeExposeObjectProperty.bind(this),
      ObjectMethod: {
        enter: this.enterSetupFunction.bind(this),
        exit: this.exitSetupFunction.bind(this)
      },
      CallExpression: this.analyzeCallExpressions.bind(this),
      ReturnStatement: this.analyzeReturnStatement.bind(this)
    });
  }

  /**
   * 检查 <script setup> 是否导入了 defineExpose
   */
  private analyzeProgram(path: NodePath<t.Program>): void {
    path.node.body.forEach(node => {
      if (t.isImportDeclaration(node) && node.source.value === 'vue') {
        node.specifiers.forEach(specifier => {
          if (
            t.isImportSpecifier(specifier) &&
            t.isIdentifier(specifier.imported) &&
            specifier.imported.name === 'defineExpose'
          ) {
            this.inSetupContext = true;
          }
        });
      }
    });
  }

  /**
   * 分析 expose 相关的变量声明
   */
  private analyzeExposeVariables(path: NodePath<t.VariableDeclarator>): void {
    const id = path.node.id;
    if (t.isIdentifier(id) && id.name === 'expose') {
      if (t.isArrayExpression(path.node.init)) {
        this.processArrayExpression(path.node.init, false);
      } else if (t.isIdentifier(path.node.init) && this.importDeclarations[path.node.init.name] && this.filePath) {
        // 处理导入的 expose 变量
        processIdentifierReference(
          path.node.init, 
          path, 
          new Set(), // 此处创建一个临时Set，最终结果通过addExposedProperty方法添加
          this.importDeclarations, 
          this.filePath, 
          (importInfo, filePath, exposedCollection) => {
            this.processImportedExpose(importInfo, filePath, exposedCollection, false);
          }
        );
        this.hasExplicitExpose = true;
      }
    }
  }

  /**
   * 处理数组表达式
   */
  private processArrayExpression(arrayExpr: t.ArrayExpression, isOptions: boolean): void {
    arrayExpr.elements.forEach(element => {
      if (t.isStringLiteral(element) || t.isIdentifier(element)) {
        const name = t.isStringLiteral(element) ? element.value : element.name;
        this.addExposedProperty(name, isOptions);
        
        if (isOptions) {
          this.hasOptionsExpose = true;
        } else {
          this.hasExplicitExpose = true;
        }
      }
    });
  }

  /**
   * 分析 expose 对象属性
   */
  private analyzeExposeObjectProperty(path: NodePath<t.ObjectProperty>): void {
    if (t.isIdentifier(path.node.key) && path.node.key.name === 'expose') {
      if (t.isArrayExpression(path.node.value)) {
        this.processArrayExpression(path.node.value, true);
      } else if (t.isIdentifier(path.node.value)) {
        processIdentifierReference(
          path.node.value, 
          path, 
          new Set(), // 临时Set
          this.importDeclarations, 
          this.filePath, 
          (importInfo, filePath, exposedCollection) => {
            this.processImportedExpose(importInfo, filePath, exposedCollection, true);
          }
        );
        this.hasOptionsExpose = true;
      }
    }
  }

  /**
   * 进入 setup 函数
   */
  private enterSetupFunction(path: NodePath<t.ObjectMethod>): void {
    if (t.isIdentifier(path.node.key) && path.node.key.name === 'setup') {
      this.inSetupContext = true;
      // 检查 setup 参数中的 expose
      this.checkSetupParamsForExpose(path);
    }
  }

  /**
   * 检查 setup 函数参数中的 expose
   */
  private checkSetupParamsForExpose(path: NodePath<t.ObjectMethod>): void {
    if (path.node.params.length < 2) return;
    
    const secondParam = path.node.params[1];
    if (!t.isObjectPattern(secondParam)) return;
    
    const exposeBinding = secondParam.properties.find(
      prop => t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'expose'
    );
    
    if (!exposeBinding || !t.isObjectProperty(exposeBinding) || !t.isIdentifier(exposeBinding.value)) return;
    
    const exposeName = exposeBinding.value.name;
    
    path.scope.traverse(path.node, {
      CallExpression: (callPath) => {
        if (t.isIdentifier(callPath.node.callee) && callPath.node.callee.name === exposeName) {
          const arg = callPath.node.arguments[0];
          if (t.isObjectExpression(arg)) {
            this.hasExplicitExpose = true;
            this.processObjectExpression(arg, false);
          }
        }
      }
    });
  }

  /**
   * 退出 setup 函数
   */
  private exitSetupFunction(path: NodePath<t.ObjectMethod>): void {
    if (t.isIdentifier(path.node.key) && path.node.key.name === 'setup') {
      this.inSetupContext = false;
    }
  }

  /**
   * 分析各种调用表达式
   */
  private analyzeCallExpressions(path: NodePath<t.CallExpression>): void {
    if (!t.isIdentifier(path.node.callee)) return;
    
    const calleeName = path.node.callee.name;
    
    if (calleeName === 'defineExpose') {
      this.processDefineExpose(path);
    } else if (calleeName === 'defineComponent') {
      this.processDefineComponent(path);
    } else if (calleeName === 'expose') {
      this.processExposeCall(path);
    }
  }

  /**
   * 处理 defineExpose 调用
   */
  private processDefineExpose(path: NodePath<t.CallExpression>): void {
    this.hasExplicitExpose = true;
    const arg = path.node.arguments[0];
    
    // 处理类型参数
    if (path.node.typeParameters) {
      this.handleTypeAnnotation(path.node.typeParameters.params[0], path);
    }

    // 处理对象字面量参数
    if (t.isObjectExpression(arg)) {
      this.processObjectExpression(arg, false);
    } else if (t.isIdentifier(arg)) {
      // 处理整个对象传递给 defineExpose 的情况
      const binding = path.scope.getBinding(arg.name);
      if (binding && t.isVariableDeclarator(binding.path.node)) {
        const id = binding.path.node.id;
        if (t.isIdentifier(id) && t.isTSTypeAnnotation(id.typeAnnotation)) {
          this.handleTypeAnnotation(id.typeAnnotation, binding.path);
        }
        if (t.isObjectExpression(binding.path.node.init)) {
          this.processObjectExpression(binding.path.node.init, false);
        }
      }
    }
  }

  /**
   * 处理对象表达式
   */
  private processObjectExpression(obj: t.ObjectExpression, isOptions: boolean): void {
    obj.properties.forEach(prop => {
      if (t.isObjectProperty(prop) || t.isObjectMethod(prop) || t.isSpreadElement(prop)) {
        this.addExposedProperty(prop, isOptions);
      }
    });
  }

  /**
   * 处理 defineComponent 调用
   */
  private processDefineComponent(path: NodePath<t.CallExpression>): void {
    const arg = path.node.arguments[0];
    if (!t.isObjectExpression(arg)) return;
    
    // 检查组件选项中的 expose 选项
    const exposeProp = arg.properties.find(
      prop => t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'expose'
    );
    
    if (exposeProp && t.isObjectProperty(exposeProp)) {
      this.hasExplicitExpose = true;
      this.hasOptionsExpose = true;
      
      const value = exposeProp.value;
      if (t.isArrayExpression(value)) {
        this.processArrayExpression(value, true);
      }
    }
    
    // 检查 setup 函数
    this.checkSetupFunctionInComponent(arg, path);
  }

  /**
   * 在组件选项中检查 setup 函数
   */
  private checkSetupFunctionInComponent(
    componentOptions: t.ObjectExpression, 
    path: NodePath<t.CallExpression>
  ): void {
    const setupProp = componentOptions.properties.find(
      prop => (t.isObjectMethod(prop) || t.isObjectProperty(prop)) && 
             t.isIdentifier(prop.key) && 
             prop.key.name === 'setup'
    );
    
    if (!setupProp) return;
    
    let setupFunction;
    if (t.isObjectMethod(setupProp)) {
      setupFunction = setupProp;
    } else if (t.isObjectProperty(setupProp) && 
              (t.isFunctionExpression(setupProp.value) || t.isArrowFunctionExpression(setupProp.value))) {
      setupFunction = setupProp.value;
    }
    
    if (!setupFunction || !setupFunction.params || setupFunction.params.length < 2) return;
    
    const secondParam = setupFunction.params[1];
    if (!t.isObjectPattern(secondParam)) return;
    
    const exposeBinding = secondParam.properties.find(
      prop => t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'expose'
    );
    
    if (!exposeBinding || !t.isObjectProperty(exposeBinding) || !t.isIdentifier(exposeBinding.value)) return;
    
    const exposeName = exposeBinding.value.name;
    
    path.traverse({
      CallExpression: (callPath) => {
        if (t.isIdentifier(callPath.node.callee) && callPath.node.callee.name === exposeName) {
          const arg = callPath.node.arguments[0];
          if (t.isObjectExpression(arg)) {
            this.hasExplicitExpose = true;
            this.processObjectExpression(arg, false);
          }
        }
      }
    });
  }

  /**
   * 处理 expose 函数调用
   */
  private processExposeCall(path: NodePath<t.CallExpression>): void {
    this.hasExplicitExpose = true;
    const arg = path.node.arguments[0];
    if (t.isObjectExpression(arg)) {
      this.processObjectExpression(arg, false);
    }
  }

  /**
   * 分析 setup 函数中的返回语句
   */
  private analyzeReturnStatement(path: NodePath<t.ReturnStatement>): void {
    if (!this.inSetupContext || this.hasExplicitExpose || this.hasOptionsExpose) return;
    
    const argument = path.node.argument;
    if (t.isObjectExpression(argument)) {
      this.processObjectExpression(argument, false);
    } else if (t.isIdentifier(argument)) {
      // 处理标识符返回的情况
      const binding = path.scope.getBinding(argument.name);
      if (binding && t.isVariableDeclarator(binding.path.node)) {
        const init = binding.path.node.init;
        if (t.isObjectExpression(init)) {
          this.processObjectExpression(init, false);
        }
      }
    }
  }

  /**
   * 处理类型注解
   */
  private handleTypeAnnotation(typeAnnotation: t.TSType | t.TSTypeAnnotation | null, path: NodePath): void {
    if (!typeAnnotation) return;
    
    const actualType = t.isTSTypeAnnotation(typeAnnotation) ? typeAnnotation.typeAnnotation : typeAnnotation;

    if (t.isTSTypeLiteral(actualType)) {
      actualType.members.forEach((member: t.TSTypeElement) => {
        if (t.isTSPropertySignature(member) || t.isTSMethodSignature(member)) {
          this.addExposedProperty(member, false);
        }
      });
    } else if (t.isTSTypeReference(actualType) && t.isIdentifier(actualType.typeName)) {
      this.resolveTypeReference(actualType.typeName.name, path);
    } else if (t.isTSIntersectionType(actualType) || t.isTSUnionType(actualType)) {
      actualType.types.forEach(type => this.handleTypeAnnotation(type, path));
    }
  }

  /**
   * 解析类型引用
   */
  private resolveTypeReference(typeName: string, path: NodePath): void {
    let scope = path.scope;
    while (scope) {
      const binding = scope.getBinding(typeName);
      if (binding) {
        if (t.isTSInterfaceDeclaration(binding.path.node)) {
          binding.path.node.body.body.forEach(member => {
            this.addExposedProperty(member, false);
          });
          break;
        } else if (t.isTSTypeAliasDeclaration(binding.path.node)) {
          this.handleTypeAnnotation(binding.path.node.typeAnnotation, binding.path);
          break;
        }
      }
      scope = scope.parent;
    }
  }

  /**
   * 添加暴露的属性
   */
  private addExposedProperty(
    propOrName: t.ObjectProperty | t.ObjectMethod | t.TSPropertySignature | t.Identifier | 
               t.StringLiteral | t.TSTypeElement | t.SpreadElement | string, 
    isOptions = false
  ): void {
    let name: string | null = null;
    
    if (typeof propOrName === 'string') {
      name = propOrName;
    } else if (t.isObjectProperty(propOrName) || t.isObjectMethod(propOrName)) {
      if (t.isIdentifier(propOrName.key)) {
        name = propOrName.key.name;
      } else if (t.isStringLiteral(propOrName.key)) {
        name = propOrName.key.value;
      }
    } else if (t.isIdentifier(propOrName)) {
      name = propOrName.name;
    } else if (t.isStringLiteral(propOrName)) {
      name = propOrName.value;
    } else if (t.isTSPropertySignature(propOrName) && t.isIdentifier(propOrName.key)) {
      name = propOrName.key.name;
    } else if (t.isTSMethodSignature(propOrName) && t.isIdentifier(propOrName.key)) {
      name = propOrName.key.name;
    } else if (t.isSpreadElement(propOrName) && t.isIdentifier(propOrName.argument)) {
      name = propOrName.argument.name;
    }

    if (!name) return;
    
    // 统一管理所有exposed属性
    if (!this.exposed.has(name)) {
      this.exposed.set(name, { isOptions });
      this.exposeOrder.push(name);
    }
  }

  /**
   * 处理导入的 expose
   */
  private processImportedExpose(
    importInfo: ImportInfo,
    filePath: string,
    exposedCollection: Set<string> | string[],
    isOptions: boolean
  ): void {
    const importSource = importInfo.source;
    const importedName = importInfo.importedName;
    
    try {
      const currentDir = path.dirname(filePath);
      const importFilePath = path.resolve(currentDir, importSource + (importSource.endsWith('.ts') ? '' : '.ts'));
      
      logDebug(moduleName, `Trying to resolve imported expose from ${importFilePath}, imported name: ${importedName}`);
      
      if (fs.existsSync(importFilePath)) {
        const importedCode = fs.readFileSync(importFilePath, 'utf-8');
        const importedAst = parseComponent(importedCode).ast;
        
        // 查找导出的变量
        const [exportedExposeObject, nestedImportDeclarations] = findExportedObjectAndImports(
          importedAst, 
          importedName, 
        );
        
        if (exportedExposeObject) {
          if (t.isArrayExpression(exportedExposeObject)) {
            exportedExposeObject.elements.forEach(element => {
              if (t.isStringLiteral(element) || t.isIdentifier(element)) {
                const name = t.isStringLiteral(element) ? element.value : element.name;
                this.addExposedProperty(name, isOptions);
              }
            });
          } else if (t.isObjectExpression(exportedExposeObject)) {
            exportedExposeObject.properties.forEach(prop => {
              if (t.isObjectProperty(prop) || t.isObjectMethod(prop) || t.isSpreadElement(prop)) {
                this.addExposedProperty(prop, isOptions);
              }
            });
          }
        } else {
          logDebug(moduleName, `Could not find export named ${importedName} in ${importFilePath}`);
        }
      } else {
        logDebug(moduleName, `Import file not found: ${importFilePath}`);
      }
    } catch (error) {
      logError(moduleName, `Error analyzing imported expose:`, error);
    }
  }
}

// 入口函数
export function analyzeExpose(code: string, parsedAst?: ParseResult<File>, filePath?: string): string[] {
  const ast = parsedAst || parseComponent(code).ast;
  const analyzer = new ExposeAnalyzer(code, ast, filePath);
  return analyzer.analyze(ast);
} 