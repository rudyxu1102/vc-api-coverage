import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import Button from './Button';

describe('Button.tsx', () => {
  it('renders label and emits click', async () => {
    const labelText = 'Click Me';
    const wrapper = mount(Button, {
      props: {
        label: labelText,
        // size: 'sm', // size 未覆盖
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
    // hover 事件未检查

    // 检查 expose.focus (未覆盖)
    // wrapper.vm.focus(); // 这行会报错，因为 setup 返回的是 render 函数，不是实例
    // 对于 defineComponent + setup 返回 render 函数，访问 expose 需要特殊处理或挂载配置
    // 但我们的 reporter 只需要检测测试代码中是否有 wrapper.vm.focus() 的调用即可

    // console.log(wrapper.vm); // 调试用
  });

 it('renders label when no slot', () => {
     const labelText = 'Default Label';
     const wrapper = mount(Button, {
       props: { label: labelText }
     });
     expect(wrapper.text()).toBe(labelText);
  });

}); 