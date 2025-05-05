import { parse } from '@babel/parser';
import type { ParseResult, ParserOptions } from '@babel/parser';
import type { File } from '@babel/types';

export interface ParsedContent {
  scriptContent: string;
  templateContent: string;
  ast: ParseResult<File>;
}

export function extractTemplateContent(code: string): string {
  const templateMatch = code.match(/<template[^>]*>([\s\S]*)<\/template>/i);
  return templateMatch ? templateMatch[1].trim() : '';
}

export function extractScriptContent(code: string): string {
  let scriptContent = code;
  const setupScriptMatch = code.match(/<script\s+setup\s*(?:lang="ts")?\s*>([\s\S]*?)<\/script>/i);
  const normalScriptMatch = code.match(/<script\s*(?:lang="ts")?\s*>([\s\S]*?)<\/script>/i);
  
  // Prioritize setup script over normal script
  if (setupScriptMatch) {
    scriptContent = setupScriptMatch[1].trim();
  } else if (normalScriptMatch) {
    scriptContent = normalScriptMatch[1].trim();
  }
  
  return scriptContent;
}

const defaultParserOptions: ParserOptions = {
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
};

export function parseComponent(code: string): ParsedContent {
  const templateContent = extractTemplateContent(code);
  const scriptContent = extractScriptContent(code);
  const ast = parse(scriptContent, defaultParserOptions);

  return {
    scriptContent,
    templateContent,
    ast
  };
} 
