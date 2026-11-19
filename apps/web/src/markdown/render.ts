import { marked } from 'marked';
import katex from 'katex';

/**
 * Configure marked renderer for clean accessible HTML.
 */
marked.setOptions({
  gfm: true,
  breaks: true,
});

const ESCAPED_DOLLAR_PLACEHOLDER = '___ESCAPED_DOLLAR___';

/**
 * Parses markdown text containing inline/block LaTeX formulas into accessible HTML
 * with MathML and KaTeX markup.
 */
export function renderMarkdownWithMath(content: string): string {
  if (!content) return '';

  // 1. Protect escaped dollars
  let text = content.replace(/\\\$/g, ESCAPED_DOLLAR_PLACEHOLDER);

  // 2. Block math: $$ ... $$ or \[ ... \]
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
    try {
      return '\n\n' + katex.renderToString(math.trim(), { displayMode: true, throwOnError: false }) + '\n\n';
    } catch {
      return math;
    }
  });

  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_, math) => {
    try {
      return '\n\n' + katex.renderToString(math.trim(), { displayMode: true, throwOnError: false }) + '\n\n';
    } catch {
      return math;
    }
  });

  // 3. Inline math: \( ... \) or $ ... $
  text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
    } catch {
      return math;
    }
  });

  text = text.replace(/(?<!\w)\$([^$\n]+?)\$(?!\w)/g, (match, math) => {
    // If content is purely numeric / currency e.g. "50", "100.00", keep as literal currency
    if (/^\s*\d+([.,]\d+)?\s*$/.test(math)) {
      return match;
    }
    try {
      return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
    } catch {
      return match;
    }
  });

  // 4. Restore escaped dollars
  text = text.replace(new RegExp(ESCAPED_DOLLAR_PLACEHOLDER, 'g'), '$');

  // 5. Parse markdown to HTML
  const parsed = marked.parse(text, { async: false });
  return typeof parsed === 'string' ? parsed : '';
}
