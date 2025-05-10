import { describe, it, expect, vi, afterEach } from 'vitest'
import ExposeAnalyzer from '../../lib/analyzer/expose-analyzer'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const tempFile = path.join(__dirname, '_temp_test_file.tsx')

// Mock fs and path modules for import testing
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

describe('Expose Analyzer', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should analyze expose in Vue SFC with defineExpose', () => {
    const code = `
      <script setup>
      import { ref } from 'vue'
      
      const count = ref(0)
      const increment = () => count.value++
      const reset = () => count.value = 0
      
      defineExpose({
        count,
        increment,
        reset
      })
      </script>
    `
    const exposeResult = new ExposeAnalyzer(tempFile, code).analyze()
    expect(exposeResult.sort()).toEqual(['count', 'increment', 'reset'].sort())
  })

  it('should analyze expose in TSX component', () => {
    const code = `
      export default defineComponent({
        setup() {
          const state = reactive({
            value: 0
          })
          
          return {
            state,
            increment: () => state.value++,
            getValue: () => state.value
          }
        },
        expose: ['getValue', 'increment']
      })
    `
    const exposeResult = new ExposeAnalyzer(tempFile, code).analyze()
    expect(exposeResult.sort()).toEqual(['getValue', 'increment'].sort())
  })

  it('should analyze expose in TSX component with expose', () => {
    const code = `
      export default defineComponent({
        expose: ['getValue', 'increment'],
        setup() {
          const state = reactive({
            value: 0
          })
          
          return {
            state,
            increment: () => state.value++,
            getValue: () => state.value
          }
        },
      })
    `
    
    const exposeResult = new ExposeAnalyzer(tempFile, code).analyze()
    expect(exposeResult.sort()).toEqual(['getValue', 'increment'].sort())
  })
  
  it('should analyze expose in TSX component with setup context expose', () => {
    const code = `
      export default defineComponent({
        setup(props, { expose }) {
          const focus = () => {
            console.log('focus')
          }
          const blur = () => {
            console.log('blur')
          }
          const state = reactive({
            value: 0
          })
          expose({
            focus,
            blur
          })
          
          return {
            state
          }
        }
      })
    `
    const exposeResult = new ExposeAnalyzer(tempFile, code).analyze()
    expect(exposeResult.sort()).toEqual(['focus', 'blur'].sort())
  })

  it('should analyze expose with type annotations', () => {
    const code = `
      <script setup lang="ts">
      interface Exposed {
        submit: () => Promise<void>
        validate: () => boolean
        reset: () => void
      }
      
      defineExpose<Exposed>({
        submit: async () => { /* ... */ },
        validate: () => true,
        reset: () => { /* ... */ }
      })
      </script>
    `
    const exposeResult = new ExposeAnalyzer(tempFile, code).analyze()
    expect(exposeResult.sort()).toEqual(['submit', 'validate', 'reset'].sort())
  })

  it('should return empty array when nothing is exposed', () => {
    const code = `
      <script setup>
      const internal = 'not exposed'
      </script>
    `
    const exposeResult = new ExposeAnalyzer(tempFile, code).analyze()
    expect(exposeResult).toEqual([])
  })

  it('should analyze expose in options API', () => {
    const code = `
      export default {
        data() {
          return {
            count: 0
          }
        },
        methods: {
          increment() {
            this.count++
          }
        },
        expose: ['count', 'increment']
      }
    `
    const exposeResult = new ExposeAnalyzer(tempFile, code).analyze()
    expect(exposeResult.sort()).toEqual(['count', 'increment'].sort())
  })
})

describe('ExposeAnalyzer', () => {
  it('should handle defineExpose with object literal', () => {
    const code = `
      defineExpose({
        method1,
        prop1: 'value',
        method2() {}
      })
    `
    const exposeResult = new ExposeAnalyzer(tempFile, code).analyze()
    expect(exposeResult.sort()).toEqual(['method1', 'prop1', 'method2'].sort())
  })

  it('should handle defineExpose with type parameters', () => {
    const code = `
      defineExpose<{
        method1: () => void;
        prop1: string;
        method2: () => boolean;
      }>({
        method1,
        prop1,
        method2
      })
    `
    const exposeResult = new ExposeAnalyzer(tempFile, code).analyze()
    expect(exposeResult.sort()).toEqual(['method1', 'prop1', 'method2'].sort())
  })

  it('should handle expose option in component options', () => {
    const code = `
      export default {
        expose: ['method1', 'method2'],
        methods: {
          method1() {},
          method2() {},
          method3() {}
        }
      }
    `
    const exposeResult = new ExposeAnalyzer(tempFile, code).analyze()
    expect(exposeResult.sort()).toEqual(['method1', 'method2'].sort())
  })

  it('should handle setup function return', () => {
    const code = `
      export default {
        setup() {
          const count = ref(0)
          const increment = () => count.value++
          const decrement = () => count.value--
          
          return {
            count,
            increment,
            decrement
          }
        }
      }
    `
    const exposeResult = new ExposeAnalyzer(tempFile, code).analyze()
    expect(exposeResult).toEqual([])
  })

  it('should handle multiple expose declarations', () => {
    const code = `
      export default {
        expose: ['method1', 'method2', 'prop1'],
        setup() {
          return {
            method1: () => {},
            method2: () => {},
            prop1: 'value',
            method3: () => {},  // 这个不会被暴露
            prop2: ref('')      // 这个不会被暴露
          }
        }
      }
    `
    const exposeResult = new ExposeAnalyzer(tempFile, code).analyze()
    expect(exposeResult.sort()).toEqual(['method1', 'method2', 'prop1'].sort())
  })

  it('should handle empty expose declarations', () => {
    const code = `
      export default {
        setup() {
          // no expose
        }
      }
    `
    const exposeResult = new ExposeAnalyzer(tempFile, code).analyze()
    expect(exposeResult).toEqual([])
  })

  it('should handle interface type in defineExpose', () => {
    const code = `
      interface Exposed {
        method1: () => void;
        prop1: string;
      }
      
      defineExpose<Exposed>({
        method1,
        prop1
      })
    `
    const exposeResult = new ExposeAnalyzer(tempFile, code).analyze()
    expect(exposeResult.sort()).toEqual(['method1', 'prop1'].sort())
  })
}) 