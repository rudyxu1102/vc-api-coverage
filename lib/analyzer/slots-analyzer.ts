import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { NodePath } from '@babel/traverse';
import type { ParseResult } from '@babel/parser';
import type { File } from '@babel/types';
import { parseComponent } from '../common/shared-parser';

/**
 * 从模板中提取插槽名称
 */
function extractSlotsFromTemplate(template: string): string[] {
  const slots = new Set<string>();
  // 匹配 <slot> 标签，包括可能的属性、作用域插槽的绑定数据和自闭合标签
  const slotRegex = /<slot(?:\s+[^>]*?(?:name|:name|v-bind:name)=["']([^"']+)["'][^>]*?|\s+[^>]*?)?(?:>[\s\S]*?<\/slot>|\/>)/g;
  let match;

  while ((match = slotRegex.exec(template)) !== null) {
    const slotTag = match[0];
    // 尝试从 name 属性中提取插槽名
    const nameMatch = slotTag.match(/(?:name|:name|v-bind:name)=["']([^"']+)["']/);
    slots.add(nameMatch ? nameMatch[1] : 'default');
  }

  return Array.from(slots);
}

/**
 * 插槽分析器类，包含不同的分析策略
 */
class SlotsAnalyzer {
  private slots: Set<string> = new Set<string>();
  private hasTemplateSlots: boolean = false;
  private templateContent: string;
  private ast: ParseResult<File>;

  constructor(code: string, parsedContent?: { ast: ParseResult<File>; templateContent: string }) {
    const parsed = parsedContent || parseComponent(code);
    this.templateContent = parsed.templateContent;
    this.ast = parsed.ast;
  }

  /**
   * 分析并返回组件的插槽
   */
  analyze(): string[] {
    // 首先从模板中分析插槽
    this.analyzeTemplateSlots();
    
    // 然后从 JavaScript/TypeScript 中分析插槽
    this.analyzeScriptSlots();
    
    // 处理默认插槽的特殊情况
    this.handleDefaultSlot();
    
    // 返回排序后的数组
    return Array.from(this.slots);
  }

  /**
   * 从模板中分析插槽
   */
  private analyzeTemplateSlots(): void {
    if (!this.templateContent) return;
    
    const templateSlots = extractSlotsFromTemplate(this.templateContent);
    if (templateSlots.length > 0) {
      templateSlots.forEach(slot => {
        this.slots.add(slot);
      });
      this.hasTemplateSlots = true;
    }
  }

  /**
   * 分析脚本中的插槽使用
   */
  private analyzeScriptSlots(): void {
    traverse(this.ast, {
      MemberExpression: this.analyzeMemberExpression.bind(this),
      CallExpression: this.analyzeCallExpression.bind(this),
      ObjectProperty: this.analyzeObjectProperty.bind(this)
    });
  }

  /**
   * 分析 this.$slots 或 slots 成员表达式
   */
  private analyzeMemberExpression(path: NodePath<t.MemberExpression>): void {
    if (
      (t.isThisExpression(path.node.object) && 
       t.isIdentifier(path.node.property) && 
       path.node.property.name === '$slots') ||
      (t.isIdentifier(path.node.object) && 
       path.node.object.name === 'slots')
    ) {
      let parent = path.parent;
      if (t.isMemberExpression(parent) && t.isIdentifier(parent.property)) {
        this.slots.add(parent.property.name);
      }
    }
  }

  /**
   * 分析 useSlots() 调用
   */
  private analyzeCallExpression(path: NodePath<t.CallExpression>): void {
    if (t.isIdentifier(path.node.callee) && path.node.callee.name === 'useSlots') {
      const parentBinding = path.parentPath?.scope.getBinding('slots');
      if (parentBinding) {
        parentBinding.referencePaths.forEach(refPath => {
          let parent = refPath.parent;
          if (t.isMemberExpression(parent) && t.isIdentifier(parent.property)) {
            this.slots.add(parent.property.name);
          }
        });
      }
    }
  }

  /**
   * 分析 TSX 中的 slots 定义
   */
  private analyzeObjectProperty(path: NodePath<t.ObjectProperty>): void {
    if (
      t.isIdentifier(path.node.key) && 
      path.node.key.name === 'slots'
    ) {
      // 处理 Object as SlotsType<{...}> 形式
      if (
        t.isTSAsExpression(path.node.value) &&
        t.isTSTypeReference(path.node.value.typeAnnotation)
      ) {
        this.analyzeSlotsTypeReference(path.node.value.typeAnnotation as t.TSTypeReference);
      }
      // 处理直接的 SlotsType<{...}> 形式
      else if (t.isTSTypeReference(path.node.value)) {
        this.analyzeSlotsTypeReference(path.node.value as t.TSTypeReference);
      }
    }
  }

  /**
   * 分析 SlotsType<{...}> 类型引用
   */
  private analyzeSlotsTypeReference(typeRef: t.TSTypeReference): void {
    if (t.isIdentifier(typeRef.typeName) && typeRef.typeName.name === 'SlotsType') {
      const typeParameter = typeRef.typeParameters?.params[0];
      if (t.isTSTypeLiteral(typeParameter)) {
        typeParameter.members.forEach(member => {
          if (t.isTSPropertySignature(member) && t.isIdentifier(member.key)) {
            this.slots.add(member.key.name);
          }
        });
      }
    }
  }

  /**
   * 处理默认插槽的特殊情况
   */
  private handleDefaultSlot(): void {
    // 只有在模板中找到插槽时才考虑添加默认插槽
    if (this.hasTemplateSlots && !this.slots.has('default')) {
      // 检查模板中是否有不带 name 属性的 slot 标签
      const hasDefaultSlot = /<slot(?!\s+[^>]*?(?:name|:name|v-bind:name)=["'][^"']+["'])[^>]*?>/.test(this.templateContent);
      if (hasDefaultSlot) {
        this.slots.add('default');
      }
    }
  }
}

/**
 * 分析组件的插槽
 */
export function analyzeSlots(code: string, parsedContent?: { ast: ParseResult<File>; templateContent: string }): string[] {
  const analyzer = new SlotsAnalyzer(code, parsedContent);
  return analyzer.analyze();
} 