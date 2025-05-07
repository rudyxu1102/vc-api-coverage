import type { ParseResult } from '@babel/parser';
import type { File } from '@babel/types';
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { resolveExportedPathBabel } from '../common/export-parser';
import type { ViteDevServer } from 'vite';
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
    private vitenode?: ViteDevServer;
    
    constructor(ast: ParseResult<File>, vitenode?: ViteDevServer) {
        this.ast = ast;
        this.vitenode = vitenode;
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
    
    // 获取导入的组件
    public getImportedComponents(): Map<string, string> {
        return this.importedComponents;
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
                            const moduleId = `${this.vitenode?.config.root}${source}`
                            // 通过vitenode.moduleGraph.getModuleById(testModule.moduleId)获取到模块的绝对路径
                            const module = this.vitenode?.moduleGraph.getModuleById(moduleId);
                            const code = module?.transformResult?.code || ''
                            const name = specifier.local.name
                            const path = resolveExportedPathBabel(code, name)
                            if (path) {
                                this.importedComponents.set(specifier.local.name,  path);
                            }
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
                    // 检查测试用例中是否包含expect断言
                    let hasExpect = false;
                    
                    // 遍历当前测试用例体内所有函数调用，检查是否有expect调用
                    path.traverse({
                        CallExpression: (innerPath) => {
                            if (t.isIdentifier(innerPath.node.callee) && innerPath.node.callee.name === 'expect') {
                                hasExpect = true;
                            }
                        }
                    });
                    
                    // 如果没有expect断言，则跳过该测试用例
                    if (!hasExpect) {
                        return;
                    }
                    
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
        
        // 首先找到所有包含expect断言的测试用例的范围
        const testBlocksWithExpect = new Set<t.CallExpression>();
        
        // 收集所有包含expect断言的测试块
        traverse(this.ast, {
            CallExpression: (path) => {
                if (
                    t.isIdentifier(path.node.callee) && 
                    (path.node.callee.name === 'it' || path.node.callee.name === 'test')
                ) {
                    // 检查是否包含expect断言
                    let hasExpect = false;
                    path.traverse({
                        CallExpression: (innerPath) => {
                            if (t.isIdentifier(innerPath.node.callee) && innerPath.node.callee.name === 'expect') {
                                hasExpect = true;
                            }
                        }
                    });
                    
                    if (hasExpect) {
                        testBlocksWithExpect.add(path.node);
                    }
                }
            }
        });
        
        traverse(this.ast, {
            CallExpression: (path) => {
                // 排除已知的非组件创建函数
                if (t.isIdentifier(path.node.callee) && skipFunctions.has(path.node.callee.name)) {
                    return;
                }
                
                // 检查当前调用是否在包含expect断言的测试块内
                let isInTestWithExpect = false;
                let currentPath: any = path;
                
                while (currentPath && !isInTestWithExpect) {
                    // 向上查找父级CallExpression节点
                    currentPath = currentPath.findParent((p: any) => p.isCallExpression());
                    
                    if (!currentPath) break;
                    
                    if (t.isIdentifier(currentPath.node.callee) && 
                        (currentPath.node.callee.name === 'it' || currentPath.node.callee.name === 'test')) {
                        // 检查当前测试块是否包含expect断言
                        isInTestWithExpect = testBlocksWithExpect.has(currentPath.node);
                        break;
                    }
                }
                
                // 如果不在包含expect断言的测试块内，则跳过
                if (!isInTestWithExpect) {
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
                                    this.result[componentFile].emits = [...new Set([...this.result[componentFile].emits!, propName])];
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
                        return key.name
                    } else if (t.isStringLiteral(key) && key.value.startsWith('on')) {
                        return key.value
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

export function analyzeTestUnits(code: string, vitenode?: ViteDevServer) {
    const ast = parser.parse(code, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx'], // 测试文件也可能用 TSX
        errorRecovery: true, // 增加容错性，避免因单个测试文件解析失败中断
    });
    
    // 分析测试用例
    const analyzer = new TestUnitAnalyzer(ast, vitenode);
    const result = analyzer.analyze();
    
    // 确保所有导入的组件都有一个条目
    analyzer.getImportedComponents().forEach((path) => {
        if (!result[path]) {
            result[path] = { props: [], emits: [], slots: [] };
        } else {
            result[path].props = result[path].props || [];
            result[path].emits = result[path].emits || [];
            result[path].slots = result[path].slots || [];
        }
    });
    
    return result;
}