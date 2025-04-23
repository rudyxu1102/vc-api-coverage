import { defineComponent, ref, SlotsType, VNode } from 'vue';


export default defineComponent({
  name: 'MyButton',

  props: {
    label: { type: String, required: true },
    size: { type: String, default: 'md' },
    disabled: { type: Boolean, default: false },
  },

  slots: Object as SlotsType<{
    default: () => VNode[];
    icon: () => VNode[];
  }>,

  // 2. Emits 定义
  emits: {
      click: (payload: MouseEvent) => payload instanceof MouseEvent, // 带验证器
      hover: null // 无验证器
  },
  // 也可以用 defineEmits: const emit = defineEmits<{(e: 'click', payload: MouseEvent): void; (e: 'hover'): void}>()

  setup(props, { emit, slots, expose }) {
    const buttonRef = ref<HTMLButtonElement | null>(null);

    const handleClick = (event: MouseEvent) => {
      if (!props.disabled) {
        emit('click', event);
      }
    };

    const focus = () => {
      buttonRef.value?.focus();
    };

    const blur = () => { // 这个方法未暴露
       buttonRef.value?.blur();
    };

    // 3. Expose 定义
    expose({ focus });

    return () => (
      <button
        ref={buttonRef}
        class={`button button-${props.size ?? 'md'}`}
        disabled={props.disabled}
        onClick={handleClick}
        onMouseover={() => emit('hover')}
      >
        {/* 4. Slot 使用 */}
        {slots.default ? slots.default() : props.label}
        {slots.icon?.()} {/* 使用名为 icon 的插槽，但测试中可能不提供 */}
      </button>
    );
  },
}); 