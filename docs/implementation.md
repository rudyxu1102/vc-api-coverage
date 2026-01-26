# Implementation Details

This document explains how `vc-api-coverage` works internally to track and report Vue 3 component API coverage.

## Overview

The tool analyzes your Vue 3 TSX components and their test files to determine which component APIs (Props, Events, Slots, and Exposed methods) are actually being tested. It leverages TypeScript's type system and AST analysis to achieve this.

## How Different APIs Are Tracked

### Props/Events Coverage

Props and Events coverage is calculated by analyzing the TypeScript type of the component's `$props` attribute:

```ts
InstanceType<typeof Button>['$props']
```

This approach leverages TypeScript's type system to extract all available props and events from your component definition. Event handlers (like `onUpdate`, `onClick`) are treated as special props that start with `on`.

**Example:**

```tsx
// Button.tsx
interface ButtonProps {
  type?: 'primary' | 'default';
  disabled?: boolean;
  loading?: boolean;
  onClick?: (e: MouseEvent) => void;
}

export default defineComponent<ButtonProps>({ /*...*/ })
```

In this case, the tool will identify 4 APIs from `$props`:
- `type` (prop)
- `disabled` (prop)
- `loading` (prop)
- `onClick` (event)

### Slots Coverage

Slots coverage is calculated by analyzing the TypeScript type of the component's `$slots` attribute:

```ts
InstanceType<typeof Button>['$slots']
```

This extracts all available slots from your component's type definition.

**Important Note:** If you see coverage data like `1/N` for slots (where N > 1), it means your component hasn't explicitly defined the `slots` option. To get accurate slot coverage tracking, make sure to declare your slots in the component.

#### Why Define Slots Explicitly?

Defining slots explicitly is a Vue 3 feature that provides **type checking** for your slots. This ensures type safety when using the component:

```tsx
import { defineComponent, SlotsType } from 'vue'

// ✅ Good - Explicit slots definition with type checking
export default defineComponent({
  slots: Object as SlotsType<{
    default: { text: string };
    header: void;
    footer: { title: string };
  }>,
  setup(props, { slots }) {
    // TypeScript will enforce that:
    // - default slot receives { text: string }
    // - header slot receives no props
    // - footer slot receives { title: string }
    return () => (
      <div>
        {slots.header?.()}
        {slots.default?.({ text: 'Hello' })}
        {slots.footer?.({ title: 'Footer' })}
      </div>
    )
  }
})

// ❌ Bad - No explicit slots definition
// The tool may not accurately detect all slots
// AND no type checking for slot props
export default defineComponent({
  setup(props, { slots }) {
    return () => (
      <div>
        {slots.header?.()}
        {slots.default?.({ text: 'Hello' })} {/* No type checking! */}
      </div>
    )
  }
})
```

Benefits of explicit slots definition:
1. **Type Safety**: TypeScript validates slot props at compile time
2. **Better IDE Support**: Auto-completion and type hints for slot props
3. **Accurate Coverage Tracking**: The tool can correctly identify all declared slots
4. **Better Documentation**: Slots are explicitly documented in the component definition

### Exposed Methods Coverage

Exposed methods coverage is calculated through **AST (Abstract Syntax Tree) analysis** of both your component's source code and test files.

#### Component Analysis

The tool parses the component file to identify all methods exposed via `defineExpose()`.

**Example:**

```tsx
export default defineComponent({
  setup() {
    const focus = () => {
      inputRef.value?.focus()
    }

    const blur = () => {
      inputRef.value?.blur()
    }

    defineExpose({
      focus,
      blur
    })
  }
})
```

The AST parser will identify `focus` and `blur` as exposed methods that should be covered in tests.

#### Test Analysis

The tool scans test files for method calls that match exposed method names. It uses a simple and reliable approach:

1. **Scans all property access expressions** in test code (e.g., `xxx.methodName`)
2. **Filters for exposed method names** (focus, blur, validate, clear, select, etc.)
3. **Associates found methods** with components tested in the same test file

**Supported Test Patterns:**

```tsx
// ✅ Direct calls
wrapper.vm.focus()
ref.value?.validate()

// ✅ Type assertions
(wrapper.vm as any).focus()

// ✅ Variable assignments
const instance = wrapper.vm
instance.focus()

// ✅ Testing existence
expect(wrapper.vm.focus).toBeDefined()

// ✅ Complex access patterns
formRef.value?.validate()
el.__vueParentComponent.exposed.setScrollTop(100)
```

**How It Works:**

The detection is intentionally simple - it matches method names rather than tracking variable sources. This approach:

- ✅ **Simple and maintainable**: ~30 lines of code vs 300+ for variable tracking
- ✅ **Reliable**: No dependency on V8 coverage or complex AST traversal
- ✅ **Fast**: Direct method name matching
- ✅ **Accurate**: Exposed methods typically have unique names (focus, validate, etc.), so false positives are rare

## How Coverage Is Determined

The tool hooks into Vitest's test execution and monitors:

1. **Component instantiation** - When a component is rendered in a test
2. **Props/Events usage** - Which props are passed and which event handlers are attached
3. **Slots usage** - Which slots are populated with content
4. **Exposed methods calls** - Which exposed methods are invoked during testing

After all tests complete, it compares the used APIs against the declared APIs to calculate coverage percentages.

## CI Integration

You can use the `onFinished` callback to enforce coverage thresholds in your CI pipeline:

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    reporters: [['vc-api-coverage', {
      onFinished: (data) => {
        for (const item of data) {
          if (item.total > item.covered) {
            throw new Error(`${item.name} API Coverage is not 100%`)
          }
        }
      }
    }]]
  }
})
```

This callback receives an array of coverage data, where each item contains:

```ts
interface CoverageItem {
  name: string;          // Component name
  file: string;          // Component file path
  total: number;         // Total number of APIs
  covered: number;       // Number of covered APIs
  props: {               // Props/Events coverage details
    total: number;
    covered: number;
    details: Array<{ name: string; covered: boolean }>;
  };
  slots: {               // Slots coverage details
    total: number;
    covered: number;
    details: Array<{ name: string; covered: boolean }>;
  };
  exposes: {             // Exposed methods coverage details
    total: number;
    covered: number;
    details: Array<{ name: string; covered: boolean }>;
  };
}
```

By analyzing this data in the `onFinished` callback, you can:
- Fail the CI build if coverage is below a threshold
- Generate custom reports
- Send notifications
- Integrate with other tools

## Technical Architecture

1. **Vitest Reporter Integration** - The tool implements Vitest's reporter interface to hook into the test lifecycle
2. **TypeScript Type Extraction** - Uses TypeScript Compiler API to extract component type definitions
3. **AST Parsing** - Uses Babel/TypeScript parser to analyze component source code
4. **Runtime Tracking** - Monitors component usage during test execution
5. **Report Generation** - Aggregates data and generates reports in multiple formats (CLI, HTML, JSON)

## Limitations

- Only works with Vue 3 TSX components (not `.vue` SFC files by default, though they can be configured via `include` option)
- Requires TypeScript for accurate type extraction
- Components must use `defineComponent` for proper type inference
- Slots tracking requires explicit slots definition for accuracy
