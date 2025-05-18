import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import { Button } from '../index';

describe('Button.tsx', () => {

  it('renders emits click', async () => {
    const fn = vi.fn()
    const wrapper = mount({
      template: '<Button @click="fn" />',
      components: {
        Button: Button
      },
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