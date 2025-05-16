import { commonProps } from './common'
import { aaa } from '../common'
import { SlotsType, VNode } from 'vue';

export const buttonProps = {
    ...commonProps,
    label: { type: String, required: true },
    size: { type: String, default: 'md' },
    disabled: { type: Boolean, default: false },
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