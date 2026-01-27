import { describe, it, expect, vi, beforeEach } from 'vitest'
import TestUnitAnalyzer from '../../src/analyzer/UnitTestAnalyzer'
import { Project } from 'ts-morph'

describe('test-units-analyzer', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })
    it('should analyze props in test units', () => {
        const fakeTestFilePath = './prop-analyzer.test.tsx'
        const project = new Project({
            useInMemoryFileSystem: true
        })
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
                            Button: Button
                        }
                    })
                    expect(1).toBe(1)
                })
            })
        `)
        const res = new TestUnitAnalyzer(sourceFile, project).analyze()
        expect(res[`./ButtonProps.tsx`].props!.sort()).toEqual(['type', 'block', 'size', 'shape'].sort())
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
                            Button: Button
                        }
                    })
                    expect(1).toBe(1)
                })
            })
        `)
        const res = new TestUnitAnalyzer(sourceFile, project).analyze()
        expect(res[`./ButtonEmit.tsx`].emits!.sort()).toEqual(['onClick', 'onFocus', 'onHover', 'onChange', 'onUpdate:value'].sort())
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
                            Button: Button
                        }
                    })
                    expect(1).toBe(1)
                })
            })
        `)
        const res = new TestUnitAnalyzer(sourceFile, project).analyze()
        expect(res[`./ButtonSlot.tsx`].slots!.sort()).toEqual(['default', 'trigger', 'header'].sort())
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
                            Button: Button
                        }
                    })
                    expect(1).toBe(1)
                })
            })
        `)
        const res = new TestUnitAnalyzer(sourceFile, project).analyze()
        expect(res[`./ButtonSlot.tsx`].slots!.sort()).toEqual(['footer', 'header', 'trigger'].sort())
    })


    it('should analyze `v-slots` in test units without default slot', () => {
        const fakeTestFilePath = './slots-analyzer.test.tsx'
        const project = new Project()
        const sourceFile = project.createSourceFile(fakeTestFilePath, `
            import Button from './ButtonSlot.tsx';
            import { describe, it, expect, test } from 'vitest';
            import { shallowMount } from '@vue/test-utils'
            import { render } from '@testing-library/vue'

            describe('components', () => {
                it('should render correctly 1', () => {
                    render(() => <Button v-slots={{ header: () => 'Hello World' }}></Button>, {})
                    expect(1).toBe(1)
                })
            })
        `)
        const res = new TestUnitAnalyzer(sourceFile, project).analyze()
        expect(res[`./ButtonSlot.tsx`].slots!.sort()).toEqual(['header'].sort())
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
        expect(res[`./ButtonProps.tsx`]).toEqual(undefined)
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
        expect(res[`./ButtonProps.tsx`]).toEqual(undefined)
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
        expect(res[`./ButtonModel.tsx`].props!.sort()).toEqual(['value', 'visible', 'onUpdate:value', 'onUpdate:visible'].sort())
    })

    it('should analyze in test units with muti components', () => {
        const fakeTestFilePath = './multi-components.test.tsx'
        const project = new Project()
        const sourceFile = project.createSourceFile(fakeTestFilePath, `
            import Menu from './Menu.tsx';
            import MenuItem from './MenuItem.tsx';
            import { describe, it, expect, test } from 'vitest';
            import { shallowMount } from '@vue/test-utils'
            import { render } from '@testing-library/vue'

            describe('components', () => {
                it('should render correctly 1', () => {
                    render(() => <Menu type="vertical"><MenuItem size="large"/></Menu>, {})
                    expect(1).toBe(1)
                })
                it('should render correctly 2', () => {
                    mount({
                        template: '<Menu shape="round"><MenuItem label="test"/></Menu>',
                        components: {
                            MenuItem: MenuItem,
                            Menu: Menu,
                        }
                    })
                    expect(1).toBe(1)
                })
            })
        `)
        const res = new TestUnitAnalyzer(sourceFile, project).analyze()
        expect(res[`./Menu.tsx`].props!.sort()).toEqual(['shape', 'type'].sort())
        expect(res[`./MenuItem.tsx`].props!.sort()).toEqual(['label', 'size'].sort())
    })

    it('should analyze in test units', () => {
        const fakeTestFilePath = '/fake/multi-components.test.tsx'
        const project = new Project()
        project.createSourceFile('/fake/Menu.tsx', `
            import { defineComponent } from 'vue'
            export default defineComponent()
        `)
        project.createSourceFile('/fake/index.ts', `
            import Menu from './Menu.tsx'
            export default Menu;
        `)

        const sourceFile = project.createSourceFile(fakeTestFilePath, `
            import Menu from './index.ts';
            import { describe, it, expect, test } from 'vitest';
            import { shallowMount } from '@vue/test-utils'
            import { render } from '@testing-library/vue'

            describe('components', () => {
                it('should render correctly 2', () => {
                    mount({
                        template: '<Menu shape="round"></Menu>',
                        components: {
                            Menu,
                        }
                    })
                    expect(1).toBe(1)
                })
            })
        `)
        const res = new TestUnitAnalyzer(sourceFile, project).analyze()
        expect(res[`/fake/Menu.tsx`].props!.sort()).toEqual(['shape'].sort())
    })

    it('should analyze in test units', () => {
        const fakeTestFilePath = '/fake/multi-components.test.tsx'
        const project = new Project()
        project.createSourceFile('/fake/Menu.tsx', `
            import { defineComponent } from 'vue'
            export default defineComponent()
        `)
        project.createSourceFile('/fake/index.ts', `
            import Menu from './Menu.tsx'
            export { Menu };
        `)

        const sourceFile = project.createSourceFile(fakeTestFilePath, `
            import { Menu } from './index.ts';
            import { describe, it, expect, test } from 'vitest';
            import { shallowMount } from '@vue/test-utils'
            import { render } from '@testing-library/vue'

            describe('components', () => {
                it('should render correctly 2', () => {
                    mount({
                        template: '<Menu shape="round"></Menu>',
                        components: {
                            Menu,
                        }
                    })
                    expect(1).toBe(1)
                })
            })
        `)
        const res = new TestUnitAnalyzer(sourceFile, project).analyze()
        console.log(res)
        expect(res[`/fake/Menu.tsx`].props!.sort()).toEqual(['shape'].sort())
    })

    describe('strict mode - loop value detection', () => {
        it('should extract values from for...of loop', () => {
            const fakeTestFilePath = './loop-forof.test.tsx'
            const project = new Project()
            const sourceFile = project.createSourceFile(fakeTestFilePath, `
                import Button from './Button.tsx';
                import { describe, it, expect } from 'vitest';
                import { mount } from '@vue/test-utils'

                type ButtonSize = 'sm' | 'md' | 'lg';

                describe('Button', () => {
                    it('should render with size prop', () => {
                        const sizes: ButtonSize[] = ['sm', 'md'];
                        for (const s of sizes) {
                            const wrapper = mount(Button, {
                                props: {
                                    size: s
                                }
                            });
                            expect(wrapper.exists()).toBe(true);
                        }
                    })
                })
            `)
            const res = new TestUnitAnalyzer(sourceFile, project, true).analyze()
            expect(res[`./Button.tsx`].propValues).toBeDefined()
            expect(res[`./Button.tsx`].propValues!.length).toBe(2)
            expect(res[`./Button.tsx`].propValues!.map(pv => pv.value).sort()).toEqual(['sm', 'md'].sort())
        })

        it('should extract values from for...in loop', () => {
            const fakeTestFilePath = './loop-forin.test.tsx'
            const project = new Project()
            const sourceFile = project.createSourceFile(fakeTestFilePath, `
                import Button from './Button.tsx';
                import { describe, it, expect } from 'vitest';
                import { mount } from '@vue/test-utils'

                type ButtonSize = 'sm' | 'md' | 'lg';

                describe('Button', () => {
                    it('should render with size prop', () => {
                        const sizes: ButtonSize[] = ['sm', 'md'];
                        for (const i in sizes) {
                            const wrapper = mount(Button, {
                                props: {
                                    size: sizes[i]
                                }
                            });
                            expect(wrapper.exists()).toBe(true);
                        }
                    })
                })
            `)
            const res = new TestUnitAnalyzer(sourceFile, project, true).analyze()
            expect(res[`./Button.tsx`].propValues).toBeDefined()
            expect(res[`./Button.tsx`].propValues!.length).toBe(2)
            expect(res[`./Button.tsx`].propValues!.map(pv => pv.value).sort()).toEqual(['sm', 'md'].sort())
        })

        it('should extract values from array.forEach', () => {
            const fakeTestFilePath = './loop-foreach.test.tsx'
            const project = new Project()
            const sourceFile = project.createSourceFile(fakeTestFilePath, `
                import Button from './Button.tsx';
                import { describe, it, expect } from 'vitest';
                import { mount } from '@vue/test-utils'

                type ButtonSize = 'sm' | 'md' | 'lg';

                describe('Button', () => {
                    it('should render with size prop', () => {
                        const sizes: ButtonSize[] = ['sm', 'md'];
                        sizes.forEach(s => {
                            const wrapper = mount(Button, {
                                props: {
                                    size: s
                                }
                            });
                            expect(wrapper.exists()).toBe(true);
                        });
                    })
                })
            `)
            const res = new TestUnitAnalyzer(sourceFile, project, true).analyze()
            expect(res[`./Button.tsx`].propValues).toBeDefined()
            expect(res[`./Button.tsx`].propValues!.length).toBe(2)
            expect(res[`./Button.tsx`].propValues!.map(pv => pv.value).sort()).toEqual(['sm', 'md'].sort())
        })

        it('should extract values from array.map', () => {
            const fakeTestFilePath = './loop-map.test.tsx'
            const project = new Project()
            const sourceFile = project.createSourceFile(fakeTestFilePath, `
                import Button from './Button.tsx';
                import { describe, it, expect } from 'vitest';
                import { mount } from '@vue/test-utils'

                type ButtonSize = 'sm' | 'md' | 'lg';

                describe('Button', () => {
                    it('should render with size prop', () => {
                        const sizes: ButtonSize[] = ['sm', 'md'];
                        const wrappers = sizes.map(s => mount(Button, {
                            props: {
                                size: s
                            }
                        }));
                        wrappers.forEach(w => expect(w.exists()).toBe(true));
                    })
                })
            `)
            const res = new TestUnitAnalyzer(sourceFile, project, true).analyze()
            expect(res[`./Button.tsx`].propValues).toBeDefined()
            expect(res[`./Button.tsx`].propValues!.length).toBe(2)
            expect(res[`./Button.tsx`].propValues!.map(pv => pv.value).sort()).toEqual(['sm', 'md'].sort())
        })

        it('should extract values from JSX in for...of loop', () => {
            const fakeTestFilePath = './loop-jsx.test.tsx'
            const project = new Project()
            const sourceFile = project.createSourceFile(fakeTestFilePath, `
                import Button from './Button.tsx';
                import { describe, it, expect } from 'vitest';
                import { render } from '@testing-library/vue'

                type ButtonSize = 'sm' | 'md' | 'lg';

                describe('Button', () => {
                    it('should render with size prop', () => {
                        const sizes: ButtonSize[] = ['sm', 'md'];
                        for (const s of sizes) {
                            render(() => <Button size={s} />, {});
                            expect(1).toBe(1);
                        }
                    })
                })
            `)
            const res = new TestUnitAnalyzer(sourceFile, project, true).analyze()
            expect(res[`./Button.tsx`].propValues).toBeDefined()
            expect(res[`./Button.tsx`].propValues!.length).toBe(2)
            expect(res[`./Button.tsx`].propValues!.map(pv => pv.value).sort()).toEqual(['sm', 'md'].sort())
        })

        it('should extract ref assignments with direct access', () => {
            const fakeTestFilePath = './ref-direct-access.test.tsx'
            const project = new Project()
            const sourceFile = project.createSourceFile(fakeTestFilePath, `
                import Input from './Input.tsx';
                import { describe, it, expect } from 'vitest';
                import { render } from '@testing-library/vue'
                import { ref } from 'vue';

                type InputSize = 'sm' | 'md' | 'lg';

                describe('Input', () => {
                    it('should render with size prop using ref', () => {
                        const size = ref<InputSize>('sm');
                        render(() => <Input size={size.value} />, {});
                        expect(1).toBe(1);

                        size.value = 'lg';
                        render(() => <Input size={size.value} />, {});
                        expect(1).toBe(1);

                        size.value = 'md';
                        render(() => <Input size={size.value} />, {});
                        expect(1).toBe(1);
                    })
                })
            `)
            const res = new TestUnitAnalyzer(sourceFile, project, true).analyze()
            expect(res[`./Input.tsx`].propValues).toBeDefined()
            expect(res[`./Input.tsx`].propValues!.length).toBeGreaterThanOrEqual(3)

            const sizeValues = [...new Set(res[`./Input.tsx`].propValues!
                .filter(pv => pv.propName === 'size')
                .map(pv => pv.value))]
                .sort()
            expect(sizeValues).toEqual(['lg', 'md', 'sm'])
        })

        it('should extract ref assignments with type assertion', () => {
            const fakeTestFilePath = './ref-type-assertion.test.tsx'
            const project = new Project()
            const sourceFile = project.createSourceFile(fakeTestFilePath, `
                import Input from './Input.tsx';
                import { describe, it, expect } from 'vitest';
                import { render } from '@testing-library/vue'
                import { ref } from 'vue';

                type InputSize = 'sm' | 'md' | 'lg';

                describe('Input', () => {
                    it('should render with size prop using type assertion', () => {
                        const size = ref('sm');
                        render(() => <Input size={size.value as InputSize} />, {});
                        expect(1).toBe(1);

                        size.value = 'lg';
                        render(() => <Input size={size.value as InputSize} />, {});
                        expect(1).toBe(1);

                        size.value = 'md';
                        render(() => <Input size={size.value as InputSize} />, {});
                        expect(1).toBe(1);
                    })
                })
            `)
            const res = new TestUnitAnalyzer(sourceFile, project, true).analyze()
            expect(res[`./Input.tsx`].propValues).toBeDefined()
            expect(res[`./Input.tsx`].propValues!.length).toBeGreaterThanOrEqual(3)

            const sizeValues = [...new Set(res[`./Input.tsx`].propValues!
                .filter(pv => pv.propName === 'size')
                .map(pv => pv.value))]
                .sort()
            expect(sizeValues).toEqual(['lg', 'md', 'sm'])
        })

        it('should extract ref assignments with parentheses', () => {
            const fakeTestFilePath = './ref-parentheses.test.tsx'
            const project = new Project()
            const sourceFile = project.createSourceFile(fakeTestFilePath, `
                import Input from './Input.tsx';
                import { describe, it, expect } from 'vitest';
                import { render } from '@testing-library/vue'
                import { ref } from 'vue';

                type InputSize = 'sm' | 'md' | 'lg';

                describe('Input', () => {
                    it('should render with size prop using parentheses', () => {
                        const size = ref<InputSize>('sm');
                        render(() => <Input size={(size.value)} />, {});
                        expect(1).toBe(1);

                        size.value = 'lg';
                        render(() => <Input size={(size.value)} />, {});
                        expect(1).toBe(1);
                    })
                })
            `)
            const res = new TestUnitAnalyzer(sourceFile, project, true).analyze()
            expect(res[`./Input.tsx`].propValues).toBeDefined()
            expect(res[`./Input.tsx`].propValues!.length).toBeGreaterThanOrEqual(2)

            const sizeValues = [...new Set(res[`./Input.tsx`].propValues!
                .filter(pv => pv.propName === 'size')
                .map(pv => pv.value))]
                .sort()
            expect(sizeValues).toEqual(['lg', 'sm'])
        })

        it('should extract ref assignments with non-null assertion', () => {
            const fakeTestFilePath = './ref-non-null.test.tsx'
            const project = new Project()
            const sourceFile = project.createSourceFile(fakeTestFilePath, `
                import Input from './Input.tsx';
                import { describe, it, expect } from 'vitest';
                import { render } from '@testing-library/vue'
                import { ref } from 'vue';

                type InputSize = 'sm' | 'md' | 'lg';

                describe('Input', () => {
                    it('should render with size prop using non-null assertion', () => {
                        const size = ref<InputSize>('sm');
                        render(() => <Input size={size.value!} />, {});
                        expect(1).toBe(1);

                        size.value = 'md';
                        render(() => <Input size={size.value!} />, {});
                        expect(1).toBe(1);
                    })
                })
            `)
            const res = new TestUnitAnalyzer(sourceFile, project, true).analyze()
            expect(res[`./Input.tsx`].propValues).toBeDefined()
            expect(res[`./Input.tsx`].propValues!.length).toBeGreaterThanOrEqual(2)

            const sizeValues = [...new Set(res[`./Input.tsx`].propValues!
                .filter(pv => pv.propName === 'size')
                .map(pv => pv.value))]
                .sort()
            expect(sizeValues).toEqual(['md', 'sm'])
        })

        it('should extract ref assignments with combined wrappers', () => {
            const fakeTestFilePath = './ref-combined.test.tsx'
            const project = new Project()
            const sourceFile = project.createSourceFile(fakeTestFilePath, `
                import Input from './Input.tsx';
                import { describe, it, expect } from 'vitest';
                import { render } from '@testing-library/vue'
                import { ref } from 'vue';

                type InputSize = 'sm' | 'md' | 'lg';

                describe('Input', () => {
                    it('should render with size prop using combined wrappers', () => {
                        const size = ref('sm');
                        // Multiple wrappers: parentheses + type assertion
                        render(() => <Input size={(size.value as InputSize)} />, {});
                        expect(1).toBe(1);

                        size.value = 'lg';
                        render(() => <Input size={(size.value as InputSize)} />, {});
                        expect(1).toBe(1);
                    })
                })
            `)
            const res = new TestUnitAnalyzer(sourceFile, project, true).analyze()
            expect(res[`./Input.tsx`].propValues).toBeDefined()
            expect(res[`./Input.tsx`].propValues!.length).toBeGreaterThanOrEqual(2)

            const sizeValues = [...new Set(res[`./Input.tsx`].propValues!
                .filter(pv => pv.propName === 'size')
                .map(pv => pv.value))]
                .sort()
            expect(sizeValues).toEqual(['lg', 'sm'])
        })

        it('should extract ref assignments in mount options', () => {
            const fakeTestFilePath = './ref-mount-options.test.tsx'
            const project = new Project()
            const sourceFile = project.createSourceFile(fakeTestFilePath, `
                import Input from './Input.tsx';
                import { describe, it, expect } from 'vitest';
                import { mount } from '@vue/test-utils'
                import { ref } from 'vue';

                type InputSize = 'sm' | 'md' | 'lg';

                describe('Input', () => {
                    it('should render with size prop in mount options', () => {
                        const size = ref<InputSize>('sm');
                        const wrapper = mount(Input, {
                            props: {
                                size: size.value
                            }
                        });
                        expect(wrapper.exists()).toBe(true);

                        size.value = 'lg';
                        const wrapper2 = mount(Input, {
                            props: {
                                size: size.value
                            }
                        });
                        expect(wrapper2.exists()).toBe(true);
                    })
                })
            `)
            const res = new TestUnitAnalyzer(sourceFile, project, true).analyze()
            expect(res[`./Input.tsx`].propValues).toBeDefined()
            expect(res[`./Input.tsx`].propValues!.length).toBeGreaterThanOrEqual(1)

            const sizeValues = [...new Set(res[`./Input.tsx`].propValues!
                .filter(pv => pv.propName === 'size')
                .map(pv => pv.value))]
                .sort()
            // Should extract at least some ref values
            expect(sizeValues.length).toBeGreaterThan(0)
            // Should contain at least one of the assigned values
            expect(['sm', 'lg'].some(val => sizeValues.includes(val))).toBe(true)
        })

        it('should extract value type from v-model with PropertyAccessExpression', () => {
            const fakeTestFilePath = './vmodel-property-access.test.tsx'
            const project = new Project()
            const sourceFile = project.createSourceFile(fakeTestFilePath, `
                import Input from './Input.tsx';
                import { describe, it, expect } from 'vitest';
                import { render } from '@testing-library/vue'
                import { ref } from 'vue';

                describe('components', () => {
                    it('should handle v-model with string ref', () => {
                        const value = ref('initial value');
                        render(() => <Input v-model:value={value.value} />, {});
                        expect(1).toBe(1);
                    })

                    it('should handle v-model with number ref', () => {
                        const count = ref(42);
                        render(() => <Input v-model:value={count.value} />, {});
                        expect(1).toBe(1);
                    })

                    it('should handle v-model with boolean ref', () => {
                        const isActive = ref(true);
                        render(() => <Input v-model:value={isActive.value} />, {});
                        expect(1).toBe(1);
                    })
                })
            `)
            const res = new TestUnitAnalyzer(sourceFile, project, true).analyze()
            expect(res[`./Input.tsx`].propValues).toBeDefined()
            expect(res[`./Input.tsx`].propValues!.length).toBeGreaterThanOrEqual(3)

            const propValues = res[`./Input.tsx`].propValues!
            // Should extract the actual literal values from ref initialization or infer types
            const hasString = propValues.some(pv => pv.propName === 'value' && (pv.type === 'literal' && typeof pv.value === 'string' || pv.type === 'string'))
            const hasNumber = propValues.some(pv => pv.propName === 'value' && (pv.type === 'literal' && typeof pv.value === 'number' || pv.type === 'number'))
            const hasBoolean = propValues.some(pv => pv.propName === 'value' && (pv.type === 'literal' && typeof pv.value === 'boolean' || pv.type === 'boolean'))

            expect(hasString).toBe(true)
            expect(hasNumber).toBe(true)
            expect(hasBoolean).toBe(true)
        })
    })
})