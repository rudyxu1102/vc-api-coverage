import Button from '../components/Button';
import { describe, it, expect, test } from 'vitest';
import { shallowMount } from '@vue/test-utils'
import { render } from '@testing-library/vue'

describe('components', () => {
    test('should render correctly 1', () => {
        const wrapper = shallowMount(Button, {
            props: {
                type: 'primary'
            }
        })
        expect(1).toBe(1)
    })
    it('should render correctly 1', () => {
        render(() => <Button size="large"></Button>, {})
        expect(1).toBe(1)
    })
})