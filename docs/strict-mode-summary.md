# Strict Mode - Quick Summary

## What is Strict Mode?

Strict mode tracks each variant of union type props individually, rather than treating them as a single API.

## Quick Example

```typescript
// Component
props: {
  variant: PropType<'primary' | 'secondary' | 'tertiary'>
}

// Normal Mode
✓ variant tested → 100% coverage

// Strict Mode
✓ variant='primary' tested
✓ variant='secondary' tested
✗ variant='tertiary' NOT tested → 66% coverage
```

## Enable Strict Mode

```typescript
// vitest.config.ts
reporters: [['vc-api-coverage', { strict: true }]]
```

## What Gets Expanded?

| Type | Normal Mode | Strict Mode |
|------|------------|-------------|
| `'a' \| 'b' \| 'c'` | 1 API | 3 APIs: `[a]`, `[b]`, `[c]` |
| `boolean` | 1 API | 1 API: `[true]` (false filtered) |
| `string \| number` | 1 API | 2 APIs: `[string]`, `[number]` |
| `T \| undefined` | 1 API | 1 API: `T` only (undefined filtered) |

## What Gets Filtered?

- ✅ `false` - Not meaningful to test
- ✅ `undefined` - Optional props don't need undefined tests
- ✅ `null` - Filtered automatically

## When to Use Strict Mode?

✅ **Use When:**
- Props have enum-like values that represent different behaviors
- Each variant triggers different code paths
- You want comprehensive test coverage
- Working on critical components

❌ **Skip When:**
- Props accept arbitrary values (like `string` or `number`)
- Variants don't affect behavior significantly
- You need quick iteration during development

## Report Comparison

### Normal Mode
```
║ Button │ 3/4 │ Uncovered: variant, loading
```

### Strict Mode
```
║ Button │ 5/8 │ Uncovered: variant[tertiary], loading[true]
```

Strict mode gives you precise information about what's missing!

## See Also

- [Full Documentation](./strict-mode.md)
- [Implementation Details](./implementation.md)
