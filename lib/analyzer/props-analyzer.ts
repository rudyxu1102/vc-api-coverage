import traverse from '@babel/traverse'
import * as t from '@babel/types'
import type { ParseResult } from '@babel/parser'
import type { File } from '@babel/types'
import { parseComponent } from './shared-parser'

export function analyzeProps(code: string, parsedAst?: ParseResult<File>): string[] {
  const props: string[] = []
  const ast = parsedAst || parseComponent(code).ast

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

    // 处理 props: ['prop1', 'prop2'] 形式和 props: variableName 形式
    ObjectProperty(path) {
      if (
        t.isIdentifier(path.node.key) &&
        path.node.key.name === 'props'
      ) {
        if (t.isArrayExpression(path.node.value)) {
          path.node.value.elements.forEach(element => {
            if (t.isStringLiteral(element)) {
              props.push(element.value)
            }
          })
        } else if (t.isIdentifier(path.node.value)) {
          const binding = path.scope.getBinding(path.node.value.name)
          if (binding && t.isVariableDeclarator(binding.path.node)) {
            const init = binding.path.node.init
            if (t.isObjectExpression(init)) {
              init.properties.forEach(prop => {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                  props.push(prop.key.name)
                }
              })
            }
          }
        }
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