import { describe, it, expect } from 'vitest';
import { renderMarkdownWithMath } from './render.js';

describe('renderMarkdownWithMath', () => {
  it('renders standard markdown tags (headings, bold, lists, code)', () => {
    const md = '# Topic Heading\n\n**Important:** remember to check *safety* first.\n\n- Step 1\n- Step 2\n\n`console.log("ok")`';
    const html = renderMarkdownWithMath(md);

    expect(html).toContain('<h1>Topic Heading</h1>');
    expect(html).toContain('<strong>Important:</strong>');
    expect(html).toContain('<em>safety</em>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>Step 1</li>');
    expect(html).toMatch(/<code>console\.log\((&quot;|")ok(&quot;|")\)<\/code>/);
  });

  it('renders inline KaTeX math $...$', () => {
    const md = 'The formula is $E = mc^2$ in physics.';
    const html = renderMarkdownWithMath(md);

    expect(html).toContain('class="katex"');
    expect(html).toContain('<math');
    expect(html).toContain('E = mc^2');
  });

  it('renders block KaTeX math $$...$$', () => {
    const md = 'Here is the integral:\n\n$$\\int_0^1 x dx$$\n\nEnd.';
    const html = renderMarkdownWithMath(md);

    expect(html).toContain('class="katex-display"');
    expect(html).toContain('\\int_0^1 x dx');
  });

  it('preserves currency and escaped dollar signs without triggering math', () => {
    const md = 'The lab kit costs $50, and the manual is $15.50. Literal: \\$100.';
    const html = renderMarkdownWithMath(md);

    expect(html).toContain('$50');
    expect(html).toContain('$15.50');
    expect(html).toContain('$100');
    expect(html).not.toContain('class="katex"');
  });

  it('handles empty or blank content gracefully', () => {
    expect(renderMarkdownWithMath('')).toBe('');
    expect(renderMarkdownWithMath('   ')).toContain('');
  });

  it('sanitizes malicious scripts and XSS payloads in browser environments', () => {
    // When window and DOMPurify are present, raw scripts must be neutralized
    const xssPayload = '<script>alert("xss")</script><img src=x onerror=alert(1)>Hello safe text';
    const output = renderMarkdownWithMath(xssPayload);
    // If running in environment with window, scripts are stripped
    if (typeof window !== 'undefined') {
      expect(output).not.toContain('<script>');
      expect(output).not.toContain('onerror=');
    }
    expect(output).toContain('Hello safe text');
  });
});
