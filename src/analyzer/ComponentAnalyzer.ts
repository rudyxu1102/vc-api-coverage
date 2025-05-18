import { SourceFile, Node, Type, Expression, ObjectLiteralExpression, SyntaxKind } from "ts-morph";

class ComponentAnalyzer {
    private sourceFile: SourceFile;
    private props = new Set<string>();
    private slots = new Set<string>();
    private exposes = new Set<string>();
    private code: string;

    constructor(sourceFile: SourceFile) {
        this.sourceFile = sourceFile;
        this.code = sourceFile.getFullText();
    }

    analyze() {
        this.analyzerComponentType();
        return {
            props: Array.from(this.props),
            slots: Array.from(this.slots),
            exposes: Array.from(this.exposes),
        }
    }

    analyzePropsAndEmits(instanceType: Type, exportedExpression: Expression) {
        const internalProps = ['key', 'ref', 'ref_for', 'ref_key', 'onVnodeBeforeMount', 'onVnodeMounted', 'onVnodeBeforeUpdate', 'onVnodeUpdated', 'onVnodeBeforeUnmount', 'onVnodeUnmounted', 'class', 'style'];
        const dollarPropsSymbol = instanceType.getProperty('$props');
        if (!dollarPropsSymbol) return
        const dollarPropsType = dollarPropsSymbol.getTypeAtLocation(exportedExpression);
        dollarPropsType.getProperties().forEach(propSymbol => {
            const propName = propSymbol.getName();
            if (internalProps.includes(propName)) {
                return;
            }
            this.props.add(propName);
        });
    }

    analyzeSlots(instanceType: Type, exportedExpression: Expression) {
        const dollarPropsSymbol = instanceType.getProperty('$slots');
        if (!dollarPropsSymbol) return
        const dollarPropsType = dollarPropsSymbol.getTypeAtLocation(exportedExpression);
        dollarPropsType.getProperties().forEach(propSymbol => {
            const propName = propSymbol.getName();
            this.slots.add(propName);
        });
    }

    /**
     * 分析 expose 的上下文调用和数组选项
     * 由于vue组件类型无法分析出暴露的属性，所以需要通过代码分析
     */
    analyzerExpose(exportedExpression: Expression) {
        this.analyzeExposeContextCalls();
        this.analyzeExposeArrayOption(exportedExpression);
    }

    analyzeExposeContextCalls() {
        const hasExposeContextCall = this.code.includes('expose({') ||
            (this.code.includes('setup(props, { expose })') ||
                this.code.includes('{ expose }') ||
                this.code.includes('context.expose'));

        if (!hasExposeContextCall) return;
        const matches = this.code.match(/expose\(\s*\{([^}]+)\}\s*\)/g);

        if (matches && matches.length > 0) {
            for (const match of matches) {
                const propsStr = match.replace(/expose\(\s*\{/, '').replace(/\}\s*\)/, '');
                const propMatches = propsStr.match(/(\w+),?/g);

                if (propMatches) {
                    for (const prop of propMatches) {
                        const cleanProp = prop.replace(/,/g, '').trim();
                        if (cleanProp && !this.exposes.has(cleanProp)) {
                            this.exposes.add(cleanProp);
                        }
                    }
                }
            }
        }
    }

    analyzeExposeArrayOption(exportedExpression: Expression) {
        const componentOptions = this.getComponentOptions(exportedExpression);
        if (!componentOptions) return;
        const exposeArrayOption = componentOptions.getProperty('expose');
        if (!exposeArrayOption || !Node.isPropertyAssignment(exposeArrayOption)) return;

        let exposeArray = exposeArrayOption.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);

        // Handle AsExpression
        if (!exposeArray) {
            const asExpression = exposeArrayOption.getInitializerIfKind(SyntaxKind.AsExpression);
            if (asExpression) {
                exposeArray = asExpression.getExpressionIfKind(SyntaxKind.ArrayLiteralExpression);
            }
        }

        if (!exposeArray) return;
        const exposeItems = exposeArray.getElements();
        for (const item of exposeItems) {
            const itemName = item.getText().replace(/[\'\"\`]/g, '');
            if (itemName && !this.exposes.has(itemName)) {
                this.exposes.add(itemName);
            }
        }
    }

    isComponentFile(type: Type) {
        const constructSignatures = type.getConstructSignatures();
        if (constructSignatures.length === 0) return false;
        return true
    }

    getExportedExpression() {
        let exportedExpression: Expression | null = null;
        const defaultExport = this.sourceFile.getDefaultExportSymbol();
        if (defaultExport) {
            const exportAssignmentDeclaration = defaultExport.getDeclarations()[0];
            if (exportAssignmentDeclaration && Node.isExportAssignment(exportAssignmentDeclaration)) {
                exportedExpression = exportAssignmentDeclaration.getExpression();
                const varType = exportedExpression.getType();
                if (this.isComponentFile(varType)) return exportedExpression;
            }
        }
        // 获取具名导出
        const namedExport = this.sourceFile.getExportSymbols().find(symbol => {
            const valueDeclaration = symbol.getValueDeclaration();
            if (!valueDeclaration) return false;
            const varType = valueDeclaration.getType();
            return this.isComponentFile(varType)
        });
        if (!namedExport) return;
        const declarations = namedExport.getDeclarations();
        if (declarations.length === 0) return;
        const declaration = declarations[0];
        if (Node.isExportAssignment(declaration)) {
            exportedExpression = declaration.getExpression();
        } else if (Node.isVariableDeclaration(declaration)) {
            exportedExpression = declaration.getInitializer()!;
        } else if (Node.isExportSpecifier(declaration)) {
            const localTargetSymbol = declaration.getLocalTargetSymbol();
            if (!localTargetSymbol) return;
            const localDeclarations = localTargetSymbol.getDeclarations();
            if (localDeclarations.length === 0) return;
            
            const localDeclaration = localDeclarations[0];
            if (Node.isVariableDeclaration(localDeclaration)) {
                exportedExpression = localDeclaration.getInitializer()!;
            }
        }
        return exportedExpression;
    }

    getComponentOptions(exportedExpression: Expression) {
        let componentOptions: ObjectLiteralExpression | undefined = undefined;
        if (Node.isCallExpression(exportedExpression) && exportedExpression.getExpression().isKind(SyntaxKind.Identifier) && exportedExpression.getExpression().getText() === 'defineComponent') {
            const arg = exportedExpression.getArguments()[0];
            if (arg && Node.isObjectLiteralExpression(arg)) {
                componentOptions = arg;
            }
        }
        return componentOptions;
    }

    analyzerComponentType() {
        const exportedExpression = this.getExportedExpression();
        if (!exportedExpression) return;
        const componentType = exportedExpression.getType();
        const constructSignatures = componentType.getConstructSignatures();
        if (constructSignatures.length === 0) return
        const instanceType = constructSignatures[0].getReturnType();
        this.analyzePropsAndEmits(instanceType, exportedExpression);
        this.analyzeSlots(instanceType, exportedExpression);
        this.analyzerExpose(exportedExpression);
    }
}

export default ComponentAnalyzer;