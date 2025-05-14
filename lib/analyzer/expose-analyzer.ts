import { SyntaxKind, Node, ArrayLiteralExpression, TypeLiteralNode, PropertySignature, ObjectLiteralExpression, Project, SourceFile } from 'ts-morph';
import { logDebug, logError } from '../common/utils';
import { BaseAnalyzer } from './base-analyzer';
import path from 'path';

const moduleName = 'expose-analyzer-morph';

/**
 * Expose 分析器类，使用ts-morph处理TypeScript AST
 */
class ExposeAnalyzer extends BaseAnalyzer {
  private exposed: Set<string> = new Set<string>();
  private optionsExpose: Set<string> = new Set<string>();
  private hasExplicitExpose: boolean = false;
  private hasOptionsExpose: boolean = false;

  constructor(sourceFile: SourceFile, project: Project) {
    super(sourceFile, project);
  }

  /**
   * 返回模块名称
   */
  protected getModuleName(): string {
    return moduleName;
  }

  /**
   * 执行Expose分析
   */
  protected performAnalysis(): void {
    
    // 分析defineExpose调用
    this.analyzeDefineExpose();
    
    // 分析expose属性
    this.analyzeExposeProperty();
    
    // 分析setup中的expose调用
    this.analyzeSetupExpose();

    // 将分析结果合并到resultSet中
    this.getResult().forEach(prop => this.resultSet.add(prop));
  }

  /**
   * 获取分析结果
   */
  private getResult(): string[] {
    // 优先使用显式expose和options expose的属性
    const allExposed = new Set<string>([...this.exposed, ...this.optionsExpose]);
    return Array.from(allExposed);
  }

  /**
   * 分析 defineExpose({...}) 调用
   */
  private analyzeDefineExpose(): void {
    const defineExposeCallExpressions = this.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter(call => {
        const expr = call.getExpression();
        return expr.getText() === 'defineExpose';
      });
    
    for (const call of defineExposeCallExpressions) {
      this.hasExplicitExpose = true;
      
      // 处理类型参数: defineExpose<Type>({...})
      const typeArgs = call.getTypeArguments();
      if (typeArgs.length > 0) {
        const typeArg = typeArgs[0];
        this.processTypeNode(typeArg);
      }
      
      // 处理对象参数: defineExpose({ prop1, prop2 })
      const args = call.getArguments();
      if (args.length > 0) {
        const arg = args[0];
        
        // 对象字面量参数
        if (arg.getKind() === SyntaxKind.ObjectLiteralExpression) {
          const objExpr = arg.asKind(SyntaxKind.ObjectLiteralExpression);
          if (objExpr) {
            this.processObjectExpression(objExpr, false);
          }
        }
        // 标识符参数: defineExpose(exposedObject)
        else if (arg.getKind() === SyntaxKind.Identifier) {
          const identifier = arg.getText();
          this.resolveIdentifierReference(identifier, this.sourceFile);
        }
      }
    }
  }

  /**
   * 分析 expose 属性
   */
  private analyzeExposeProperty(): void {
    const exposeProperties = this.sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAssignment)
      .filter(prop => prop.getName() === 'expose');
    
    for (const exposeProperty of exposeProperties) {
      const initializer = exposeProperty.getInitializer();
      
      if (!initializer) continue;
      
      this.hasOptionsExpose = true;
      
      // 数组形式: expose: ['method1', 'method2']
      if (initializer.getKind() === SyntaxKind.ArrayLiteralExpression) {
        const arrayLiteral = initializer.asKind(SyntaxKind.ArrayLiteralExpression);
        if (arrayLiteral) {
          this.processArrayForOptionsExpose(arrayLiteral);
        }
      }
      // 标识符引用: expose: exposedMethods
      else if (initializer.getKind() === SyntaxKind.Identifier) {
        const identifier = initializer.getText();
        // 在options expose上下文中处理
        this.resolveIdentifierReferenceForOptionsExpose(identifier);
      }
    }
  }

  /**
   * 分析setup函数中的expose调用
   */
  private analyzeSetupExpose(): void {
    // 查找setup方法
    const setupMethods = this.sourceFile.getDescendantsOfKind(SyntaxKind.MethodDeclaration)
      .filter(method => method.getName() === 'setup');
    
    for (const setupMethod of setupMethods) {
      // 检查参数中是否包含context或{expose}
      const parameters = setupMethod.getParameters();
      
      if (parameters.length >= 2) {
        const secondParam = parameters[1];
        
        // 检查是否使用对象解构 { expose }
        if (secondParam.getStructure().name && secondParam.getStructure().name.includes('expose')) {
          this.extractExposeFromSetupContext(setupMethod);
        }
        // 检查是否使用context.expose
        else if (secondParam.getStructure().name === 'context') {
          this.extractExposeFromContext(setupMethod);
        }
      }
      
      // 查找setup方法中的return语句
      const returnStatements = setupMethod.getDescendantsOfKind(SyntaxKind.ReturnStatement);
      for (const returnStmt of returnStatements) {
        const expression = returnStmt.getExpression();
        
        if (expression) {
          if (expression.getKind() === SyntaxKind.ObjectLiteralExpression) {
            const objExpr = expression.asKind(SyntaxKind.ObjectLiteralExpression);
            if (objExpr && !this.hasExplicitExpose && !this.hasOptionsExpose) {
              // 在Vue3中，setup返回的属性只在组件内部可用，不会暴露给父组件
              // 这里不需要处理返回值
            }
          } else if (expression.getKind() === SyntaxKind.Identifier) {
            // 处理返回标识符的情况
            if (!this.hasExplicitExpose && !this.hasOptionsExpose) {
              // 同样，在Vue3中setup返回的属性不会自动暴露给父组件
            }
          }
        }
      }
    }
  }

  /**
   * 从setup上下文中提取expose调用
   */
  private extractExposeFromSetupContext(setupMethod: Node): void {
    const exposeCallExpressions = setupMethod.getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter(call => {
        const expr = call.getExpression();
        // 匹配expose({...}) 模式
        return expr.getKind() === SyntaxKind.Identifier && expr.getText() === 'expose';
      });
    
    for (const call of exposeCallExpressions) {
      this.hasExplicitExpose = true;
      
      const args = call.getArguments();
      if (args.length > 0) {
        const arg = args[0];
        
        if (arg.getKind() === SyntaxKind.ObjectLiteralExpression) {
          const objExpr = arg.asKind(SyntaxKind.ObjectLiteralExpression);
          if (objExpr) {
            this.processObjectExpression(objExpr, false);
          }
        }
      }
    }
  }

  /**
   * 从context中提取expose调用
   */
  private extractExposeFromContext(setupMethod: Node): void {
    const contextExposeCallExpressions = setupMethod.getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter(call => {
        const expr = call.getExpression();
        // 匹配context.expose({...}) 模式
        return expr.getKind() === SyntaxKind.PropertyAccessExpression && 
               expr.getText() === 'context.expose';
      });
    
    for (const call of contextExposeCallExpressions) {
      this.hasExplicitExpose = true;
      
      const args = call.getArguments();
      if (args.length > 0) {
        const arg = args[0];
        
        if (arg.getKind() === SyntaxKind.ObjectLiteralExpression) {
          const objExpr = arg.asKind(SyntaxKind.ObjectLiteralExpression);
          if (objExpr) {
            this.processObjectExpression(objExpr, false);
          }
        }
      }
    }
  }

  /**
   * 处理对象表达式
   */
  private processObjectExpression(objExpr: ObjectLiteralExpression, isOptionsExpose: boolean): void {
    // 处理常规属性
    const properties = objExpr.getProperties();
    
    for (const prop of properties) {
      if (Node.isPropertyAssignment(prop)) {
        const propName = prop.getName();
        this.addExposedProperty(propName);
      }
      else if (Node.isShorthandPropertyAssignment(prop)) {
        const propName = prop.getName();
        this.addExposedProperty(propName);
      }
      else if (Node.isMethodDeclaration(prop)) {
        const methodName = prop.getName();
        this.addExposedProperty(methodName);
      }
      else if (Node.isSpreadAssignment(prop)) {
        const expression = prop.getExpression();
        
        if (Node.isIdentifier(expression)) {
          // 处理标识符引用的展开: ...exposedObject
          const spreadName = expression.getText();
          if (isOptionsExpose) {
            this.resolveIdentifierReferenceForOptionsExpose(spreadName);
          } else {
            this.resolveIdentifierReference(spreadName, this.sourceFile);
          }
        }
      }
    }
  }

  /**
   * 处理数组表达式
   */
  private processArrayExpressionForExpose(arrayExpr: ArrayLiteralExpression, isOptionsExpose: boolean): void {
    const elements = arrayExpr.getElements();
    
    for (const element of elements) {
      // 字符串字面量
      if (Node.isStringLiteral(element)) {
        const propName = element.getLiteralValue();
        this.addExposedProperty(propName);
      }
      // 标识符
      else if (Node.isIdentifier(element)) {
        const propName = element.getText();
        this.addExposedProperty(propName);
      }
      // 其他类型的表达式
      else if (isOptionsExpose) {
        this.resolveExpressionForOptionsExpose(element);
      } else {
        this.resolveExpression(element);
      }
    }
  }

  /**
   * 处理类型节点，提取属性
   */
  private processTypeNode(typeNode: Node): void {
    if (typeNode.getKind() === SyntaxKind.TypeLiteral) {
      // 直接类型字面量，如 { method1: Function, prop2: number }
      const typeLiteral = typeNode as TypeLiteralNode;
      const members = typeLiteral.getMembers();
      
      for (const member of members) {
        if (member.getKind() === SyntaxKind.PropertySignature) {
          const propSig = member as PropertySignature;
          const propName = propSig.getName();
          this.addExposedProperty(propName);
        }
        else if (member.getKind() === SyntaxKind.MethodSignature) {
          const methodName = member.getFirstChildByKind(SyntaxKind.Identifier)?.getText();
          if (methodName) {
            this.addExposedProperty(methodName);
          }
        }
      }
    } 
    else if (typeNode.getKind() === SyntaxKind.TypeReference) {
      // 类型引用，如 ExposeType
      const typeName = typeNode.getText().split('<')[0].trim();
      this.resolveTypeReference(typeName);
    } 
    else if (typeNode.getKind() === SyntaxKind.IntersectionType) {
      // 交集类型，如 A & B
      const typeElements = typeNode.getChildrenOfKind(SyntaxKind.TypeLiteral);
      for (const element of typeElements) {
        this.processTypeNode(element);
      }
      
      // 处理可能的类型引用
      const typeRefs = typeNode.getChildrenOfKind(SyntaxKind.TypeReference);
      for (const typeRef of typeRefs) {
        const typeName = typeRef.getText();
        this.resolveTypeReference(typeName);
      }
    }
    else if (typeNode.getKind() === SyntaxKind.UnionType) {
      // 联合类型，如 A | B
      const typeElements = typeNode.getChildrenOfKind(SyntaxKind.TypeLiteral);
      for (const element of typeElements) {
        this.processTypeNode(element);
      }
      
      // 处理可能的类型引用
      const typeRefs = typeNode.getChildrenOfKind(SyntaxKind.TypeReference);
      for (const typeRef of typeRefs) {
        const typeName = typeRef.getText();
        this.resolveTypeReference(typeName);
      }
    }
  }

  /**
   * 解析标识符引用，追踪expose相关定义
   */
  private resolveIdentifierReferenceForOptionsExpose(identifierName: string): void {
    logDebug(moduleName, `Resolving options expose identifier: ${identifierName}`);
    
    // 查找局部变量定义
    const variableDeclarations = this.sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .filter(decl => decl.getName() === identifierName);
    
    if (variableDeclarations.length > 0) {
      for (const decl of variableDeclarations) {
        const initializer = decl.getInitializer();
        if (initializer) {
          // 处理数组字面量
          if (Node.isArrayLiteralExpression(initializer)) {
            this.processArrayForOptionsExpose(initializer);
          }
          // 处理对象字面量
          else if (Node.isObjectLiteralExpression(initializer)) {
            this.processObjectExpression(initializer, true);
          }
        }
      }
    }
    
    // 查找导入声明
    const importedDecl = this.findImportDeclaration(identifierName, this.sourceFile);
    if (importedDecl) {
      const { moduleSpecifier, importName } = importedDecl;
      this.resolveImportedReferenceForOptionsExpose(moduleSpecifier, importName);
    }
  }

  /**
   * 解析表达式，从中提取expose属性
   */
  private resolveExpression(expression: Node): void {
    // 目前简单处理，可以根据需要扩展
    if (Node.isIdentifier(expression)) {
      this.resolveIdentifierReference(expression.getText(), this.sourceFile);
    }
  }

  /**
   * 为options expose解析表达式
   */
  private resolveExpressionForOptionsExpose(expression: Node): void {
    // 与resolveExpression类似，但针对options expose上下文
    if (Node.isIdentifier(expression)) {
      this.resolveIdentifierReferenceForOptionsExpose(expression.getText());
    }
  }

  /**
   * 解析导入的引用，用于options expose
   */
  private resolveImportedReferenceForOptionsExpose(moduleSpecifier: string, importName: string): void {
    try {
      logDebug(moduleName, `Resolving imported reference for options expose: ${moduleSpecifier}, ${importName}`);
      
      const importSourceFile = this.tryImportFile(moduleSpecifier, path.dirname(this.sourceFile.getFilePath()));
      if (!importSourceFile) return;
      
      // 查找导出的标识符
      if (importName === 'default') {
        // 查找默认导出
        const defaultExportSymbol = importSourceFile.getDefaultExportSymbol();
        if (defaultExportSymbol) {
          const declarations = defaultExportSymbol.getDeclarations();
          for (const decl of declarations) {
            this.processExportDeclarationForOptionsExpose(decl);
          }
        }
      } else if (importName === '*') {
        // 处理所有命名导出
        const exportedSymbols = importSourceFile.getExportSymbols();
        for (const symbol of exportedSymbols) {
          const declarations = symbol.getDeclarations();
          for (const decl of declarations) {
            this.processExportDeclarationForOptionsExpose(decl);
          }
        }
      } else {
        // 查找特定命名导出
        const exportedSymbols = importSourceFile.getExportSymbols();
        const exportedSymbol = exportedSymbols.find(symbol => symbol.getName() === importName);
        
        if (exportedSymbol) {
          const declarations = exportedSymbol.getDeclarations();
          for (const decl of declarations) {
            this.processExportDeclarationForOptionsExpose(decl);
          }
        }
        
        // 查找变量声明
        const variableDeclarations = importSourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)
          .filter(decl => decl.getName() === importName);
          
        for (const varDecl of variableDeclarations) {
          const initializer = varDecl.getInitializer();
          if (initializer) {
            if (initializer.getKind() === SyntaxKind.ArrayLiteralExpression) {
              this.processArrayForOptionsExpose(initializer);
            } else if (initializer.getKind() === SyntaxKind.ObjectLiteralExpression) {
              this.processObjectExpression(initializer as ObjectLiteralExpression, true);
            }
          }
        }
      }
    } catch (error) {
      logError(moduleName, `Error resolving imported reference for options expose: ${error}`);
    }
  }

  /**
   * 处理导出声明，用于options expose
   */
  private processExportDeclarationForOptionsExpose(node: Node): void {
    try {
      // 数组字面量导出
      if (Node.isArrayLiteralExpression(node)) {
        this.processArrayForOptionsExpose(node);
      }
      // 对象字面量导出
      else if (Node.isObjectLiteralExpression(node)) {
        this.processObjectExpression(node, true);
      }
      // 变量声明导出
      else if (Node.isVariableDeclaration(node)) {
        const initializer = node.getInitializer();
        if (initializer) {
          if (Node.isArrayLiteralExpression(initializer)) {
            this.processArrayForOptionsExpose(initializer);
          } else if (Node.isObjectLiteralExpression(initializer)) {
            this.processObjectExpression(initializer, true);
          }
        }
      }
    } catch (error) {
      logError(moduleName, `Error processing export declaration for options expose: ${error}`);
    }
  }

  /**
   * 添加暴露的属性
   */
  private addExposedProperty(propName: string): void {
    if (!propName) return;
    
    this.resultSet.add(propName);
  }
  
  /**
   * 解析类型引用
   */
  protected resolveTypeReference(typeName: string): void {
    logDebug(moduleName, `Resolving type reference: ${typeName}`);
    
    // 查找类型别名
    const typeAliases = this.sourceFile.getDescendantsOfKind(SyntaxKind.TypeAliasDeclaration)
      .filter(typeAlias => typeAlias.getName() === typeName);
    
    if (typeAliases.length > 0) {
      const typeAlias = typeAliases[0];
      const typeNode = typeAlias.getTypeNode();
      if (typeNode) {
        this.processTypeNode(typeNode);
      }
      return;
    }
    
    // 查找接口声明
    const interfaces = this.sourceFile.getDescendantsOfKind(SyntaxKind.InterfaceDeclaration)
      .filter(iface => iface.getName() === typeName);
    
    if (interfaces.length > 0) {
      const interfaceDecl = interfaces[0];
      
      // 处理接口属性
      const properties = interfaceDecl.getMembers()
        .filter(member => member.getKind() === SyntaxKind.PropertySignature)
        .map(member => member.asKind(SyntaxKind.PropertySignature));
      
      for (const prop of properties) {
        if (prop) {
          this.addExposedProperty(prop.getName());
        }
      }
      
      // 处理接口方法
      const methods = interfaceDecl.getMembers()
        .filter(member => member.getKind() === SyntaxKind.MethodSignature);
      
      for (const method of methods) {
        const methodName = method.getFirstChildByKind(SyntaxKind.Identifier)?.getText();
        if (methodName) {
          this.addExposedProperty(methodName);
        }
      }
      
      // 处理接口继承
      const extendsTypes = interfaceDecl.getHeritageClauses()
        .filter(clause => clause.getToken() === SyntaxKind.ExtendsKeyword)
        .flatMap(clause => clause.getTypeNodes());
      
      for (const extendType of extendsTypes) {
        const extendTypeName = extendType.getText();
        // 递归处理继承的类型
        this.resolveTypeReference(extendTypeName);
      }
      
      return;
    }
    
    // 查找导入的类型
    const importedTypeInfo = this.findImportDeclaration(typeName, this.sourceFile);
    if (importedTypeInfo) {
      this.resolveImportedType(importedTypeInfo.moduleSpecifier, importedTypeInfo.importName);
    }
  }

  /**
   * 解析导入的类型
   */
  protected resolveImportedType(moduleSpecifier: string, typeName: string): void {
    try {
      logDebug(moduleName, `Resolving imported type from: ${moduleSpecifier}, name: ${typeName}`);
      
      const importSourceFile = this.tryImportFile(moduleSpecifier, path.dirname(this.sourceFile.getFilePath()));
      if (!importSourceFile) return;
      
      // 查找导出的类型别名
      const typeAliases = importSourceFile.getDescendantsOfKind(SyntaxKind.TypeAliasDeclaration)
        .filter(typeAlias => typeAlias.getName() === typeName);
      
      if (typeAliases.length > 0) {
        const typeAlias = typeAliases[0];
        const typeNode = typeAlias.getTypeNode();
        if (typeNode) {
          this.processTypeNode(typeNode);
        }
        return;
      }
      
      // 查找导出的接口
      const interfaces = importSourceFile.getDescendantsOfKind(SyntaxKind.InterfaceDeclaration)
        .filter(iface => iface.getName() === typeName);
      
      if (interfaces.length > 0) {
        const interfaceDecl = interfaces[0];
        
        // 处理接口属性
        const properties = interfaceDecl.getMembers()
          .filter(member => member.getKind() === SyntaxKind.PropertySignature)
          .map(member => member.asKind(SyntaxKind.PropertySignature));
        
        for (const prop of properties) {
          if (prop) {
            this.addExposedProperty(prop.getName());
          }
        }
        
        // 处理接口方法
        const methods = interfaceDecl.getMembers()
          .filter(member => member.getKind() === SyntaxKind.MethodSignature);
      
        for (const method of methods) {
          const methodName = method.getFirstChildByKind(SyntaxKind.Identifier)?.getText();
          if (methodName) {
            this.addExposedProperty(methodName);
          }
        }
        
        // 处理接口继承
        const extendsTypes = interfaceDecl.getHeritageClauses()
          .filter(clause => clause.getToken() === SyntaxKind.ExtendsKeyword)
          .flatMap(clause => clause.getTypeNodes());
        
        for (const extendType of extendsTypes) {
          const extendTypeName = extendType.getText();
          
          // 查找父接口并处理其属性
          const parentInterfaces = importSourceFile.getDescendantsOfKind(SyntaxKind.InterfaceDeclaration)
            .filter(iface => iface.getName() === extendTypeName);
          
          if (parentInterfaces.length > 0) {
            const parentInterface = parentInterfaces[0];
            
            // 处理父接口属性
            const parentProperties = parentInterface.getMembers()
              .filter(member => member.getKind() === SyntaxKind.PropertySignature)
              .map(member => member.asKind(SyntaxKind.PropertySignature));
            
            for (const prop of parentProperties) {
              if (prop) {
                this.addExposedProperty(prop.getName());
              }
            }
            
            // 处理父接口方法
            const parentMethods = parentInterface.getMembers()
              .filter(member => member.getKind() === SyntaxKind.MethodSignature);
          
            for (const method of parentMethods) {
              const methodName = method.getFirstChildByKind(SyntaxKind.Identifier)?.getText();
              if (methodName) {
                this.addExposedProperty(methodName);
              }
            }
          }
        }
      }
    } catch (error) {
      logError(moduleName, `Error resolving imported type: ${error}, moduleSpecifier: ${moduleSpecifier}`);
    }
  }

  /**
   * Override the base class method to properly handle expose arrays
   */
  protected processArrayExpression(node: Node): void {
    // Call the parent method first
    super.processArrayExpression(node, this.sourceFile);
    
    // Then do our specific processing if it's an array literal
    if (Node.isArrayLiteralExpression(node)) {
      this.processArrayExpressionForExpose(node, false);
    }
  }

  /**
   * Helper method to process array for options expose
   */
  private processArrayForOptionsExpose(node: Node): void {
    if (Node.isArrayLiteralExpression(node)) {
      this.processArrayExpressionForExpose(node, true);
    }
  }

  /**
   * Override the base class method to properly handle object literals
   */
  protected processObjectLiteral(node: Node): void {
    // Call parent method first
    super.processObjectLiteral(node, this.sourceFile);
    
    // Then do our specific processing
    if (Node.isObjectLiteralExpression(node)) {
      this.processObjectExpression(node, false);
    }
  }
}

export default ExposeAnalyzer;