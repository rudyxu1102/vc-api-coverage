import { defineComponent } from 'vue';

export default defineComponent({
  name: 'MyButton',

  props: {
    size: String,
    type: String,
  },


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
