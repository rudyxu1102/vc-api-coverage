import { defineComponent, ref, computed, SlotsType, VNode } from 'vue';

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

    const wrapperStyle = {
      display: 'inline-flex',
      alignItems: 'center',
      border: '1px solid #dcdfe6',
      borderRadius: '4px',
      transition: 'all 0.2s',
      position: 'relative',
      height: props.size === 'sm' ? '28px' : props.size === 'lg' ? '44px' : '36px',
      backgroundColor: props.disabled ? '#f5f7fa' : undefined,
      borderColor: props.disabled ? '#e4e7ed' : undefined,
      cursor: props.disabled ? 'not-allowed' : undefined,
    };

    const inputStyle = {
      border: 'none',
      outline: 'none',
      padding: '0 12px',
      width: '100%',
      fontSize: '14px',
      color: '#606266',
      background: 'none',
      cursor: props.disabled ? 'not-allowed' : undefined,
    };

    const clearIconStyle = {
      padding: '0 8px',
      color: '#c0c4cc',
      cursor: 'pointer',
      transition: 'color 0.2s',
      userSelect: 'none' as const,
    };

    const slotStyle = {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '0 8px',
      color: '#909399',
    };

    return () => (
      <div style={wrapperStyle} class={`input-wrapper input-${props.size} ${props.disabled ? 'disabled' : ''}`}>
        {/* 前置内容插槽 */}
        {slots.prefix && <span style={slotStyle} class="prefix">{slots.prefix()}</span>}
        
        <input
          ref={inputRef}
          type={props.type}
          style={inputStyle}
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
          <span style={clearIconStyle} class="clear-icon" onClick={clear}>
            {slots.clearIcon?.() || '×'}
          </span>
        )}

        {/* 后置内容插槽 */}
        {slots.suffix && <span style={slotStyle} class="suffix">{slots.suffix()}</span>}
      </div>
    );
  },
});
