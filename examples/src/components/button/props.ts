import { commonProps } from './common'
import { aaa } from '../common'
import { SlotsType, VNode, PropType } from 'vue';
import { ButtonSize, ButtonType } from './type';

export const buttonProps = {
    ...commonProps,
    label: { type: String, required: true },
    size: { type: String as PropType<ButtonSize>, default: 'md' },
    disabled: { type: Boolean, default: false },
    variant: { type: String as PropType<ButtonType>, default: 'primary' },
    content: { type: [String, Function], default: ''},
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
