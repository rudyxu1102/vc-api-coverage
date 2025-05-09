import { Project, SyntaxKind, Node, ts, SourceFile, TypeLiteralNode, PropertySignature, ArrayLiteralExpression } from 'ts-morph';
import * as fs from 'fs';
import * as path from 'path';
import { logDebug, logError } from '../common/utils';
import { parseComponent } from '../common/shared-parser';

const moduleName = 'props-analyzer-morph';

/**
 * Props 分析器类，使用ts-morph处理TypeScript AST
 */
class PropsAnalyzer {
  private propsSet: Set<string> = new Set<string>();
  private sourceFile: SourceFile;
  private project: Project;
  /**
   * 文件路径属性，用于：
   * 1. 在构造函数中读取文件内容
   * 2. 解析导入模块的路径
   * 3. 处理跨文件的类型引用
   * 该属性对于分析器的正常工作是必需的
   */
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.project = new Project({
      compilerOptions: {
        jsx: ts.JsxEmit.React,
        jsxFactory: 'h',
        target: ts.ScriptTarget.ESNext,
      },
    });
    
    // 读取文件并添加到项目中
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    this.sourceFile = this.project.createSourceFile(filePath, fileContent, { overwrite: true });
  }

  /**
   * 分析并返回组件的 props
   */
  analyze(): string[] {
    // 分析defineProps调用
    this.analyzeDefineProps();
    
    // 分析props属性
    this.analyzePropsProperty();
    
    return Array.from(this.propsSet);
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
                this.propsSet.add(propName);
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
          this.processObjectLiteral(arg);
        }
        // 标识符引用: defineProps(propsOptions)
        else if (arg.getKind() === SyntaxKind.Identifier) {
          const identifier = arg.getText();
          this.resolveIdentifierReference(identifier);
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
        const arrayLiteral = initializer as ArrayLiteralExpression;
        const elements = arrayLiteral.getElements();
        
        for (const element of elements) {
          if (element.getKind() === SyntaxKind.StringLiteral) {
            const propName = element.getText().replace(/['"]/g, '');
            this.propsSet.add(propName);
          }
        }
      }
      // 对象形式: props: { prop1: {...}, prop2: {...} }
      else if (initializer.getKind() === SyntaxKind.ObjectLiteralExpression) {
        this.processObjectLiteral(initializer);
      }
      // 处理 AS 表达式，如 props: { ... } as const
      else if (initializer.getKind() === SyntaxKind.AsExpression) {
        const asExpression = initializer.asKind(SyntaxKind.AsExpression);
        if (asExpression) {
          const expression = asExpression.getExpression();
          if (expression.getKind() === SyntaxKind.ObjectLiteralExpression) {
            this.processObjectLiteral(expression);
          }
        }
      }
      // 标识符引用: props: PropsOptions
      else if (initializer.getKind() === SyntaxKind.Identifier) {
        const identifier = initializer.getText();
        this.resolveIdentifierReference(identifier);
      }
    }
  }

  /**
   * 处理对象字面量 { prop1: ..., prop2: ... }
   */
  private processObjectLiteral(node: Node): void {
    if (node.getKind() !== SyntaxKind.ObjectLiteralExpression) return;
    
    // 处理常规属性
    const properties = node.getChildrenOfKind(SyntaxKind.PropertyAssignment);
    for (const prop of properties) {
      const propName = prop.getName();
      this.propsSet.add(propName);
    }
    
    // 处理展开操作符
    const spreadElements = node.getChildrenOfKind(SyntaxKind.SpreadAssignment);
    for (const spread of spreadElements) {
      const expression = spread.getExpression();
      
      if (expression.getKind() === SyntaxKind.Identifier) {
        const spreadName = expression.getText();
        this.resolveIdentifierReference(spreadName);
      }
    }
  }

  /**
   * 解析标识符引用，追踪其定义
   */
  private resolveIdentifierReference(identifierName: string): void {
    logDebug(moduleName, `Resolving identifier reference: ${identifierName}`);
    
    // 查找局部变量定义
    const variableDeclarations = this.sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .filter(decl => decl.getName() === identifierName);
    
    if (variableDeclarations.length > 0) {
      for (const decl of variableDeclarations) {
        const initializer = decl.getInitializer();
        if (initializer && initializer.getKind() === SyntaxKind.ObjectLiteralExpression) {
          this.processObjectLiteral(initializer);
          return;
        }
      }
    }
    
    // 查找导入声明
    const importedDecl = this.findImportDeclaration(identifierName);
    if (importedDecl) {
      const { moduleSpecifier, importName } = importedDecl;
      this.resolveImportedReference(moduleSpecifier, importName);
    }
  }

  /**
   * 查找导入声明
   */
  private findImportDeclaration(name: string): { moduleSpecifier: string; importName: string } | null {
    const importDeclarations = this.sourceFile.getImportDeclarations();
    
    for (const importDecl of importDeclarations) {
      // 查找命名导入
      const namedImports = importDecl.getNamedImports();
      for (const namedImport of namedImports) {
        const importName = namedImport.getName();
        const alias = namedImport.getAliasNode()?.getText() || importName;
        
        if (alias === name) {
          return {
            moduleSpecifier: importDecl.getModuleSpecifierValue(),
            importName
          };
        }
      }
      
      // 查找默认导入
      const defaultImport = importDecl.getDefaultImport();
      if (defaultImport && defaultImport.getText() === name) {
        return {
          moduleSpecifier: importDecl.getModuleSpecifierValue(),
          importName: 'default'
        };
      }
      
      // 查找命名空间导入
      const namespaceImport = importDecl.getNamespaceImport();
      if (namespaceImport && namespaceImport.getText() === name) {
        return {
          moduleSpecifier: importDecl.getModuleSpecifierValue(),
          importName: '*'
        };
      }
    }
    
    return null;
  }

  /**
   * 解析导入的引用
   */
  private resolveImportedReference(moduleSpecifier: string, importName: string): void {
    try {
      logDebug(moduleName, `Resolving imported reference from: ${moduleSpecifier}, name: ${importName}`);
      
      // 解析导入文件路径
      const currentDir = path.dirname(this.filePath);
      let importFilePath = '';
      
      // 处理相对路径导入
      if (moduleSpecifier.startsWith('.')) {
        importFilePath = path.resolve(currentDir, moduleSpecifier);
        
        // 处理可能的扩展名
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
      const importSourceFile = this.project.createSourceFile(`import-${path.basename(importFilePath)}`, 
                                                           importFileContent, 
                                                           { overwrite: true });
      
      // 查找导出的标识符
      if (importName === 'default') {
        // 查找默认导出
        const defaultExportAssignment = importSourceFile.getDefaultExportSymbol();
        if (defaultExportAssignment) {
          // 获取默认导出声明
          const declarations = defaultExportAssignment.getDeclarations();
          for (const decl of declarations) {
            // 处理不同类型的默认导出
            this.processExportDeclaration(decl);
          }
        }
      } else if (importName === '*') {
        // 处理所有命名导出
        const exportedSymbols = importSourceFile.getExportSymbols();
        for (const symbol of exportedSymbols) {
          const declarations = symbol.getDeclarations();
          for (const decl of declarations) {
            this.processExportDeclaration(decl);
          }
        }
      } else {
        // 查找特定命名导出
        const exportedSymbols = importSourceFile.getExportSymbols();
        const exportedSymbol = exportedSymbols.find(symbol => symbol.getName() === importName);
        
        if (exportedSymbol) {
          const declarations = exportedSymbol.getDeclarations();
          for (const decl of declarations) {
            this.processExportDeclaration(decl);
          }
        }
        
        // 查找变量声明并处理
        const variableDeclarations = importSourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)
          .filter(decl => decl.getName() === importName);
          
        for (const varDecl of variableDeclarations) {
          const initializer = varDecl.getInitializer();
          if (initializer && initializer.getKind() === SyntaxKind.ObjectLiteralExpression) {
            
            // 处理对象字面量
            const objLiteral = initializer.asKind(SyntaxKind.ObjectLiteralExpression);
            if (objLiteral) {
              // 处理普通属性
              const properties = objLiteral.getProperties();
              for (const prop of properties) {
                if (prop.getKind() === SyntaxKind.PropertyAssignment) {
                  const propName = prop.asKind(SyntaxKind.PropertyAssignment)?.getName();
                  if (propName) {
                    this.propsSet.add(propName);
                  }
                }
              }
              
              // 递归处理展开的属性
              const spreadElements = objLiteral.getChildrenOfKind(SyntaxKind.SpreadAssignment);
              for (const spread of spreadElements) {
                const expression = spread.getExpression();
                
                if (expression.getKind() === SyntaxKind.Identifier) {
                  const spreadName = expression.getText();
                  
                  // 创建一个临时 PropsAnalyzer 实例来分析导入文件中的展开属性
                  const tempAnalyzer = new PropsAnalyzer(importFilePath);
                  tempAnalyzer.resolveIdentifierReference(spreadName);
                  
                  // 合并找到的属性
                  const foundProps = Array.from(tempAnalyzer.propsSet);
                  for (const prop of foundProps) {
                    this.propsSet.add(prop);
                  }
                }
              }
            }
          }
        }
      }

      // 特别处理从测试用例中导入的类型
      this.resolveImportedType(moduleSpecifier, importName);
    } catch (error) {
      logError(moduleName, `Error resolving imported reference: ${error}`);
    }
  }

  /**
   * 处理导出声明
   */
  private processExportDeclaration(node: Node): void {
    try {
      // 对象字面量导出
      if (node.getKind() === SyntaxKind.ObjectLiteralExpression) {
        this.processObjectLiteral(node);
      }
      // 变量声明导出
      else if (node.getKind() === SyntaxKind.VariableDeclaration) {
        const initializer = node.asKind(SyntaxKind.VariableDeclaration)?.getInitializer();
        if (initializer && initializer.getKind() === SyntaxKind.ObjectLiteralExpression) {
          this.processObjectLiteral(initializer);
        }
      }
      // 通过其他方式导出
      else if (node.getKind() === SyntaxKind.ExportSpecifier) {
        const name = node.asKind(SyntaxKind.ExportSpecifier)?.getName();
        if (name) {
          this.resolveTypeReference(name);
        }
      }
    } catch (error) {
      logError(moduleName, `Error processing export declaration: ${error}`);
    }
  }

  /**
   * 解析类型引用，找出类型定义中的属性
   */
  private resolveTypeReference(typeName: string): void {
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
          this.propsSet.add(prop.getName());
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
    const importedTypeInfo = this.findImportDeclaration(typeName);
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
            this.propsSet.add(propName);
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
  private resolveImportedType(moduleSpecifier: string, typeName: string): void {
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
      } else if (moduleSpecifier.includes('/fixtures/')) {
        // 针对test/fixtures目录下的文件
        const rootDir = path.resolve(currentDir, '../../');
        importFilePath = path.resolve(rootDir, moduleSpecifier);
        if (!importFilePath.endsWith('.ts') && !importFilePath.endsWith('.tsx')) {
          importFilePath += '.ts';
        }
      } else {
        return;
      }
      
      if (!fs.existsSync(importFilePath)) {
        logDebug(moduleName, `Import file not found: ${importFilePath}`);
        return;
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
            this.propsSet.add(prop.getName());
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
                this.propsSet.add(prop.getName());
              }
            }
          } else {
            // 处理跨文件的接口继承
            const importedParentTypeInfo = this.findImportDeclaration(extendTypeName);
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
              this.processObjectLiteral(initializer);
            }
          }
        }
      }
    } catch (error) {
      logError(moduleName, `Error resolving imported type: ${error}`);
    }
  }
}

// 入口函数
export function analyzeProps(code: string, filePath?: string): string[] {
  if (!filePath) {
    throw new Error('filePath is required for ts-morph based props analyzer');
  }
  
  // 创建临时文件以供分析
  const tempFilePath = filePath || path.join(process.cwd(), '_temp_file_for_analysis.tsx');
  
  try {
    // 对于SFC组件，需要先解析出script部分
    const parsed = parseComponent(code);
    let scriptContent = parsed.scriptContent;
    
    // 处理Vue SFC模板，将其转换为ts-morph可以理解的形式
    if (code.includes('<script setup') && scriptContent) {
      fs.writeFileSync(tempFilePath, scriptContent);
    }
    // 如果是常规JS/TS文件，不做特殊处理
    else {
      fs.writeFileSync(tempFilePath, code);
    }
    
    const analyzer = new PropsAnalyzer(tempFilePath);
    const result = analyzer.analyze();
    
    // 如果没有找到任何props并且代码中包含defineProps，尝试手动解析
    if (result.length === 0 && code.includes('defineProps')) {
      // 尝试匹配defineProps对象参数
      const propsMatch = code.match(/defineProps\(\s*{([^}]+)}\s*\)/s);
      if (propsMatch && propsMatch[1]) {
        const propsText = propsMatch[1];
        const propNames = propsText.split(',')
          .map(line => line.trim())
          .filter(line => line.includes(':'))
          .map(line => line.split(':')[0].trim());
        
        if (propNames.length > 0) {
          return propNames;
        }
      }
      
      // 尝试匹配 defineProps<类型>() 形式
      const typePropsMatch = code.match(/defineProps<\s*([^>]+)\s*>\(\)/);
      if (typePropsMatch && typePropsMatch[1]) {
        const typeName = typePropsMatch[1].trim();
        
        // 尝试查找接口或类型定义
        const interfaceMatch = new RegExp(`interface\\s+${typeName}\\s*{([^}]+)}`, 's').exec(code);
        const typeMatch = new RegExp(`type\\s+${typeName}\\s*=\\s*{([^}]+)}`, 's').exec(code);
        
        const propsBlock = (interfaceMatch && interfaceMatch[1]) || (typeMatch && typeMatch[1]);
        
        if (propsBlock) {
          const propNames = propsBlock.split('\n')
            .map(line => line.trim())
            .filter(line => line.includes(':') && !line.startsWith('//'))
            .map(line => line.split(':')[0].trim().replace('?', ''));
          
          if (propNames.length > 0) {
            return propNames;
          }
        }
      }
    }
    
    return result;
  } finally {
    // 如果使用了临时文件，则删除它
    if (!filePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
} 