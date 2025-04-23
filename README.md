# vc-coverage-reporter

A specialized Vitest reporter designed for Vue 3 TSX components that helps you track and improve your component API coverage. This tool analyzes and reports the usage coverage of your component's Props, Emits, Slots, and Exposed methods in your tests.

## Features

- 📊 Detailed coverage reporting for Vue 3 TSX components
- ✨ Tracks Props, Emits, Slots, and Expose coverage
- 🎯 Visual representation of test coverage with emoji indicators
- 🔍 Clear identification of untested component APIs
- 📈 Coverage percentage calculation for each API category

## Installation

```bash
npm install vc-coverage-reporter --save-dev
# or
yarn add -D vc-coverage-reporter
# or
pnpm add -D vc-coverage-reporter
```

## Usage

1. Add the reporter to your Vitest configuration:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    reporters: ['vc-coverage-reporter']
  }
})
```

2. Run your tests as usual:

```bash
vitest
```

The reporter will automatically generate coverage reports for your Vue 3 TSX components, showing which APIs are covered by your tests and which ones need attention.

## Example Output

```
   ╭─────────────────── VC Coverage Reporter ───────────────────╮
   │                                                            │
   │   [Coverage Report for src/components/button/Button.tsx]   │
   │                                                            │
   │   Props Coverage: 1 / 3 (33.3%)                            │
   │     label           ✅                                     │
   │     size            ❌                                     │
   │     disabled        ❌                                     │
   │                                                            │
   │   Emits Coverage: 1 / 2 (50%)                              │
   │     click           ✅                                     │
   │     hover           ❌                                     │
   │                                                            │
   │   Slots Coverage: 1 / 2 (50%)                              │
   │     default         ✅                                     │
   │     icon            ❌                                     │
   │                                                            │
   │   Expose Coverage: 0 / 1 (0%)                              │
   │     focus           ❌                                     │
   │                                                            │
   ╰────────────────────────────────────────────────────────────╯
```

## Understanding the Report

- ✅ indicates the API is covered by tests
- ❌ indicates the API needs test coverage
- Coverage percentages are shown for each API category
- The report clearly shows which specific props, emits, slots, and exposed methods need attention

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
