import { Project, SyntaxKind, Node, SourceFile, CallExpression, ObjectLiteralExpression, ImportDeclaration, JsxSelfClosingElement, JsxElement } from 'ts-morph';
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
        const filePath = sourceFile.getFilePath();
        this.dirname = path.dirname(filePath);
    }

    isValidTestCall(testCall: CallExpression) {
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

        return hasExpect;
    }

    public analyze(): TestUnitsResult {
        const testCalls = this.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).filter(call => {
            const expression = call.getExpression();
            if (Node.isIdentifier(expression)) {
                const name = expression.getText();
                return name === 'it' || name === 'test';
            }
            return false;
        });

        for (const testCall of testCalls) {
            if (!this.isValidTestCall(testCall)) continue;
            // Analyze traditional mount method calls
            this.analyzeTraditionalMountCalls(testCall);
              
            // Analyze JSX elements in the file
            this.analyzeJSXElements(testCall);
        }
      

        const data = this.transformResult(this.result);
        return data;
    }


    transformResult(result: TestUnitsResult) {
        for (const componentName in result) {
            const testUnit = result[componentName];
            // if (testUnit.props && testUnit.emits) {  //-- This logic is removed
            //     testUnit.props = [...new Set([...testUnit.props, ...testUnit.emits])]
            // }
        }
        return result;
    }

    // 处理index文件，如 ./components/input/index.ts
    private resolveRealComponentPath(sourceValue: string, exportName: string = 'default'): string | null {
        // 使用ts-morph解析代码，获取结构化信息
        const sourceFile = this.project.addSourceFileAtPath(sourceValue);
        // 查找默认导出
        if (exportName === 'default') {
            let componentImportPath = null;
            const defaultExport = sourceFile.getDefaultExportSymbol();
            if (!defaultExport) return null;
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
        } else {
            const importDecl = this.getImportDecl(exportName, sourceFile);
            const exportDecl = this.getExportDecl(exportName, sourceFile);
            if (!importDecl && !exportDecl) return null;
            const modulePath = exportDecl?.getModuleSpecifier()?.getLiteralValue()  || importDecl?.getModuleSpecifier().getLiteralValue() || '';
            const componentFile = getAsbFilePath(modulePath, path.dirname(sourceFile.getFilePath()));
            return componentFile;
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
    private analyzeTraditionalMountCalls(testCall: CallExpression) {
        // Find all mount or shallowMount calls
        const mountCalls = testCall.getDescendantsOfKind(SyntaxKind.CallExpression)
            .filter(call => {
                const expression = call.getExpression();
                return Node.isIdentifier(expression) && 
                        (expression.getText() === 'mount' || expression.getText() === 'shallowMount' || expression.getText() === 'render');
            });
        
        for (const mountCall of mountCalls) {
            // 检查mount调用中是否存在模板字符串，且模板中包含trigger插槽
            this.processMountCall(mountCall);
        }
    }

    getImportDecl(componentName: string, sourceFile: SourceFile) {
        const importDecls = sourceFile.getImportDeclarations();
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

    getExportDecl(componentName: string, sourceFile: SourceFile) {
        const exportDecls = sourceFile.getExportDeclarations();
        if (exportDecls.length === 0) return null;
        for (const exportDecl of exportDecls) {
            const namedExports = exportDecl.getNamedExports();
            for (const namedExport of namedExports) {
                if (namedExport.getText() === componentName) {
                    return exportDecl;
                }
            }
        }
        return null;
    }

    private isDefaultExport(importDecl: ImportDeclaration, componentName: string) {
        const defaultImportIdentifier = importDecl.getDefaultImport();
        return defaultImportIdentifier !== undefined && defaultImportIdentifier.getText() === componentName;
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

        const importDecl = this.getImportDecl(componentName, this.sourceFile);
        if (!importDecl) return;
        const modulePath = importDecl.getModuleSpecifier().getLiteralValue();
        let componentFile: string | null = getAsbFilePath(modulePath, this.dirname);
        const isDefaultExport = this.isDefaultExport(importDecl, componentName);
        const exportName = isDefaultExport ? 'default' : componentName
        if (!isComponentFile(componentFile)) {
            const realComponentPath = this.resolveRealComponentPath(componentFile, exportName);
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
                        this.extractSlotsFromTemplate(templateContent, this.result[componentFile]);
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
                } else if (propName.startsWith('v-model:')) {
                    propName = propName.substring(8);
                } else if (propName === 'v-model') {
                    propName = 'value'; // Or 'modelValue' depending on Vue 3 convention
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
            const attrRegex = /([@a-zA-Z0-9_:-]+)(?:=(?:\"[^\"]*\"|'[^']*'|[^\s>]*))?/g;
            let attrMatch;
            while ((attrMatch = attrRegex.exec(attrsString)) !== null) {
                let emitName = attrMatch[1];
                let isVModel = false;
                if (emitName.startsWith('v-model:')) {
                    emitName = `onUpdate:${emitName.substring(8)}`;
                    isVModel = true;
                } else if (emitName === 'v-model') {
                    emitName = 'onUpdate:value'; // Or onUpdate:modelValue
                    isVModel = true;
                }

                if (isVModel) {
                    emitsFound.push(emitName);
                } else if (emitName.startsWith('@')) {
                    emitName = emitName.substring(1);
                    emitsFound.push('on' + emitName.charAt(0).toUpperCase() + emitName.slice(1));
                } else if (emitName.startsWith('v-on:')) {
                    emitName = emitName.substring(5);
                    emitsFound.push('on' + emitName.charAt(0).toUpperCase() + emitName.slice(1));
                }
            }
        }

        if (emitsFound.length > 0) {
            componentTestUnit.emits = componentTestUnit.emits || [];
            componentTestUnit.emits = [...new Set([...componentTestUnit.emits, ...emitsFound])];
        }
    }

    private extractSlotsFromTemplate(template: string, componentTestUnit: TestUnit) {
        const slotsFound: string[] = [];
        
        // 1. Find all explicitly named slots first
        const componentSlotRegex = /<[A-Za-z][A-Za-z0-9-]*[^>]*>.*?<template\s+#([a-zA-Z0-9_-]+)[^>]*>.*?<\/template>/gs;
        let componentSlotMatch;
        while ((componentSlotMatch = componentSlotRegex.exec(template)) !== null) {
            const slotName = componentSlotMatch[1];
            if (!slotsFound.includes(slotName)) {
                slotsFound.push(slotName);
            }
        }
        
        const hashSlotRegex = /<template\s+#([a-zA-Z0-9_-]+)[^>]*>/g;
        let hashMatch;
        while ((hashMatch = hashSlotRegex.exec(template)) !== null) {
            const slotName = hashMatch[1];
            if (!slotsFound.includes(slotName)) {
                slotsFound.push(slotName);
            }
        }
        
        const vSlotRegex = /<template\s+v-slot:([a-zA-Z0-9_-]+)[^>]*>/g;
        let vSlotMatch;
        while ((vSlotMatch = vSlotRegex.exec(template)) !== null) {
            const slotName = vSlotMatch[1];
            if (!slotsFound.includes(slotName)) {
                slotsFound.push(slotName);
            }
        }

        // 2. Create a version of the template with all named slot <template> blocks removed.
        let templateWithoutNamedSlotDeclarations = template;
        slotsFound.forEach(slotName => {
            const specificSlotBlockRegexText = `<template\\s+(?:#${slotName}|v-slot:${slotName})[^>]*>[\\s\\S]*?<\\/template>`;
            const specificSlotBlockRegex = new RegExp(specificSlotBlockRegexText, 'g');
            templateWithoutNamedSlotDeclarations = templateWithoutNamedSlotDeclarations.replace(specificSlotBlockRegex, '');
        });

        // 3. Check if the remaining template (inside the main component tags) has actual content for a default slot.
        const mainComponentContentRegex = /<([A-Za-z][A-Za-z0-9-]+)[^>]*>([\s\S]*?)<\/\1>/i;
        const mainComponentMatch = mainComponentContentRegex.exec(templateWithoutNamedSlotDeclarations);

        let hasActualDefaultContent = false;
        if (mainComponentMatch && mainComponentMatch[2] !== undefined) {
            let innerContent = mainComponentMatch[2];
            innerContent = innerContent.replace(/<!--[\s\S]*?-->/g, '');
            innerContent = innerContent.trim();
            if (innerContent !== '') {
                hasActualDefaultContent = true;
            }
        }
        
        if (hasActualDefaultContent) {
            if (!slotsFound.includes('default')) {
                slotsFound.push('default');
            }
        }
        
        // 4. Add all found slots to the componentTestUnit
        if (slotsFound.length > 0) {
            componentTestUnit.slots = componentTestUnit.slots || [];
            componentTestUnit.slots = [...new Set([...componentTestUnit.slots, ...slotsFound])];
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

    findJsxInCallExpression(callExpression: CallExpression): (JsxElement | JsxSelfClosingElement)[] {
        const jsxNodes: (JsxElement | JsxSelfClosingElement)[] = [];
      
        const args = callExpression.getArguments();
      
        args.forEach(arg => {
          // 遍历每个参数节点及其所有子孙节点
          arg.forEachDescendant((node) => {
            // 检查节点类型是否是 JSX 元素或片段
            if (Node.isJsxElement(node) || Node.isJsxSelfClosingElement(node)) {
              jsxNodes.push(node);
            }
          });
        });
      
        return jsxNodes;
      }

    // Analyze JSX elements in the source file
    private analyzeJSXElements(callExpression: CallExpression) {
        // Find all JSX elements and self-closing elements
        const jsxElements = this.findJsxInCallExpression(callExpression);
        for (const jsxElement of jsxElements) {
            // Get the opening element (or the self-closing element itself)
            const openingElement = Node.isJsxElement(jsxElement) 
                ? jsxElement.getOpeningElement()
                : jsxElement;
            
            // Get component name
            const tagName = openingElement.getTagNameNode().getText();
            
            // Find the corresponding import declaration
            const importDecl = this.getImportDecl(tagName, this.sourceFile);
            if (!importDecl) continue;
            
            const resolved = importDecl.getModuleSpecifierSourceFile();
            const modulePath = importDecl.getModuleSpecifier().getLiteralValue();
            let filePath: string | null = getAsbFilePath(modulePath, this.dirname);
            if (resolved) {
                filePath = resolved.getFilePath();
            };
            const isDefaultExport = this.isDefaultExport(importDecl, tagName);
            const exportName = isDefaultExport ? 'default' : tagName;
            // Check if we need to handle index.ts files
            if (!isComponentFile(filePath)) {
                const realComponentPath = this.resolveRealComponentPath(filePath, exportName);
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
                    let propName = attr.getNameNode().getText();
                    let originalPropName = propName; // Keep original for emit generation

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
                        let isVModel = false;
                        // Handle v-model transformation for props
                        if (propName.startsWith('v-model:')) {
                            propName = propName.substring(8);
                            isVModel = true;
                        } else if (propName === 'v-model') {
                            propName = 'value'; // Or 'modelValue' depending on Vue 3 convention
                            isVModel = true;
                        }

                        // Add regular prop to the result
                        if (!component.props) {
                            component.props = [];
                        }
                        if (!component.props.includes(propName)) {
                            component.props.push(propName);
                        }

                        // If it was a v-model, also add the corresponding emit
                        if (isVModel) {
                            if (!component.emits) {
                                component.emits = [];
                            }
                            let emitName = '';
                            if (originalPropName === 'v-model') {
                                emitName = 'onUpdate:value'; // or onUpdate:modelValue
                            } else if (originalPropName.startsWith('v-model:')){
                                emitName = `onUpdate:${originalPropName.substring(8)}`;
                            }
                            if (emitName && !component.emits.includes(emitName)) {
                                component.emits.push(emitName);
                            }
                        }
                    }
                }
            }
        }
    }

    // Helper method to extract slots from JSX elements
    private extractJSXSlots(element: Node, component: TestUnit) {
        if (Node.isJsxElement(element)) {
            let hasPotentialDefaultSlotContent = false;
            const children = element.getJsxChildren();

            for (const child of children) {
                if (Node.isJsxText(child) && child.getText().trim() !== '') { // Non-empty text node
                    hasPotentialDefaultSlotContent = true;
                    break;
                }
                if (Node.isJsxElement(child)) { // Direct JSX element child
                    hasPotentialDefaultSlotContent = true;
                    break;
                }
                if (Node.isJsxExpression(child)) {
                    const expression = child.getExpression();
                    // If the JsxExpression is not an ObjectLiteral (which is used for named slots)
                    // it could be default slot content e.g. <Button>{() => <div/>}</Button> or <Button>{someVariable}</Button>
                    if (expression && !Node.isObjectLiteralExpression(expression)) {
                        hasPotentialDefaultSlotContent = true;
                        break;
                    }
                }
            }

            if (hasPotentialDefaultSlotContent) {
                component.slots = component.slots || [];
                if (!component.slots.includes('default')) {
                    component.slots.push('default');
                }
            }

            // Look for Vue-style named slots pattern: {{ slotName: content }}
            const objectLiteralExpressions = element.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression);
            for (const objLiteral of objectLiteralExpressions) {
                // Check if this is inside a JSX expression that is a direct child of the current element
                const parentJsxExpression = objLiteral.getParentIfKind(SyntaxKind.JsxExpression);
                if (parentJsxExpression && parentJsxExpression.getParentIfKind(SyntaxKind.JsxElement) === element) {
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