import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue'; // 需要安装 @vitejs/plugin-vue
import vueJsx from '@vitejs/plugin-vue-jsx'; // 需要安装 @vitejs/plugin-vue-jsx
import path from 'path'; // 导入 path 模块
import { fileURLToPath } from 'url'; // 用于获取 __dirname 在 ESM 中的等效值

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [
    vue(),
    vueJsx(), // 启用 JSX/TSX 支持
  ],
  test: {
    globals: true, // 使用全局 API (describe, it, expect)
    environment: 'jsdom', // 模拟 DOM 环境
    // 使用绝对路径
    reporters: ['default', path.resolve(__dirname, '../dist/reporters/vc-coverage-reporter.js')], // 指向编译后的 JS 文件
    // coverage: { // 标准的代码覆盖率配置（可选，但通常会一起使用）
    //   provider: 'v8', // or 'istanbul'
    //   reporter: ['text', 'json', 'html'],
    // },
    // 指定测试文件查找目录，避免扫描项目根目录的 node_modules
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts', 'src/**/*.spec.tsx', 'src/**/*.test.tsx'],
  },
  css: {
    modules: {
      localsConvention: 'camelCase',
    },
  },
}); 