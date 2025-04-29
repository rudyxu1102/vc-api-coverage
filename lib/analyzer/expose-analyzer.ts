import traverse from '@babel/traverse'
import * as t from '@babel/types'
import type { NodePath } from '@babel/traverse'
import type { ParseResult } from '@babel/parser'
import type { File } from '@babel/types'
import { parseComponent } from './shared-parser'
import * as fs from 'fs'
import * as path from 'path'

export interface ExposeInfo {
  name: string;
}

function logDebug(message: string, ...args: any[]) {
  if (process.env.DEBUG) {
    console.log(`[expose-analyzer] ${message}`, ...args);
  }
}

interface ImportInfo {
  source: string;
  importedName: string;
}

export function analyzeExpose(code: string, parsedAst?: ParseResult<File>, filePath?: string): string[] {
  logDebug('Analyzing code', code)
  
  const ast = parsedAst || parseComponent(code).ast
  const exposed = new Set<string>()
  const exposeOrder: string[] = []
  const optionsExpose = new Set<string>()
  const optionsExposeOrder: string[] = []

  // 收集导入声明
  const importDeclarations: Record<string, ImportInfo> = {};
  collectImportDeclarations(ast, importDeclarations);

  // Flag to track if we're in a setup function or script setup
  let inSetupContext = false
  let hasExplicitExpose = false
  let hasOptionsExpose = false

  // Special handling for TSX component with expose context parameter
  const hasExposeContextCall = code.includes('expose({') && 
                             (code.includes('setup(props, { expose })') || 
                              code.includes('{ expose }') || 
                              code.includes('context.expose'))
  if (hasExposeContextCall) {
    logDebug('Detected expose context call')
    const matches = code.match(/expose\(\s*\{([^}]+)\}\s*\)/g)
    if (matches && matches.length > 0) {
      logDebug('Found expose calls', matches)
      for (const match of matches) {
        const propsStr = match.replace(/expose\(\s*\{/, '').replace(/\}\s*\)/, '')
        const propMatches = propsStr.match(/(\w+),?/g)
        if (propMatches) {
          for (const prop of propMatches) {
            const cleanProp = prop.replace(/,/g, '').trim()
            if (cleanProp && !exposed.has(cleanProp)) {
              logDebug('Adding exposed property', cleanProp)
              exposed.add(cleanProp)
              exposeOrder.push(cleanProp)
              hasExplicitExpose = true
            }
          }
        }
      }
    }
  }

  // Special handling for TSX component with expose option as an array
  const exposeArrayMatch = code.match(/expose\s*:\s*(?:\[\s*(['"][\w\s]+['"]|[\w\s]+),?\s*(['"][\w\s]+['"]|[\w\s]+)?\s*\]|(\w+))/g)
  if (exposeArrayMatch) {
    for (const match of exposeArrayMatch) {
      if (match.includes('[')) {
        const cleanMatch = match.replace(/expose\s*:\s*\[\s*/, '').replace(/\s*\]/, '')
        const exposeItems = cleanMatch.split(',').map(item => item.trim().replace(/['"]/g, ''))
        for (const item of exposeItems) {
          if (item && !optionsExpose.has(item)) {
            optionsExpose.add(item)
            optionsExposeOrder.push(item)
            hasOptionsExpose = true
          }
        }
      } else {
        // Handle variable reference
        const variableName = match.replace(/expose\s*:\s*/, '')
        const variableMatch = code.match(new RegExp(`const\\s+${variableName}\\s*=\\s*\\[([^\\]]+)\\]`))
        if (variableMatch) {
          const exposeItems = variableMatch[1].split(',').map(item => item.trim().replace(/['"]/g, ''))
          for (const item of exposeItems) {
            if (item && !optionsExpose.has(item)) {
              optionsExpose.add(item)
              optionsExposeOrder.push(item)
              hasOptionsExpose = true
            }
          }
        }
      }
    }
    if (hasOptionsExpose) {
      return optionsExposeOrder;
    }
  }

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
    // 在 Program 级别查找导入的 expose 变量
    VariableDeclarator(path) {
      const id = path.node.id;
      if (t.isIdentifier(id) && id.name === 'expose') {
        if (t.isArrayExpression(path.node.init)) {
          path.node.init.elements.forEach(element => {
            if (t.isStringLiteral(element)) {
              if (!exposed.has(element.value)) {
                exposed.add(element.value);
                exposeOrder.push(element.value);
                hasExplicitExpose = true;
              }
            } else if (t.isIdentifier(element)) {
              if (!exposed.has(element.name)) {
                exposed.add(element.name);
                exposeOrder.push(element.name);
                hasExplicitExpose = true;
              }
            }
          });
        } else if (t.isIdentifier(path.node.init) && importDeclarations[path.node.init.name] && filePath) {
          // 处理导入的 expose 变量
          const importInfo = importDeclarations[path.node.init.name];
          processImportedExpose(importInfo, filePath, exposed, exposeOrder);
          hasExplicitExpose = true;
        }
      }
    },

    // 处理 expose 选项
    ObjectProperty(path) {
      if (t.isIdentifier(path.node.key) && path.node.key.name === 'expose') {
        if (t.isArrayExpression(path.node.value)) {
          path.node.value.elements.forEach(element => {
            if (t.isStringLiteral(element)) {
              if (!optionsExpose.has(element.value)) {
                optionsExpose.add(element.value);
                optionsExposeOrder.push(element.value);
                hasOptionsExpose = true;
              }
            } else if (t.isIdentifier(element)) {
              if (!optionsExpose.has(element.name)) {
                optionsExpose.add(element.name);
                optionsExposeOrder.push(element.name);
                hasOptionsExpose = true;
              }
            }
          });
        } else if (t.isIdentifier(path.node.value)) {
          const varName = path.node.value.name;
          // 如果是本地变量
          const binding = path.scope.getBinding(varName);
          if (binding && t.isVariableDeclarator(binding.path.node) && t.isArrayExpression(binding.path.node.init)) {
            binding.path.node.init.elements.forEach(element => {
              if (t.isStringLiteral(element)) {
                if (!optionsExpose.has(element.value)) {
                  optionsExpose.add(element.value);
                  optionsExposeOrder.push(element.value);
                  hasOptionsExpose = true;
                }
              } else if (t.isIdentifier(element)) {
                if (!optionsExpose.has(element.name)) {
                  optionsExpose.add(element.name);
                  optionsExposeOrder.push(element.name);
                  hasOptionsExpose = true;
                }
              }
            });
          }
          // 如果是导入的变量
          else if (importDeclarations[varName] && filePath) {
            const importInfo = importDeclarations[varName];
            processImportedExpose(importInfo, filePath, optionsExpose, optionsExposeOrder);
            hasOptionsExpose = true;
          }
        }
      }
    },

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
          // Check for expose in setup params
          if (path.node.params.length >= 2) {
            const secondParam = path.node.params[1]
            if (t.isObjectPattern(secondParam)) {
              const exposeBinding = secondParam.properties.find(
                prop => t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'expose'
              )
              if (exposeBinding && t.isObjectProperty(exposeBinding) && t.isIdentifier(exposeBinding.value)) {
                const exposeName = exposeBinding.value.name
                path.scope.traverse(path.node, {
                  CallExpression(callPath) {
                    if (t.isIdentifier(callPath.node.callee) && callPath.node.callee.name === exposeName) {
                      const arg = callPath.node.arguments[0]
                      if (t.isObjectExpression(arg)) {
                        hasExplicitExpose = true
                        arg.properties.forEach(prop => {
                          if (t.isObjectProperty(prop) || t.isObjectMethod(prop)) {
                            addExposedProperty(prop)
                          } else if (t.isSpreadElement(prop)) {
                            addExposedProperty(prop)
                          }
                        })
                      }
                    }
                  }
                })
              }
            }
          }
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
        } else if (path.node.callee.name === 'defineComponent') {
          const arg = path.node.arguments[0]
          if (t.isObjectExpression(arg)) {
            // Check for expose option in the component options
            const exposeProp = arg.properties.find(
              prop => t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'expose'
            )
            
            if (exposeProp && t.isObjectProperty(exposeProp)) {
              hasExplicitExpose = true
              hasOptionsExpose = true
              
              const value = exposeProp.value
              if (t.isArrayExpression(value)) {
                value.elements.forEach(element => {
                  if (t.isStringLiteral(element) || t.isIdentifier(element)) {
                    addExposedProperty(element, true)
                  }
                })
              }
            }
            
            const setupProp = arg.properties.find(
              prop => (t.isObjectMethod(prop) || t.isObjectProperty(prop)) && 
                     t.isIdentifier(prop.key) && 
                     prop.key.name === 'setup'
            )
            
            if (setupProp) {
              let setupFunction;
              if (t.isObjectMethod(setupProp)) {
                setupFunction = setupProp;
              } else if (t.isObjectProperty(setupProp) && t.isFunctionExpression(setupProp.value)) {
                setupFunction = setupProp.value;
              } else if (t.isObjectProperty(setupProp) && t.isArrowFunctionExpression(setupProp.value)) {
                setupFunction = setupProp.value;
              }
              
              if (setupFunction && setupFunction.params && setupFunction.params.length >= 2) {
                const secondParam = setupFunction.params[1]
                if (t.isObjectPattern(secondParam)) {
                  const exposeBinding = secondParam.properties.find(
                    prop => t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'expose'
                  )
                  if (exposeBinding && t.isObjectProperty(exposeBinding) && t.isIdentifier(exposeBinding.value)) {
                    const exposeName = exposeBinding.value.name
                    
                    path.traverse({
                      CallExpression(callPath) {
                        if (t.isIdentifier(callPath.node.callee) && callPath.node.callee.name === exposeName) {
                          const arg = callPath.node.arguments[0]
                          if (t.isObjectExpression(arg)) {
                            hasExplicitExpose = true
                            arg.properties.forEach(prop => {
                              if (t.isObjectProperty(prop) || t.isObjectMethod(prop)) {
                                addExposedProperty(prop)
                              } else if (t.isSpreadElement(prop)) {
                                addExposedProperty(prop)
                              }
                            })
                          }
                        }
                      }
                    })
                  }
                }
              }
            }
          }
        } else if (path.node.callee.name === 'expose') {
          hasExplicitExpose = true
          const arg = path.node.arguments[0]
          if (t.isObjectExpression(arg)) {
            arg.properties.forEach(prop => {
              if (t.isObjectProperty(prop) || t.isObjectMethod(prop)) {
                addExposedProperty(prop)
              } else if (t.isSpreadElement(prop)) {
                addExposedProperty(prop)
              }
            })
          }
        }
      }
    },

    // Handle setup function return value
    ReturnStatement(path) {
      if (inSetupContext && !hasExplicitExpose && !hasOptionsExpose) {
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

  // If special handling already captured exposed properties, return them
  if (hasExplicitExpose && exposeOrder.length > 0) {
    return exposeOrder
  }
  
  // If options expose is found, return only those properties
  if (hasOptionsExpose) {
    return optionsExposeOrder
  }

  // If no explicit expose is found, return all properties from setup return
  if (!hasExplicitExpose && exposeOrder.length > 0) {
    return exposeOrder
  }

  return exposeOrder
}

// 收集导入声明
function collectImportDeclarations(ast: File, importDeclarations: Record<string, ImportInfo>) {
  traverse(ast, {
    ImportDeclaration(path) {
      const source = path.node.source.value;
      path.node.specifiers.forEach(specifier => {
        if (t.isImportSpecifier(specifier)) {
          // 处理命名导入: import { expose } from './consts'
          const importedName = t.isIdentifier(specifier.imported) ? specifier.imported.name : specifier.imported.value;
          const localName = specifier.local.name;
          importDeclarations[localName] = { source, importedName };
        } else if (t.isImportDefaultSpecifier(specifier)) {
          // 处理默认导入: import expose from './consts'
          importDeclarations[specifier.local.name] = { source, importedName: 'default' };
        }
      });
    }
  });
}

// 处理导入的 expose
function processImportedExpose(
  importInfo: ImportInfo,
  filePath: string,
  exposedSet: Set<string>,
  exposeOrder: string[]
) {
  const importSource = importInfo.source;
  const importedName = importInfo.importedName;
  
  try {
    const currentDir = path.dirname(filePath);
    const importFilePath = path.resolve(currentDir, importSource + (importSource.endsWith('.ts') ? '' : '.ts'));
    
    logDebug(`Trying to resolve imported expose from ${importFilePath}, imported name: ${importedName}`);
    
    if (fs.existsSync(importFilePath)) {
      const importedCode = fs.readFileSync(importFilePath, 'utf-8');
      const importedAst = parseComponent(importedCode).ast;
      
      // 查找导出的变量
      let found = false;
      
      traverse(importedAst, {
        // 处理 export const expose = ['method1', 'method2']
        ExportNamedDeclaration(path) {
          if (found) return;
          
          if (t.isVariableDeclaration(path.node.declaration)) {
            const declarations = path.node.declaration.declarations;
            for (const decl of declarations) {
              if (t.isIdentifier(decl.id) && decl.id.name === importedName) {
                if (t.isArrayExpression(decl.init)) {
                  decl.init.elements.forEach(element => {
                    if (t.isStringLiteral(element)) {
                      const name = element.value;
                      if (!exposedSet.has(name)) {
                        exposedSet.add(name);
                        exposeOrder.push(name);
                      }
                    } else if (t.isIdentifier(element)) {
                      const name = element.name;
                      if (!exposedSet.has(name)) {
                        exposedSet.add(name);
                        exposeOrder.push(name);
                      }
                    }
                  });
                  found = true;
                  path.stop();
                }
              }
            }
          }
        },
        
        // 处理 export { expose }
        ExportSpecifier(path) {
          if (found) return;
          
          if (t.isIdentifier(path.node.exported) && path.node.exported.name === importedName) {
            const localName = path.node.local.name;
            const binding = path.scope.getBinding(localName);
            
            if (binding && t.isVariableDeclarator(binding.path.node)) {
              if (t.isArrayExpression(binding.path.node.init)) {
                binding.path.node.init.elements.forEach(element => {
                  if (t.isStringLiteral(element)) {
                    const name = element.value;
                    if (!exposedSet.has(name)) {
                      exposedSet.add(name);
                      exposeOrder.push(name);
                    }
                  } else if (t.isIdentifier(element)) {
                    const name = element.name;
                    if (!exposedSet.has(name)) {
                      exposedSet.add(name);
                      exposeOrder.push(name);
                    }
                  }
                });
                found = true;
                path.stop();
              }
            }
          }
        },
        
        // 处理 export default ['method1', 'method2']
        ExportDefaultDeclaration(path) {
          if (found || importedName !== 'default') return;
          
          if (t.isArrayExpression(path.node.declaration)) {
            path.node.declaration.elements.forEach(element => {
              if (t.isStringLiteral(element)) {
                const name = element.value;
                if (!exposedSet.has(name)) {
                  exposedSet.add(name);
                  exposeOrder.push(name);
                }
              } else if (t.isIdentifier(element)) {
                const name = element.name;
                if (!exposedSet.has(name)) {
                  exposedSet.add(name);
                  exposeOrder.push(name);
                }
              }
            });
            found = true;
            path.stop();
          }
        }
      });
      
      if (!found) {
        logDebug(`Could not find export named ${importedName} in ${importFilePath}`);
      }
    } else {
      logDebug(`Import file not found: ${importFilePath}`);
    }
  } catch (error) {
    console.error(`[expose-analyzer] Error analyzing imported expose:`, error);
  }
} 