import { parse } from '@babel/parser'
import traverse from '@babel/traverse'
import * as t from '@babel/types'

function extractScriptContent(code: string): string {
  const scriptMatch = code.match(/<script[^>]*>([\s\S]*?)<\/script>/)
  return scriptMatch ? scriptMatch[1].trim() : code
}

export function analyzeProps(code: string): string[] {
  const props: string[] = []
  const scriptContent = extractScriptContent(code)
  
  const ast = parse(scriptContent, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx']
  })

  traverse(ast, {
    // 处理 defineProps<{...}>() 形式
    CallExpression(path) {
      if (t.isIdentifier(path.node.callee) && path.node.callee.name === 'defineProps') {
        if (path.node.typeParameters?.params[0]) {
          const typeAnnotation = path.node.typeParameters.params[0]
          if (t.isTSTypeLiteral(typeAnnotation)) {
            typeAnnotation.members.forEach(member => {
              if (t.isTSPropertySignature(member) && t.isIdentifier(member.key)) {
                props.push(member.key.name)
              }
            })
          }
        }
      }
    },

    // 处理 props: ['prop1', 'prop2'] 形式
    ObjectProperty(path) {
      if (
        t.isIdentifier(path.node.key) &&
        path.node.key.name === 'props' &&
        t.isArrayExpression(path.node.value)
      ) {
        path.node.value.elements.forEach(element => {
          if (t.isStringLiteral(element)) {
            props.push(element.value)
          }
        })
      }
    },

    // 处理 props: { prop1: Type, prop2: { type: Type } } 形式
    ObjectExpression(path) {
      const parent = path.parent
      if (
        t.isObjectProperty(parent) &&
        t.isIdentifier(parent.key) &&
        parent.key.name === 'props'
      ) {
        path.node.properties.forEach(prop => {
          if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
            props.push(prop.key.name)
          }
        })
      }
    }
  })

  return props
} 