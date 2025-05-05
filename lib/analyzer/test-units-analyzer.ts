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
    private importedComponents: Map<string, string> = new Map();
    private result: TestUnitsResult = {};
    
    constructor(ast: ParseResult<File>) {
        this.ast = ast;
    }

    public analyze(): TestUnitsResult {
        // 首先收集所有的导入组件
        traverse(this.ast, {
            ImportDeclaration: (path) => {
                const source = path.node.source.value;
                
                if (source.endsWith(".tsx") || source.endsWith(".vue") || source.endsWith(".jsx")) {
                    path.node.specifiers.forEach(specifier => {
                        if (t.isImportDefaultSpecifier(specifier) && t.isIdentifier(specifier.local)) {
                            // 保存完整的导入路径
                            this.importedComponents.set(specifier.local.name, source);
                        }
                    });
                }
            }
        });
        
        // 分析传统的挂载方法调用
        this.analyzeTraditionalMountCalls();
        
        // 分析所有的JSX元素
        this.analyzeJsxElements();

        return this.result;
    }
    
    private analyzeTraditionalMountCalls() {
        traverse(this.ast, {
            CallExpression: (path) => {
                // 查找 it('...', () => {}) 语句内的挂载调用
                if (
                    t.isIdentifier(path.node.callee) && 
                    path.node.callee.name === 'it' && 
                    t.isStringLiteral(path.node.arguments[0])
                ) {
                    // 查找 shallowMount 或 mount 调用
                    path.traverse({
                        CallExpression: (mountPath) => {
                            if (
                                t.isIdentifier(mountPath.node.callee) && 
                                (mountPath.node.callee.name === 'shallowMount' || mountPath.node.callee.name === 'mount')
                            ) {
                                const componentArg = mountPath.node.arguments[0];
                                if (t.isIdentifier(componentArg)) {
                                    const componentName = componentArg.name;
                                    const componentFile = this.importedComponents.get(componentName);
                                    
                                    if (componentFile) {
                                        if (!this.result[componentFile]) {
                                            this.result[componentFile] = {};
                                        }
                                        
                                        // 检查第二个参数（选项对象）
                                        const options = mountPath.node.arguments[1];
                                        if (options && t.isObjectExpression(options)) {
                                            this.extractProps(options, this.result[componentFile]);
                                            this.extractEmits(options, this.result[componentFile]);
                                            this.extractSlots(options, this.result[componentFile]);
                                        }
                                    }
                                }
                            }
                        }
                    });
                }
            }
        });
    }
    
    private analyzeJsxElements() {
        // 直接遍历所有JSX元素
        traverse(this.ast, {
            JSXElement: (jsxPath) => {
                const jsxOpeningElement = jsxPath.node.openingElement;
                
                // 获取组件名称
                if (t.isJSXIdentifier(jsxOpeningElement.name)) {
                    const componentName = jsxOpeningElement.name.name;
                    const componentFile = this.importedComponents.get(componentName);
                    
                    if (componentFile) {
                        if (!this.result[componentFile]) {
                            this.result[componentFile] = {};
                        }
                        
                        // 分析JSX属性
                        this.extractJsxProps(jsxOpeningElement, this.result[componentFile]);
                        
                        // 分析JSX子元素作为插槽
                        this.extractJsxSlots(jsxPath.node, this.result[componentFile]);
                    }
                }
            }
        });
    }
    
    private extractJsxProps(jsxElement: t.JSXOpeningElement, component: TestUnit) {
        // 遍历所有JSX属性
        jsxElement.attributes.forEach(attr => {
            if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
                const attrName = attr.name.name;
                
                // 处理事件监听器 (onClick等)
                if (attrName.startsWith('on') && attrName.length > 2) {
                    // 提取事件名 (onClick -> click)
                    const eventName = attrName.charAt(2).toLowerCase() + attrName.slice(3);
                    
                    // 添加到组件的emits列表
                    component.emits = component.emits || [];
                    component.emits = [...new Set([...component.emits, eventName])];
                } else {
                    // 普通属性
                    component.props = component.props || [];
                    component.props = [...new Set([...component.props, attrName])];
                }
            }
        });
    }
    
    private extractJsxSlots(jsxElement: t.JSXElement, component: TestUnit) {
        // 检查是否有子元素
        if (jsxElement.children && jsxElement.children.length > 0) {
            // 检查是否有类似 {{default: () => <div>...</div>, footer: () => <div>...</div>}} 的插槽
            const jsxExprContainer = jsxElement.children.find(child => 
                t.isJSXExpressionContainer(child) && 
                t.isObjectExpression((child as t.JSXExpressionContainer).expression)
            );
            
            component.slots = component.slots || [];
            
            if (jsxExprContainer && t.isJSXExpressionContainer(jsxExprContainer) && t.isObjectExpression(jsxExprContainer.expression)) {
                // 提取命名插槽
                const namedSlots = jsxExprContainer.expression.properties
                    .filter(prop => t.isObjectProperty(prop) && t.isIdentifier((prop as t.ObjectProperty).key))
                    .map(prop => {
                        const key = (prop as t.ObjectProperty).key;
                        return t.isIdentifier(key) ? key.name : '';
                    })
                    .filter(name => name !== '');
                
                component.slots = [...new Set([...component.slots, ...namedSlots])];
            } else {
                // 如果有普通子元素，则视为默认插槽
                component.slots = [...new Set([...component.slots, 'default'])];
            }
        }
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

            component.props = component.props || [];
            component.props = [...new Set([...component.props, ...props])];
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
                .filter(prop => t.isObjectProperty(prop) && (t.isIdentifier(prop.key) || t.isStringLiteral(prop.key)))
                .map(prop => {
                    const key = (prop as t.ObjectProperty).key;
                    
                    if (t.isIdentifier(key) && key.name.startsWith('on') && key.name.length > 2) {
                        // 提取 onClick -> click, onChange -> change
                        return key.name.charAt(2).toLowerCase() + key.name.slice(3);
                    } else if (t.isStringLiteral(key) && key.value.startsWith('on')) {
                        // 处理 'onUpdate:modelValue' 这样的情况
                        const eventName = key.value.slice(2); // 移除 'on' 前缀
                        
                        // 确保第一个字母是小写
                        return eventName.charAt(0).toLowerCase() + eventName.slice(1);
                    }
                    
                    return null;
                })
                .filter(Boolean) as string[];

            if (emitProps.length > 0) {
                component.emits = component.emits || [];
                component.emits = [...new Set([...component.emits, ...emitProps])];
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

            if (slots.length > 0) {
                component.slots = component.slots || [];
                component.slots = [...new Set([...component.slots, ...slots])];
            }
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