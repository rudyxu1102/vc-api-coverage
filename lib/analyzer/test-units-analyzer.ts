import { Project, SyntaxKind, Node, SourceFile, CallExpression, ObjectLiteralExpression } from 'ts-morph';
import { isComponentFile } from '../common/utils';

interface TestUnit {
    props?: string[];
    emits?: string[];
    slots?: string[];
}

interface TestUnitsResult {
    [componentName: string]: TestUnit;
}

class TestUnitAnalyzer {
    private sourceFile: SourceFile;
    private result: TestUnitsResult = {};
    private project: Project;
    
    constructor(filePath: string) {
        // Create a project
        this.project = new Project({
            compilerOptions: {
                jsx: 1, // Preserve JSX
                target: 99, // ESNext
            },
        });
        // Add source file
        this.sourceFile = this.project.addSourceFileAtPath(filePath);
        
        // Initialize result
        this.result = {};
    }

    public analyze(): TestUnitsResult {
        
        // Analyze traditional mount method calls
        this.analyzeTraditionalMountCalls();
        
        // Analyze all component creation function calls
        this.analyzeComponentCreationCalls();

        return this.result;
    }
    
    private resolveRealComponentPath(sourceValue: string): string | null {

        // 处理index文件，如 ./components/input/index.ts
        if (!isComponentFile(sourceValue)) {
            // 使用ts-morph解析代码，获取结构化信息
            const sourceFile = this.project.addSourceFileAtPath(sourceValue);
            // 查找默认导出
            const defaultExport = sourceFile.getDefaultExportSymbol();
            let componentImportPath = null;
            if (defaultExport) {
                // 获取默认导出的声明
                const declarations = defaultExport.getDeclarations();
                for (const declaration of declarations) {
                    // 如果是导出的表达式语句
                    if (Node.isExportAssignment(declaration)) {
                        const expression = declaration.getExpression();
                        
                        // 如果是函数调用(如 export default withInstall(Component))
                        if (Node.isCallExpression(expression)) {
                            const args = expression.getArguments();
                            if (args.length > 0 && Node.isIdentifier(args[0])) {
                                // 获取函数的第一个参数，通常是组件标识符
                                const componentName = args[0].getText();
                                // 查找这个标识符的导入
                                const importDecls = sourceFile.getImportDeclarations();
                                for (const importDecl of importDecls) {
                                    // 检查默认导入
                                    const defaultImport = importDecl.getDefaultImport();
                                    if (defaultImport && defaultImport.getText() === componentName) {
                                        const importResolved = importDecl.getModuleSpecifierSourceFile();
                                        componentImportPath = importResolved!.getFilePath();
                                        break;  
                                    }
                                    
                                    // 检查命名导入
                                    const namedImports = importDecl.getNamedImports();
                                    for (const namedImport of namedImports) {
                                        if (namedImport.getName() === componentName) {
                                            const importResolved = importDecl.getModuleSpecifierSourceFile();
                                            componentImportPath = importResolved!.getFilePath();
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        // 如果是标识符(如 export default Component
                        else if (Node.isIdentifier(expression)) {
                            const componentName = expression.getText();
                            
                            // 查找这个标识符的导入
                            const importDecls = sourceFile.getImportDeclarations();
                            for (const importDecl of importDecls) {
                                // 检查默认导入
                                const defaultImport = importDecl.getDefaultImport();
                                if (defaultImport && defaultImport.getText() === componentName) {
                                    const importResolved = importDecl.getModuleSpecifierSourceFile();
                                    componentImportPath = importResolved!.getFilePath();
                                    break;
                                }
                                
                                // 检查命名导入
                                const namedImports = importDecl.getNamedImports();
                                for (const namedImport of namedImports) {
                                    if (namedImport.getName() === componentName) {
                                        const importResolved = importDecl.getModuleSpecifierSourceFile();
                                        componentImportPath = importResolved!.getFilePath();
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
                if (!componentImportPath) return null;
                if (isComponentFile(componentImportPath)) return componentImportPath;
                // 如果找不到，则递归查找
                const componentSourceFile = this.project.addSourceFileAtPath(componentImportPath);
                const res = this.searchComponentFilePath(componentSourceFile) as string | null;
                if (res) return res;
            }
        }
        

        
        return null;
    }
    
    // 递归层序遍历文件引用，文件后缀为tsx或者vue
    private searchComponentFilePath(sourceFile: SourceFile) {
        const importDeclarations = sourceFile.getImportDeclarations();
        for (const importDecl of importDeclarations) {
            const resolved = importDecl.getModuleSpecifierSourceFile();
            const absolutePath = resolved?.getFilePath();
            if (absolutePath && isComponentFile(absolutePath)) {
                return absolutePath;
            }
        }
        for (const importDecl of importDeclarations) {
            const res = this.searchComponentFilePath(importDecl.getSourceFile()) as string | null;
            if (res) {
                return res;
            }
        }
        return null
    }

    // 分析传统挂载mount/shallowMount方法调用
    private analyzeTraditionalMountCalls() {
        // Find all test or it blocks
        const testCalls = this.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
            .filter(call => {
                const expression = call.getExpression();
                if (Node.isIdentifier(expression)) {
                    const name = expression.getText();
                    return name === 'it' || name === 'test';
                }
                return false;
            });
        
        for (const testCall of testCalls) {
            // Check if the test block has an expect assertion
            let hasExpect = false;
            
            // Find all expect calls in this test block
            const expectCalls = testCall.getDescendantsOfKind(SyntaxKind.CallExpression)
                .filter(call => {
                    const expression = call.getExpression();
                    return Node.isIdentifier(expression) && expression.getText() === 'expect';
                });
            
            if (expectCalls.length > 0) {
                hasExpect = true;
            }
            
            // If there are no expect assertions, skip this test block
            if (!hasExpect) {
                continue;
            }
            
            // Find all mount or shallowMount calls
            const mountCalls = testCall.getDescendantsOfKind(SyntaxKind.CallExpression)
                .filter(call => {
                    const expression = call.getExpression();
                    return Node.isIdentifier(expression) && 
                           (expression.getText() === 'mount' || expression.getText() === 'shallowMount');
                });
            
            for (const mountCall of mountCalls) {
                this.processMountCall(mountCall);
            }
        }
    }

    getImportDecl(componentName: string) {
        const importDecls = this.sourceFile.getImportDeclarations();
        for (const importDecl of importDecls) {
            const defaultImport = importDecl.getDefaultImport();
            if (defaultImport && defaultImport.getText() === componentName) {
                return importDecl;
            }
        }
        return null;
    }
    
    private processMountCall(mountCall: CallExpression) {
        const args = mountCall.getArguments();
        if (args.length === 0) return;
        
        const componentArg = args[0];
        if (Node.isIdentifier(componentArg)) {
            const componentName = componentArg.getText();
            const importDecl = this.getImportDecl(componentName);
        
            if (importDecl) {
                const resolved = importDecl.getModuleSpecifierSourceFile();
                let componentFile: string | null = resolved!.getFilePath();
                // 检查是否需要处理index.ts文件
                if (!isComponentFile(componentFile)) {
                    const realComponentPath = this.resolveRealComponentPath(componentFile);
                    if (realComponentPath) {
                        componentFile = realComponentPath;
                    }
                }
                
                // Initialize component entry in result if not exists
                if (!this.result[componentFile]) {
                    this.result[componentFile] = {};
                }
                
                // Check for options object (second argument)
                if (args.length > 1 && Node.isObjectLiteralExpression(args[1])) {
                    const options = args[1] as ObjectLiteralExpression;
                    this.extractProps(options, this.result[componentFile]);
                    this.extractEmits(options, this.result[componentFile]);
                    this.extractSlots(options, this.result[componentFile]);
                }
            }
        }
    }
    
    private analyzeComponentCreationCalls() {
        const skipFunctions = new Set(['mount', 'shallowMount', 'it', 'describe', 'test', 'expect']);
        
        // First, collect all test blocks with expect assertions
        const testBlocksWithExpect = new Set<CallExpression>();
        
        const testCalls = this.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
            .filter(call => {
                const expression = call.getExpression();
                if (Node.isIdentifier(expression)) {
                    const name = expression.getText();
                    return name === 'it' || name === 'test';
                }
                return false;
            });
        
        for (const testCall of testCalls) {
            const expectCalls = testCall.getDescendantsOfKind(SyntaxKind.CallExpression)
                .filter(call => {
                    const expression = call.getExpression();
                    return Node.isIdentifier(expression) && expression.getText() === 'expect';
                });
            
            if (expectCalls.length > 0) {
                testBlocksWithExpect.add(testCall);
            }
        }
        
        // Now find all potential component creation calls
        const allCallExpressions = this.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
        
        for (const callExpr of allCallExpressions) {
            const expression = callExpr.getExpression();
            
            // Skip known non-component creation functions
            if (Node.isIdentifier(expression) && skipFunctions.has(expression.getText())) {
                continue;
            }
            
            // Check if this call is inside a test block with expect assertions
            const isInTestWithExpect = this.isCallInTestWithExpect(callExpr, testBlocksWithExpect);
            
            // If not in a test block with expect, skip
            if (!isInTestWithExpect) {
                continue;
            }
            
            // Special handling for render function calls
            if (Node.isIdentifier(expression) && expression.getText() === 'render') {
                const args = callExpr.getArguments();
                if (args.length > 0) {
                    // Handle both arrow function and direct callbacks
                    if (Node.isArrowFunction(args[0])) {
                        const arrowFunc = args[0];
                        const body = arrowFunc.getBody();
                        
                        if (Node.isCallExpression(body)) {
                            this.analyzeComponentCreationNode(body);
                        }
                    } else if (Node.isCallExpression(args[0])) {
                        // Handle direct call expressions
                        this.analyzeComponentCreationNode(args[0]);
                    }
                }
                continue;
            }
            
            // Analyze other potential component creation calls
            this.analyzeComponentCreationNode(callExpr);
        }
    }
    
    private isCallInTestWithExpect(callExpr: CallExpression, testBlocksWithExpect: Set<CallExpression>): boolean {
        let currentNode: Node | undefined = callExpr;
        
        while (currentNode) {
            if (Node.isCallExpression(currentNode)) {
                const expression = currentNode.getExpression();
                
                if (Node.isIdentifier(expression)) {
                    const name = expression.getText();
                    if (name === 'it' || name === 'test') {
                        return testBlocksWithExpect.has(currentNode);
                    }
                }
            }
            
            currentNode = currentNode.getParent();
        }
        
        return false;
    }
    
    private analyzeComponentCreationNode(callExpr: CallExpression) {
        const args = callExpr.getArguments();
        if (args.length === 0) return;
        
        const componentArg = args[0];
        
        // Check if the first argument is a component identifier
        if (Node.isIdentifier(componentArg)) {
            const componentName = componentArg.getText();
            const importDecl = this.getImportDecl(componentName);
            
            if (importDecl) {
                const resolved = importDecl.getModuleSpecifierSourceFile();
                let  componentFile: string | null = resolved!.getFilePath();
                // 检查是否需要处理index.ts文件
                if (!isComponentFile(componentFile)) {
                    const realComponentPath = this.resolveRealComponentPath(componentFile);
                    if (realComponentPath) {
                        componentFile = realComponentPath;
                    }
                }
                
                // Initialize component in result if not exists
                if (!this.result[componentFile]) {
                    this.result[componentFile] = {};
                }
                
                // Initialize arrays if they don't exist
                this.result[componentFile].props = this.result[componentFile].props || [];
                this.result[componentFile].emits = this.result[componentFile].emits || [];
                this.result[componentFile].slots = this.result[componentFile].slots || [];
                
                // Check for props object (second argument)
                if (args.length > 1 && Node.isObjectLiteralExpression(args[1])) {
                    const propsObject = args[1];
                    
                    // Extract props and events
                    for (const prop of propsObject.getProperties()) {
                        if (Node.isPropertyAssignment(prop)) {
                            let propName: string;
                            
                            // Handle both identifier and string literal property names
                            const propNameNode = prop.getNameNode();
                            if (Node.isIdentifier(propNameNode)) {
                                propName = propNameNode.getText();
                            } else if (Node.isStringLiteral(propNameNode)) {
                                propName = propNameNode.getLiteralValue();
                            } else {
                                propName = prop.getName();
                            }
                            
                            // Handle event handlers (onClick, onChange, etc.)
                            if (propName.startsWith('on') && propName.length > 2) {
                                if (!this.result[componentFile].emits!.includes(propName)) {
                                    this.result[componentFile].emits!.push(propName);
                                }
                            } else {
                                // Regular props
                                if (!this.result[componentFile].props!.includes(propName)) {
                                    this.result[componentFile].props!.push(propName);
                                }
                            }
                        }
                    }
                }
                
                // Check for slots object (third argument)
                if (args.length > 2 && Node.isObjectLiteralExpression(args[2])) {
                    const slotsObject = args[2];
                    
                    // Extract slot names
                    for (const prop of slotsObject.getProperties()) {
                        if (Node.isPropertyAssignment(prop)) {
                            const slotName = prop.getName();
                            if (!this.result[componentFile].slots!.includes(slotName)) {
                                this.result[componentFile].slots!.push(slotName);
                            }
                        }
                    }
                }
            }
        }
    }

    private extractProps(options: ObjectLiteralExpression, component: TestUnit) {
        const propsProperty = options.getProperty('props');
        
        if (propsProperty && Node.isPropertyAssignment(propsProperty)) {
            const initializer = propsProperty.getInitializer();
            
            if (initializer && Node.isObjectLiteralExpression(initializer)) {
                const props = initializer.getProperties()
                    .filter(Node.isPropertyAssignment)
                    .map(prop => {
                        // 处理字符串属性名
                        const propNameNode = prop.getNameNode();
                        let propName: string;
                        
                        if (Node.isStringLiteral(propNameNode)) {
                            // 对于字符串字面量属性名，使用其值
                            propName = propNameNode.getLiteralValue();
                        } else {
                            propName = prop.getName();
                        }
                        
                        // 排除以on开头的事件处理器prop，它们应该被当作emit处理
                        return propName.startsWith('on') && propName.length > 2 ? null : propName;
                    })
                    .filter(Boolean) as string[]; // 过滤掉null值
                
                component.props = component.props || [];
                component.props = [...new Set([...component.props, ...props])];
            }
        }
    }

    private extractEmits(options: ObjectLiteralExpression, component: TestUnit) {
        const propsProperty = options.getProperty('props');
        
        if (propsProperty && Node.isPropertyAssignment(propsProperty)) {
            const initializer = propsProperty.getInitializer();
            
            if (initializer && Node.isObjectLiteralExpression(initializer)) {
                const emitProps: string[] = [];
                
                for (const prop of initializer.getProperties()) {
                    if (Node.isPropertyAssignment(prop)) {
                        // Handle both regular property names and string literals
                        const propNameNode = prop.getNameNode();
                        let propName: string;
                        
                        if (Node.isStringLiteral(propNameNode)) {
                            // For string literal property names like 'onUpdate:modelValue'
                            propName = propNameNode.getLiteralValue();
                        } else {
                            propName = prop.getName();
                        }
                        
                        if (propName.startsWith('on') && propName.length > 2) {
                            emitProps.push(propName);
                        }
                    }
                }
                
                if (emitProps.length > 0) {
                    component.emits = component.emits || [];
                    component.emits = [...new Set([...component.emits, ...emitProps])];
                }
            }
        }
    }

    private extractSlots(options: ObjectLiteralExpression, component: TestUnit) {
        const slotsProperty = options.getProperty('slots');
        
        if (slotsProperty && Node.isPropertyAssignment(slotsProperty)) {
            const initializer = slotsProperty.getInitializer();
            
            if (initializer && Node.isObjectLiteralExpression(initializer)) {
                const slots = initializer.getProperties()
                    .filter(Node.isPropertyAssignment)
                    .map(prop => prop.getName());
                
                if (slots.length > 0) {
                    component.slots = component.slots || [];
                    component.slots = [...new Set([...component.slots, ...slots])];
                }
            }
        }
    }

}

export function analyzeTestUnits(filePath: string) {
    // Create the analyzer
    const analyzer = new TestUnitAnalyzer(filePath);
    const result = analyzer.analyze();
    
    return result;
}

export default TestUnitAnalyzer;