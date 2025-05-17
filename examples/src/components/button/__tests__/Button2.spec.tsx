import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import { Button } from '../index';

describe('Button.tsx', () => {
  it('renders size and slot', async () => {
    const wrapper = mount(Button, {
      props: {
        // label: labelText,
        size: 'sm', // size 未覆盖
        // disabled: false, // disabled 未覆盖
      },
      slots: {
        default: '<span>Slot Content</span>',
        icon: '<i>Icon</i>', // icon slot 未覆盖
      }
    });

    // 检查 props.label 和 slot.default
    expect(wrapper.text()).toContain('Slot Content'); // 验证 slot 优先
  });

  it('renders emits click', async () => {
    const fn = vi.fn()
    const wrapper = mount({
      components: {
        Button
      },
      template: '<Button @click="fn" />',
      data() {
        return {
          fn
        }
      }
    })
    wrapper.trigger('click')
    expect(fn).toHaveBeenCalled()
  })

}); 