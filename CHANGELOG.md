## 更新日志

### 0.8.6
- **修复**: 改进 ref 值的 prop 覆盖率检测
  - 修复在测试中使用 `ref().value` 模式时，prop 的具体值无法正确识别的问题
  - 新增 `extractRefAssignments` 方法，支持提取 ref 的初始值和所有赋值语句
  - 新增 `unwrapExpression` 通用方法，统一处理类型断言、括号等表达式包装
  - 支持检测各种 ref 使用模式：
    - `size.value`（直接访问）
    - `size.value as InputSize`（类型断言）
    - `(size.value)`（括号包装）
    - `size.value!`（非空断言）
  - 提升 strict mode 下对动态 prop 值的覆盖率准确性

### 0.8.4
- **重大改进**: 重构 expose 方法检测机制
  - 移除基于 V8 coverage 的检测方式（不可靠，fnMap 名称可能被混淆）
  - 采用简化的方法名匹配策略
  - 从 300+ 行复杂的变量追踪代码简化为 30 行
  - 支持所有常见测试模式：`wrapper.vm.method()`, `ref.value?.method()`, `(vm as any).method()` 等
  - 提升可维护性和准确性
  - 详见文档：[Implementation Details](./docs/implementation.md)

### 0.6.4
- 修复default symbol寻找不到

### 0.6.3
- 修复vitest watch模式报错

### 0.6.2
- 支持识别`v-slots`

### 0.6.0
- 修复一些问题

### 0.5.0
- 使用类型分析

### 0.4.2
- 支持从vitest的覆盖率数据里面检查

### 0.3.1
- 使用cli-table3库优化CLI表格格式，解决表格对齐问题
- 支持在各终端环境中正确显示中文和ANSI颜色文本

### 0.3.0
- 支持多种报告格式：CLI、HTML和JSON
- 支持分析Slot类型
- 支持对Props的默认值进行分析
- 优化了分析精度，减少误报情况

### 0.3.0
- cli格式改为表格展示

### 0.2.1
- 支持从其他文件引入slot

### 0.2.0
- 支持从其他文件引入props、emit、expose

### 0.1.0
- 初始版本