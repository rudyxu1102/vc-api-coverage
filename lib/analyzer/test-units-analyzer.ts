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
        // 收集所有的导入组件
        this.collectComponentImports();
        
        // 分析传统的挂载方法调用
        this.analyzeTraditionalMountCalls();
        
        // 分析所有的组件创建函数调用 (包括createVNode以及任意函数名)
        this.analyzeComponentCreationCalls();

        return this.result;
    }
    
    private collectComponentImports() {
        traverse(this.ast, {
            ImportDeclaration: (path) => {
                const source = path.node.source.value;
                
                if (source.endsWith(".tsx") || source.endsWith(".vue") || source.endsWith(".jsx") || source.endsWith(".ts")) {
                    path.node.specifiers.forEach(specifier => {
                        // Handle default imports
                        if (t.isImportDefaultSpecifier(specifier) && t.isIdentifier(specifier.local)) {
                            // 保存完整的导入路径
                            this.importedComponents.set(specifier.local.name, source);
                        }
                        // Handle named imports
                        else if (t.isImportSpecifier(specifier) && t.isIdentifier(specifier.local)) {
                            this.importedComponents.set(specifier.local.name, source);
                        }
                    });
                }
            }
        });
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
    
    private analyzeComponentCreationCalls() {
        const skipFunctions = new Set(['mount', 'shallowMount', 'it', 'describe', 'test', 'expect']);
        
        traverse(this.ast, {
            CallExpression: (path) => {
                // 排除已知的非组件创建函数
                if (t.isIdentifier(path.node.callee) && skipFunctions.has(path.node.callee.name)) {
                    return;
                }
                
                // 检查是否是render函数调用
                if (t.isIdentifier(path.node.callee) && path.node.callee.name === 'render') {
                    // 如果第一个参数是箭头函数
                    const firstArg = path.node.arguments[0];
                    if (t.isArrowFunctionExpression(firstArg) && firstArg.body) {
                        // 如果箭头函数体是一个createVNode调用
                        if (t.isCallExpression(firstArg.body)) {
                            this.analyzeComponentCreationNode(firstArg.body);
                        }
                    }
                    return;
                }
                
                // 检查函数调用的第一个参数是否为我们已知的组件
                this.analyzeComponentCreationNode(path.node);
            }
        });
    }
    
    private analyzeComponentCreationNode(callExprNode: t.CallExpression) {
        // 检查函数调用的第一个参数是否为我们已知的组件
        if (callExprNode.arguments.length > 0) {
            const componentArg = callExprNode.arguments[0];
            
            // 检查组件参数是否为标识符
            if (t.isIdentifier(componentArg)) {
                const componentName = componentArg.name;
                const componentFile = this.importedComponents.get(componentName);
                
                if (componentFile) {
                    // 只要函数调用的第一个参数是组件，我们就认为这是一个组件创建函数
                    // 这样可以捕获 createVNode, h, jsx, _createVNode 等任意名称的函数
                    
                    if (!this.result[componentFile]) {
                        this.result[componentFile] = {};
                    }
                    
                    // 初始化组件对象的各个属性
                    this.result[componentFile].props = this.result[componentFile].props || [];
                    this.result[componentFile].emits = this.result[componentFile].emits || [];
                    this.result[componentFile].slots = this.result[componentFile].slots || [];
                    
                    // 检查是否有属性对象（第二个参数）
                    if (callExprNode.arguments.length > 1 && t.isObjectExpression(callExprNode.arguments[1])) {
                        const propsObject = callExprNode.arguments[1];
                        
                        // 提取属性和事件
                        propsObject.properties.forEach(prop => {
                            if (t.isObjectProperty(prop) && (t.isIdentifier(prop.key) || t.isStringLiteral(prop.key))) {
                                let propName = '';
                                
                                if (t.isIdentifier(prop.key)) {
                                    propName = prop.key.name;
                                } else if (t.isStringLiteral(prop.key)) {
                                    propName = prop.key.value;
                                }
                                
                                // 处理事件处理器 (onClick, onChange, etc.)
                                if (propName.startsWith('on') && propName.length > 2) {
                                    const eventName = propName.charAt(2).toLowerCase() + propName.slice(3);
                                    this.result[componentFile].emits = [...new Set([...this.result[componentFile].emits!, eventName])];
                                } else {
                                    // 普通属性
                                    this.result[componentFile].props = [...new Set([...this.result[componentFile].props!, propName])];
                                }
                            }
                        });
                    }
                    
                    // 检查是否有插槽对象（第三个参数）
                    if (callExprNode.arguments.length > 2 && t.isObjectExpression(callExprNode.arguments[2])) {
                        const slotsObject = callExprNode.arguments[2];
                        
                        // 提取插槽名称
                        slotsObject.properties.forEach(prop => {
                            if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                                const slotName = prop.key.name;
                                this.result[componentFile].slots = [...new Set([...this.result[componentFile].slots!, slotName])];
                            }
                        });
                    }
                }
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