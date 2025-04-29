import { commonProps } from './common'

export const buttonProps = {
    ...commonProps,
    label: { type: String, required: true },
    size: { type: String, default: 'md' },
    disabled: { type: Boolean, default: false },
}

