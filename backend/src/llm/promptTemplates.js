import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.resolve(__dirname, '../../prompts');
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

const cache = new Map();

export function loadPromptTemplate(name) {
  if (!cache.has(name)) {
    const fullPath = path.join(PROMPTS_DIR, name);
    cache.set(name, readFileSync(fullPath, 'utf8').trim());
  }
  return cache.get(name);
}

export function renderTemplate(template, values) {
  const used = new Set();
  const rendered = template.replace(PLACEHOLDER_RE, (_match, key) => {
    used.add(key);
    if (!Object.hasOwn(values, key)) {
      throw new Error(`Prompt template missing value for {{${key}}}`);
    }
    const value = values[key];
    return value == null ? '' : String(value);
  });

  const unresolved = rendered.match(PLACEHOLDER_RE);
  if (unresolved) {
    throw new Error(`Prompt template has unresolved placeholders: ${unresolved.join(', ')}`);
  }

  return rendered;
}

export function renderPromptTemplate(name, values) {
  return renderTemplate(loadPromptTemplate(name), values);
}
