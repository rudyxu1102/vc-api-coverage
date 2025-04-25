import { parse } from '@babel/parser'
import traverse from '@babel/traverse'
import * as t from '@babel/types'
import type { NodePath } from '@babel/traverse'

export interface ExposeInfo {
  name: string;
}

export function analyzeExpose(code: string): string[] {
  // Extract script content from SFC with better handling of setup and TS
  let scriptContent = code
  const setupScriptMatch = code.match(/<script\s+setup\s*(?:lang="ts")?\s*>([\s\S]*?)<\/script>/i)
  const normalScriptMatch = code.match(/<script\s*(?:lang="ts")?\s*>([\s\S]*?)<\/script>/i)
  
  // Prioritize setup script over normal script
  if (setupScriptMatch) {
    scriptContent = setupScriptMatch[1].trim()
  } else if (normalScriptMatch) {
    scriptContent = normalScriptMatch[1].trim()
  }

  const ast = parse(scriptContent, {
    sourceType: 'module',
    plugins: [
      'typescript',
      'jsx',
      'decorators-legacy',
      'classProperties',
      'classPrivateProperties',
      'classPrivateMethods',
      'exportDefaultFrom',
      'exportNamespaceFrom',
      'objectRestSpread',
      'optionalChaining',
      'nullishCoalescingOperator'
    ]
  })

  const exposed = new Set<string>()
  const exposeOrder: string[] = []
  const optionsExpose = new Set<string>()
  const optionsExposeOrder: string[] = []

  // Flag to track if we're in a setup function or script setup
  let inSetupContext = setupScriptMatch !== null
  let hasExplicitExpose = false
  let hasOptionsExpose = false

  function addExposedProperty(prop: t.ObjectProperty | t.ObjectMethod | t.TSPropertySignature | t.Identifier | t.StringLiteral | t.TSTypeElement | t.SpreadElement, isOptionsExpose = false) {
    let name: string | null = null
    
    if (t.isObjectProperty(prop) || t.isObjectMethod(prop)) {
      if (t.isIdentifier(prop.key)) {
        name = prop.key.name
      } else if (t.isStringLiteral(prop.key)) {
        name = prop.key.value
      }
    } else if (t.isIdentifier(prop)) {
      name = prop.name
    } else if (t.isStringLiteral(prop)) {
      name = prop.value
    } else if (t.isTSPropertySignature(prop) && t.isIdentifier(prop.key)) {
      name = prop.key.name
    } else if (t.isTSMethodSignature(prop) && t.isIdentifier(prop.key)) {
      name = prop.key.name
    } else if (t.isSpreadElement(prop) && t.isIdentifier(prop.argument)) {
      // Handle spread operator by looking up the referenced identifier
      name = prop.argument.name
    }

    if (name) {
      if (isOptionsExpose) {
        if (!optionsExpose.has(name)) {
          optionsExpose.add(name)
          optionsExposeOrder.push(name)
        }
      } else {
        if (!exposed.has(name)) {
          exposed.add(name)
          exposeOrder.push(name)
        }
      }
    }
  }

  function handleTypeAnnotation(typeAnnotation: t.TSType | t.TSTypeAnnotation | null, path: NodePath) {
    if (!typeAnnotation) return
    
    const actualType = t.isTSTypeAnnotation(typeAnnotation) ? typeAnnotation.typeAnnotation : typeAnnotation

    if (t.isTSTypeLiteral(actualType)) {
      actualType.members.forEach((member: t.TSTypeElement) => {
        if (t.isTSPropertySignature(member) || t.isTSMethodSignature(member)) {
          addExposedProperty(member)
        }
      })
    } else if (t.isTSTypeReference(actualType) && t.isIdentifier(actualType.typeName)) {
      // Find interface or type alias declaration
      let scope = path.scope
      while (scope) {
        const binding = scope.getBinding(actualType.typeName.name)
        if (binding) {
          if (t.isTSInterfaceDeclaration(binding.path.node)) {
            binding.path.node.body.body.forEach(member => {
              addExposedProperty(member)
            })
            break
          } else if (t.isTSTypeAliasDeclaration(binding.path.node)) {
            handleTypeAnnotation(binding.path.node.typeAnnotation, binding.path)
            break
          }
        }
        scope = scope.parent
      }
    } else if (t.isTSIntersectionType(actualType) || t.isTSUnionType(actualType)) {
      actualType.types.forEach(type => handleTypeAnnotation(type, path))
    }
  }

  traverse(ast, {
    Program(path) {
      // Handle <script setup> by checking for defineExpose import
      path.node.body.forEach(node => {
        if (t.isImportDeclaration(node) && node.source.value === 'vue') {
          node.specifiers.forEach(specifier => {
            if (
              t.isImportSpecifier(specifier) &&
              t.isIdentifier(specifier.imported) &&
              specifier.imported.name === 'defineExpose'
            ) {
              inSetupContext = true
            }
          })
        }
      })
    },

    // Track setup function entry/exit
    ObjectMethod: {
      enter(path) {
        if (t.isIdentifier(path.node.key) && path.node.key.name === 'setup') {
          inSetupContext = true
        }
      },
      exit(path) {
        if (t.isIdentifier(path.node.key) && path.node.key.name === 'setup') {
          inSetupContext = false
        }
      }
    },

    // Handle defineExpose calls and expose function calls
    CallExpression(path) {
      if (t.isIdentifier(path.node.callee)) {
        if (path.node.callee.name === 'defineExpose') {
          hasExplicitExpose = true
          const arg = path.node.arguments[0]
          
          // Handle type parameters
          if (path.node.typeParameters) {
            handleTypeAnnotation(path.node.typeParameters.params[0], path)
          }

          // Handle object literal argument
          if (t.isObjectExpression(arg)) {
            arg.properties.forEach(prop => {
              if (t.isObjectProperty(prop) || t.isObjectMethod(prop)) {
                addExposedProperty(prop)
              } else if (t.isSpreadElement(prop)) {
                addExposedProperty(prop)
              }
            })
          } else if (t.isIdentifier(arg)) {
            // Handle case where entire object is passed to defineExpose
            const binding = path.scope.getBinding(arg.name)
            if (binding && t.isVariableDeclarator(binding.path.node)) {
              const id = binding.path.node.id
              if (t.isIdentifier(id) && t.isTSTypeAnnotation(id.typeAnnotation)) {
                handleTypeAnnotation(id.typeAnnotation, binding.path)
              }
              if (t.isObjectExpression(binding.path.node.init)) {
                binding.path.node.init.properties.forEach(prop => {
                  if (t.isObjectProperty(prop) || t.isObjectMethod(prop)) {
                    addExposedProperty(prop)
                  }
                })
              }
            }
          }
        } else if (path.node.callee.name === 'expose' && path.node.arguments.length > 0) {
          hasExplicitExpose = true
          const arg = path.node.arguments[0]
          if (t.isObjectExpression(arg)) {
            arg.properties.forEach(prop => {
              if (t.isObjectProperty(prop) || t.isObjectMethod(prop)) {
                addExposedProperty(prop)
              }
            })
          }
        }
      }
    },

    // Handle expose option in component options
    ObjectProperty(path) {
      if (
        t.isIdentifier(path.node.key) &&
        path.node.key.name === 'expose' &&
        !inSetupContext
      ) {
        hasExplicitExpose = true
        hasOptionsExpose = true

        const value = path.node.value
        if (t.isArrayExpression(value)) {
          value.elements.forEach(element => {
            if (t.isStringLiteral(element) || t.isIdentifier(element)) {
              addExposedProperty(element, true)
            }
          })
        } else if (t.isObjectExpression(value)) {
          value.properties.forEach(prop => {
            if (t.isObjectProperty(prop) || t.isObjectMethod(prop)) {
              addExposedProperty(prop, true)
            }
          })
        }
      }
    },

    // Handle setup function return value
    ReturnStatement(path) {
      if (inSetupContext && !hasExplicitExpose) {
        const argument = path.node.argument
        if (t.isObjectExpression(argument)) {
          argument.properties.forEach(prop => {
            if (t.isObjectProperty(prop) || t.isObjectMethod(prop)) {
              addExposedProperty(prop)
            }
          })
        } else if (t.isIdentifier(argument)) {
          // Handle case where an identifier is returned
          const binding = path.scope.getBinding(argument.name)
          if (binding && t.isVariableDeclarator(binding.path.node)) {
            const init = binding.path.node.init
            if (t.isObjectExpression(init)) {
              init.properties.forEach(prop => {
                if (t.isObjectProperty(prop) || t.isObjectMethod(prop)) {
                  addExposedProperty(prop)
                }
              })
            }
          }
        }
      }
    }
  })

  // If no explicit expose is found, return all properties from setup return
  if (!hasExplicitExpose && exposeOrder.length > 0) {
    return exposeOrder
  }

  // If options expose is found, combine it with other exposed properties
  if (hasOptionsExpose) {
    // Combine options expose with other exposed properties
    const allExposed = [...optionsExposeOrder]
    exposeOrder.forEach(name => {
      if (!optionsExpose.has(name)) {
        allExposed.push(name)
      }
    })
    return allExposed
  }

  return exposeOrder
} 