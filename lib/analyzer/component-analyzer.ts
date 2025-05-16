import { SourceFile, Node, Type, Expression } from "ts-morph";
import { toEventName } from '../common/utils';

class ComponentAnalyzer {
    private sourceFile: SourceFile;
    private props = new Set<string>();
    private slots = new Set<string>();
    private exposes = new Set<string>();
    private emits = new Set<string>();
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
            emits: Array.from(this.emits)
        }
    }

    analyzeProps(instanceType: Type, exportedExpression: Expression) {
        const internalProps = ['key', 'ref', 'ref_for', 'ref_key', 'onVnodeBeforeMount', 'onVnodeMounted', 'onVnodeBeforeUpdate', 'onVnodeUpdated', 'onVnodeBeforeUnmount', 'onVnodeUnmounted', 'class', 'style'];
        const dollarPropsSymbol = instanceType.getProperty('$props');
        if (!dollarPropsSymbol) return
        const dollarPropsType = dollarPropsSymbol.getTypeAtLocation(exportedExpression);
        dollarPropsType.getProperties().forEach(propSymbol => {
            const propName = propSymbol.getName();
            // const propType = propSymbol.getTypeAtLocation(exportedExpression);
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
    analyzerExpose() {
        this.analyzeExposeContextCalls();
        this.analyzeExposeArrayOption();
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

    analyzeExposeArrayOption() {
        const exposeArrayMatch = this.code.match(/expose\s*:\s*(?:\[\s*(['"][\w\s]+['"]|[\w\s]+),?\s*(['"][\w\s]+['"]|[\w\s]+)?\s*\]|(\w+))/g);
        if (!exposeArrayMatch) return;
        
        for (const match of exposeArrayMatch) {
          if (match.includes('[')) {
            const cleanMatch = match.replace(/expose\s*:\s*\[\s*/, '').replace(/\s*\]/, '');
            const exposeItems = cleanMatch.split(',').map(item => item.trim().replace(/['"]/g, ''));
            
            for (const item of exposeItems) {
              if (item && !this.exposes.has(item)) {
                this.exposes.add(item);
              }
            }
          } else {
            // 处理变量引用
            const variableName = match.replace(/expose\s*:\s*/, '');
            const variableMatch = this.code.match(new RegExp(`const\\s+${variableName}\\s*=\\s*\\[([^\\]]+)\\]`));
            
            if (variableMatch) {
              const exposeItems = variableMatch[1].split(',').map(item => item.trim().replace(/['"]/g, ''));
              for (const item of exposeItems) {
                if (item && !this.exposes.has(item)) {
                  this.exposes.add(item);
                }
              }
            }
          }
        }
    }


    analyzeEmits(instanceType: Type, exportedExpression: Expression) {
        const dollarPropsSymbol = instanceType.getProperty('$emit');
        if (!dollarPropsSymbol) return
        const dollarPropsType = dollarPropsSymbol.getTypeAtLocation(exportedExpression);
        const callSignatures = dollarPropsType.getCallSignatures();
        if (callSignatures.length === 0) return
        callSignatures.forEach((signature) => {
            const parameters = signature.getParameters();
            if (parameters.length > 0) {
                // 第一个参数通常是事件名称
                const eventParam = parameters[0];
                const eventParamType = eventParam.getTypeAtLocation(exportedExpression);
                const emitName = eventParamType.getText().replace(/'|"/g, '');
                if (emitName.includes('|')) {
                    const eventNames = emitName.split('|').map(name => toEventName(name.trim()));
                    eventNames.forEach(name => this.emits.add(name));
                } else {
                    const eventName = toEventName(emitName);
                    this.emits.add(eventName);
                }
            }
        });
        for (const emit of this.emits) {
            if (this.props.has(emit)) {
                this.props.delete(emit)
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

    analyzerComponentType() {
        const exportedExpression = this.getExportedExpression();
        if (!exportedExpression) return;
        const componentType = exportedExpression.getType();
        const constructSignatures = componentType.getConstructSignatures();
        if (constructSignatures.length === 0) return
        const instanceType = constructSignatures[0].getReturnType();
        this.analyzeProps(instanceType, exportedExpression);
        this.analyzeSlots(instanceType, exportedExpression);
        this.analyzeEmits(instanceType, exportedExpression);
        this.analyzerExpose();
    }
}

export default ComponentAnalyzer;