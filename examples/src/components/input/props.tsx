import { PropType } from "vue";
import { InputSize } from "./type";

export  const allprops = {
    value: { type: [String, Number], default: '' },
    placeholder: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
    type: { type: String, default: 'text' },
    size: { type: String as PropType<InputSize>, default: 'md' },
    clearable: { type: Boolean, default: false },
    prefix: { type: String, default: '' },
  }
  