import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import Input from './index';
import { render, screen } from '@testing-library/vue';

describe('Input.tsx', () => {
  // 测试 props
  it('renders with default props', () => {
    const wrapper = mount(Input);
    const input = wrapper.find('input');
    
    expect(input.exists()).toBe(true);
    expect(input.attributes('type')).toBe('text');
    expect(input.attributes('disabled')).toBeUndefined();
    expect(wrapper.classes()).toContain('input-md');
  });


  it('size prop', () => {
    const { container } = render(() => <Input size="sm" />);
    expect(container.querySelector('.input-sm')).not.toBeNull();
  })

  it('renders with custom props', () => {
    const wrapper = mount(Input, {
      props: {
        modelValue: 'test value',
        placeholder: 'Enter text',
        disabled: true,
        type: 'password',
        clearable: true,
      }
    });
    
    const input = wrapper.find('input');
    expect(input.element.value).toBe('test value');
    expect(input.attributes('placeholder')).toBe('Enter text');
    expect(input.attributes('disabled')).toBeDefined();
    expect(input.attributes('type')).toBe('password');
    expect(wrapper.classes()).toContain('disabled');
  });

  // 测试 v-model
  it('handles v-model correctly', async () => {
    const wrapper = mount(Input, {
      props: {
        modelValue: '',
        'onUpdate:modelValue': (e: string) => wrapper.setProps({ modelValue: e })
      }
    });
    
    const input = wrapper.find('input');
    await input.setValue('new value');
    
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['new value']);
    expect(input.element.value).toBe('new value');
  });

  // 测试 events
  it('emits focus and blur events', async () => {
    const focusFn = vi.fn()
    const blurFn = vi.fn()
    const wrapper = mount(Input, {
      props: {
        onFocus: focusFn,
        onBlur: blurFn
      }
    });
    const input = wrapper.find('input');
    
    await input.trigger('focus');
    expect(focusFn).toHaveBeenCalled()
    
    await input.trigger('blur');
    expect(blurFn).toHaveBeenCalled()
  });

  // 测试 clearable
  it('handles clear functionality', async () => {
    const clearFn = vi.fn()
    const wrapper = mount(Input, {
      props: {
        modelValue: 'test value',
        clearable: true,
        onClear: clearFn,
        'onUpdate:modelValue': (e: string) => wrapper.setProps({ modelValue: e })
      }
    });
    
    expect(wrapper.find('.clear-icon').exists()).toBe(true);
    
    await wrapper.find('.clear-icon').trigger('click');
    expect(clearFn).toHaveBeenCalled()
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['']);
  });

  // 测试 slots
  it('renders prefix and suffix slots', () => {
    const wrapper = mount(Input, {
      slots: {
        prefix: '<span class="prefix">$</span>',
        suffix: '<span class="suffix">USD</span>',
        clearIcon: '<span class="custom-clear">Clear</span>'
      },
      props: {
        modelValue: 'test',
        clearable: true
      }
    });
    
    expect(wrapper.find('.prefix').exists()).toBe(true);
    expect(wrapper.find('.prefix').text()).toBe('$');
    expect(wrapper.find('.suffix').exists()).toBe(true);
    expect(wrapper.find('.suffix').text()).toBe('USD');
    expect(wrapper.find('.custom-clear').exists()).toBe(true);
    expect(wrapper.find('.custom-clear').text()).toBe('Clear');
  });

  // 测试 expose 的方法
  it('exposes focus, select and clear methods', () => {
    const wrapper = mount(Input, {
      props: {
        modelValue: 'test value'
      }
    });
    
    expect((wrapper.vm as any).focus).toBeDefined();
    expect((wrapper.vm as any).select).toBeDefined();
    expect((wrapper.vm as any).clear).toBeDefined();
    
    // 调用方法
    (wrapper.vm as any).focus();
    (wrapper.vm as any).select();
    (wrapper.vm as any).clear();
  });
});
