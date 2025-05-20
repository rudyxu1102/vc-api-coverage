import { Project, SyntaxKind, Node, SourceFile, CallExpression, ObjectLiteralExpression, JsxSelfClosingElement, JsxElement, Identifier, Symbol } from 'ts-morph';
import { isComponentFile, isComponentType } from '../common/utils';

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

    constructor(sourceFile: SourceFile, project: Project) {
        this.project = project;
        this.sourceFile = sourceFile;
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
            if (testUnit.emits) {
                testUnit.props = [...new Set([...(testUnit.props || []), ...testUnit.emits])]
            }
        }
        return result;
    }  

    private resolveComponentPath(identifier: Identifier, importSymbol?: Symbol) {
        try {
            let originalSymbol: Symbol | undefined = importSymbol;
            if (identifier) {
                const typeChecker = this.project.getTypeChecker();
                originalSymbol = typeChecker.getSymbolAtLocation(identifier);
            }
            if (!originalSymbol) return null;
            while (originalSymbol?.getAliasedSymbol()) {
                originalSymbol = originalSymbol.getAliasedSymbol();
            }
            if (!originalSymbol) return null;
            const declarations = originalSymbol.getDeclarations();
            const declarationNode = declarations[0];
            if (!declarationNode) return null;
            const declarationSourceFile = declarationNode.getSourceFile();
            const originalPath = declarationSourceFile.getFilePath();
            if (!isComponentFile(originalPath)) {
                return this.resolveTsPath(declarationNode);
            }
            return originalPath;
        } catch (error) {
            return null;
        }
    }

    // 解析ts路径
    resolveTsPath(declarationNode: Node) {
        if (!Node.isExportAssignment(declarationNode)) return null;
        const exportedExpression = declarationNode.getExpression();
        if (Node.isCallExpression(exportedExpression)) {
            const args = exportedExpression.getArguments();
            for (const arg of args) {
                const argType = arg.getType();
                if (isComponentType(argType)) {
                    // 获取文件路径
                    const res = this.resolveComponentPath(arg as Identifier) as string;
                    return res;
                }
            }
        }
        return null;
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


    // 处理mount(Component, options)或render(Component, options)
    processMountComponent(componentArgNode: Node, optionsNode?: ObjectLiteralExpression) {
        if (!optionsNode) return
        const componentName = componentArgNode.getText();

        const importDecl = this.getImportDecl(componentName, this.sourceFile);
        if (!importDecl) return;
        const modulePath = importDecl.getModuleSpecifier().getLiteralValue();
        const componentFile = this.resolveComponentPath(componentArgNode as Identifier) || modulePath;
        if (!componentFile) return;
        if (!this.result[componentFile]) {
            this.result[componentFile] = {};
        }
        this.extractProps(optionsNode, this.result[componentFile]);
        this.extractEmits(optionsNode, this.result[componentFile]);
        this.extractSlots(optionsNode, this.result[componentFile]);
    }

    // 处理mount({ template: '...', components: { ... } })
    processMountOptions(optionsNode: ObjectLiteralExpression) {
        const templateProperty = optionsNode.getProperty('template');
        if (!templateProperty || !Node.isPropertyAssignment(templateProperty)) return;
    
        const templateInitializer = templateProperty.getInitializer();
        if (!templateInitializer || !(Node.isStringLiteral(templateInitializer) || Node.isNoSubstitutionTemplateLiteral(templateInitializer))) return;
        const templateContent = templateInitializer.getLiteralText();

        const componentsProperty = optionsNode.getProperty('components');
        if (!componentsProperty || !Node.isPropertyAssignment(componentsProperty)) return;
        const componentsInitializer = componentsProperty.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
        if (!componentsInitializer) return;
        for (const componentProp of componentsInitializer.getProperties()) {
            if (Node.isPropertyAssignment(componentProp) || Node.isShorthandPropertyAssignment(componentProp)) {
                const localComponentName = componentProp.getName();
                const importDecl = this.getImportDecl(localComponentName, this.sourceFile);
                const componentArgNode = componentProp.getInitializerIfKind(SyntaxKind.Identifier);
                const importSymbol = this.getResolvedDeclarationSymbol(componentProp.getNameNode() as Identifier);
                if (!importDecl) continue;
                const modulePath = importDecl.getModuleSpecifier().getLiteralValue();
                const resolvedComponentFile = this.resolveComponentPath(componentArgNode as Identifier, importSymbol) || modulePath;
                if (!resolvedComponentFile) continue;
                if (!this.result[resolvedComponentFile]) {
                    this.result[resolvedComponentFile] = {};    
                }
                this.extractPropsFromTemplate(templateContent, localComponentName, this.result[resolvedComponentFile]);
                this.extractEmitsFromTemplate(templateContent, localComponentName, this.result[resolvedComponentFile]);
                this.extractSlotsFromTemplate(templateContent, this.result[resolvedComponentFile]);
            }
        }
    }

    getResolvedDeclarationSymbol(identifier: Identifier) {
        const definitions = identifier.getDefinitions();
        let resolvedDeclarationSymbol;
        
        for (const definition of definitions) {
            const declarationNode = definition.getDeclarationNode();
            if (declarationNode && Node.isImportSpecifier(declarationNode)) {
                resolvedDeclarationSymbol = declarationNode.getSymbol();
                if (resolvedDeclarationSymbol) {
                    break; 
                }
            }
        }
        
        if (!resolvedDeclarationSymbol) {
            resolvedDeclarationSymbol = identifier.getSymbolOrThrow(); 
        }
        return resolvedDeclarationSymbol;
    }

    private processMountCall(mountCall: CallExpression) {
        const args = mountCall.getArguments();
        if (args.length === 0) return;

        let componentArgNode: Node | undefined = args[0];
        if (Node.isIdentifier(componentArgNode)) {
            this.processMountComponent(componentArgNode, args[1] as ObjectLiteralExpression);
        } else if (Node.isObjectLiteralExpression(componentArgNode)) {
            this.processMountOptions(componentArgNode as ObjectLiteralExpression);
        }

    }

    private extractPropsFromTemplate(template: string, componentTagName: string, componentTestUnit: TestUnit) {
        // Simple regex to find attributes for a given component tag.
        // This is a basic implementation and might need to be made more robust.
        // Example: <Button prop1="value1" prop2 />
        // It won't handle complex bindings like :prop or v-bind well.
        const tagRegex = new RegExp(`<${componentTagName}(\\s+[^>]*?)?>`, 'ig'); // Case-insensitive, global. Made the attribute matching non-greedy.
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
            const modulePath = importDecl.getModuleSpecifier().getLiteralValue();
            const filePath = this.resolveComponentPath(openingElement.getTagNameNode() as Identifier) || modulePath;
            if (!filePath) continue;

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
                            } else if (originalPropName.startsWith('v-model:')) {
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