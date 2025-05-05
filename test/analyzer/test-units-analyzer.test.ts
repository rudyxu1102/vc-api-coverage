import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeTestUnits } from '../../lib/analyzer/test-units-analyzer'

describe('test-units-analyzer', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })
    it('should analyze props in test units', () => {
        const code = `
            import Button from "./Button.tsx";
            import Input from "./Input.tsx";
            import { describe, it, expect } from 'vitest';

            describe('Button / Input', () => {
                it('[Button] should render correctly', () => {
                    const wrapper = shallowMount(Button, {
                        props: {
                            size: 'large',
                            type: 'primary'
                        }
                    })
                })
                it('[Input] should render correctly', () => {
                    const wrapper = shallowMount(Input, {
                        props: {
                            size: 'large',
                        }
                    })
                })
            })
        `

        const res = analyzeTestUnits(code)
        expect(res['Button'].props).toEqual(['size', 'type'])
        expect(res['Input'].props).toEqual(['size'])
    })

    it('should analyze emits in test units', () => {
        const code = `
            import Button from "./Button.tsx";
            import Input from "./Input.tsx";
            import { describe, it, expect } from 'vitest';

            describe('Button / Input', () => {
                it('[Button] should emit click event', () => {
                    const wrapper = shallowMount(Button, {
                        props: {
                            onClick: () => {}
                        }
                    })
                })

                it('[Input] should emit input event', () => {
                    const wrapper = shallowMount(Input, {
                        props: {
                            onChange: () => {}
                        }
                    })
                })
            })
        `
        
        const res = analyzeTestUnits(code)
        expect(res['Button'].emits).toEqual(['click'])
        expect(res['Input'].emits).toEqual(['change'])
    })

    it('should analyze slots in test units', () => {
        const code = `
            import Button from "./Button.tsx";
            import Input from "./Input.tsx";
            import { describe, it, expect } from 'vitest';

            describe('Button', () => {
                it('[Button] should render correctly', () => {
                    const wrapper = shallowMount(Button, {
                        slots: {
                            default: 'Button'
                        }
                    })
                })

                it('[Input] should render correctly', () => {
                    const wrapper = shallowMount(Input, {
                        slots: {
                            default: 'Input'
                        }
                    })
                })
            })
        `

        const res = analyzeTestUnits(code)
        expect(res['Button'].slots).toEqual(['default'])
        expect(res['Input'].slots).toEqual(['default'])
    })
})