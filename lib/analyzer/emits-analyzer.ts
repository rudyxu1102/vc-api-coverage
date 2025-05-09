import { Project, SyntaxKind, Node, ts, SourceFile, ArrayLiteralExpression } from 'ts-morph';
import * as fs from 'fs';
import * as path from 'path';
import { logDebug, logError } from '../common/utils';
import { parseComponent } from '../common/shared-parser';

const moduleName = 'emits-analyzer-morph';

/**
 * Emits 分析器类，使用ts-morph处理TypeScript AST
 */
class EmitsAnalyzer {
  private emitsSet: Set<string> = new Set<string>();
  private sourceFile: SourceFile;
  private project: Project;
  private filePath: string;
  private foundDefineComponentEmits: boolean = false;

  constructor(filePath: string, code: string) {
    this.filePath = filePath;
    this.project = new Project({
      compilerOptions: {
        jsx: ts.JsxEmit.React,
        jsxFactory: 'h',
        target: ts.ScriptTarget.ESNext,
      },
    });
    // 解析代码，处理Vue SFC文件
    const sourceCode = this.getSourceCode(code);
    // 读取文件并添加到项目中
    this.sourceFile = this.project.createSourceFile(filePath, sourceCode, { overwrite: true });
  }

  /**
   * 解析源代码，处理Vue SFC文件
   */
  private getSourceCode(code: string): string {
    // 解析Vue单文件组件，提取script部分
    const parsed = parseComponent(code);
    return parsed.scriptContent || code;
  }

  /**
   * 分析并返回组件的 emits
   */
  analyze(): string[] {
    // 分析defineEmits调用
    this.analyzeDefineEmits();
    
    // 分析defineComponent中的emits属性
    this.analyzeDefineComponentEmits();
    
    // 分析普通对象中的emits属性
    this.analyzeEmitsProperty();
    
    return Array.from(this.emitsSet);
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
   * 分析普通对象中的 emits 属性
   */
  private analyzeEmitsProperty(): void {
    if (this.foundDefineComponentEmits) return;
    
    // 查找所有的对象属性
    const objectProperties = this.sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAssignment)
      .filter(prop => prop.getName() === 'emits');
    
    for (const propAssignment of objectProperties) {
      this.foundDefineComponentEmits = true;
      
      const initializer = propAssignment.getInitializer();
      
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
      
      break;
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
                this.emitsSet.add(literal.getLiteralValue());
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
   * 处理数组字面量 ['event1', 'event2']
   */
  private processArrayLiteral(node: ArrayLiteralExpression): void {
    const elements = node.getElements();
    
    for (const element of elements) {
      // 处理字符串字面量
      if (Node.isStringLiteral(element)) {
        // 获取原始值，不包含引号
        this.emitsSet.add(element.getLiteralValue());
      }
      // 处理模板字符串
      else if (Node.isNoSubstitutionTemplateLiteral(element)) {
        const templateLiteral = element.getText();
        // 移除模板字符串的反引号
        const eventName = templateLiteral.slice(1, -1);
        this.emitsSet.add(eventName);
      }
    }
  }

  /**
   * 处理对象字面量 { event1: null, event2: validator }
   */
  private processObjectLiteral(node: Node): void {
    if (!Node.isObjectLiteralExpression(node)) return;
    
    // 处理常规属性
    const properties = node.getProperties().filter(Node.isPropertyAssignment);
    for (const prop of properties) {
      // 获取属性名，移除可能的引号
      let propName = prop.getName();
      // 如果属性名包含引号，去掉引号
      if (propName.startsWith("'") && propName.endsWith("'")) {
        propName = propName.slice(1, -1);
      }
      this.emitsSet.add(propName);
    }
    
    // 处理方法属性
    const methods = node.getProperties().filter(Node.isMethodDeclaration);
    for (const method of methods) {
      const methodName = method.getName();
      this.emitsSet.add(methodName);
    }
    
    // 处理展开操作符
    const spreadElements = node.getProperties().filter(Node.isSpreadAssignment);
    for (const spread of spreadElements) {
      const expression = spread.getExpression();
      
      if (Node.isIdentifier(expression)) {
        const spreadName = expression.getText();
        this.resolveIdentifierReference(spreadName);
      } else if (Node.isArrayLiteralExpression(expression)) {
        // 处理数组展开操作符 {...array}
        this.processArrayLiteral(expression);
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
        if (initializer) {
          // 处理数组字面量
          if (Node.isArrayLiteralExpression(initializer)) {
            this.processArrayLiteral(initializer);
            return;
          }
          // 处理对象字面量
          else if (Node.isObjectLiteralExpression(initializer)) {
            this.processObjectLiteral(initializer);
            return;
          }
          // 处理数组字面量表达式 - 例如 [...baseEmits, 'event1']
          else if (Node.isArrayLiteralExpression(initializer) || 
                  (Node.isBinaryExpression(initializer) && 
                   initializer.getOperatorToken().getText() === '...')) {
            // 数组展开操作符可能会包含在二元表达式中
            this.processArrayExpression(initializer);
            return;
          }
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
   * 处理可能包含展开运算符的数组表达式
   */
  private processArrayExpression(node: Node): void {
    // 处理普通数组
    if (Node.isArrayLiteralExpression(node)) {
      this.processArrayLiteral(node);
      return;
    }

    // 递归查找所有可能嵌套的标识符
    const identifiers = node.getDescendantsOfKind(SyntaxKind.Identifier);
    for (const identifier of identifiers) {
      const name = identifier.getText();
      
      // 排除运算符相关的标识符
      if (name !== 'baseEmits' && name !== 'spread') {
        this.resolveIdentifierReference(name);
      }
    }

    // 递归处理所有字符串字面量
    const stringLiterals = node.getDescendantsOfKind(SyntaxKind.StringLiteral);
    for (const literal of stringLiterals) {
      this.emitsSet.add(literal.getLiteralValue());
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
          if (initializer) {
            if (initializer.getKind() === SyntaxKind.ArrayLiteralExpression) {
              this.processArrayLiteral(initializer as ArrayLiteralExpression);
            } else if (initializer.getKind() === SyntaxKind.ObjectLiteralExpression) {
              this.processObjectLiteral(initializer);
            }
          }
        }
      }
    } catch (error) {
      logError(moduleName, `Error resolving imported reference: ${error}`);
    }
  }

  /**
   * 处理导出声明
   */
  private processExportDeclaration(node: Node): void {
    try {
      // 数组字面量导出
      if (Node.isArrayLiteralExpression(node)) {
        this.processArrayLiteral(node);
      }
      // 对象字面量导出
      else if (Node.isObjectLiteralExpression(node)) {
        this.processObjectLiteral(node);
      }
      // 变量声明导出
      else if (Node.isVariableDeclaration(node)) {
        const initializer = node.getInitializer();
        if (initializer) {
          if (Node.isArrayLiteralExpression(initializer)) {
            this.processArrayLiteral(initializer);
          } else if (Node.isObjectLiteralExpression(initializer)) {
            this.processObjectLiteral(initializer);
          }
        }
      }
      // 通过其他方式导出
      else if (Node.isExportSpecifier(node)) {
        const name = node.getName();
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
                this.emitsSet.add(literal.getLiteralValue());
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
                this.emitsSet.add(literal.getLiteralValue());
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
  private resolveImportedType(moduleSpecifier: string, typeName: string): void {
    try {
      logDebug(moduleName, `Resolving imported type from: ${moduleSpecifier}, name: ${typeName}`);
      
      // 解析导入文件路径
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
                  this.emitsSet.add(literal.getLiteralValue());
                }
              }
            }
          }
        }
      }
      
      // 查找导出变量（对象或数组形式的emits）
      const exportedSymbols = importSourceFile.getExportSymbols();
      const exportedSymbol = exportedSymbols.find(symbol => symbol.getName() === typeName);
        
      if (exportedSymbol) {
        const declarations = exportedSymbol.getDeclarations();
        for (const decl of declarations) {
          if (Node.isVariableDeclaration(decl)) {
            const initializer = decl.getInitializer();
            if (initializer) {
              if (Node.isArrayLiteralExpression(initializer)) {
                this.processArrayLiteral(initializer);
              } else if (Node.isObjectLiteralExpression(initializer)) {
                this.processObjectLiteral(initializer);
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

/**
 * 入口函数
 */
export function analyzeEmits(code: string, filePath?: string): string[] {
  const analyzer = new EmitsAnalyzer(filePath || 'temp.ts', code);
  return analyzer.analyze();
}

export default EmitsAnalyzer; 