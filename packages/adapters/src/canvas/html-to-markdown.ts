import { parse, HTMLElement, Node, NodeType } from 'node-html-parser';

const IGNORED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'SVG',
  'NOSCRIPT',
  'TEMPLATE',
]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '...',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : full;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : full;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? full;
  });
}

function isSafeHref(rawHref: string | undefined): string | null {
  if (!rawHref) return null;
  const trimmed = decodeHtmlEntities(rawHref).trim();
  if (!trimmed) return null;

  // Strip control characters and whitespace before checking URL protocol scheme
  // eslint-disable-next-line no-control-regex
  const schemeNormalized = trimmed.replace(/[\u0000-\u0020\s]+/g, '').toLowerCase();
  if (
    schemeNormalized.startsWith('javascript:') ||
    schemeNormalized.startsWith('vbscript:') ||
    schemeNormalized.startsWith('data:')
  ) {
    return null;
  }

  return trimmed;
}

interface RenderContext {
  inPre: boolean;
  listDepth: number;
}

function collapseInlineWhitespace(text: string): string {
  return decodeHtmlEntities(text).replace(/[ \t\r\n]+/g, ' ');
}

function renderInlineChildren(el: HTMLElement, ctx: RenderContext): string {
  return el.childNodes.map((child) => renderNode(child, ctx)).join('');
}

function extractRawText(node: Node): string {
  if (node.nodeType === NodeType.TEXT_NODE) {
    return decodeHtmlEntities(node.rawText);
  }
  if (node.nodeType === NodeType.ELEMENT_NODE) {
    const el = node as HTMLElement;
    const tag = el.tagName?.toUpperCase() || '';
    if (IGNORED_TAGS.has(tag)) return '';
    if (tag === 'BR') return '\n';
    return el.childNodes.map((c) => extractRawText(c)).join('');
  }
  return '';
}

function renderList(el: HTMLElement, ordered: boolean, ctx: RenderContext): string {
  const indent = '  '.repeat(ctx.listDepth);
  const lines: string[] = [];
  let index = 1;

  for (const child of el.childNodes) {
    if (child.nodeType !== NodeType.ELEMENT_NODE) continue;
    const childEl = child as HTMLElement;
    if (childEl.tagName?.toUpperCase() !== 'LI') continue;

    const bullet = ordered ? `${index}. ` : '- ';
    index++;

    const inlineParts: string[] = [];
    const nestedLists: string[] = [];

    for (const liChild of childEl.childNodes) {
      if (liChild.nodeType === NodeType.ELEMENT_NODE) {
        const liTag = (liChild as HTMLElement).tagName?.toUpperCase() || '';
        if (liTag === 'UL' || liTag === 'OL') {
          const renderedNested = renderList(liChild as HTMLElement, liTag === 'OL', {
            inPre: false,
            listDepth: ctx.listDepth + 1,
          });
          if (renderedNested) nestedLists.push(renderedNested);
          continue;
        }
      }
      inlineParts.push(renderNode(liChild, { inPre: false, listDepth: ctx.listDepth + 1 }));
    }

    const itemText = inlineParts.join('').replace(/\n+/g, ' ').replace(/[ \t]+/g, ' ').trim();
    if (itemText || nestedLists.length > 0) {
      lines.push(`${indent}${bullet}${itemText}`.trimEnd());
      for (const nested of nestedLists) {
        lines.push(nested);
      }
    }
  }

  if (lines.length === 0) return '';
  if (ctx.listDepth === 0) {
    return `\n\n${lines.join('\n')}\n\n`;
  }
  return lines.join('\n');
}

function renderTable(tableEl: HTMLElement, ctx: RenderContext): string {
  const rowElements: HTMLElement[] = [];

  const collectRows = (node: HTMLElement) => {
    for (const child of node.childNodes) {
      if (child.nodeType !== NodeType.ELEMENT_NODE) continue;
      const childEl = child as HTMLElement;
      const tag = childEl.tagName?.toUpperCase() || '';
      if (tag === 'TR') {
        rowElements.push(childEl);
      } else if (tag === 'THEAD' || tag === 'TBODY' || tag === 'TFOOT') {
        collectRows(childEl);
      }
    }
  };
  collectRows(tableEl);

  if (rowElements.length === 0) return '';

  const parsedRows: string[][] = rowElements.map((rowEl) => {
    const cells: string[] = [];
    for (const cell of rowEl.childNodes) {
      if (cell.nodeType !== NodeType.ELEMENT_NODE) continue;
      const cellEl = cell as HTMLElement;
      const cellTag = cellEl.tagName?.toUpperCase() || '';
      if (cellTag !== 'TH' && cellTag !== 'TD') continue;
      const cellText = renderInlineChildren(cellEl, { inPre: false, listDepth: ctx.listDepth })
        .replace(/\|/g, '\\|')
        .replace(/\n+/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .trim();
      cells.push(cellText);
    }
    return cells;
  });

  const nonEmptyRows = parsedRows.filter((r) => r.length > 0);
  if (nonEmptyRows.length === 0) return '';

  const columnCount = Math.max(...nonEmptyRows.map((r) => r.length));
  const normalizeRow = (r: string[]) => {
    const padded = [...r];
    while (padded.length < columnCount) padded.push('');
    return `| ${padded.join(' | ')} |`;
  };

  const lines: string[] = [];
  lines.push(normalizeRow(nonEmptyRows[0]));
  lines.push(`| ${Array.from({ length: columnCount }, () => '---').join(' | ')} |`);
  for (let i = 1; i < nonEmptyRows.length; i++) {
    lines.push(normalizeRow(nonEmptyRows[i]));
  }

  return `\n\n${lines.join('\n')}\n\n`;
}

function renderNode(node: Node, ctx: RenderContext): string {
  if (node.nodeType === NodeType.COMMENT_NODE) {
    return '';
  }

  if (node.nodeType === NodeType.TEXT_NODE) {
    return ctx.inPre ? decodeHtmlEntities(node.rawText) : collapseInlineWhitespace(node.rawText);
  }

  if (node.nodeType !== NodeType.ELEMENT_NODE) {
    return '';
  }

  const el = node as HTMLElement;
  const tag = el.tagName?.toUpperCase() || '';

  if (IGNORED_TAGS.has(tag)) {
    return '';
  }

  if (/^H[1-6]$/.test(tag)) {
    const level = Number(tag.slice(1));
    const inner = renderInlineChildren(el, ctx).replace(/\s+/g, ' ').trim();
    return inner ? `\n\n${'#'.repeat(level)} ${inner}\n\n` : '';
  }

  switch (tag) {
    case 'P': {
      const inner = renderInlineChildren(el, ctx).trim();
      return inner ? `\n\n${inner}\n\n` : '';
    }
    case 'BR':
      return '\n';
    case 'HR':
      return '\n\n---\n\n';
    case 'BLOCKQUOTE': {
      const inner = renderInlineChildren(el, ctx)
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (!inner) return '';
      const quoted = inner
        .split('\n')
        .map((line) => (line.trim() ? `> ${line.trim()}` : '>'))
        .join('\n');
      return `\n\n${quoted}\n\n`;
    }
    case 'STRONG':
    case 'B': {
      const inner = renderInlineChildren(el, ctx).trim();
      return inner ? `**${inner}**` : '';
    }
    case 'EM':
    case 'I': {
      const inner = renderInlineChildren(el, ctx).trim();
      return inner ? `*${inner}*` : '';
    }
    case 'DEL':
    case 'S': {
      const inner = renderInlineChildren(el, ctx).trim();
      return inner ? `~~${inner}~~` : '';
    }
    case 'PRE': {
      const rawCode = extractRawText(el).replace(/^\n+|\n+$/g, '');
      return rawCode ? `\n\n\`\`\`\n${rawCode}\n\`\`\`\n\n` : '';
    }
    case 'CODE': {
      if (ctx.inPre) {
        return extractRawText(el);
      }
      const codeText = decodeHtmlEntities(el.textContent || '').trim();
      return codeText ? `\`${codeText}\`` : '';
    }
    case 'A': {
      const label = renderInlineChildren(el, ctx).replace(/\s+/g, ' ').trim();
      const safeHref = isSafeHref(el.getAttribute('href'));
      if (!safeHref) return label;
      return `[${label || safeHref}](${safeHref})`;
    }
    case 'IMG': {
      const alt = decodeHtmlEntities(el.getAttribute('alt') || '').trim();
      return alt;
    }
    case 'UL':
      return renderList(el, false, ctx);
    case 'OL':
      return renderList(el, true, ctx);
    case 'TABLE':
      return renderTable(el, ctx);
    case 'DIV':
    case 'SECTION':
    case 'ARTICLE':
    case 'HEADER':
    case 'FOOTER':
    case 'MAIN':
    case 'ASIDE': {
      const inner = renderInlineChildren(el, ctx).trim();
      return inner ? `\n\n${inner}\n\n` : '';
    }
    default:
      return renderInlineChildren(el, ctx);
  }
}

/**
 * AST-based HTML-to-Markdown converter for Canvas LMS rich content using node-html-parser.
 * Preserves tables, nested lists, fenced code blocks, and safe links while stripping executable tags
 * and dangerous URI schemes (`javascript:`, `vbscript:`, `data:`).
 */
export function htmlToMarkdown(html: string | null | undefined): string {
  if (!html) return '';

  const root = parse(html, {
    comment: false,
    blockTextElements: {
      script: true,
      noscript: true,
      style: true,
    },
  });
  const rawMarkdown = root.childNodes
    .map((child) => renderNode(child, { inPre: false, listDepth: 0 }))
    .join('');

  return rawMarkdown
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+\n/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
