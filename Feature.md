# vc-coverage-reporter 需求文档

## 📌 项目名称
**vc-coverage-reporter**

## 🎯 项目目标
`vc-coverage-reporter` 是一个 Vitest Reporter 插件，旨在分析 Vue 3 单文件组件（SFC）中的以下公开 API 覆盖率：

- Props（属性）
- Emits（事件）
- Slots（插槽）
- Exposed Methods（`defineExpose` 暴露的方法）

插件将扫描组件定义和测试文件，统计哪些 API 被测试覆盖，并在 Vitest 执行结束后输出详细报告，从而提升组件测试的完整性和可维护性。

---

## ✨ 功能需求

### ✅ 组件 API 解析功能

#### 1. Props
- 支持静态 `defineProps` / 类型推导式 `defineProps<T>()`
- 记录所有 prop 名称

#### 2. Emits
- 支持 `defineEmits(['xxx'])`、`defineEmits<{(e: 'xxx'): void}>()`
- 识别组件中 `emit('xxx')` 的调用

#### 3. Slots
- 检测 `<slot name="xxx" />`、`<slot />` 的使用
- 支持默认插槽和具名插槽的识别

#### 4. Exposed Methods
- 支持识别 `defineExpose({ foo, bar })`
- 提取暴露的方法名

---

### ✅ 测试覆盖分析功能

- 分析 `mount(Component, { props, slots, expose })` 中使用的 props/slots
- 分析测试用例中对组件触发 emit 的断言（`wrapper.emitted()`）
- 分析对暴露方法的调用，例如 `wrapper.vm.foo()` 或 `wrapper.getComponent().vm.bar()`

---

### ✅ 覆盖率报告输出

输出以下格式的 CLI 报告（支持 JSON 输出作为可选配置）：

```bash
[Coverage Report for src/components/Button.vue]

Props Coverage: 2 / 3 (66.7%)
  ✅ type
  ✅ label
  ❌ disabled

Emits Coverage: 1 / 2 (50%)
  ✅ click
  ❌ hover

Slots Coverage: 1 / 2 (50%)
  ✅ default
  ❌ icon

Expose Coverage: 0 / 1 (0%)
  ❌ focus
