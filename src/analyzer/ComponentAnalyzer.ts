import { SourceFile, Node, Type, Expression, ObjectLiteralExpression, SyntaxKind } from "ts-morph";
import { isComponentType } from "../common/utils";
import { PropVariant, PropWithVariants } from "../types";

class ComponentAnalyzer {
    private sourceFile: SourceFile;
    private props = new Set<string>();
    private propsWithVariants: PropWithVariants[] = [];
    private slots = new Set<string>();
    private exposes = new Set<string>();
    private code: string;
    private strictMode: boolean;

    constructor(sourceFile: SourceFile, strictMode: boolean = false) {
        this.sourceFile = sourceFile;
        this.code = sourceFile.getFullText();
        this.strictMode = strictMode;
    }

    analyze() {
        this.analyzerComponentType();
        return {
            props: Array.from(this.props),
            propsWithVariants: this.strictMode ? this.propsWithVariants : undefined,
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

            // In strict mode, extract variants for union types
            if (this.strictMode) {
                const propType = propSymbol.getTypeAtLocation(exportedExpression);
                const variants = this.extractVariantsFromType(propType);
                if (variants.length > 0) {
                    this.propsWithVariants.push({
                        name: propName,
                        variants
                    });
                }
            }
        });
    }

    private extractVariantsFromType(type: Type): PropVariant[] {
        const variants: PropVariant[] = [];

        // Check if it's a union type
        if (type.isUnion()) {
            const unionTypes = type.getUnionTypes();

            for (const unionType of unionTypes) {
                // Skip undefined and null types
                if (unionType.isUndefined() || unionType.isNull()) {
                    continue;
                }

                const variant = this.getVariantFromType(unionType);
                if (variant) {
                    // Also skip variants that are undefined or null
                    if (variant.type !== 'undefined' && variant.type !== 'null') {
                        variants.push(variant);
                    }
                }
            }
        } else {
            // Not a union, but might be boolean which we want to expand
            const variant = this.getVariantFromType(type);
            if (variant && variant.type === 'boolean') {
                // Expand boolean to true and false
                variants.push({ type: 'literal', value: true });
                variants.push({ type: 'literal', value: false });
            }
        }

        return variants;
    }

    private getVariantFromType(type: Type): PropVariant | null {
        // Literal types (string, number, boolean literals)
        if (type.isLiteral()) {
            const literalValue = type.getLiteralValue();
            return {
                type: 'literal',
                value: literalValue as string | number | boolean
            };
        }

        // Boolean type (expand to true/false)
        if (type.isBoolean()) {
            // Return a marker that this is boolean type
            // Will be expanded to true/false in extractVariantsFromType
            return { type: 'boolean', value: 'boolean' };
        }

        // String type
        if (type.isString()) {
            return { type: 'string', value: 'string' };
        }

        // Number type
        if (type.isNumber()) {
            return { type: 'number', value: 'number' };
        }

        // Undefined
        if (type.isUndefined()) {
            return { type: 'undefined', value: undefined };
        }

        // Null
        if (type.isNull()) {
            return { type: 'null', value: null };
        }

        // Check for function signatures
        const callSignatures = type.getCallSignatures();
        if (callSignatures.length > 0) {
            return { type: 'function', value: 'function' };
        }

        // Object type (default)
        if (type.isObject() && !type.isArray()) {
            return { type: 'object', value: 'object' };
        }

        return null;
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
        return item.getText().replace(/['"`]/g, '');
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
        return item.getText().replace(/['"`]/g, '');
    }

    private getNameFromIdentifier(item: Expression): string {
        if (!Node.isIdentifier(item)) return item.getText().replace(/['"`]/g, '');
        const symbol = item.getSymbol();
        if (!symbol) return item.getText().replace(/['"`]/g, '');

        const declarations = symbol.getDeclarations();
        if (declarations.length === 0) return item.getText().replace(/['"`]/g, '');
        
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
        return item.getText().replace(/['"`]/g, '');
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

        if (expression && isComponentType(expression.getType())) {
            return expression;
        }
        return null;
    }

    private getExportedExpressionFromNamed(): Expression | null {
        const namedExportSymbol = this.sourceFile.getExportSymbols().find(symbol => {
            const valueDeclaration = symbol.getValueDeclaration();
            if (!valueDeclaration) return false;
            return isComponentType(valueDeclaration.getType());
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