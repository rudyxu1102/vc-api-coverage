import { commonProps } from './common'
import { aaa } from '../common'
import { SlotsType, VNode, PropType } from 'vue';

export const buttonProps = {
    ...commonProps,
    label: { type: String, required: true },
    size: { type: String, default: 'md' },
    disabled: { type: Boolean, default: false },
    variant: { type: String as PropType<'primary' | 'secondary' | 'tertiary'>, default: 'primary' },
}


export const buttonEmits = ['click', 'hover']
export const buttonExpose = ['focus']
export const buttonSlots = Object as SlotsType<{
    default?: () => VNode[];
    icon?: () => VNode[];
  }>
export enum ButtonEvent {
    InfoClick = 'infoclick',
}
