import { Project, SyntaxKind, Node, ts, SourceFile, ArrayLiteralExpression } from 'ts-morph';
import * as fs from 'fs';
import * as path from 'path';
import { logDebug, logError } from '../common/utils';
import { parseComponent } from '../common/shared-parser';

/**
 * 基础分析器类，提供通用的AST分析功能
 */
export abstract class BaseAnalyzer {
  protected resultSet: Set<string> = new Set<string>();
  protected sourceFile: SourceFile;
  protected project: Project;
  protected filePath: string;
  private static projectCache: Map<string, Project> = new Map();
  private static sourceFileCache: Map<string, SourceFile> = new Map();
  private static importedFileCache: Map<string, SourceFile> = new Map();

  constructor(filePath: string, code: string) {
    this.filePath = filePath;
    
    // 使用缓存的项目实例或创建新的
    if (!BaseAnalyzer.projectCache.has(filePath)) {
      const project = new Project({
        compilerOptions: {
          jsx: ts.JsxEmit.React,
          jsxFactory: 'h',
          target: ts.ScriptTarget.ESNext,
        },
      });
      BaseAnalyzer.projectCache.set(filePath, project);
    } 
    
    this.project = BaseAnalyzer.projectCache.get(filePath)!;
    
    // 解析代码，处理Vue SFC文件
    const sourceCode = this.getSourceCode(code);
    
    // 使用缓存的源文件或创建新的
    const cacheKey = `${filePath}-${sourceCode.length}`;
    if (!BaseAnalyzer.sourceFileCache.has(cacheKey)) {
      const sourceFile = this.project.createSourceFile(filePath, sourceCode, { overwrite: true });
      BaseAnalyzer.sourceFileCache.set(cacheKey, sourceFile);
    }
    
    this.sourceFile = BaseAnalyzer.sourceFileCache.get(cacheKey)!;
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
  protected processObjectLiteral(node: Node): void {
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
        this.resolveIdentifierReference(spreadName);
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
  protected processArrayExpression(node: Node): void {
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
        this.resolveIdentifierReference(name);
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
  protected resolveIdentifierReference(identifierName: string): void {
    logDebug(this.getModuleName(), `Resolving identifier reference: ${identifierName}`);
    
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
   * 查找导入声明
   */
  protected findImportDeclaration(name: string): { moduleSpecifier: string; importName: string } | null {
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
   * 尝试导入文件并返回源文件
   * 共享缓存已导入的文件，提高性能
   */
  protected tryImportFile(moduleSpecifier: string): SourceFile | null {
    try {
      // 使用缓存，避免重复导入
      const cacheKey = `${this.filePath}-${moduleSpecifier}`;
      
      if (BaseAnalyzer.importedFileCache.has(cacheKey)) {
        return BaseAnalyzer.importedFileCache.get(cacheKey)!;
      }
      
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
      } else {
        // 处理非相对路径导入 (需扩展为完整实现)
        return null;
      }
      
      if (!fs.existsSync(importFilePath)) {
        logDebug(this.getModuleName(), `File not found: ${importFilePath}`);
        return null;
      }
      
      // 读取和解析导入文件
      const importFileContent = fs.readFileSync(importFilePath, 'utf-8');
      const importSourceFile = this.project.createSourceFile(
        `import-${path.basename(importFilePath)}`,
        importFileContent, 
        { overwrite: true }
      );
      
      // 缓存结果
      BaseAnalyzer.importedFileCache.set(cacheKey, importSourceFile);
      return importSourceFile;
    } catch (error) {
      logError(this.getModuleName(), `Error importing file: ${error}`);
      return null;
    }
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

      // 处理从测试用例中导入的类型
      this.resolveImportedType(moduleSpecifier, importName);
    } catch (error) {
      logError(this.getModuleName(), `Error resolving imported reference: ${error}`);
    }
  }

  /**
   * 处理导出声明
   */
  protected processExportDeclaration(node: Node): void {
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