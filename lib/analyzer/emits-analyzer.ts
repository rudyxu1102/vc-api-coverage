import { SyntaxKind, Node } from 'ts-morph';
import { logDebug } from '../common/utils';
import { BaseAnalyzer } from './base-analyzer';

const moduleName = 'emits-analyzer-morph';

/**
 * Emits 分析器类，使用ts-morph处理TypeScript AST
 */
class EmitsAnalyzer extends BaseAnalyzer {
  private foundDefineComponentEmits: boolean = false;

  constructor(filePath: string, code: string) {
    super(filePath, code);
  }

  /**
   * 执行Emits分析
   */
  protected performAnalysis(): void {
    // 分析defineEmits调用
    this.analyzeDefineEmits();
    
    // 分析defineComponent中的emits属性
    this.analyzeDefineComponentEmits();
  }

  /**
   * 返回模块名称
   */
  protected getModuleName(): string {
    return moduleName;
  }

  /**
   * 分析 defineEmits<{...}>() 或 defineEmits(['...']) 形式
   */
  private analyzeDefineEmits(): void {
    // 查找所有的defineEmits调用
    const defineEmitsCallExpressions = this.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter(call => {
        const expr = call.getExpression();
        return expr.getText() === 'defineEmits';
      });
    
    for (const call of defineEmitsCallExpressions) {
      // 处理泛型类型参数: defineEmits<{ (e: 'event1'): void }>()
      const typeArgs = call.getTypeArguments();
      if (typeArgs.length > 0) {
        const typeArg = typeArgs[0];
        this.processEmitsTypeParameter(typeArg);
      }
      
      // 处理运行时参数: defineEmits(['event1', 'event2'])
      const args = call.getArguments();
      if (args.length > 0) {
        const arg = args[0];
        
        // 数组字面量: defineEmits(['event1', 'event2'])
        if (Node.isArrayLiteralExpression(arg)) {
          this.processArrayLiteral(arg);
        }
        // 对象字面量: defineEmits({ event1: null, event2: validator })
        else if (Node.isObjectLiteralExpression(arg)) {
          this.processObjectLiteral(arg);
        }
        // 标识符引用: defineEmits(emitsOptions)
        else if (Node.isIdentifier(arg)) {
          const identifier = arg.getText();
          this.resolveIdentifierReference(identifier);
        }
      }
    }
  }

  /**
   * 分析 defineComponent({ emits: ... }) 形式
   */
  private analyzeDefineComponentEmits(): void {
    if (this.foundDefineComponentEmits) return;

    // 查找所有的defineComponent调用
    const defineComponentCalls = this.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter(call => {
        const expr = call.getExpression();
        return expr.getText() === 'defineComponent';
      });
    
    for (const call of defineComponentCalls) {
      const args = call.getArguments();
      if (args.length > 0 && Node.isObjectLiteralExpression(args[0])) {
        const componentObj = args[0];
        
        // 查找emits属性 - 过滤掉SpreadAssignment
        const emitsProp = componentObj.getProperties()
          .filter(prop => Node.isPropertyAssignment(prop) || Node.isShorthandPropertyAssignment(prop) || Node.isMethodDeclaration(prop))
          .find(prop => prop.getName() === 'emits');
        
        if (emitsProp) {
          this.foundDefineComponentEmits = true;
          if (Node.isPropertyAssignment(emitsProp)) {
            const initializer = emitsProp.getInitializer();
            
            if (!initializer) continue;
            
            // 数组形式: emits: ['event1', 'event2']
            if (Node.isArrayLiteralExpression(initializer)) {
              this.processArrayLiteral(initializer);
            }
            // 对象形式: emits: { event1: null, event2: validator }
            else if (Node.isObjectLiteralExpression(initializer)) {
              this.processObjectLiteral(initializer);
            }
            // 标识符引用: emits: emitsOptions
            else if (Node.isIdentifier(initializer)) {
              const identifier = initializer.getText();
              this.resolveIdentifierReference(identifier);
            }
          }
          
          break;
        }
      }
    }
  }

  /**
   * 处理类型参数形式的 emits
   */
  private processEmitsTypeParameter(typeNode: Node): void {
    // 处理 { (e: 'event1'): void; (e: 'event2', id: number): void } 形式
    if (Node.isTypeLiteral(typeNode)) {
      const typeLiteral = typeNode;
      const callSignatures = typeLiteral.getMembers()
        .filter(member => Node.isCallSignatureDeclaration(member));
      
      for (const signature of callSignatures) {
        // 确保是CallSignatureDeclaration类型
        if (Node.isCallSignatureDeclaration(signature)) {
          const parameters = signature.getParameters();
          if (parameters.length > 0) {
            const firstParam = parameters[0];
            const typeAnnotation = firstParam.getTypeNode();
            
            if (typeAnnotation && Node.isLiteralTypeNode(typeAnnotation)) {
              const literal = typeAnnotation.getDescendantsOfKind(SyntaxKind.StringLiteral)[0];
              if (literal) {
                this.resultSet.add(literal.getLiteralValue());
              }
            }
          }
        }
      }
    }
    // 处理引用类型: defineEmits<EmitsType>()
    else if (Node.isTypeReference(typeNode)) {
      const typeName = typeNode.getText();
      this.resolveTypeReference(typeName);
    }
  }

  /**
   * 解析类型引用，找出类型定义中的属性
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
      
      // 处理接口中的方法签名，可能包含事件名称
      const callSignatures = interfaceDecl.getMembers()
        .filter(member => Node.isCallSignatureDeclaration(member));
      
      for (const signature of callSignatures) {
        if (Node.isCallSignatureDeclaration(signature)) {
          const parameters = signature.getParameters();
          if (parameters.length > 0) {
            const firstParam = parameters[0];
            const typeAnnotation = firstParam.getTypeNode();
            
            if (typeAnnotation && Node.isLiteralTypeNode(typeAnnotation)) {
              const literal = typeAnnotation.getDescendantsOfKind(SyntaxKind.StringLiteral)[0];
              if (literal) {
                this.resultSet.add(literal.getLiteralValue());
              }
            }
          }
        }
      }
      
      return;
    }
    
    // 查找导入的类型
    const importedTypeInfo = this.findImportDeclaration(typeName);
    if (importedTypeInfo) {
      this.resolveImportedType(importedTypeInfo.moduleSpecifier, importedTypeInfo.importName);
    }
  }

  /**
   * 处理类型节点，提取事件名称
   */
  private processTypeNode(typeNode: Node): void {
    if (Node.isTypeLiteral(typeNode)) {
      // 处理类型字面量中的调用签名
      const callSignatures = typeNode.getMembers()
        .filter(member => Node.isCallSignatureDeclaration(member));
      
      for (const signature of callSignatures) {
        if (Node.isCallSignatureDeclaration(signature)) {
          const parameters = signature.getParameters();
          if (parameters.length > 0) {
            const firstParam = parameters[0];
            const typeAnnotation = firstParam.getTypeNode();
            
            if (typeAnnotation && Node.isLiteralTypeNode(typeAnnotation)) {
              const literal = typeAnnotation.getDescendantsOfKind(SyntaxKind.StringLiteral)[0];
              if (literal) {
                this.resultSet.add(literal.getLiteralValue());
              }
            }
          }
        }
      }
    } else if (Node.isTypeReference(typeNode)) {
      // 处理类型引用
      const typeName = typeNode.getText().split('<')[0].trim();
      this.resolveTypeReference(typeName);
    } else if (Node.isIntersectionTypeNode(typeNode)) {
      // 处理交集类型，如 A & B
      const typeElements = typeNode.getTypeNodes();
      for (const element of typeElements) {
        this.processTypeNode(element);
      }
    } else if (Node.isUnionTypeNode(typeNode)) {
      // 处理联合类型，如 A | B
      const typeElements = typeNode.getTypeNodes();
      for (const element of typeElements) {
        this.processTypeNode(element);
      }
    }
  }

  /**
   * 解析导入的类型
   */
  protected resolveImportedType(moduleSpecifier: string, typeName: string): void {
    try {
      logDebug(moduleName, `Resolving imported type from: ${moduleSpecifier}, name: ${typeName}`);
      
      // 使用基类的方法解析导入文件并获取其源文件
      const importedSourceFile = this.tryImportFile(moduleSpecifier);
      if (!importedSourceFile) return;
      
      // 查找导出的类型别名
      const typeAliases = importedSourceFile.getDescendantsOfKind(SyntaxKind.TypeAliasDeclaration)
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
      const interfaces = importedSourceFile.getDescendantsOfKind(SyntaxKind.InterfaceDeclaration)
        .filter(iface => iface.getName() === typeName);
      
      if (interfaces.length > 0) {
        const interfaceDecl = interfaces[0];
        
        // 处理接口中的调用签名
        const callSignatures = interfaceDecl.getMembers()
          .filter(member => Node.isCallSignatureDeclaration(member));
        
        for (const signature of callSignatures) {
          if (Node.isCallSignatureDeclaration(signature)) {
            const parameters = signature.getParameters();
            if (parameters.length > 0) {
              const firstParam = parameters[0];
              const typeAnnotation = firstParam.getTypeNode();
              
              if (typeAnnotation && Node.isLiteralTypeNode(typeAnnotation)) {
                const literal = typeAnnotation.getDescendantsOfKind(SyntaxKind.StringLiteral)[0];
                if (literal) {
                  this.resultSet.add(literal.getLiteralValue());
                }
              }
            }
          }
        }
      }
    } catch (error) {
      logDebug(moduleName, `Error resolving imported type: ${error}`);
    }
  }
}

export default EmitsAnalyzer;