import type { ParseResult } from '@babel/parser';
import type { File } from '@babel/types';
import * as parser from '@babel/parser';

class TestUnitAnalyzer {
    private ast: ParseResult<File>;
    constructor(ast: ParseResult<File>) {
        this.ast = ast;
    }

    public analyze() {
        return this.ast
    }
}

export function analyzeTestUnits(code: string) {
    console.log(code)
    const ast = parser.parse(code, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx'], // 测试文件也可能用 TSX
        errorRecovery: true, // 增加容错性，避免因单个测试文件解析失败中断
    });
    const analyzer = new TestUnitAnalyzer(ast);
    return analyzer.analyze()
}