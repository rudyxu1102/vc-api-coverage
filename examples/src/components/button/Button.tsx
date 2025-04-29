import { defineComponent, ref, SlotsType, VNode } from 'vue';
import { buttonProps, buttonEmits, buttonExpose, buttonSlots } from './props';


export default defineComponent({
  name: 'MyButton',

  props: buttonProps,

  slots: buttonSlots,

  // 2. Emits 定义
  emits: buttonEmits,

  expose: buttonExpose,

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
        {this.$slots.default ? this.$slots.default() : this.label}
        {this.$slots.icon?.()}
      </button>
    );
  },
}); 
