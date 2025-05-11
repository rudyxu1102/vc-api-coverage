import { describe, it, expect, vi, beforeEach } from 'vitest'
import TestUnitAnalyzer from '../../lib/analyzer/test-units-analyzer'
import * as fs from 'fs'
describe('test-units-analyzer', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })
    it('should analyze props in test units', () => {
        const fakeTestFilePath = './test/fixtures/units/prop-analyzer.test.ts'
        const res = new TestUnitAnalyzer(fakeTestFilePath).analyze()
        for (const key in res) {
            expect(res[key].props).toEqual(['size', 'type'])
        }
    })

})