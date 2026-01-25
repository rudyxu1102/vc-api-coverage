import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import Button from '../index';

describe('Button.tsx - Strict Mode Test', () => {
  it('renders with variant primary', () => {
    const wrapper = mount(Button, {
      props: {
        label: 'Click me',
        variant: 'primary'
      }
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('renders with variant secondary', () => {
    const wrapper = mount(Button, {
      props: {
        label: 'Click me',
        variant: 'secondary'
      }
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('renders with disabled true', () => {
    const wrapper = mount(Button, {
      props: {
        label: 'Click me',
        disabled: true
      }
    });
    expect(wrapper.find('button').attributes('disabled')).toBeDefined();
  });

  it('renders with disabled false', () => {
    const wrapper = mount(Button, {
      props: {
        label: 'Click me',
        disabled: false
      }
    });
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined();
  });
  it('renders with content as string', () => {
    const wrapper = mount(Button, {
      props: {
        label: 'Click me',
        content: 'Some content'
      }
    });
    expect(wrapper.find('button')).toBeDefined();
  });

  it('renders with content as function', () => {
    const wrapper = mount(Button, {
      props: {
        label: 'Click me',
        content: () => 'Dynamic content'
      }
    });
    expect(wrapper.find('button')).toBeDefined();
  });
});
