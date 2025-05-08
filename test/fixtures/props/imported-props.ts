export const buttonProps = {
  type: String,
  size: {
    type: String,
    default: 'medium'
  },
  disabled: Boolean,
  loading: Boolean,
  icon: String
};

export interface BaseProps {
  id: string;
  class: string;
}

export interface InputProps extends BaseProps {
  value: string;
  placeholder: string;
  disabled: boolean;
}

export type IconProps = {
  name: string;
  color?: string;
  size?: number;
}

// 交叉类型
export type AdvancedButtonProps = BaseProps & {
  primary: boolean;
  secondary: boolean;
}; 