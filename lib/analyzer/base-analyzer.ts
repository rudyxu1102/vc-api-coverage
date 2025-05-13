import { Project, SyntaxKind, Node, SourceFile, ArrayLiteralExpression } from 'ts-morph';
import { logDebug, logError } from '../common/utils';
import { parseComponent } from '../common/shared-parser';
import path from 'path';
import fs from 'fs';

/**
 * 基础分析器类，提供通用的AST分析功能
 */
export abstract class BaseAnalyzer {
  protected resultSet: Set<string> = new Set<string>();
  protected sourceFile: SourceFile;
  protected project: Project;
  protected filePath: string;
  protected dirPath: string;

  constructor(sourceFile: SourceFile, project: Project) {
    this.project = project;
    this.filePath = sourceFile.getFilePath();
    this.dirPath = path.dirname(this.filePath);
    this.sourceFile = sourceFile;
  }

  /**
   * 解析源代码，处理Vue SFC文件
   */
  protected getSourceCode(code: string): string {
    // 解析Vue单文件组件，提取script部分
    const parsed = parseComponent(code);
    return parsed.scriptContent || code;
  }

  /**
   * 分析并返回结果
   */
  public analyze(): string[] {
    this.performAnalysis();
    return Array.from(this.resultSet);
  }

  /**
   * 由子类实现的具体分析逻辑
   */
  protected abstract performAnalysis(): void;

  /**
   * 处理对象字面量
   */
  protected processObjectLiteral(node: Node, sourceFile: SourceFile): void {
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
      this.resultSet.add(propName);
    }
    
    // 处理方法属性
    const methods = node.getProperties().filter(Node.isMethodDeclaration);
    for (const method of methods) {
      const methodName = method.getName();
      this.resultSet.add(methodName);
    }
    
    // 处理展开操作符
    const spreadElements = node.getProperties().filter(Node.isSpreadAssignment);
    for (const spread of spreadElements) {
      const expression = spread.getExpression();
      
      if (Node.isIdentifier(expression)) {
        const spreadName = expression.getText();
        this.resolveIdentifierReference(spreadName, sourceFile);
      } else if (Node.isArrayLiteralExpression(expression)) {
        // 处理数组展开操作符 {...array}
        this.processArrayLiteral(expression);
      }
    }
  }

  /**
   * 处理数组字面量
   */
  protected processArrayLiteral(node: ArrayLiteralExpression): void {
    const elements = node.getElements();
    
    for (const element of elements) {
      // 处理字符串字面量
      if (Node.isStringLiteral(element)) {
        // 获取原始值，不包含引号
        this.resultSet.add(element.getLiteralValue());
      }
      // 处理模板字符串
      else if (Node.isNoSubstitutionTemplateLiteral(element)) {
        const templateLiteral = element.getText();
        // 移除模板字符串的反引号
        const eventName = templateLiteral.slice(1, -1);
        this.resultSet.add(eventName);
      }
    }
  }

  /**
   * 处理可能包含展开运算符的数组表达式
   */
  protected processArrayExpression(node: Node, sourceFile: SourceFile): void {
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
      if (name !== 'baseEmits' && name !== 'baseProps' && name !== 'spread') {
        this.resolveIdentifierReference(name, sourceFile);
      }
    }

    // 递归处理所有字符串字面量
    const stringLiterals = node.getDescendantsOfKind(SyntaxKind.StringLiteral);
    for (const literal of stringLiterals) {
      this.resultSet.add(literal.getLiteralValue());
    }
  }

  /**
   * 解析标识符引用，追踪其定义
   */
  protected resolveIdentifierReference(identifierName: string, sourceFile: SourceFile): void {
    logDebug(this.getModuleName(), `Resolving identifier reference: ${identifierName}`);
    
    // 查找局部变量定义
    const variableDeclarations = sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)
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
            this.processObjectLiteral(initializer, sourceFile);
            return;
          }
          // 处理数组字面量表达式 - 例如 [...baseEmits, 'event1']
          else if (Node.isArrayLiteralExpression(initializer) || 
                  (Node.isBinaryExpression(initializer) && 
                   initializer.getOperatorToken().getText() === '...')) {
            // 数组展开操作符可能会包含在二元表达式中
            this.processArrayExpression(initializer, sourceFile);
            return;
          }
          // 处理 as const 或其他类型断言
          else if (Node.isAsExpression(initializer)) {
            const expression = initializer.getExpression();
            if (Node.isObjectLiteralExpression(expression)) {
              this.processObjectLiteral(expression, sourceFile);
              return;
            } else if (Node.isArrayLiteralExpression(expression)) {
              this.processArrayLiteral(expression);
              return;
            }
          }
        }
      }
    }
    
    // 查找导入声明
    const importedDecl = this.findImportDeclaration(identifierName, sourceFile);
    if (importedDecl) {
      const { moduleSpecifier, importName } = importedDecl;
      this.resolveImportedReference(moduleSpecifier, importName);
    }
  }

  /**
   * 查找导入声明
   */
  protected findImportDeclaration(name: string, sourceFile: SourceFile): { moduleSpecifier: string; importName: string } | null {
    const importDeclarations = sourceFile.getImportDeclarations();
    
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
   * 获取文件路径
   */
  protected getFilePath(moduleSpecifier: string): string {
    const ext = ['.ts', '.tsx', '.js', '.jsx', '.vue'];
    const fileData = moduleSpecifier.split('/');
    const fileName = fileData.pop() || '';
    const hasExt = ext.some(e => fileName.endsWith(e));
    if (hasExt) {
      return path.resolve(this.dirPath, moduleSpecifier);
    }
    for (const e of ext) {
      const filePath = path.resolve(this.dirPath, ...fileData, fileName + e);
      if (fs.existsSync(filePath)) {
        return filePath;
      }
    }
    for (const e of ext) {
      const filePath = path.resolve(this.dirPath, ...fileData, fileName, 'index' + e);
      if (fs.existsSync(filePath)) {
        return filePath;
      }
    }
    return '';
  }

  /**
   * 尝试导入文件并返回源文件
   * 共享缓存已导入的文件，提高性能
   */
  protected tryImportFile(moduleSpecifier: string): SourceFile | null {
    const filePath = this.getFilePath(moduleSpecifier);
    const existSourceFile = this.project.getSourceFile(filePath)
    if (existSourceFile) return existSourceFile
    const sourceFile =  this.project.addSourceFileAtPath(filePath);
    return sourceFile || null;
  }

  /**
   * 解析导入的引用
   */
  protected resolveImportedReference(moduleSpecifier: string, importName: string): void {
    try {
      logDebug(this.getModuleName(), `Resolving imported reference from: ${moduleSpecifier}, name: ${importName}`);
      
      // 使用tryImportFile方法获取源文件
      const importSourceFile = this.tryImportFile(moduleSpecifier);
      if (!importSourceFile) return;
      
      // 查找导出的标识符
      if (importName === 'default') {
        // 查找默认导出
        const defaultExportAssignment = importSourceFile.getDefaultExportSymbol();
        if (defaultExportAssignment) {
          // 获取默认导出声明
          const declarations = defaultExportAssignment.getDeclarations();
          for (const decl of declarations) {
            // 处理不同类型的默认导出
            this.processExportDeclaration(decl, importSourceFile);
          }
        }
      } else if (importName === '*') {
        // 处理所有命名导出
        const exportedSymbols = importSourceFile.getExportSymbols();
        for (const symbol of exportedSymbols) {
          const declarations = symbol.getDeclarations();
          for (const decl of declarations) {
            this.processExportDeclaration(decl, importSourceFile);
          }
        }
      } else {
        // 查找特定命名导出
        const exportedSymbols = importSourceFile.getExportSymbols();
        const exportedSymbol = exportedSymbols.find(symbol => symbol.getName() === importName);
        if (exportedSymbol) {
          const declarations = exportedSymbol.getDeclarations();
          for (const decl of declarations) {
            this.processExportDeclaration(decl,importSourceFile);
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
              this.processObjectLiteral(initializer, importSourceFile);
            }
          }
        }
      }

      // 处理从测试用例中导入的类型
      this.resolveImportedType(moduleSpecifier, importName);
    } catch (error) {
      logError(this.getModuleName(), `Error resolving imported reference: ${error}`);
    }
  }

  /**
   * 处理导出声明
   */
  protected processExportDeclaration(node: Node, sourceFile: SourceFile): void {
    try {
      // 数组字面量导出
      if (Node.isArrayLiteralExpression(node)) {
        this.processArrayLiteral(node);
      }
      // 对象字面量导出
      else if (Node.isObjectLiteralExpression(node)) {
        this.processObjectLiteral(node, sourceFile);
      }
      // 变量声明导出
      else if (Node.isVariableDeclaration(node)) {
        const initializer = node.getInitializer();

        if (initializer) {
          if (Node.isArrayLiteralExpression(initializer)) {
            this.processArrayLiteral(initializer);
          } else if (Node.isObjectLiteralExpression(initializer)) {
            this.processObjectLiteral(initializer, sourceFile);
          } else if (Node.isAsExpression(initializer)) {
            const expression = initializer.getExpression();
            if (Node.isObjectLiteralExpression(expression)) {
              this.processObjectLiteral(expression, sourceFile);
            }
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
      logError(this.getModuleName(), `Error processing export declaration: ${error}`);
    }
  }

  /**
   * 解析类型引用
   */
  protected abstract resolveTypeReference(typeName: string): void;

  /**
   * 解析导入的类型
   */
  protected abstract resolveImportedType(moduleSpecifier: string, typeName: string): void;

  /**
   * 返回当前模块名称
   */
  protected abstract getModuleName(): string;
} 