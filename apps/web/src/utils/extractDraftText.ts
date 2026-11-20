export const MAX_DRAFT_CHARS = 6000;

export interface ExtractedDraftResult {
  name: string;
  text: string;
  charCount: number;
  truncated: boolean;
}

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'csv']);

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx + 1).toLowerCase() : '';
}

/**
 * Extracts plain text from .txt, .md, .docx, or .pdf entirely in the browser.
 * Binary parsers (mammoth and pdfjs-dist) are lazy-loaded only when needed.
 */
export async function extractTextFromFile(file: File): Promise<ExtractedDraftResult> {
  const ext = getExtension(file.name);
  let rawText = '';

  if (TEXT_EXTENSIONS.has(ext) || file.type.startsWith('text/')) {
    rawText = await file.text();
  } else if (ext === 'docx') {
    const mammoth = await import('mammoth');
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    rawText = result.value || '';
  } else if (ext === 'pdf') {
    const pdfjs = await import('pdfjs-dist');
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
    }
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data }).promise;
    const pages: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
        .join(' ');
      if (pageText.trim()) pages.push(pageText.trim());
    }
    rawText = pages.join('\n\n');
  } else {
    throw new Error(
      `Unsupported file type "${ext ? `.${ext}` : file.type}". Please attach a .txt, .md, .docx, or .pdf file.`,
    );
  }

  const normalized = rawText.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  if (!normalized) {
    throw new Error(
      ext === 'pdf'
        ? 'No selectable text was found in this PDF (it may be scanned images). Try pasting your draft text instead.'
        : 'The selected file appears to be empty.',
    );
  }

  const truncated = normalized.length > MAX_DRAFT_CHARS;
  const text = truncated ? normalized.slice(0, MAX_DRAFT_CHARS) : normalized;
  return {
    name: file.name,
    text,
    charCount: text.length,
    truncated,
  };
}
