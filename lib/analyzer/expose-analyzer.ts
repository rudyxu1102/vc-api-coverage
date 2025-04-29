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
  private exposed: Set<string> = new Set<string>();
  private exposeOrder: string[] = [];
  private optionsExpose: Set<string> = new Set<string>();
  private optionsExposeOrder: string[] = [];
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
    if (this.hasExplicitExpose && this.exposeOrder.length > 0) {
      return this.exposeOrder;
    }
    
    if (this.hasOptionsExpose) {
      return this.optionsExposeOrder;
    }
    
    // 如果没有显式的 expose，但有从 setup 返回的属性
    if (!this.hasExplicitExpose && this.exposeOrder.length > 0) {
      return this.exposeOrder;
    }
    
    return this.exposeOrder;
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
            if (cleanProp && !this.exposed.has(cleanProp)) {
              logDebug(moduleName, 'Adding exposed property', cleanProp);
              this.exposed.add(cleanProp);
              this.exposeOrder.push(cleanProp);
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
          if (item && !this.optionsExpose.has(item)) {
            this.optionsExpose.add(item);
            this.optionsExposeOrder.push(item);
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
            if (item && !this.optionsExpose.has(item)) {
              this.optionsExpose.add(item);
              this.optionsExposeOrder.push(item);
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
        processArrayElements(path.node.init.elements, this.exposed);
        path.node.init.elements.forEach(element => {
          if (t.isStringLiteral(element) || t.isIdentifier(element)) {
            if (t.isStringLiteral(element) && !this.exposed.has(element.value)) {
              this.exposed.add(element.value);
              this.exposeOrder.push(element.value);
            } else if (t.isIdentifier(element) && !this.exposed.has(element.name)) {
              this.exposed.add(element.name);
              this.exposeOrder.push(element.name);
            }
            this.hasExplicitExpose = true;
          }
        });
      } else if (t.isIdentifier(path.node.init) && this.importDeclarations[path.node.init.name] && this.filePath) {
        // 处理导入的 expose 变量
        processIdentifierReference(
          path.node.init, 
          path, 
          this.exposed, 
          this.importDeclarations, 
          this.filePath, 
          processImportedExpose
        );
        this.hasExplicitExpose = true;
      }
    }
  }

  /**
   * 分析 expose 对象属性
   */
  private analyzeExposeObjectProperty(path: NodePath<t.ObjectProperty>): void {
    if (t.isIdentifier(path.node.key) && path.node.key.name === 'expose') {
      if (t.isArrayExpression(path.node.value)) {
        processArrayElements(path.node.value.elements, this.optionsExpose);
        // 同步更新 optionsExposeOrder 数组
        Array.from(this.optionsExpose).forEach(item => {
          if (!this.optionsExposeOrder.includes(item)) {
            this.optionsExposeOrder.push(item);
          }
        });
        this.hasOptionsExpose = true;
      } else if (t.isIdentifier(path.node.value)) {
        processIdentifierReference(
          path.node.value, 
          path, 
          this.optionsExpose, 
          this.importDeclarations, 
          this.filePath, 
          processImportedExpose
        );
        // 同步更新 optionsExposeOrder 数组
        Array.from(this.optionsExpose).forEach(item => {
          if (!this.optionsExposeOrder.includes(item)) {
            this.optionsExposeOrder.push(item);
          }
        });
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
    if (path.node.params.length >= 2) {
      const secondParam = path.node.params[1];
      if (t.isObjectPattern(secondParam)) {
        const exposeBinding = secondParam.properties.find(
          prop => t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'expose'
        );
        if (exposeBinding && t.isObjectProperty(exposeBinding) && t.isIdentifier(exposeBinding.value)) {
          const exposeName = exposeBinding.value.name;
          path.scope.traverse(path.node, {
            CallExpression: (callPath) => {
              if (t.isIdentifier(callPath.node.callee) && callPath.node.callee.name === exposeName) {
                const arg = callPath.node.arguments[0];
                if (t.isObjectExpression(arg)) {
                  this.hasExplicitExpose = true;
                  arg.properties.forEach(prop => {
                    if (t.isObjectProperty(prop) || t.isObjectMethod(prop)) {
                      this.addExposedProperty(prop);
                    } else if (t.isSpreadElement(prop)) {
                      this.addExposedProperty(prop);
                    }
                  });
                }
              }
            }
          });
        }
      }
    }
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
      arg.properties.forEach(prop => {
        if (t.isObjectProperty(prop) || t.isObjectMethod(prop)) {
          this.addExposedProperty(prop);
        } else if (t.isSpreadElement(prop)) {
          this.addExposedProperty(prop);
        }
      });
    } else if (t.isIdentifier(arg)) {
      // 处理整个对象传递给 defineExpose 的情况
      const binding = path.scope.getBinding(arg.name);
      if (binding && t.isVariableDeclarator(binding.path.node)) {
        const id = binding.path.node.id;
        if (t.isIdentifier(id) && t.isTSTypeAnnotation(id.typeAnnotation)) {
          this.handleTypeAnnotation(id.typeAnnotation, binding.path);
        }
        if (t.isObjectExpression(binding.path.node.init)) {
          binding.path.node.init.properties.forEach(prop => {
            if (t.isObjectProperty(prop) || t.isObjectMethod(prop)) {
              this.addExposedProperty(prop);
            }
          });
        }
      }
    }
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
        value.elements.forEach(element => {
          if (t.isStringLiteral(element) || t.isIdentifier(element)) {
            this.addExposedProperty(element, true);
          }
        });
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
    } else if (t.isObjectProperty(setupProp) && t.isFunctionExpression(setupProp.value)) {
      setupFunction = setupProp.value;
    } else if (t.isObjectProperty(setupProp) && t.isArrowFunctionExpression(setupProp.value)) {
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
            arg.properties.forEach(prop => {
              if (t.isObjectProperty(prop) || t.isObjectMethod(prop)) {
                this.addExposedProperty(prop);
              } else if (t.isSpreadElement(prop)) {
                this.addExposedProperty(prop);
              }
            });
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
      arg.properties.forEach(prop => {
        if (t.isObjectProperty(prop) || t.isObjectMethod(prop)) {
          this.addExposedProperty(prop);
        } else if (t.isSpreadElement(prop)) {
          this.addExposedProperty(prop);
        }
      });
    }
  }

  /**
   * 分析 setup 函数中的返回语句
   */
  private analyzeReturnStatement(path: NodePath<t.ReturnStatement>): void {
    if (!this.inSetupContext || this.hasExplicitExpose || this.hasOptionsExpose) return;
    
    const argument = path.node.argument;
    if (t.isObjectExpression(argument)) {
      argument.properties.forEach(prop => {
        if (t.isObjectProperty(prop) || t.isObjectMethod(prop)) {
          this.addExposedProperty(prop);
        }
      });
    } else if (t.isIdentifier(argument)) {
      // 处理标识符返回的情况
      const binding = path.scope.getBinding(argument.name);
      if (binding && t.isVariableDeclarator(binding.path.node)) {
        const init = binding.path.node.init;
        if (t.isObjectExpression(init)) {
          init.properties.forEach(prop => {
            if (t.isObjectProperty(prop) || t.isObjectMethod(prop)) {
              this.addExposedProperty(prop);
            }
          });
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
          this.addExposedProperty(member);
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
            this.addExposedProperty(member);
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
    prop: t.ObjectProperty | t.ObjectMethod | t.TSPropertySignature | t.Identifier | t.StringLiteral | t.TSTypeElement | t.SpreadElement, 
    isOptionsExpose = false
  ): void {
    let name: string | null = null;
    
    if (t.isObjectProperty(prop) || t.isObjectMethod(prop)) {
      if (t.isIdentifier(prop.key)) {
        name = prop.key.name;
      } else if (t.isStringLiteral(prop.key)) {
        name = prop.key.value;
      }
    } else if (t.isIdentifier(prop)) {
      name = prop.name;
    } else if (t.isStringLiteral(prop)) {
      name = prop.value;
    } else if (t.isTSPropertySignature(prop) && t.isIdentifier(prop.key)) {
      name = prop.key.name;
    } else if (t.isTSMethodSignature(prop) && t.isIdentifier(prop.key)) {
      name = prop.key.name;
    } else if (t.isSpreadElement(prop) && t.isIdentifier(prop.argument)) {
      // 处理展开运算符
      name = prop.argument.name;
    }

    if (!name) return;
    
    if (isOptionsExpose) {
      if (!this.optionsExpose.has(name)) {
        this.optionsExpose.add(name);
        this.optionsExposeOrder.push(name);
      }
    } else {
      if (!this.exposed.has(name)) {
        this.exposed.add(name);
        this.exposeOrder.push(name);
      }
    }
  }
}

// 入口函数
export function analyzeExpose(code: string, parsedAst?: ParseResult<File>, filePath?: string): string[] {
  const ast = parsedAst || parseComponent(code).ast;
  const analyzer = new ExposeAnalyzer(code, ast, filePath);
  return analyzer.analyze(ast);
}

// 处理导入的 expose
function processImportedExpose(
  importInfo: ImportInfo,
  filePath: string,
  exposedCollection: Set<string> | string[]
): void {
  const importSource = importInfo.source;
  const importedName = importInfo.importedName;
  const isSet = exposedCollection instanceof Set;
  const exposedSet = isSet ? exposedCollection as Set<string> : new Set<string>();
  const exposeOrder = isSet ? [] : exposedCollection as string[];
  
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
            if (t.isStringLiteral(element)) {
              const name = element.value;
              if (!exposedSet.has(name)) {
                exposedSet.add(name);
                if (!isSet) exposeOrder.push(name);
              }
            } else if (t.isIdentifier(element)) {
              const name = element.name;
              if (!exposedSet.has(name)) {
                exposedSet.add(name);
                if (!isSet) exposeOrder.push(name);
              }
            }
          });
        } else if (t.isObjectExpression(exportedExposeObject)) {
          processObjectProperties(
            exportedExposeObject.properties, 
            exposedCollection, 
            importFilePath, 
            nestedImportDeclarations, 
            'expose', 
            processImportedExpose
          );
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