import { SyntaxKind, Node, TypeLiteralNode, PropertySignature, SourceFile, Project } from 'ts-morph';
import { logDebug, logError } from '../common/utils';
import { BaseAnalyzer } from './base-analyzer';

const moduleName = 'props-analyzer-morph';

/**
 * Props 分析器类，使用ts-morph处理TypeScript AST
 */
class PropsAnalyzer extends BaseAnalyzer {
  constructor(sourceFile: SourceFile, project: Project) {
    super(sourceFile, project);
  }

  /**
   * 执行Props分析
   */
  protected performAnalysis(): void {
    // 分析defineProps调用
    this.analyzeDefineProps();
    
    // 分析props属性
    this.analyzePropsProperty();
    this.analyzeExportedPropsVariable();
  }

  /**
   * 返回模块名称
   */
  protected getModuleName(): string {
    return moduleName;
  }

  /**
   * 分析 defineProps<{...}>() 或 defineProps({...}) 形式
   */
  private analyzeDefineProps(): void {
    // 查找所有的defineProps调用
    const definePropsCallExpressions = this.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter(call => {
        const expr = call.getExpression();
        return expr.getText() === 'defineProps';
      });
    
    for (const call of definePropsCallExpressions) {
      // 处理泛型类型参数: defineProps<Props>()
      const typeArgs = call.getTypeArguments();
      if (typeArgs.length > 0) {
        const typeArg = typeArgs[0];
        
        if (Node.isTypeLiteral(typeArg)) {
          const typeLiteral = typeArg as TypeLiteralNode;
          const properties = typeLiteral.getMembers();
          
          for (const prop of properties) {
            if (Node.isPropertySignature(prop)) {
              const propSig = prop as PropertySignature;
              const propName = propSig.getName();
              if (propName) {
                this.resultSet.add(propName);
              }
            }
          }
        } 
        else if (Node.isTypeReference(typeArg)) {
          const typeName = typeArg.getText();
          this.resolveTypeReference(typeName);
        }
      }
      
      const args = call.getArguments();
      if (args.length > 0) {
        const arg = args[0];
        
        if (Node.isObjectLiteralExpression(arg)) {
          this.processObjectLiteral(arg, this.sourceFile);
        }
        else if (Node.isIdentifier(arg)) {
          const identifier = arg.getText();
          this.resolveIdentifierReference(identifier, this.sourceFile);
        }
      }
    }
  }

  /**
   * 分析 props 对象属性
   */
  private analyzePropsProperty(): void {
    const objectProperties = this.sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAssignment)
      .filter(prop => prop.getName() === 'props');
    
    for (const propAssignment of objectProperties) {
      const initializer = propAssignment.getInitializer();
      
      if (!initializer) continue;
      
      if (Node.isArrayLiteralExpression(initializer)) {
        const arrayLiteral = initializer.asKind(SyntaxKind.ArrayLiteralExpression);
        if (arrayLiteral) {
          this.processArrayLiteral(arrayLiteral);
        }
      }
      else if (Node.isObjectLiteralExpression(initializer)) {
        this.processObjectLiteral(initializer, this.sourceFile);
      }
      else if (Node.isAsExpression(initializer)) {
        const asExpression = initializer.asKind(SyntaxKind.AsExpression);
        if (asExpression) {
          const expression = asExpression.getExpression();
          if (Node.isObjectLiteralExpression(expression)) {
            this.processObjectLiteral(expression, this.sourceFile);
          }
        }
      }
      else if (Node.isIdentifier(initializer)) {
        const identifier = initializer.getText();
        this.resolveIdentifierReference(identifier, this.sourceFile);
      }
    }
  }

  /**
   * 解析类型引用，找出类型定义中的属性
   */
  protected resolveTypeReference(typeName: string): void {
    logDebug(moduleName, `Resolving type reference: ${typeName}`);
    
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
    
    const interfaces = this.sourceFile.getDescendantsOfKind(SyntaxKind.InterfaceDeclaration)
      .filter(iface => iface.getName() === typeName);
    
    if (interfaces.length > 0) {
      const interfaceDecl = interfaces[0];
      
      const properties = interfaceDecl.getMembers()
        .filter(Node.isPropertySignature)
        .map(member => member.asKind(SyntaxKind.PropertySignature));
      
      for (const prop of properties) {
        if (prop) {
          this.resultSet.add(prop.getName());
        }
      }
      
      const extendsTypes = interfaceDecl.getHeritageClauses()
        .filter(clause => clause.getToken() === SyntaxKind.ExtendsKeyword)
        .flatMap(clause => clause.getTypeNodes());
      
      for (const extendType of extendsTypes) {
        const extendTypeName = extendType.getText();
        this.resolveTypeReference(extendTypeName);
      }
      
      return;
    }
    
    const importedTypeInfo = this.findImportDeclaration(typeName, this.sourceFile);
    if (importedTypeInfo) {
      this.resolveImportedType(importedTypeInfo.moduleSpecifier, importedTypeInfo.importName);
    }
  }

  /**
   * 处理类型节点，提取属性
   */
  private processTypeNode(typeNode: Node): void {
    if (Node.isTypeLiteral(typeNode)) {
      const members = typeNode.asKind(SyntaxKind.TypeLiteral)?.getMembers() || [];
      for (const member of members) {
        if (Node.isPropertySignature(member)) {
          const propName = member.asKind(SyntaxKind.PropertySignature)?.getName();
          if (propName) {
            this.resultSet.add(propName);
          }
        }
      }
    } else if (Node.isTypeReference(typeNode)) {
      const typeName = typeNode.getText().split('<')[0].trim();
      this.resolveTypeReference(typeName);
    } else if (Node.isIntersectionTypeNode(typeNode)) {
      const typeElements = typeNode.asKind(SyntaxKind.IntersectionType)?.getTypeNodes() || [];
      for (const element of typeElements) {
        this.processTypeNode(element);
      }
    } else if (Node.isUnionTypeNode(typeNode)) {
      const typeElements = typeNode.asKind(SyntaxKind.UnionType)?.getTypeNodes() || [];
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

      const importDeclaration = this.sourceFile.getImportDeclaration(moduleSpecifier);
      if (!importDeclaration) {
        logError(moduleName, `Cannot find import declaration for module specifier: ${moduleSpecifier}`);
        return;
      }
      const importSourceFile = importDeclaration.getModuleSpecifierSourceFile();
      if (!importSourceFile) {
        logError(moduleName, `Cannot get source file for module specifier: ${moduleSpecifier}`);
        return;
      }

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
      
      const interfaces = importSourceFile.getDescendantsOfKind(SyntaxKind.InterfaceDeclaration)
        .filter(iface => iface.getName() === typeName);
      
      if (interfaces.length > 0) {
        const interfaceDecl = interfaces[0];
        
        const properties = interfaceDecl.getMembers()
          .filter(Node.isPropertySignature)
          .map(member => member.asKind(SyntaxKind.PropertySignature));
        
        for (const prop of properties) {
          if (prop) {
            this.resultSet.add(prop.getName());
          }
        }
        
        const extendsTypes = interfaceDecl.getHeritageClauses()
          .filter(clause => clause.getToken() === SyntaxKind.ExtendsKeyword)
          .flatMap(clause => clause.getTypeNodes());
        
        for (const extendType of extendsTypes) {
          const extendTypeName = extendType.getText();
          const parentInterfaces = importSourceFile.getDescendantsOfKind(SyntaxKind.InterfaceDeclaration)
            .filter(iface => iface.getName() === extendTypeName);
          
          if (parentInterfaces.length > 0) {
            const parentInterface = parentInterfaces[0];
            const parentProperties = parentInterface.getMembers()
              .filter(Node.isPropertySignature)
              .map(member => member.asKind(SyntaxKind.PropertySignature));
            
            for (const prop of parentProperties) {
              if (prop) {
                this.resultSet.add(prop.getName());
              }
            }
          } else {
            const importedParentTypeInfo = this.findImportDeclaration(extendTypeName, importSourceFile);
            if (importedParentTypeInfo) {
              this.resolveImportedType(importedParentTypeInfo.moduleSpecifier, importedParentTypeInfo.importName);
            } else {
              logDebug(moduleName, `Could not find import for inherited type ${extendTypeName} in ${importSourceFile.getFilePath()}`);
            }
          }
        }
      }
      
    } catch (error) {
      logError(moduleName, `Error resolving imported type: ${error}, moduleSpecifier: ${moduleSpecifier}, filePath: ${this.sourceFile.getFilePath()}`);
    }
  }
}

export default PropsAnalyzer;