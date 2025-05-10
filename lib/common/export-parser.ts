import { Project } from 'ts-morph'

// 返回值类型更新为包含来源信息
export interface ExportResolution {
    // 当为外部模块时，包含相对路径；当为本地声明时为null
    relativeSpecifier: string | null;
    // 表示导出类型
    type: 'external' | 'local-declaration' | 'local-reference' | 'default';
}

export function resolveExportedPath(
    sourceCode: string,
    exportName: string
): string | null {
    // Create a project and add source file from string
    const project = new Project()
    const sourceFile = project.createSourceFile('temp.ts', sourceCode)

    let foundPath: string | null = null

    // Create a map to track imports
    const importMap = new Map<string, string>() // localName -> source

    // Process all import declarations
    sourceFile.getImportDeclarations().forEach(importDecl => {
        const source = importDecl.getModuleSpecifierValue()
        
        // Handle named imports
        importDecl.getNamedImports().forEach(namedImport => {
            importMap.set(namedImport.getName(), source)
        })
        
        // Handle default imports
        const defaultImport = importDecl.getDefaultImport()
        if (defaultImport) {
            importMap.set(defaultImport.getText(), source)
        }
        
        // Handle namespace imports
        const namespaceImport = importDecl.getNamespaceImport()
        if (namespaceImport) {
            importMap.set(namespaceImport.getText(), source)
        }
    })

    // Process all export declarations
    sourceFile.getExportDeclarations().forEach(exportDecl => {
        const moduleSpecifier = exportDecl.getModuleSpecifier()
        
        // ✅ 方式一： export { Button } from './Button'
        if (moduleSpecifier) {
            const namedExports = exportDecl.getNamedExports()
            for (const namedExport of namedExports) {
                const name = namedExport.getName()
                const aliasNode = namedExport.getAliasNode()
                const exportedName = aliasNode ? aliasNode.getText() : name
                
                if (exportedName === exportName) {
                    foundPath = moduleSpecifier.getLiteralValue()
                    return
                }
            }
        } 
        // ✅ 方式二：先 import Button，再 export { Button }
        else {
            const namedExports = exportDecl.getNamedExports()
            for (const namedExport of namedExports) {
                const name = namedExport.getName()
                const aliasNode = namedExport.getAliasNode()
                const exportedName = aliasNode ? aliasNode.getText() : name
                
                if (exportedName === exportName) {
                    const importSource = importMap.get(name)
                    if (importSource) {
                        foundPath = importSource
                        return
                    }
                }
            }
        }
    })

    return foundPath;
}
