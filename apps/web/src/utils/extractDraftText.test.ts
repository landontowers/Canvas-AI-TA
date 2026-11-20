import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractTextFromFile, MAX_DRAFT_CHARS } from './extractDraftText.js';

vi.mock('mammoth', () => ({
  extractRawText: vi.fn().mockResolvedValue({ value: 'DOCX extracted safety outline.' }),
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn().mockReturnValue({
    promise: Promise.resolve({
      numPages: 1,
      getPage: vi.fn().mockResolvedValue({
        getTextContent: vi.fn().mockResolvedValue({
          items: [{ str: 'PDF page 1 draft text.' }],
        }),
      }),
    }),
  }),
}));

describe('extractTextFromFile', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('extracts plain text from .txt and .md files and truncates over MAX_DRAFT_CHARS', async () => {
    const smallFile = new File(['Hello **rubric** world'], 'outline.md', { type: 'text/markdown' });
    const smallRes = await extractTextFromFile(smallFile);
    expect(smallRes).toEqual({
      name: 'outline.md',
      text: 'Hello **rubric** world',
      charCount: 22,
      truncated: false,
    });

    const longText = 'A'.repeat(MAX_DRAFT_CHARS + 250);
    const bigFile = new File([longText], 'long.txt', { type: 'text/plain' });
    const bigRes = await extractTextFromFile(bigFile);
    expect(bigRes.truncated).toBe(true);
    expect(bigRes.charCount).toBe(MAX_DRAFT_CHARS);
    expect(bigRes.text.length).toBe(MAX_DRAFT_CHARS);
  });

  it('lazy-loads mammoth for .docx files and pdfjs-dist for .pdf files', async () => {
    const docxFile = new File([new Uint8Array([1, 2, 3])], 'lab1.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const docxRes = await extractTextFromFile(docxFile);
    expect(docxRes.text).toBe('DOCX extracted safety outline.');

    const pdfFile = new File([new Uint8Array([37, 80, 68, 70])], 'lab1.pdf', {
      type: 'application/pdf',
    });
    const pdfRes = await extractTextFromFile(pdfFile);
    expect(pdfRes.text).toBe('PDF page 1 draft text.');
  });

  it('rejects unsupported extensions and empty files', async () => {
    const badFile = new File(['abc'], 'image.png', { type: 'image/png' });
    await expect(extractTextFromFile(badFile)).rejects.toThrow(/Unsupported file type/i);

    const emptyTxt = new File(['   '], 'empty.txt', { type: 'text/plain' });
    await expect(extractTextFromFile(emptyTxt)).rejects.toThrow(/appears to be empty/i);
  });
});
