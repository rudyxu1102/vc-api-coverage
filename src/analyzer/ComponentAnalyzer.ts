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

        const exposeArray = this.getExposeArrayFromOptions(componentOptions);
        if (!exposeArray) return;

        const exposeItems = exposeArray.getElements();
        for (const item of exposeItems) {
            const itemName = this.getItemName(item);
            if (itemName && !this.exposes.has(itemName)) {
                this.exposes.add(itemName);
            }
        }
    }

    private getExposeArrayFromOptions(componentOptions: ObjectLiteralExpression) {
        const exposeArrayOption = componentOptions.getProperty('expose');
        if (!exposeArrayOption || !Node.isPropertyAssignment(exposeArrayOption)) return undefined;

        let exposeArray = exposeArrayOption.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
        if (exposeArray) return exposeArray;

        const asExpression = exposeArrayOption.getInitializerIfKind(SyntaxKind.AsExpression);
        if (asExpression) {
            exposeArray = asExpression.getExpressionIfKind(SyntaxKind.ArrayLiteralExpression);
        }
        return exposeArray;
    }

    private getItemName(item: Expression): string {
        if (Node.isPropertyAccessExpression(item)) {
            return this.getNameFromPropertyAccess(item);
        }
        if (Node.isStringLiteral(item)) {
            return item.getLiteralValue();
        }
        if (Node.isIdentifier(item)) {
            return this.getNameFromIdentifier(item);
        }
        return item.getText().replace(/[\'\"\`]/g, '');
    }

    private getNameFromPropertyAccess(item: Expression): string {
        const symbol = item.getSymbol();
        if (symbol) {
            const valueDeclaration = symbol.getDeclarations()[0];
            if (Node.isEnumMember(valueDeclaration)) {
                const enumMemberValue = valueDeclaration.getValue();
                if (typeof enumMemberValue === 'string') {
                    return enumMemberValue;
                }
            }
        }
        return item.getText().replace(/[\'\"\`]/g, '');
    }

    private getNameFromIdentifier(item: Expression): string {
        if (!Node.isIdentifier(item)) return item.getText().replace(/[\'\"\`]/g, '');

        const symbol = item.getSymbol();
        if (!symbol) return item.getText().replace(/[\'\"\`]/g, '');

        const declarations = symbol.getDeclarations();
        if (declarations.length === 0) return item.getText().replace(/[\'\"\`]/g, '');
        
        for (const declaration of declarations) {
            if (Node.isVariableDeclaration(declaration)) {
                const initializer = declaration.getInitializer();
                if (initializer && Node.isStringLiteral(initializer)) {
                    return initializer.getLiteralValue();
                }
            } else if (Node.isImportSpecifier(declaration)) {
                const importedSymbol = declaration.getNameNode().getSymbol();
                if (importedSymbol) {
                    const importedDeclarations = importedSymbol.getAliasedSymbol()?.getDeclarations() ?? importedSymbol.getDeclarations();
                    for (const impDecl of importedDeclarations) {
                        if (Node.isVariableDeclaration(impDecl)) {
                            const initializer = impDecl.getInitializer();
                            if (initializer && Node.isStringLiteral(initializer)) {
                                return initializer.getLiteralValue();
                            }
                        }
                    }
                }
            }
        }
        return item.getText().replace(/[\'\"\`]/g, '');
    }

    isComponentFile(type: Type) {
        const constructSignatures = type.getConstructSignatures();
        if (constructSignatures.length === 0) return false;
        return true
    }

    getExportedExpression() {
        let exportedExpression = this.getExportedExpressionFromDefault();
        if (exportedExpression) return exportedExpression;

        exportedExpression = this.getExportedExpressionFromNamed();
        return exportedExpression;
    }

    private getExportedExpressionFromDefault(): Expression | null {
        const defaultExport = this.sourceFile.getDefaultExportSymbol();
        if (!defaultExport) return null;

        const exportAssignmentDeclaration = defaultExport.getDeclarations()[0];
        if (!exportAssignmentDeclaration || !Node.isExportAssignment(exportAssignmentDeclaration)) return null;

        let expression = exportAssignmentDeclaration.getExpression();
        if (Node.isIdentifier(expression)) {
            const symbol = expression.getSymbol();
            if (symbol) {
                const valueDeclaration = symbol.getValueDeclaration();
                if (valueDeclaration && Node.isVariableDeclaration(valueDeclaration)) {
                    expression = valueDeclaration.getInitializer()!;
                }
            }
        }

        if (expression && this.isComponentFile(expression.getType())) {
            return expression;
        }
        return null;
    }

    private getExportedExpressionFromNamed(): Expression | null {
        const namedExportSymbol = this.sourceFile.getExportSymbols().find(symbol => {
            const valueDeclaration = symbol.getValueDeclaration();
            if (!valueDeclaration) return false;
            return this.isComponentFile(valueDeclaration.getType());
        });

        if (!namedExportSymbol) return null;

        const declarations = namedExportSymbol.getDeclarations();
        if (declarations.length === 0) return null;

        const declaration = declarations[0];
        let expression: Expression | null = null;

        if (Node.isExportAssignment(declaration)) {
            expression = declaration.getExpression();
        } else if (Node.isVariableDeclaration(declaration)) {
            expression = declaration.getInitializer()!;
        } else if (Node.isExportSpecifier(declaration)) {
            const localTargetSymbol = declaration.getLocalTargetSymbol();
            if (localTargetSymbol) {
                const localDeclarations = localTargetSymbol.getDeclarations();
                if (localDeclarations.length > 0) {
                    const localDeclaration = localDeclarations[0];
                    if (Node.isVariableDeclaration(localDeclaration)) {
                        expression = localDeclaration.getInitializer()!;
                    }
                }
            }
        }
        return expression;
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