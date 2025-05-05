import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeTestUnits } from '../../lib/analyzer/test-units-analyzer'

describe('test-units-analyzer', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })
    it('should analyze props in test units', () => {
        const code = `
            import Button from "src/components/Button.tsx";
            import Input from "src/components/Input.vue";
            import { describe, it, expect } from 'vitest';

            describe('components', () => {
                it('should render correctly 1', () => {
                    const wrapper = shallowMount(Button, {
                        props: {
                            size: 'large',
                            type: 'primary'
                        }
                    })
                })
                it('should render correctly 2', () => {
                    const wrapper = shallowMount(Input, {
                        props: {
                            size: 'large',
                        }
                    })
                })
            })
        `

        const res = analyzeTestUnits(code)
        expect(res['src/components/Button.tsx'].props).toEqual(['size', 'type'])
        expect(res['src/components/Input.vue'].props).toEqual(['size'])
    })

    it('should analyze emits in test units', () => {
        const code = `
            import Button from "src/components/Button.tsx";
            import Input from "src/components/Input.vue";
            import { describe, it, expect } from 'vitest';

            describe('components', () => {
                it('should emit click event 1', () => {
                    const wrapper = shallowMount(Button, {
                        props: {
                            onClick: () => {}
                        }
                    })
                })

                it('should emit input event 2', () => {
                    const wrapper = shallowMount(Input, {
                        props: {
                            onChange: () => {},
                            'onUpdate:modelValue': () => {}
                        }
                    })
                })
            })
        `
        
        const res = analyzeTestUnits(code)
        expect(res['src/components/Button.tsx'].emits).toEqual(['click'])
        expect(res['src/components/Input.vue'].emits).toEqual(['change', 'update:modelValue'])
    })

    it('should analyze slots in test units', () => {
        const code = `
            import Button from "src/components/Button.tsx";
            import Input from "src/components/Input.vue";
            import { describe, it, expect } from 'vitest';

            describe('components', () => {
                it('should render correctly 1', () => {
                    const wrapper = shallowMount(Button, {
                        slots: {
                            default: 'Button'
                        }
                    })
                })

                it('should render correctly2', () => {
                    const wrapper = shallowMount(Input, {
                        slots: {
                            default: 'Input'
                        }
                    })
                })
            })
        `

        const res = analyzeTestUnits(code)
        expect(res['src/components/Button.tsx'].slots).toEqual(['default'])
        expect(res['src/components/Input.vue'].slots).toEqual(['default'])
    })


    it('should analyze props in jsx', () => {
        const code = `
            import { render } from '@testing-library/vue';
            import Button from 'src/components/Button.tsx';

            describe('Button', () => {
                it('should render correctly', () => {
                    render(() => <Button size="large" type="primary"/>)
                })
            })
        `

        const res = analyzeTestUnits(code)
        expect(res['src/components/Button.tsx'].props).toEqual(['size', 'type'])
    })

    it('should analyze emits in jsx', () => {
        const code = `
            import { render } from '@testing-library/vue';
            import Button from 'src/components/Button.tsx';

            describe('Button', () => {
                it('should emit click event', () => {
                    const wrapper = render(() => <Button onClick={() => {}}/>)
                })
            })
        `

        const res = analyzeTestUnits(code)
        expect(res['src/components/Button.tsx'].emits).toEqual(['click'])
    })

    it('should analyze slots in jsx', () => {
        const code = `
            import { render } from '@testing-library/vue';
            import Button from 'src/components/Button.tsx';

            describe('Button', () => {
                it('should render correctly', () => {
                    render(() => <Button>123</Button>)
                })
            })
        `
        const res = analyzeTestUnits(code)
        expect(res['src/components/Button.tsx'].slots).toEqual(['default'])
    })

    it('should analyze slots in jsx', () => {
        const code = `
            import { render } from '@testing-library/vue';
            import Button from 'src/components/Button.vue';

            describe('Button', () => {
                it('should render correctly', () => {
                    render(() => (
                        <Button>
                            {{
                                default: () => <div>测试内容</div>,
                                footer: () => <div>底部内容</div>
                            }}
                        </Button>
                        
                    ))
                })
            })
        `
        const res = analyzeTestUnits(code)
        expect(res['src/components/Button.vue'].slots).toEqual(['default', 'footer'])
    })


})