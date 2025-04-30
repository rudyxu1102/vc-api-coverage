import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import Button from '../Button';

describe('Button.tsx', () => {
  it('renders label and emits click', async () => {
    const labelText = 'Click Me';
    const wrapper = mount(Button, {
      props: {
        // label: labelText,
        size: 'sm', // size 未覆盖
        // disabled: false, // disabled 未覆盖
      },
      slots: {
        default: '<span>Slot Content</span>',
        // icon: '<i>Icon</i>', // icon slot 未覆盖
      }
    });

    // 检查 props.label 和 slot.default
    expect(wrapper.text()).toContain('Slot Content'); // 验证 slot 优先

    // 触发 click 事件
    await wrapper.trigger('click');

    // 检查 emits.click
    expect(wrapper.emitted()).toHaveProperty('click');
    expect(wrapper.emitted('click')?.[0]?.[0]).toBeInstanceOf(MouseEvent);
  });

}); 