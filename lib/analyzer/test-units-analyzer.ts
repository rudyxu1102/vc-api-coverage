import { Project, SyntaxKind, Node, SourceFile, CallExpression, ObjectLiteralExpression } from 'ts-morph';
import { getAsbFilePath, isComponentFile } from '../common/utils';
import path from 'path';

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
    private dirname: string;
    
    constructor(sourceFile: SourceFile, project: Project) {
        this.project = project;
        this.sourceFile = sourceFile;
        this.result = {};
        const filePath = sourceFile.getFilePath();
        this.dirname = path.dirname(filePath);
    }

    public analyze(): TestUnitsResult {
        // Analyze traditional mount method calls
        this.analyzeTraditionalMountCalls();
        
        // Analyze JSX elements in the file
        this.analyzeJSXElements();

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
                           (expression.getText() === 'mount' || expression.getText() === 'shallowMount' || expression.getText() === 'render');
                });
            
            for (const mountCall of mountCalls) {
                this.processMountCall(mountCall);
            }
        }
    }

    getImportDecl(componentName: string) {
        const importDecls = this.sourceFile.getImportDeclarations();
        for (const importDecl of importDecls) {
            // 检查默认导入
            const defaultImport = importDecl.getDefaultImport();
            if (defaultImport && defaultImport.getText() === componentName) {
                return importDecl;
            }
            
            // 检查命名导入
            const namedImports = importDecl.getNamedImports();
            for (const namedImport of namedImports) {
                if (namedImport.getName() === componentName) {
                    return importDecl;
                }
            }
        }
        return null;
    }
    
    private processMountCall(mountCall: CallExpression) {
        const args = mountCall.getArguments();
        if (args.length === 0) return;

        let componentArgNode: Node | undefined = args[0];
        let optionsNode: Node | undefined;
        let componentName: string | undefined;
        let mountOptionsObject: ObjectLiteralExpression | undefined;

        if (Node.isIdentifier(componentArgNode)) {
            // Existing logic: mount(Component, options) or render(Component, options)
            componentName = componentArgNode.getText();
            if (args.length > 1 && Node.isObjectLiteralExpression(args[1])) {
                optionsNode = args[1];
            }
        } else if (Node.isObjectLiteralExpression(componentArgNode)) {
            // New logic: mount({ template: '...', components: { ... } })
            mountOptionsObject = componentArgNode as ObjectLiteralExpression;
            optionsNode = mountOptionsObject; // The entire object is effectively the options

            const componentsProperty = mountOptionsObject.getProperty('components');
            if (componentsProperty && Node.isPropertyAssignment(componentsProperty)) {
                const componentsInitializer = componentsProperty.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
                if (componentsInitializer) {
                    // Take the first component found in the 'components' object
                    // This is a simplification. A more robust solution might parse the template.
                    const firstComponentProp = componentsInitializer.getProperties()[0];
                    if (firstComponentProp && (Node.isPropertyAssignment(firstComponentProp) || Node.isShorthandPropertyAssignment(firstComponentProp))) {
                        componentName = firstComponentProp.getName();
                    }
                }
            }
        }

        if (!componentName) return;

        const importDecl = this.getImportDecl(componentName);
        if (!importDecl) return;

        const modulePath = importDecl.getModuleSpecifier().getLiteralValue();
        let componentFile: string | null = getAsbFilePath(modulePath, this.dirname);

        if (!isComponentFile(componentFile)) {
            const realComponentPath = this.resolveRealComponentPath(componentFile);
            if (realComponentPath) {
                componentFile = realComponentPath;
            } else {
                return; // Skip if we can't resolve the component path
            }
        }

        if (!this.result[componentFile]) {
            this.result[componentFile] = {};
        }

        // Process props, emits, slots from optionsNode or template
        if (optionsNode && Node.isObjectLiteralExpression(optionsNode)) {
            const options = optionsNode as ObjectLiteralExpression;
            this.extractProps(options, this.result[componentFile]);
            this.extractEmits(options, this.result[componentFile]);
            this.extractSlots(options, this.result[componentFile]);

            // If this was a mount({ template: '...' }) call, also try to extract props from template
            if (mountOptionsObject) {
                const templateProperty = mountOptionsObject.getProperty('template');
                if (templateProperty && Node.isPropertyAssignment(templateProperty)) {
                    const templateInitializer = templateProperty.getInitializer();
                    if (templateInitializer && (Node.isStringLiteral(templateInitializer) || Node.isNoSubstitutionTemplateLiteral(templateInitializer))) {
                        const templateContent = templateInitializer.getLiteralText();
                        
                        this.extractPropsFromTemplate(templateContent, componentName, this.result[componentFile]);
                        this.extractEmitsFromTemplate(templateContent, componentName, this.result[componentFile]);
                    }
                }
            }
        }
    }

    private extractPropsFromTemplate(template: string, componentTagName: string, componentTestUnit: TestUnit) {
        // Simple regex to find attributes for a given component tag.
        // This is a basic implementation and might need to be made more robust.
        // Example: <Button prop1="value1" prop2 />
        // It won't handle complex bindings like :prop or v-bind well.
        const tagRegex = new RegExp(`<${componentTagName}(\\s+[^>]*)?>`, 'ig'); // Case-insensitive, global
        let match;
        const propsFound: string[] = [];

        while ((match = tagRegex.exec(template)) !== null) {
            const attrsString = match[1]; // Group 1 captures the attributes string
            if (!attrsString) continue;

            // Regex to find attribute names (e.g., prop1, prop2)
            // Handles: prop="value", prop='value', prop, prop={expr}, prop-name, :prop-name
            const attrRegex = /([@:a-zA-Z0-9_-]+)(?:=(?:"[^"]*"|'[^']*'|[^\s>]*))?/g;
            let attrMatch;
            while ((attrMatch = attrRegex.exec(attrsString)) !== null) {
                let propName = attrMatch[1];
                // Remove potential Vue binding prefixes like : or v-bind:
                if (propName.startsWith(':')) {
                    propName = propName.substring(1);
                } else if (propName.startsWith('v-bind:')) {
                    propName = propName.substring(7);
                }
                // Exclude event handlers (onXxx or @xxx) as they are handled by emits
                if (!((propName.startsWith('on') && propName.length > 2 && propName[2] === propName[2].toUpperCase()) || propName.startsWith('@'))) {
                    propsFound.push(propName);
                }
            }
        }

        if (propsFound.length > 0) {
            componentTestUnit.props = componentTestUnit.props || [];
            componentTestUnit.props = [...new Set([...componentTestUnit.props, ...propsFound])];
        }
    }

    private extractEmitsFromTemplate(template: string, componentTagName: string, componentTestUnit: TestUnit) {
        // Simple regex to find attributes for a given component tag.
        // Example: <Button @click="handler" />
        const tagRegex = new RegExp(`<${componentTagName}(\\s+[^>]*)?>`, 'ig');
        let match;
        const emitsFound: string[] = [];

        while ((match = tagRegex.exec(template)) !== null) {
            const attrsString = match[1]; // Group 1 captures the attributes string
            if (!attrsString) continue;

            // Regex to find attribute names starting with @ or v-on:
            const attrRegex = /([@a-zA-Z0-9_-]+)(?:=(?:\"[^\"]*\"|'[^']*'|[^\s>]*))?/g;
            let attrMatch;
            while ((attrMatch = attrRegex.exec(attrsString)) !== null) {
                let emitName = attrMatch[1];
                if (emitName.startsWith('@')) {
                    emitName = emitName.substring(1);
                    emitsFound.push(emitName);
                } else if (emitName.startsWith('v-on:')) {
                    emitName = emitName.substring(5);
                    emitsFound.push(emitName);
                }
            }
        }

        if (emitsFound.length > 0) {
            componentTestUnit.emits = componentTestUnit.emits || [];
            componentTestUnit.emits = [...new Set([...componentTestUnit.emits, ...emitsFound])];
        }
    }

    private extractProps(options: ObjectLiteralExpression, component: TestUnit) {
        const propsProperty = options.getProperty('props');
        if (propsProperty && Node.isPropertyAssignment(propsProperty)) {
            const initializer = propsProperty.getInitializer();
            if (initializer && Node.isObjectLiteralExpression(initializer)) {
                const props = initializer.getProperties()
                    .map(propNode => {
                        let propName: string | undefined;
                        if (Node.isPropertyAssignment(propNode)) {
                            const nameNode = propNode.getNameNode();
                            if (Node.isStringLiteral(nameNode)) {
                                propName = nameNode.getLiteralValue();
                            } else {
                                propName = propNode.getName();
                            }
                        } else if (Node.isShorthandPropertyAssignment(propNode)) {
                            propName = propNode.getName();
                        }

                        // Exclude onXxx event handlers from props list
                        if (propName && !(propName.startsWith('on') && propName.length > 2 && propName[2] === propName[2].toUpperCase())) {
                            return propName;
                        }
                        return null;
                    })
                    .filter(Boolean) as string[];
                
                if (props.length > 0) {
                    component.props = component.props || [];
                    component.props = [...new Set([...component.props, ...props])];
                }
            }
        }
    }

    private extractEmits(options: ObjectLiteralExpression, component: TestUnit) {
        const propsProperty = options.getProperty('props'); // Emits are derived from onXxx props
        if (propsProperty && Node.isPropertyAssignment(propsProperty)) {
            const initializer = propsProperty.getInitializer();
            if (initializer && Node.isObjectLiteralExpression(initializer)) {
                const emits = initializer.getProperties()
                    .map(propNode => {
                        let propName: string | undefined;
                        if (Node.isPropertyAssignment(propNode)) {
                            const nameNode = propNode.getNameNode();
                            if (Node.isStringLiteral(nameNode)) {
                                propName = nameNode.getLiteralValue();
                            } else {
                                propName = propNode.getName();
                            }
                        } else if (Node.isShorthandPropertyAssignment(propNode)) {
                            propName = propNode.getName();
                        }

                        // Emits are onXxx event handlers
                        if (propName && propName.startsWith('on') && propName.length > 2 && propName[2] === propName[2].toUpperCase()) {
                            return propName;
                        }
                        return null;
                    })
                    .filter(Boolean) as string[];

                if (emits.length > 0) {
                    component.emits = component.emits || [];
                    component.emits = [...new Set([...component.emits, ...emits])];
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

    // Analyze JSX elements in the source file
    private analyzeJSXElements() {
        // Find all JSX elements and self-closing elements
        const jsxElements = [
            ...this.sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement),
            ...this.sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)
        ];
        for (const jsxElement of jsxElements) {
            // Get the opening element (or the self-closing element itself)
            const openingElement = Node.isJsxElement(jsxElement) 
                ? jsxElement.getOpeningElement()
                : jsxElement;
            
            // Get component name
            const tagName = openingElement.getTagNameNode().getText();
            
            // Find the corresponding import declaration
            const importDecl = this.getImportDecl(tagName);
            if (!importDecl) continue;
            
            const resolved = importDecl.getModuleSpecifierSourceFile();
            const modulePath = importDecl.getModuleSpecifier().getLiteralValue();
            let filePath: string | null = getAsbFilePath(modulePath, this.dirname);
            if (resolved) {
                filePath = resolved.getFilePath();
            };
            // Check if we need to handle index.ts files
            if (!isComponentFile(filePath)) {
                const realComponentPath = this.resolveRealComponentPath(filePath);
                if (realComponentPath) {
                    // Initialize component entry in result if not exists
                    if (!this.result[realComponentPath]) {
                        this.result[realComponentPath] = {};
                    }
                    
                    // Extract props from JSX attributes
                    this.extractJSXAttrs(openingElement, this.result[realComponentPath]);
                    
                    // Extract slots from JSX children if it's a JSX element (not self-closing)
                    if (Node.isJsxElement(jsxElement)) {
                        this.extractJSXSlots(jsxElement, this.result[realComponentPath]);
                    }
                } 
            } else {
                // Initialize component entry in result if not exists
                if (!this.result[filePath]) {
                    this.result[filePath] = {};
                }
                
                // Extract props from JSX attributes
                this.extractJSXAttrs(openingElement, this.result[filePath]);
                
                // Extract slots from JSX children if it's a JSX element (not self-closing)
                if (Node.isJsxElement(jsxElement)) {
                    this.extractJSXSlots(jsxElement, this.result[filePath]);
                }
            }
        }
    }
    
    // Helper method to extract attributes from JSX elements
    private extractJSXAttrs(element: Node, component: TestUnit) {
        if (Node.isJsxOpeningElement(element) || Node.isJsxSelfClosingElement(element)) {
            const attributes = element.getAttributes();
            
            for (const attr of attributes) {
                if (Node.isJsxAttribute(attr)) {
                    const propName = attr.getNameNode().getText();
                    // Handle event handlers (props starting with "on")
                    if (propName.startsWith('on') && propName.length > 2) {
                        // Add to emits list
                        if (!component.emits) {
                            component.emits = [];
                        }
                        
                        if (!component.emits.includes(propName)) {
                            component.emits.push(propName);
                        }
                    } else {
                        // Add regular prop to the result
                        if (!component.props) {
                            component.props = [];
                        }
                        
                        if (!component.props.includes(propName)) {
                            component.props.push(propName);
                        }
                    }
                }
            }
        }
    }

    // Helper method to extract slots from JSX elements
    private extractJSXSlots(element: Node, component: TestUnit) {
        if (Node.isJsxElement(element)) {
            // First, add the default slot if the element has children
            const children = element.getJsxChildren();
            if (children.length > 0) {
                component.slots = component.slots || [];
                if (!component.slots.includes('default')) {
                    component.slots.push('default');
                }
            }
            
            // Look for Vue-style named slots pattern: {{ slotName: content }}
            const objectLiteralExpressions = element.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression);
            for (const objLiteral of objectLiteralExpressions) {
                // Check if this is inside a JSX expression
                const parent = objLiteral.getParent();
                if (parent && Node.isJsxExpression(parent)) {
                    // Extract slot names from object properties
                    const properties = objLiteral.getProperties();
                    for (const prop of properties) {
                        if (Node.isPropertyAssignment(prop) || Node.isShorthandPropertyAssignment(prop)) {
                            const slotName = prop.getName();
                            if (slotName) {
                                component.slots = component.slots || [];
                                if (!component.slots.includes(slotName)) {
                                    component.slots.push(slotName);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

}


export default TestUnitAnalyzer;