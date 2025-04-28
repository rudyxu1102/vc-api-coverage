import { defineComponent, ref, SlotsType, VNode } from 'vue';
const expose = ['focus']
const emits = ['click', 'hover']
export default defineComponent({
  name: 'MyButton',

  props: {
    label: { type: String, required: true },
    size: { type: String, default: 'md' },
    disabled: { type: Boolean, default: false },
  },

  slots: Object as SlotsType<{
    default?: () => VNode[];
    icon?: () => VNode[];
  }>,

  // 2. Emits 定义
  emits,

  expose,

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
