import { describe, it, expect, vi, beforeEach } from 'vitest'
import TestUnitAnalyzer from '../../src/analyzer/UnitTestAnalyzer'
import { Project } from 'ts-morph'
import path from 'path'

const rootDir = path.resolve(__dirname, '../..')
describe('test-units-analyzer', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })
    it('should analyze props in test units', () => {
        const fakeTestFilePath = './prop-analyzer.test.tsx'
        const project = new Project()
        const sourceFile = project.createSourceFile(fakeTestFilePath, `
            import Button from './ButtonProps.tsx';
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
                    render(() => <Button size="large" />, {})
                    expect(1).toBe(1)
                })
                it('should render correctly 2', () => {
                    render(Button, {
                        props: {
                            block: true
                        }
                    })
                    expect(1).toBe(1)
                })
                it('should render correctly 3', () => {
                    mount({
                        template: '<Button shape="circle" />',
                        components: {
                            Button
                        }
                    })
                    expect(1).toBe(1)
                })
            })
        `)
        const res = new TestUnitAnalyzer(sourceFile, project).analyze()
        expect(res[`${rootDir}/ButtonProps.tsx`].props!.sort()).toEqual(['type', 'block', 'size', 'shape'].sort())
    })
    it('should analyze emits in test units', () => {
        const fakeTestFilePath = './emits-analyzer.test.tsx'
        const project = new Project()
        const sourceFile = project.createSourceFile(fakeTestFilePath, `
            import Button from './ButtonEmit.tsx';
            import { describe, it, expect, test } from 'vitest';
            import { shallowMount } from '@vue/test-utils'
            import { render } from '@testing-library/vue'

            describe('components', () => {
                test('should render correctly 1', () => {
                    const onClick = vi.fn()
                    const fn = vi.fn()
                    const wrapper = shallowMount(Button, {
                        props: {
                            type: 'primary',
                            onClick,
                            onFocus: fn
                        }
                    })
                    expect(1).toBe(1)
                })
                it('should render correctly 1', () => {
                    const onHover = vi.fn();
                    render(() => <Button onHover={onHover}></Button>, {});
                    expect(1).toBe(1)
                })
                it('should render correctly 2', () => {
                    mount({
                        template: '<Button shape="circle" @change="test" @update:value="test" />',
                        components: {
                            Button
                        }
                    })
                    expect(1).toBe(1)
                })
            })
        `)
        const res = new TestUnitAnalyzer(sourceFile, project).analyze()
        expect(res[`${rootDir}/ButtonEmit.tsx`].emits!.sort()).toEqual(['onClick', 'onFocus', 'onHover', 'onChange', 'onUpdate:value'].sort())
    })

    it('should analyze slots in test units', () => {
        const fakeTestFilePath = './slots-analyzer.test.tsx'
        const project = new Project()
        const sourceFile = project.createSourceFile(fakeTestFilePath, `
            import Button from './ButtonSlot.tsx';
            import { describe, it, expect, test } from 'vitest';
            import { shallowMount } from '@vue/test-utils'
            import { render } from '@testing-library/vue'

            describe('components', () => {
                test('should render correctly 1', () => {
                    const wrapper = shallowMount(Button, {
                        slots: {
                            default: 'Hello World'
                        }
                    })
                    expect(wrapper.text()).toBe('Hello World')
                })
                it('should render correctly 1', () => {
                    render(() => <Button>{{ header: () => 'Hello World' }}</Button>, {})
                    expect(1).toBe(1)
                })
                it('should render correctly 2', () => {
                    mount({
                        template: '<Button><template #trigger>Hello World</template></Button>',
                        components: {
                            Button
                        }
                    })
                    expect(1).toBe(1)
                })
            })
        `)
        const res = new TestUnitAnalyzer(sourceFile, project).analyze()
        expect(res[`${rootDir}/ButtonSlot.tsx`].slots!.sort()).toEqual(['default', 'trigger', 'header'].sort())
    })

    it('should analyze slots in test units without default slot', () => {
        const fakeTestFilePath = './slots-analyzer.test.tsx'
        const project = new Project()
        const sourceFile = project.createSourceFile(fakeTestFilePath, `
            import Button from './ButtonSlot.tsx';
            import { describe, it, expect, test } from 'vitest';
            import { shallowMount } from '@vue/test-utils'
            import { render } from '@testing-library/vue'

            describe('components', () => {
                test('should render correctly 1', () => {
                    const wrapper = shallowMount(Button, {
                        slots: {
                            footer: 'Hello World'
                        }
                    })
                    expect(wrapper.text()).toBe('Hello World')
                })
                it('should render correctly 1', () => {
                    render(() => <Button>{{ header: () => 'Hello World' }}</Button>, {})
                    expect(1).toBe(1)
                })
                it('should render correctly 2', () => {
                    mount({
                        template: '<Button><template #trigger>Hello World</template></Button>',
                        components: {
                            Button
                        }
                    })
                    expect(1).toBe(1)
                })
            })
        `)
        const res = new TestUnitAnalyzer(sourceFile, project).analyze()
        expect(res[`${rootDir}/ButtonSlot.tsx`].slots!.sort()).toEqual(['footer', 'header', 'trigger'].sort())
    })

    it('should not analyze props in `mount` test units without expect', () => {
        const fakeTestFilePath = './prop-analyzer.test.tsx'
        const project = new Project()
        const sourceFile = project.createSourceFile(fakeTestFilePath, `
            import Button from './ButtonProps.tsx';
            import { describe, it, expect, test } from 'vitest';
            import { shallowMount } from '@vue/test-utils'
            import { render } from '@testing-library/vue'

            describe('components', () => {
                test('should render correctly 1', () => {
                    const wrapper = shallowMount(Button, {
                        props: {
                            type: 'primary'
                        },
                    })
                })
            })
        `)
        const res = new TestUnitAnalyzer(sourceFile, project).analyze()
        expect(res[`${rootDir}/ButtonProps.tsx`]).toEqual(undefined)
    })

    it('should not analyze props in `jsx` test units without expect', () => {
        const fakeTestFilePath = './prop-analyzer.test.tsx'
        const project = new Project()
        const sourceFile = project.createSourceFile(fakeTestFilePath, `
            import Button from './ButtonProps.tsx';
            import { describe, it, expect, test } from 'vitest';
            import { shallowMount } from '@vue/test-utils'
            import { render } from '@testing-library/vue'

            describe('components', () => {
                it('should render correctly 1', () => {
                    render(() => <Button size="large"></Button>, {})
                })
            })
        `)
        const res = new TestUnitAnalyzer(sourceFile, project).analyze()
        expect(res[`${rootDir}/ButtonProps.tsx`]).toEqual(undefined)
    })

    it('should analyze v-model in test units', () => {
        const fakeTestFilePath = './model-analyzer.test.tsx'
        const project = new Project()
        const sourceFile = project.createSourceFile(fakeTestFilePath, `
            import Button from './ButtonModel.tsx';
            import { describe, it, expect, test } from 'vitest';
            import { shallowMount } from '@vue/test-utils'
            import { render } from '@testing-library/vue'

            describe('components', () => {
                it('should render correctly 1', () => {
                    render(() => <Button v-model={value} />, {})
                    expect(1).toBe(1)
                })

                it('should render correctly 1', () => {
                    render(() => <Button v-model:visible={value} />, {})
                    expect(1).toBe(1)
                })
            })
        `)
        const res = new TestUnitAnalyzer(sourceFile, project).analyze()
        expect(res[`${rootDir}/ButtonModel.tsx`].props!.sort()).toEqual(['value', 'visible', 'onUpdate:value', 'onUpdate:visible'].sort())
    })
})