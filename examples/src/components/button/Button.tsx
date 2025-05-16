import { defineComponent } from 'vue';
import { buttonProps, buttonEmits, buttonExpose, buttonSlots, ButtonEvent } from './props';

export const Button = defineComponent({
  name: 'MyButton',

  props: buttonProps,

  slots: buttonSlots,

  // 2. Emits 定义
  emits: {
    [ButtonEvent.InfoClick]: (event: MouseEvent) => true,
  },

  expose: ['focus'] as string[],

  methods: {
    handleClick(event: MouseEvent) {
      if (!this.disabled) {
        this.$emit('click', event);
      }
    },
    focus() {
      (this.$refs.buttonRef as HTMLButtonElement)?.focus();
    },
  },

  render() {
    return (
      <button
        ref="buttonRef"
        class={`button button-${this.size}`}
        disabled={this.disabled}
        onClick={this.handleClick}
        onMouseover={() => this.$emit('hover')}
      >
        {this.$slots.default?.() || this.label}
      </button>
    );
  },
}); 
