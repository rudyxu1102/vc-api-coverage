import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeTestUnits } from '../../lib/analyzer/test-units-analyzer'

describe('test-units-analyzer', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })
    it('should analyze props in test units', () => {
        const code = `
            import Button from './Button.tsx;
            import { describe, it, expect } from 'vitest';

            describe('Button', () => {
                it('should render correctly', () => {
                    const wrapper = shallowMount(Button, {
                        props: {
                            size: 'large',
                            type: 'primary'
                        }
                    })
                })
            })
        `

        const res = analyzeTestUnits(code)
        expect(res['Button'].props).toEqual(['size', 'primary'])
    })

    it('should analyze emits in test units', () => {
        const code = `
            import Button from './Button.tsx;
            import { describe, it, expect } from 'vitest';

            describe('Button', () => {
                it('should emit click event', () => {
                    const wrapper = shallowMount(Button, {
                        props: {
                            onClick: () => {}
                        }
                    })
                })
            })
        `
        
        const res = analyzeTestUnits(code)
        expect(res['Button'].emits).toEqual(['click'])
    })

    it('should analyze slots in test units', () => {
        const code = `
            import Button from './Button.tsx;
            import { describe, it, expect } from 'vitest';

            describe('Button', () => {
                it('should render correctly', () => {
                    const wrapper = shallowMount(Button, {
                        slots: {
                            default: 'Button'
                        }
                    })
                })
            })
        `

        const res = analyzeTestUnits(code)
        expect(res['Button'].slots).toEqual(['default'])
    })
})