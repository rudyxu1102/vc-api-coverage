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
            import Button from 'src/components/Button.tsx';
            import { createVNode} from 'vue'

            describe('Button', () => {
                it('should render correctly', () => {
                    createVNode(Button, {
                        size: 'large',
                        type: 'primary'
                    })
                })
            })
        `

        const res = analyzeTestUnits(code)
        expect(res['src/components/Button.tsx'].props).toEqual(['size', 'type'])
    })

    it('should analyze emits in jsx', () => {
        const code = `
            import Button from 'src/components/Button.tsx';
            import { createVNode} from 'vue'

            describe('Button', () => {
                it('should emit click event', () => {
                    createVNode(Button, {
                        onClick: () => {}
                    })
                })
            })
        `

        const res = analyzeTestUnits(code)
        expect(res['src/components/Button.tsx'].emits).toEqual(['click'])
    })

    it('should analyze default slot in jsx', () => {
        const code = `
            import Button from 'src/components/Button.tsx';
            import { createVNode} from 'vue'

            describe('Button', () => {
                it('should render correctly', () => {
                    createVNode(Button, {}, {
                        default: () => '123'
                    })
                })
            })
        `
        const res = analyzeTestUnits(code)
        expect(res['src/components/Button.tsx'].slots).toEqual(['default'])
    })

    it('should analyze muti slots in jsx', () => {
        const code = `
            import Button from 'src/components/Button.vue';
            import { createVNode } from 'vue'

            describe('Button', () => {
                it('should render correctly', () => {
                    createVNode(Button, {}, {
                        default: () => '123',
                        footer: () => '456'
                    })
                })
            })
        `
        const res = analyzeTestUnits(code)
        expect(res['src/components/Button.vue'].slots).toEqual(['default', 'footer'])
    })

    it('should analyze props in jsx with _createVNode', () => {
        const code = `
            import Button from 'src/components/Button.tsx';
            import { createVNode as _createVNode } from 'vue'

            describe('Button', () => {
                it('should render correctly', () => {
                    _createVNode(Button, {
                        size: 'large',
                        type: 'primary'
                    })
                })
            })
        `

        const res = analyzeTestUnits(code)
        expect(res['src/components/Button.tsx'].props).toEqual(['size', 'type'])
    })

    it('should analyze props in jsx with render', () => {
        const code = `
            import Button from 'src/components/Button.tsx';
            import { createVNode as _createVNode, createTextVNode as _createTextVNode } from 'vue'
            import { render, fireEvent } from '@testing-library/vue'

            describe('Button', () => {
                it('可点击', async () => {
                    const onClick = vi.fn();
                    const {
                        getByRole
                } = render(() => _createVNode(Button, {
                    "onClick": onClick  
                    }, {
                    default: () => [_createTextVNode("123")]
                }), {});
                    const button = getByRole('button');
                    fireEvent.click(button);
                    expect(onClick).toHaveBeenCalled();
                    expect(onClick).toHaveBeenCalledWith(expect.any(MouseEvent));
                });
            });
        `

        const res = analyzeTestUnits(code)
        expect(res['src/components/Button.tsx'].emits).toEqual(['click'])
        expect(res['src/components/Button.tsx'].slots).toEqual(['default'])
    })


})