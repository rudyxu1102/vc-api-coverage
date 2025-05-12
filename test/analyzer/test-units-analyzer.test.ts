import { describe, it, expect, vi, beforeEach } from 'vitest'
import TestUnitAnalyzer from '../../lib/analyzer/test-units-analyzer'
import { Project } from 'ts-morph'

describe('test-units-analyzer', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })
    it('should analyze props in test units', () => {
        const fakeTestFilePath = './prop-analyzer.test.tsx'
        const project = new Project()
        const sourceFile = project.createSourceFile(fakeTestFilePath, `
            import Button from './Button';
            import { describe, it, expect, test } from 'vitest';
            import { shallowMount } from '@vue/test-utils'
            import { render } from '@testing-library/vue'

            describe('components', () => {
                test('should render correctly 1', () => {
                    const wrapper = shallowMount(Button, {
                        props: {
                            type: 'primary'
                        }
                    })
                    expect(1).toBe(1)
                })
                it('should render correctly 1', () => {
                    render(() => <Button size="large"></Button>, {})
                    expect(1).toBe(1)
                })
            })
        `)
        project.createSourceFile('./Button.tsx', `
            export default defineComponent({
                name: 'Button',
                props: {
                    size: String,
                    type: String
                }
            })
        `)
        const res = new TestUnitAnalyzer(sourceFile, project).analyze()
        for (const key in res) {
            expect(res[key].props).toEqual(['type', 'size'])
        }
    })

})