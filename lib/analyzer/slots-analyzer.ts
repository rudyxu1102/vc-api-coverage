import { SyntaxKind, Node, TypeLiteralNode, PropertySignature, SourceFile, Project } from 'ts-morph';
import { logDebug, logError } from '../common/utils';
import { BaseAnalyzer } from './base-analyzer';
import path from 'path';

const moduleName = 'slots-analyzer-morph';


/**
 * 插槽分析器类，使用ts-morph处理TypeScript AST
 */
class SlotsAnalyzer extends BaseAnalyzer {
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
   * 执行分析
   */
  protected performAnalysis(): void {
    // 分析defineSlots语法
    this.analyzeDefineSlots();
    
    // 然后从 JavaScript/TypeScript 中分析插槽
    this.analyzeScriptSlots();
  }

  /**
   * 分析defineSlots语法
   */
  private analyzeDefineSlots(): void {
    // 查找defineSlots调用
    const callExpressions = this.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter(call => {
        const expression = call.getExpression();
        return expression.getKind() === SyntaxKind.Identifier && 
               expression.getText() === 'defineSlots';
      });
    
    for (const call of callExpressions) {
      // 检查泛型参数
      const typeArgs = call.getTypeArguments();
      if (typeArgs.length > 0) {
        const firstArg = typeArgs[0];
        
        // 检查类型参数是否为对象类型字面量
        if (firstArg.getKind() === SyntaxKind.TypeLiteral) {
          const typeLiteral = firstArg as TypeLiteralNode;
          const members = typeLiteral.getMembers();
          
          for (const member of members) {
            if (member.getKind() === SyntaxKind.PropertySignature) {
              const propSig = member as PropertySignature;
              const slotName = propSig.getName();
              if (slotName) {
                this.resultSet.add(slotName);
              }
            }
          }
        }
      }
    }
  }

  /**
   * 分析脚本中的插槽使用
   */
  private analyzeScriptSlots(): void {
    // 查找所有对象属性，包括slots属性
    const objectProperties = this.sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAssignment)
      .filter(prop => prop.getName() === 'slots');
    
    for (const propAssignment of objectProperties) {
      const initializer = propAssignment.getInitializer();
      
      if (!initializer) continue;
      
      // 处理标识符引用: slots: slotsIdentifier
      if (initializer.getKind() === SyntaxKind.Identifier) {
        const identifier = initializer.getText();
        this.resolveIdentifierReference(identifier, this.sourceFile);
      }
      // 处理类型断言: slots: (...) as SlotsType<{...}>
      else if (initializer.getKind() === SyntaxKind.AsExpression) {
        const asExpression = initializer.asKind(SyntaxKind.AsExpression);
        if (asExpression) {
          const typeNode = asExpression.getTypeNode();
          if (typeNode && typeNode.getKind() === SyntaxKind.TypeReference) {
            this.analyzeSlotsTypeReference(typeNode);
          }
        }
      }
      // 直接的类型引用: slots: SlotsType<{...}>
      else if (initializer.getKind() === SyntaxKind.TypeReference) {
        this.analyzeSlotsTypeReference(initializer);
      }
    }
  }

  /**
   * 分析 SlotsType<{...}> 类型引用
   */
  private analyzeSlotsTypeReference(typeRef: Node): void {
    if (typeRef.getKind() !== SyntaxKind.TypeReference) return;
    
    const typeRefNode = typeRef.asKind(SyntaxKind.TypeReference);
    if (!typeRefNode) return;
    
    const typeName = typeRefNode.getTypeName().getText();
    
    if (typeName === 'SlotsType') {
      const typeArgs = typeRefNode.getTypeArguments();
      if (typeArgs.length > 0) {
        const firstArg = typeArgs[0];
        
        // 检查类型参数是否为对象类型字面量
        if (firstArg.getKind() === SyntaxKind.TypeLiteral) {
          const typeLiteral = firstArg as TypeLiteralNode;
          const members = typeLiteral.getMembers();
          
          for (const member of members) {
            if (member.getKind() === SyntaxKind.PropertySignature) {
              const propSig = member as PropertySignature;
              const slotName = propSig.getName();
              if (slotName) {
                this.resultSet.add(slotName);
              }
            }
          }
        }
      }
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
      
      // 处理接口属性
      const properties = interfaceDecl.getMembers()
        .filter(member => member.getKind() === SyntaxKind.PropertySignature)
        .map(member => member.asKind(SyntaxKind.PropertySignature));
      
      for (const prop of properties) {
        if (prop) {
          this.resultSet.add(prop.getName());
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
   * 处理类型节点，提取属性
   */
  private processTypeNode(typeNode: Node): void {
    if (typeNode.getKind() === SyntaxKind.TypeLiteral) {
      // 处理类型字面量，如 { slot1: ..., slot2: ... }
      const members = typeNode.asKind(SyntaxKind.TypeLiteral)?.getMembers() || [];
      for (const member of members) {
        if (member.getKind() === SyntaxKind.PropertySignature) {
          const propName = member.asKind(SyntaxKind.PropertySignature)?.getName();
          if (propName) {
            this.resultSet.add(propName);
          }
        }
      }
    } else if (typeNode.getKind() === SyntaxKind.TypeReference) {
      // 处理类型引用，如 SlotsType<{...}>
      const typeRefNode = typeNode.asKind(SyntaxKind.TypeReference);
      if (typeRefNode) {
        const typeName = typeRefNode.getTypeName().getText();
        if (typeName === 'SlotsType') {
          const typeArgs = typeRefNode.getTypeArguments();
          if (typeArgs.length > 0) {
            this.processTypeNode(typeArgs[0]);
          }
        } else {
          // 普通类型引用，可能需要递归解析
          this.resolveTypeReference(typeName);
        }
      }
    } else if (typeNode.getKind() === SyntaxKind.IntersectionType) {
      // 处理交集类型，如 A & B
      const typeElements = typeNode.asKind(SyntaxKind.IntersectionType)?.getTypeNodes() || [];
      for (const element of typeElements) {
        this.processTypeNode(element);
      }
    } else if (typeNode.getKind() === SyntaxKind.UnionType) {
      // 处理联合类型，如 A | B
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
      const importSourceFile = this.tryImportFile(moduleSpecifier, path.dirname(this.sourceFile.getFilePath()));
      if (!importSourceFile) return;

      let processed = false;
      const typeAlias = importSourceFile.getTypeAlias(typeName);
      if (typeAlias) {
        const typeNode = typeAlias.getTypeNode();
        if (typeNode) {
          this.processTypeNode(typeNode); // processTypeNode is expected to add to resultSet
          processed = true;
        }
      }

      if (!processed) {
        const interfaceDecl = importSourceFile.getInterface(typeName);
        if (interfaceDecl) {
          // Simplified: iterate over members and add their names.
          interfaceDecl.getMembers().forEach(member => {
            if (Node.isPropertySignature(member) || Node.isMethodSignature(member)) {
              this.resultSet.add(member.getName());
            }
          });
          processed = true;
        }
      }

      if (!processed) {
        super.resolveImportedReference(moduleSpecifier, typeName, this.sourceFile);
      }
    } catch (error) {
      logError(moduleName, `Error resolving imported type: ${error}, moduleSpecifier: ${moduleSpecifier}, filePath: ${this.sourceFile.getFilePath()}`);
    }
  }

  /**
   * 解析导入的引用，特别针对测试中的模拟导入处理
   */
  protected resolveImportedReference(moduleSpecifier: string, importName: string, referencingSourceFile: SourceFile): void {
    try {
      logDebug(moduleName, `Resolving imported reference from: ${moduleSpecifier}, name: ${importName}, in file: ${referencingSourceFile.getFilePath()}`);
      
      const importSourceFile = this.tryImportFile(moduleSpecifier, path.dirname(referencingSourceFile.getFilePath()));
      if (importSourceFile) {
        super.resolveImportedReference(moduleSpecifier, importName, referencingSourceFile);
        return;
      }
      
    } catch (error) {
      logError(moduleName, `Error resolving imported reference: ${error}`);
    }
  }
}

export default SlotsAnalyzer