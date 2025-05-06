import { describe, it, expect } from 'vitest'
import { analyzeExpose } from '../../lib/analyzer/expose-analyzer'

describe('expose-analyzer', () => {
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
    const exposed = analyzeExpose(code)
    expect(exposed).toEqual(['count', 'increment', 'reset'])
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
    const exposed = analyzeExpose(code)
    expect(exposed).toEqual(['getValue', 'increment'])
  })

  it('should analyze expose in TSX component with expose', () => {
    const code = `
      const expose = ['getValue', 'increment']
      export default defineComponent({
        expose,
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
    const exposed = analyzeExpose(code)
    expect(exposed).toEqual(['getValue', 'increment'])
  })
  
  it('should analyze expose in TSX component with expose', () => {
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
    const exposed = analyzeExpose(code)
    expect(exposed).toEqual(['focus', 'blur'])
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
    const exposed = analyzeExpose(code)
    expect(exposed).toEqual(['submit', 'validate', 'reset'])
  })

  it('should return empty array when nothing is exposed', () => {
    const code = `
      <script setup>
      const internal = 'not exposed'
      </script>
    `
    const exposed = analyzeExpose(code)
    expect(exposed).toEqual([])
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
    const exposed = analyzeExpose(code)
    expect(exposed).toEqual(['count', 'increment'])
  })
})

describe('analyzeExpose', () => {
  it('should handle defineExpose with object literal', () => {
    const code = `
      defineExpose({
        method1,
        prop1: 'value',
        method2() {}
      })
    `
    expect(analyzeExpose(code)).toEqual(['method1', 'prop1', 'method2'])
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
    expect(analyzeExpose(code)).toEqual(['method1', 'prop1', 'method2'])
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
    expect(analyzeExpose(code)).toEqual(['method1', 'method2'])
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
    expect(analyzeExpose(code)).toEqual([])
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
    expect(analyzeExpose(code)).toEqual(['method1', 'method2', 'prop1'])
  })

  it('should handle empty expose declarations', () => {
    const code = `
      export default {
        setup() {
          // no expose
        }
      }
    `
    expect(analyzeExpose(code)).toEqual([])
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
    expect(analyzeExpose(code)).toEqual(['method1', 'prop1'])
  })
}) 