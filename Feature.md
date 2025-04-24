# vc-api-coverage 需求文档

## 项目名称

vc-api-coverage

## 项目目标

`vc-api-coverage` 是一个 Vitest Reporter 插件，专为使用 TypeScript + TSX 编写的 Vue 3 组件设计。它会分析组件中公开 API（props、emits、slots、expose 方法）是否被测试覆盖，提升组件测试完整性和质量。

## 功能需求

### 组件 API 静态分析

目标组件为以 `setup()` + TSX 写法开发的 Vue 3 组件（即 `.tsx` 或 `.ts` 文件中的 `defineComponent()` 定义的组件）。

#### Props 分析

- 支持静态类型定义的 props，例如：
  ```typescript
  defineComponent({ props: { label: String, size: { type: String, default: 'md' } } })
  ```
- 支持泛型方式：
  ```typescript
  const props = withDefaults(defineProps<Props>(), { size: 'md' })
  ```

#### Events 分析

- 支持以下形式：
  ```typescript
  defineEmits(['update:modelValue', 'click'])
  ```
  ```typescript
  const emit = defineEmits<{(e: 'click', payload: MouseEvent): void}>()
  ```
- `emit('click')` 的调用追踪

#### Slots 分析

- TSX 中通过 `slots.default?.()`、`slots.icon?.()` 使用插槽
- 识别 `setup(props, { slots })` 中的 slots 访问内容

#### Exposed Methods 分析

- 支持识别 `defineExpose({ focus, blur })` 暴露方法名

### 测试覆盖分析功能

- **Props**： 检查测试中是否通过 `mount(Component, { props })` 设置了对应 prop
- **Events**： 检查是否使用了 `wrapper.emitted('xxx')` 或 `expect(wrapper.emitted()).toHaveProperty('xxx')`
- **Slots**： 检查 `mount(Component, { slots: { default: ..., icon: ... } })` 中是否传入对应插槽
- **Expose**： 检查是否调用 `wrapper.vm.xxx()`，验证是否覆盖 exposed 方法

### 覆盖率报告输出

测试执行后自动输出 CLI 报告（支持导出 JSON），例如：

```plaintext
[Coverage Report for src/components/Button.tsx]

Props Coverage: 2 / 3 (66.7%)
  label   ✅
  type    ✅
  disabled ❌

Events Coverage: 1 / 2 (50%)
  click   ✅
  hover   ❌

Slots Coverage: 1 / 2 (50%)
  default ✅
  icon    ❌

Methods Coverage: 0 / 1 (0%)
  focus   ❌
```

## 技术方案

| 模块          | 工具/库                                                             |
|---------------|--------------------------------------------------------------------|
| AST 解析      | `@babel/parser`（tsx 模式）                                          |
| AST 遍历      | `@babel/traverse`                                                  |
| Vue 组件识别   | 识别 `defineComponent()`、`defineProps()`、`defineEmits()`、`defineExpose()` |
| 文件匹配      | `fast-glob`                                                        |
| CLI 美化      | `chalk`、`boxen`、`ora`                                             |
| 覆盖率计算    | 基于组件定义项与测试匹配项的交集统计                                  |

## 使用方式

1.  在 Vitest 配置中注册插件：

    ```typescript
    // vitest.config.ts
    import { defineConfig } from 'vitest/config'

    export default defineConfig({
      test: {
        reporters: ['default', './reporters/vc-api-coverage.ts'],
      }
    })
    ```

2.  执行测试时会自动输出报告：

    ```bash
    $ vitest run
    ```

## 项目结构建议

```
vc-api-coverage/
├── reporters/
│   └── vc-api-coverage.ts
├── lib/
│   ├── analyzer/
│   │   ├── props-analyzer.ts
│   │   ├── emits-analyzer.ts
│   │   ├── slots-analyzer.ts
│   │   └── expose-analyzer.ts
│   ├── matcher/
│   │   └── test-coverage-matcher.ts
│   └── reporter/
│       └── cli-reporter.ts
├── utils/
│   └── ts-ast-utils.ts
├── examples/
└── README.md
```

## 验收标准

| 功能项                 | 验收标准                                          |
|------------------------|---------------------------------------------------|
| 支持 TSX 组件分析      | 正确识别组件中 props、emits、slots、expose 定义        |
| 匹配测试用例中使用情况 | 能识别测试文件中是否覆盖相关 API                       |
| 输出结构化报告         | CLI 输出带标记的覆盖率详情                           |
| 支持 JSON 输出格式     | 可用于集成到 CI 工具中                              |
| 支持多组件统计         | 可批量扫描整个目录结构生成汇总报告                      |