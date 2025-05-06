import { parse } from '@babel/parser'
import traverse from '@babel/traverse'
import type {
    ExportNamedDeclaration,
    ImportDeclaration,
    Identifier,
    ExportSpecifier
} from '@babel/types'

// 返回值类型更新为包含来源信息
export interface ExportResolution {
    // 当为外部模块时，包含相对路径；当为本地声明时为null
    relativeSpecifier: string | null;
    // 表示导出类型
    type: 'external' | 'local-declaration' | 'local-reference' | 'default';
}

export function resolveExportedPathBabel(
    sourceCode: string,
    exportName: string
): string | null {

    const ast = parse(sourceCode, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx'],
    })

    const importMap = new Map<string, string>() // localName -> source

    let foundPath: string | null = null

    traverse(ast, {
        ImportDeclaration(path) {
            const node = path.node as ImportDeclaration
            const source = node.source.value
            for (const specifier of node.specifiers) {
                if (specifier.type === 'ImportSpecifier') {
                    importMap.set(specifier.local.name, source)
                } else if (specifier.type === 'ImportDefaultSpecifier') {
                    importMap.set(specifier.local.name, source)
                } else if (specifier.type === 'ImportNamespaceSpecifier') {
                    importMap.set(specifier.local.name, source)
                }
            }
        },

        ExportNamedDeclaration(path) {
            const node = path.node as ExportNamedDeclaration

            // ✅ 方式一： export { Button } from './Button'
            if (node.source && node.specifiers.length > 0) {
                const match = node.specifiers.find(s => (s.exported as Identifier).name === exportName)
                if (match) {
                    foundPath = node.source.value
                    path.stop()
                }
            }

            // ✅ 方式二：先 import Button，再 export { Button }
            if (!node.source && node.specifiers.length > 0) {
                const match = node.specifiers.find(s => (s.exported as Identifier).name === exportName)
                if (match) {
                    const localName = (match as ExportSpecifier).local.name
                    const importSource = importMap.get(localName)
                    if (importSource) {
                        foundPath = importSource
                        path.stop()
                    }
                }
            }
        },
    })

    if (!foundPath) {
        console.warn(`Export "${exportName}" not found `)
        return null
    }


    return foundPath;
}
