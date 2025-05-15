import { SourceFile, Node } from "ts-morph";

class ComponentAnalyzer {
    private sourceFile: SourceFile;
    private props: string[] = [];
    private slots: string[] = [];
    constructor(sourceFile: SourceFile) {
        this.sourceFile = sourceFile;
    }

    analyze() {
        this.analyzeProps();
        this.analyzeSlots();
        return {
            props: this.props,
            slots: this.slots
        }
    }

    analyzeProps() {
        const defaultExport = this.sourceFile.getDefaultExportSymbol();
        const internalProps = [ 'key', 'ref', 'ref_for', 'ref_key', 'onVnodeBeforeMount', 'onVnodeMounted', 'onVnodeBeforeUpdate', 'onVnodeUpdated', 'onVnodeBeforeUnmount', 'onVnodeUnmounted', 'class', 'style' ];
        if (!defaultExport) return
        const exportAssignmentDeclaration = defaultExport.getDeclarations()[0];
        if (!exportAssignmentDeclaration || !Node.isExportAssignment(exportAssignmentDeclaration)) return
        const exportedExpression = exportAssignmentDeclaration.getExpression();
        if (!exportedExpression) return
        const componentType = exportedExpression.getType(); // 获取 'aaaa' 的类型
        const constructSignatures = componentType.getConstructSignatures();
        if (constructSignatures.length === 0) return
        const instanceType = constructSignatures[0].getReturnType();
        const dollarPropsSymbol = instanceType.getProperty('$props');
        if (!dollarPropsSymbol) return
        const dollarPropsType = dollarPropsSymbol.getTypeAtLocation(exportedExpression);
        dollarPropsType.getProperties().forEach(propSymbol => {
            const propName = propSymbol.getName();
            // const propType = propSymbol.getTypeAtLocation(exportedExpression);
            if (internalProps.includes(propName)) {
                return;
            }

            this.props.push(propName);
        });
    }

    analyzeSlots() {
        const defaultExport = this.sourceFile.getDefaultExportSymbol();
        if (!defaultExport) return
        const exportAssignmentDeclaration = defaultExport.getDeclarations()[0];
        if (!exportAssignmentDeclaration || !Node.isExportAssignment(exportAssignmentDeclaration)) return
        const exportedExpression = exportAssignmentDeclaration.getExpression();
        if (!exportedExpression) return
        const componentType = exportedExpression.getType(); // 获取 'aaaa' 的类型
        const constructSignatures = componentType.getConstructSignatures();
        if (constructSignatures.length === 0) return
        const instanceType = constructSignatures[0].getReturnType();
        const dollarPropsSymbol = instanceType.getProperty('$slots');
        if (!dollarPropsSymbol) return
        const dollarPropsType = dollarPropsSymbol.getTypeAtLocation(exportedExpression);
        dollarPropsType.getProperties().forEach(propSymbol => {
            const propName = propSymbol.getName();
            // const propType = propSymbol.getTypeAtLocation(exportedExpression);
            console.log(propName);
            this.props.push(propName);
        });
    }
}

export default ComponentAnalyzer;