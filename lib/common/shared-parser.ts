export interface ParsedContent {
  scriptContent: string;
  templateContent: string;
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

export function parseComponent(code: string): ParsedContent {
  const templateContent = extractTemplateContent(code);
  const scriptContent = extractScriptContent(code);

  return {
    scriptContent,
    templateContent,
  };
} 
