import type { ParseResult } from '@babel/parser';
import type { File } from '@babel/types';
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';

interface TestUnit {
    props?: string[];
    emits?: string[];
    slots?: string[];
}

interface TestUnitsResult {
    [componentName: string]: TestUnit;
}

class TestUnitAnalyzer {
    private ast: ParseResult<File>;
    
    constructor(ast: ParseResult<File>) {
        this.ast = ast;
    }

    public analyze(): TestUnitsResult {
        const result: TestUnitsResult = {};
        
        traverse(this.ast, {
            CallExpression: (path) => {
                // 查找 it('[ComponentName] ...', () => {}) 语句
                if (
                    t.isIdentifier(path.node.callee) && 
                    path.node.callee.name === 'it' && 
                    t.isStringLiteral(path.node.arguments[0])
                ) {
                    const itDescription = path.node.arguments[0].value;
                    // 从描述中提取组件名，格式为 '[ComponentName] ...'
                    const componentNameMatch = itDescription.match(/\[([^\]]+)\]/);
                    if (componentNameMatch && componentNameMatch[1]) {
                        const componentName = componentNameMatch[1];
                        if (!result[componentName]) {
                            result[componentName] = {};
                        }

                        // 查找 shallowMount 或 mount 调用
                        path.traverse({
                            CallExpression: (mountPath) => {
                                if (
                                    t.isIdentifier(mountPath.node.callee) && 
                                    (mountPath.node.callee.name === 'shallowMount' || mountPath.node.callee.name === 'mount')
                                ) {
                                    // 检查第二个参数（选项对象）
                                    const options = mountPath.node.arguments[1];
                                    if (options && t.isObjectExpression(options)) {
                                        this.extractProps(options, result[componentName]);
                                        this.extractEmits(options, result[componentName]);
                                        this.extractSlots(options, result[componentName]);
                                    }
                                }
                            }
                        });
                    }
                }
            }
        });

        return result;
    }

    private extractProps(options: t.ObjectExpression, component: TestUnit) {
        const propsProperty = options.properties.find(
            prop => t.isObjectProperty(prop) && 
                   t.isIdentifier(prop.key) && 
                   prop.key.name === 'props'
        );

        if (propsProperty && t.isObjectProperty(propsProperty) && t.isObjectExpression(propsProperty.value)) {
            const props = propsProperty.value.properties.map(prop => {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                    return prop.key.name;
                }
                return null;
            }).filter(Boolean) as string[];

            component.props = props;
        }
    }

    private extractEmits(options: t.ObjectExpression, component: TestUnit) {
        const propsProperty = options.properties.find(
            prop => t.isObjectProperty(prop) && 
                   t.isIdentifier(prop.key) && 
                   prop.key.name === 'props'
        );

        if (propsProperty && t.isObjectProperty(propsProperty) && t.isObjectExpression(propsProperty.value)) {
            // 检查 props 中是否有 onClick 等事件处理器
            const emitProps = propsProperty.value.properties
                .filter(prop => t.isObjectProperty(prop) && t.isIdentifier(prop.key))
                .map(prop => {
                    const key = (prop as t.ObjectProperty).key as t.Identifier;
                    if (key.name.startsWith('on') && key.name.length > 2) {
                        // 提取 onClick -> click, onChange -> change
                        return key.name.charAt(2).toLowerCase() + key.name.slice(3);
                    }
                    return null;
                })
                .filter(Boolean) as string[];

            if (emitProps.length > 0) {
                component.emits = emitProps;
            }
        }
    }

    private extractSlots(options: t.ObjectExpression, component: TestUnit) {
        const slotsProperty = options.properties.find(
            prop => t.isObjectProperty(prop) && 
                   t.isIdentifier(prop.key) && 
                   prop.key.name === 'slots'
        );

        if (slotsProperty && t.isObjectProperty(slotsProperty) && t.isObjectExpression(slotsProperty.value)) {
            const slots = slotsProperty.value.properties.map(prop => {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                    return prop.key.name;
                }
                return null;
            }).filter(Boolean) as string[];

            component.slots = slots;
        }
    }
}

export function analyzeTestUnits(code: string) {
    const ast = parser.parse(code, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx'], // 测试文件也可能用 TSX
        errorRecovery: true, // 增加容错性，避免因单个测试文件解析失败中断
    });
    const analyzer = new TestUnitAnalyzer(ast);
    return analyzer.analyze();
}