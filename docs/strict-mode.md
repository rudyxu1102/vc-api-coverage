# Strict Mode

Strict mode provides more granular API coverage tracking by expanding union types and checking each variant individually.

## Overview

In normal mode, the tool only checks if a prop is tested at all. In strict mode, it checks if each possible value of a union type prop is tested.

### Example

```typescript
// Component definition
const buttonProps = {
  variant: {
    type: String as PropType<'primary' | 'secondary' | 'tertiary'>,
    default: 'primary'
  },
  disabled: { type: Boolean, default: false }
}
```

**Normal Mode:**
- Checks if `variant` is tested (any value)
- Checks if `disabled` is tested (any value)

**Strict Mode:**
- Checks if `variant='primary'` is tested
- Checks if `variant='secondary'` is tested
- Checks if `variant='tertiary'` is tested
- Checks if `disabled=true` is tested (false is filtered out)

## Configuration

Enable strict mode in your `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: ['default', ['vc-api-coverage', {
      strict: true,  // Enable strict mode
      outputDir: 'coverage-api',
    }]],
  },
});
```

## Variant Expansion Rules

### 1. Literal Union Types

String or number literal unions are expanded to individual variants:

```typescript
// Type: 'sm' | 'md' | 'lg'
size: { type: String as PropType<'sm' | 'md' | 'lg'> }

// Strict mode checks:
// - size[sm]
// - size[md]
// - size[lg]
```

### 2. Boolean Types

Boolean props are expanded to only the `true` value (false is filtered):

```typescript
// Type: boolean
disabled: { type: Boolean, default: false }

// Strict mode checks:
// - disabled[true]
// Note: disabled[false] is NOT checked
```

**Rationale:** Testing the false case is often not meaningful as it represents the default/inactive state. Most tests focus on the active (true) behavior.

### 3. Primitive Union Types

Mixed primitive types are expanded by type category:

```typescript
// Type: string | number
value: { type: [String, Number] as PropType<string | number> }

// Strict mode checks:
// - value[string] - Any string value satisfies this
// - value[number] - Any number value satisfies this
```

### 4. Complex Union Types

```typescript
// Type: 'fixed' | number | () => number
width: { type: [String, Number, Function] as PropType<'fixed' | number | (() => number)> }

// Strict mode checks:
// - width[fixed]     - Must test with literal 'fixed'
// - width[number]    - Any number satisfies this
// - width[function]  - Any function satisfies this
```

### 5. Filtered Types

The following types are automatically filtered and NOT checked:
- `undefined` - Optional props don't require undefined testing
- `null` - Null variants are filtered
- `false` - Boolean false is filtered (see Boolean section)

## Coverage Report Example

### Normal Mode

```
║ button/Button.tsx │ 2/3 │ Uncovered APIs: variant, disabled
```

### Strict Mode

```
║ button/Button.tsx │ 3/5 │ Uncovered APIs: variant[tertiary], disabled[true]
```

The strict mode report shows exactly which variants are not tested.

## Testing Strategy

When strict mode is enabled, ensure your tests cover all meaningful variants:

```typescript
describe('Button', () => {
  it('renders with variant primary', () => {
    mount(Button, { props: { variant: 'primary' } });
  });

  it('renders with variant secondary', () => {
    mount(Button, { props: { variant: 'secondary' } });
  });

  it('renders with variant tertiary', () => {
    mount(Button, { props: { variant: 'tertiary' } });
  });

  it('handles disabled state', () => {
    mount(Button, { props: { disabled: true } });
  });
});
```

### Loop-Based Testing

Strict mode intelligently detects and extracts values from loop-based tests:

#### ✅ Supported Loop Patterns

**1. for...of Loop**
```typescript
it('renders with different sizes', () => {
  const sizes: ButtonSize[] = ['sm', 'md']; // Missing 'lg'
  for (const size of sizes) {
    mount(Button, { props: { size } });
    // assertions...
  }
});
// ✅ Detects: size[sm], size[md] are covered
// ❌ Reports: size[lg] is NOT covered
```

**2. for...in Loop**
```typescript
it('renders with different sizes', () => {
  const sizes: ButtonSize[] = ['sm', 'md'];
  for (const i in sizes) {
    mount(Button, { props: { size: sizes[i] } });
    // assertions...
  }
});
// ✅ Detects array element access pattern
```

**3. Array.forEach()**
```typescript
it('renders with different sizes', () => {
  const sizes: ButtonSize[] = ['sm', 'md'];
  sizes.forEach(size => {
    mount(Button, { props: { size } });
    // assertions...
  });
});
// ✅ Detects callback parameter pattern
```

**4. Array.map()**
```typescript
it('renders with different sizes', () => {
  const sizes: ButtonSize[] = ['sm', 'md'];
  const wrappers = sizes.map(size => mount(Button, { props: { size } }));
  wrappers.forEach(wrapper => expect(wrapper.exists()).toBe(true));
});
// ✅ Detects map callback pattern
```

**5. JSX in Loops**
```typescript
it('renders with different sizes', () => {
  const sizes: ButtonSize[] = ['sm', 'md'];
  for (const size of sizes) {
    render(() => <Button size={size} />, {});
    // assertions...
  }
});
// ✅ Works with JSX syntax too
```

#### How It Works

The tool uses **AST (Abstract Syntax Tree) backtracking** to:
1. Detect when a prop value comes from a loop variable
2. Find the source array being iterated
3. Extract the array's literal values
4. Compare against the full type definition to find missing values

This means you can write concise loop-based tests, and the tool will still accurately detect which enum values are covered and which are missing.

## Benefits

1. **More Thorough Testing**: Ensures all code paths for different prop values are tested
2. **Better Type Coverage**: Catches cases where only some enum values are tested
3. **Clearer Insights**: Reports show exactly which variants need testing
4. **Prevents Regressions**: Ensures new enum values trigger test additions

## Trade-offs

- **More Granular Tracking**: Increases the number of APIs to track
- **Higher Test Requirements**: May require more test cases to achieve 100% coverage
- **More Detailed Reports**: Coverage percentages may be lower initially

## Best Practices

1. **Use for Critical Props**: Enable strict mode for props that have distinct behavioral paths
2. **Document Variants**: Comment why certain variants exist if not obvious
3. **Group Related Tests**: Organize tests by prop variant for clarity
4. **Skip Meaningless Variants**: Remember false is already filtered for booleans

## Type Support Matrix

| Type | Expanded | Example |
|------|----------|---------|
| Literal Union | ✅ Yes | `'a' \| 'b' \| 'c'` → `[a]`, `[b]`, `[c]` |
| Boolean | ✅ Partial | `boolean` → `[true]` only |
| String | ❌ No | `string` → `[string]` |
| Number | ❌ No | `number` → `[number]` |
| Function | ❌ No | `() => void` → `[function]` |
| Object | ❌ No | `object` → `[object]` |
| Mixed Union | ✅ Yes | `'a' \| number` → `[a]`, `[number]` |
| Optional | Filtered | `T \| undefined` → T only |
