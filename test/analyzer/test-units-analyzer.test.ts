import { describe, it, expect, vi, beforeEach } from 'vitest'
import TestUnitAnalyzer from '../../lib/analyzer/test-units-analyzer'
import { Project } from 'ts-morph'

describe('test-units-analyzer', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })
    // it('should analyze props in test units', () => {
    //     const fakeTestFilePath = './prop-analyzer.test.tsx'
    //     const project = new Project()
    //     const sourceFile = project.createSourceFile(fakeTestFilePath, `
    //         import Button from 'src/components/Button.tsx';
    //         import { describe, it, expect, test } from 'vitest';
    //         import { shallowMount } from '@vue/test-utils'
    //         import { render } from '@testing-library/vue'

    //         describe('components', () => {
    //             test('should render correctly 1', () => {
    //                 const wrapper = shallowMount(Button, {
    //                     props: {
    //                         type: 'primary'
    //                     }
    //                 })
    //                 expect(1).toBe(1)
    //             })
    //             it('should render correctly 1', () => {
    //                 render(() => <Button size="large"></Button>, {})
    //                 expect(1).toBe(1)
    //             })
    //         })
    //     `)
    //     const res = new TestUnitAnalyzer(sourceFile, project).analyze()
    //     expect(res['src/components/Button.tsx'].props).toEqual(['type', 'size'])
    // })
    it('should analyze emits in test units', () => {
        const fakeTestFilePath = './emits-analyzer.test.tsx'
        const project = new Project()
        const sourceFile = project.createSourceFile(fakeTestFilePath, `
            import Button from 'src/components/Button.tsx';
            import { describe, it, expect, test } from 'vitest';
            import { shallowMount } from '@vue/test-utils'
            import { render } from '@testing-library/vue'

            describe('components', () => {
                test('should render correctly 1', () => {
                    const onClick = vi.fn()
                    const wrapper = shallowMount(Button, {
                        props: {
                            type: 'primary',
                            onClick,
                        }
                    })
                    expect(1).toBe(1)
                })
            })
        `)
        const res = new TestUnitAnalyzer(sourceFile, project).analyze()
        expect(res['src/components/Button.tsx'].emits).toEqual(['click'])
    })

    // it('should analyze slots in test units', () => {
    //     const fakeTestFilePath = './slots-analyzer.test.tsx'
    //     const project = new Project()
    //     const sourceFile = project.createSourceFile(fakeTestFilePath, `
    //         import Button from 'src/components/Button.tsx';
    //         import { describe, it, expect, test } from 'vitest';
    //         import { shallowMount } from '@vue/test-utils'
    //         import { render } from '@testing-library/vue'

    //         describe('components', () => {
    //             test('should render correctly 1', () => {
    //                 const wrapper = shallowMount(Button, {
    //                     slots: {
    //                         default: 'Hello World'
    //                     }
    //                 })
    //                 expect(wrapper.text()).toBe('Hello World')
    //             })
    //             it('should render correctly 1', () => {
    //                 render(() => <Button>{{ header: () => 'Hello World' }}</Button>, {})
    //                 expect(1).toBe(1)
    //             })
    //         })
    //     `)
    //     const res = new TestUnitAnalyzer(sourceFile, project).analyze()
    //     expect(res['src/components/Button.tsx'].slots).toEqual(['default', 'header'])
    // })

})