import { SourceFile, Node } from "ts-morph";

class ComponentAnalyzer {
    private sourceFile: SourceFile;
    private props: string[] = [];

    constructor(sourceFile: SourceFile) {
        this.sourceFile = sourceFile;
    }

    analyze() {
        this.analyzeProps();
        return {
            props: this.props
        }
    }

    analyzeProps() {
        const defaultExport = this.sourceFile.getDefaultExportSymbol();
        const internalProps = [ 'key', 'ref', 'ref_for', 'ref_key', 'onVnodeBeforeMount', 'onVnodeMounted', 'onVnodeBeforeUpdate', 'onVnodeUpdated', 'onVnodeBeforeUnmount', 'onVnodeUnmounted', 'class', 'style' ];

        if (defaultExport) {
            const exportAssignmentDeclaration = defaultExport.getDeclarations()[0];
            if (exportAssignmentDeclaration && Node.isExportAssignment(exportAssignmentDeclaration)) {
                const exportedExpression = exportAssignmentDeclaration.getExpression();
                if (exportedExpression) {
                    const componentType = exportedExpression.getType(); // 获取 'aaaa' 的类型
                    const constructSignatures = componentType.getConstructSignatures();

                    if (constructSignatures.length > 0) {
                        const instanceType = constructSignatures[0].getReturnType();
                        const dollarPropsSymbol = instanceType.getProperty('$props');
                        if (dollarPropsSymbol) {
                            const dollarPropsType = dollarPropsSymbol.getTypeAtLocation(exportedExpression);
                            dollarPropsType.getProperties().forEach(propSymbol => {
                                const propName = propSymbol.getName();
                                // const propType = propSymbol.getTypeAtLocation(exportedExpression);
                                if (internalProps.includes(propName)) {
                                    return;
                                }

                                this.props.push(propName);
                            });
                        } else {
                            console.log("推断的实例类型上未找到 '$props' 属性。");
                        }
                    } else {
                        console.log("componentType (DefineComponent) 没有构造签名，无法推断实例类型。");
                    }
                } else {
                    console.error("无法从 ExportAssignment 获取表达式。");
                }
            }

        }
    }
}

export default ComponentAnalyzer;