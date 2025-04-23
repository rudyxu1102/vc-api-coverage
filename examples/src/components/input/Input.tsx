import { defineComponent, ref, computed, SlotsType, VNode } from 'vue';
import './Input.css';

export default defineComponent({
  name: 'MyInput',

  props: {
    modelValue: { type: String, default: '' },
    placeholder: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
    type: { type: String, default: 'text' },
    size: { type: String, default: 'md' },
    clearable: { type: Boolean, default: false },
  },

  slots: Object as SlotsType<{
    prefix?: () => VNode[];
    suffix?: () => VNode[];
    clearIcon?: () => VNode[];
  }>,

  emits: {
    'update:modelValue': (value: string) => true,
    'focus': (e: FocusEvent) => true,
    'blur': (e: FocusEvent) => true,
    'clear': () => true,
  },

  setup(props, { emit, slots, expose }) {
    const inputRef = ref<HTMLInputElement | null>(null);

    const showClear = computed(() => {
      return props.clearable && props.modelValue && !props.disabled;
    });

    const handleInput = (e: Event) => {
      const target = e.target as HTMLInputElement;
      emit('update:modelValue', target.value);
    };

    const handleFocus = (e: FocusEvent) => {
      emit('focus', e);
    };

    const handleBlur = (e: FocusEvent) => {
      emit('blur', e);
    };

    const clear = () => {
      emit('update:modelValue', '');
      emit('clear');
      // 清空后自动聚焦
      inputRef.value?.focus();
    };

    const focus = () => {
      inputRef.value?.focus();
    };

    const select = () => {
      inputRef.value?.select();
    };

    // 暴露方法
    expose({
      focus,
      select,
      clear,
    });

    return () => (
      <div class={`input-wrapper input-${props.size} ${props.disabled ? 'disabled' : ''}`}>
        {/* 前置内容插槽 */}
        {slots.prefix?.()}
        
        <input
          ref={inputRef}
          type={props.type}
          class="input"
          value={props.modelValue}
          disabled={props.disabled}
          placeholder={props.placeholder}
          onInput={handleInput}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />

        {/* 清空按钮 */}
        {showClear.value && (
          <span class="clear-icon" onClick={clear}>
            {slots.clearIcon?.() || '×'}
          </span>
        )}

        {/* 后置内容插槽 */}
        {slots.suffix?.()}
      </div>
    );
  },
});
