import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import Button from './Button';

describe('Button.tsx', () => {
  it('mock', () => {
    const mock = vi.fn();
    mock.mockReturnValue('test');
    expect(mock()).toBe('test');
  })

  it('renders label when no slot', () => {
    const labelText = 'Default Label';
    const wrapper = mount(Button, {
      props: { label: labelText }
    });
    expect(wrapper.text()).toBe(labelText);
  });
}); 