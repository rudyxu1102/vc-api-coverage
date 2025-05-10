import { SyntaxKind, Node, TypeLiteralNode, PropertySignature } from 'ts-morph';
import * as fs from 'fs';
import * as path from 'path';
import { logDebug, logError } from '../common/utils';
import { BaseAnalyzer } from './base-analyzer';

const moduleName = 'props-analyzer-morph';

/**
 * Props 分析器类，使用ts-morph处理TypeScript AST
 */
class PropsAnalyzer extends BaseAnalyzer {
  constructor(filePath: string, code: string) {
    super(filePath, code);
  }

  /**
   * 执行Props分析
   */
  protected performAnalysis(): void {
    // 分析defineProps调用
    this.analyzeDefineProps();
    
    // 分析props属性
    this.analyzePropsProperty();
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
        
        // 直接内联类型: defineProps<{ prop1: string, prop2: number }>()
        if (typeArg.getKind() === SyntaxKind.TypeLiteral) {
          const typeLiteral = typeArg as TypeLiteralNode;
          const properties = typeLiteral.getMembers();
          
          for (const prop of properties) {
            if (prop.getKind() === SyntaxKind.PropertySignature) {
              const propSig = prop as PropertySignature;
              const propName = propSig.getName();
              if (propName) {
                this.resultSet.add(propName);
              }
            }
          }
        } 
        // 引用类型名称: defineProps<PropsType>()
        else if (typeArg.getKind() === SyntaxKind.TypeReference) {
          const typeName = typeArg.getText();
          this.resolveTypeReference(typeName);
        }
      }
      
      // 处理运行时参数: defineProps({ prop1: String, ... })
      const args = call.getArguments();
      if (args.length > 0) {
        const arg = args[0];
        
        // 对象字面量: defineProps({ prop1: String, ... })
        if (arg.getKind() === SyntaxKind.ObjectLiteralExpression) {
          this.processObjectLiteral(arg, this.sourceFile);
        }
        // 标识符引用: defineProps(propsOptions)
        else if (arg.getKind() === SyntaxKind.Identifier) {
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
    // 查找所有的对象属性
    const objectProperties = this.sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAssignment)
      .filter(prop => prop.getName() === 'props');
    
    for (const propAssignment of objectProperties) {
      const initializer = propAssignment.getInitializer();
      
      if (!initializer) continue;
      
      // 数组形式: props: ['prop1', 'prop2']
      if (initializer.getKind() === SyntaxKind.ArrayLiteralExpression) {
        const arrayLiteral = initializer.asKind(SyntaxKind.ArrayLiteralExpression);
        if (arrayLiteral) {
          this.processArrayLiteral(arrayLiteral);
        }
      }
      // 对象形式: props: { prop1: {...}, prop2: {...} }
      else if (initializer.getKind() === SyntaxKind.ObjectLiteralExpression) {
        this.processObjectLiteral(initializer, this.sourceFile);
      }
      // 处理 AS 表达式，如 props: { ... } as const
      else if (initializer.getKind() === SyntaxKind.AsExpression) {
        const asExpression = initializer.asKind(SyntaxKind.AsExpression);
        if (asExpression) {
          const expression = asExpression.getExpression();
          if (expression.getKind() === SyntaxKind.ObjectLiteralExpression) {
            this.processObjectLiteral(expression, this.sourceFile);
          }
        }
      }
      // 标识符引用: props: PropsOptions
      else if (initializer.getKind() === SyntaxKind.Identifier) {
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
      // 直接类型字面量，如 { prop1: string, prop2: number }
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
      // 类型引用，如 Props 或 React.ComponentProps<'button'>
      const typeName = typeNode.getText().split('<')[0].trim();
      this.resolveTypeReference(typeName);
    } else if (typeNode.getKind() === SyntaxKind.IntersectionType) {
      // 交集类型，如 A & B & C
      const typeElements = typeNode.asKind(SyntaxKind.IntersectionType)?.getTypeNodes() || [];
      for (const element of typeElements) {
        this.processTypeNode(element);
      }
    } else if (typeNode.getKind() === SyntaxKind.UnionType) {
      // 联合类型，如 A | B | C
      const typeElements = typeNode.asKind(SyntaxKind.UnionType)?.getTypeNodes() || [];
      for (const element of typeElements) {
        this.processTypeNode(element);
      }
    }
    // 可能还需要处理更多类型种类
  }

  /**
   * 解析导入的类型
   */
  protected resolveImportedType(moduleSpecifier: string, typeName: string): void {
    try {
      logDebug(moduleName, `Resolving imported type from: ${moduleSpecifier}, name: ${typeName}`);
      
      // 解析导入文件路径，类似resolveImportedReference
      const currentDir = path.dirname(this.filePath);
      let importFilePath = '';
      
      if (moduleSpecifier.startsWith('.')) {
        importFilePath = path.resolve(currentDir, moduleSpecifier);
        
        if (!importFilePath.endsWith('.ts') && !importFilePath.endsWith('.tsx')) {
          const possibleExtensions = ['.ts', '.tsx', '/index.ts', '/index.tsx'];
          for (const ext of possibleExtensions) {
            const testPath = `${importFilePath}${ext}`;
            if (fs.existsSync(testPath)) {
              importFilePath = testPath;
              break;
            }
          }
        }
      }
      // 读取和解析导入文件
      const importFileContent = fs.readFileSync(importFilePath, 'utf-8');
      const importSourceFile = this.project.createSourceFile(`import-type-${path.basename(importFilePath)}`, 
                                                           importFileContent, 
                                                           { overwrite: true });
      
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
            this.resultSet.add(prop.getName());
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
            const parentProperties = parentInterface.getMembers()
              .filter(member => member.getKind() === SyntaxKind.PropertySignature)
              .map(member => member.asKind(SyntaxKind.PropertySignature));
            
            for (const prop of parentProperties) {
              if (prop) {
                this.resultSet.add(prop.getName());
              }
            }
          } else {
            // 处理跨文件的接口继承
            const importedParentTypeInfo = this.findImportDeclaration(extendTypeName, this.sourceFile);
            if (importedParentTypeInfo) {
              this.resolveImportedType(importedParentTypeInfo.moduleSpecifier, importedParentTypeInfo.importName);
            }
          }
        }
      }
      
      // 查找导出变量（对象形式的props）
      const exportedSymbols = importSourceFile.getExportSymbols();
      const exportedSymbol = exportedSymbols.find(symbol => symbol.getName() === typeName);
        
      if (exportedSymbol) {
        const declarations = exportedSymbol.getDeclarations();
        for (const decl of declarations) {
          if (decl.getKind() === SyntaxKind.VariableDeclaration) {
            const initializer = decl.asKind(SyntaxKind.VariableDeclaration)?.getInitializer();
            if (initializer && initializer.getKind() === SyntaxKind.ObjectLiteralExpression) {
              this.processObjectLiteral(initializer, importSourceFile);
            } else if (initializer && initializer.getKind() === SyntaxKind.AsExpression) {
              const asExpression = initializer.asKind(SyntaxKind.AsExpression);
              if (asExpression) {
                const expression = asExpression.getExpression();
                if (expression && expression.getKind() === SyntaxKind.ObjectLiteralExpression) {
                  this.processObjectLiteral(expression, importSourceFile);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      logError(moduleName, `Error resolving imported type: ${error}`);
    }
  }
}

export default PropsAnalyzer;