import { resolveExportedPathBabel } from '../../lib/common/export-parser'
import { describe, it, expect } from 'vitest'

describe('resolveExportedPathBabel', () => {
    it('should return the correct path', () => {
        const path = resolveExportedPathBabel('export { Button } from "./Button"', 'Button')
        expect(path).toBe('./Button')
    })

    it('should return the correct path', () => {
        const path = resolveExportedPathBabel('import aaa from "src/Button"; export { aaa as Button };', 'Button')
        expect(path).toBe('src/Button')
    })
})