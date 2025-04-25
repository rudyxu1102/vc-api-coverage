import { parse } from '@babel/parser'
import traverse from '@babel/traverse'
import * as t from '@babel/types'

function extractScriptContent(code: string): string {
  const scriptMatch = code.match(/<script[^>]*>([\s\S]*?)<\/script>/)
  return scriptMatch ? scriptMatch[1].trim() : code
}

function extractTemplateContent(code: string): string {
  const templateMatch = code.match(/<template[^>]*>([\s\S]*?)<\/template>/)
  return templateMatch ? templateMatch[1].trim() : code
}

function extractSlotsFromTemplate(template: string): string[] {
  const slots = new Set<string>()
  // 匹配 <slot> 标签，包括可能的属性、作用域插槽的绑定数据和自闭合标签
  const slotRegex = /<slot(?:\s+[^>]*?(?:name|:name|v-bind:name)=["']([^"']+)["'][^>]*?|\s+[^>]*?)?(?:>[\s\S]*?<\/slot>|\/>)/g
  let match

  while ((match = slotRegex.exec(template)) !== null) {
    const slotTag = match[0]
    // 尝试从 name 属性中提取插槽名
    const nameMatch = slotTag.match(/(?:name|:name|v-bind:name)=["']([^"']+)["']/)
    slots.add(nameMatch ? nameMatch[1] : 'default')
  }

  return Array.from(slots)
}

export function analyzeSlots(code: string): string[] {
  const slots = new Set<string>()
  let hasTemplateSlots = false

  // 如果代码包含 template 标签，使用正则表达式提取插槽
  if (code.includes('<template')) {
    const templateContent = extractTemplateContent(code)
    const templateSlots = extractSlotsFromTemplate(templateContent)
    templateSlots.forEach(slot => {
      slots.add(slot)
      hasTemplateSlots = true
    })
  }

  // 解析 script 内容
  const scriptContent = extractScriptContent(code)
  const ast = parse(scriptContent, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx']
  })

  traverse(ast, {
    // 处理 render 函数中的 slots 访问
    MemberExpression(path) {
      if (
        (t.isThisExpression(path.node.object) && 
         t.isIdentifier(path.node.property) && 
         path.node.property.name === '$slots') ||
        (t.isIdentifier(path.node.object) && 
         path.node.object.name === 'slots')
      ) {
        let parent = path.parent
        if (t.isMemberExpression(parent) && t.isIdentifier(parent.property)) {
          slots.add(parent.property.name)
        }
      }
    },

    // 处理 setup 中的 useSlots() 调用
    CallExpression(path) {
      if (t.isIdentifier(path.node.callee) && path.node.callee.name === 'useSlots') {
        const parentBinding = path.parentPath?.scope.getBinding('slots')
        if (parentBinding) {
          parentBinding.referencePaths.forEach(refPath => {
            let parent = refPath.parent
            if (t.isMemberExpression(parent) && t.isIdentifier(parent.property)) {
              slots.add(parent.property.name)
            }
          })
        }
      }
    },

    // 处理 TSX 中的 slots 定义
    ObjectProperty(path) {
      if (
        t.isIdentifier(path.node.key) && 
        path.node.key.name === 'slots'
      ) {
        // 处理 Object as SlotsType<{...}> 形式
        if (
          t.isTSAsExpression(path.node.value) &&
          t.isTSTypeReference(path.node.value.typeAnnotation)
        ) {
          const typeRef = path.node.value.typeAnnotation as t.TSTypeReference
          if (t.isIdentifier(typeRef.typeName) && typeRef.typeName.name === 'SlotsType') {
            const typeParameter = typeRef.typeParameters?.params[0]
            if (t.isTSTypeLiteral(typeParameter)) {
              typeParameter.members.forEach(member => {
                if (t.isTSPropertySignature(member) && t.isIdentifier(member.key)) {
                  slots.add(member.key.name)
                }
              })
            }
          }
        }
        // 处理直接的 SlotsType<{...}> 形式
        else if (t.isTSTypeReference(path.node.value)) {
          const typeRef = path.node.value as t.TSTypeReference
          if (t.isIdentifier(typeRef.typeName) && typeRef.typeName.name === 'SlotsType') {
            const typeParameter = typeRef.typeParameters?.params[0]
            if (t.isTSTypeLiteral(typeParameter)) {
              typeParameter.members.forEach(member => {
                if (t.isTSPropertySignature(member) && t.isIdentifier(member.key)) {
                  slots.add(member.key.name)
                }
              })
            }
          }
        }
      }
    }
  })

  // 只有在模板中找到插槽时才添加默认插槽
  if (hasTemplateSlots && !slots.has('default')) {
    // 检查模板中是否有不带 name 属性的 slot 标签
    const templateContent = extractTemplateContent(code)
    const hasDefaultSlot = /<slot(?!\s+[^>]*?(?:name|:name|v-bind:name)=["'][^"']+["'])[^>]*?>/.test(templateContent)
    if (hasDefaultSlot) {
      slots.add('default')
    }
  }

  // 返回排序后的数组
  return Array.from(slots).sort((a, b) => {
    if (a === 'header') return -1
    if (b === 'header') return 1
    if (a === 'footer') return 1
    if (b === 'footer') return -1
    if (a === 'default') return b === 'footer' ? -1 : 1
    if (b === 'default') return a === 'footer' ? -1 : 1
    return a.localeCompare(b)
  })
} 