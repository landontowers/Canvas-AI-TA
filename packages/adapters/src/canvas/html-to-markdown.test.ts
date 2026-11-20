import { describe, it, expect } from 'vitest';
import { htmlToMarkdown, decodeHtmlEntities } from './html-to-markdown.js';

describe('htmlToMarkdown (AST-based Canvas content parser)', () => {
  it('handles null, undefined, empty strings, and HTML entity decoding', () => {
    expect(htmlToMarkdown(null)).toBe('');
    expect(htmlToMarkdown(undefined)).toBe('');
    expect(htmlToMarkdown('')).toBe('');
    expect(decodeHtmlEntities('5 &lt; 10 &amp; 20 &gt; 15 &#39;ok&#39; &quot;yes&quot;')).toBe(
      '5 < 10 & 20 > 15 \'ok\' "yes"',
    );
    expect(decodeHtmlEntities('Check &#x27;hex&#x27; &amp; &#64;dec&nbsp;end')).toBe(
      "Check 'hex' & @dec end",
    );
  });

  it('converts Canvas headings, paragraphs, emphasis, code, blockquotes, and preformatted blocks', () => {
    const html = `
      <h3>Lab Safety Assessment</h3>
      <p>Identify all <strong>required gear</strong> and <em>shop steps</em> using <code>calipers</code>.</p>
      <blockquote>Always verify zero before measuring.</blockquote>
      <pre><code>twist = 150 * (d * d) / len\nprint(twist)</code></pre>
    `;
    const md = htmlToMarkdown(html);
    expect(md).toContain('### Lab Safety Assessment');
    expect(md).toContain('**required gear**');
    expect(md).toContain('*shop steps*');
    expect(md).toContain('`calipers`');
    expect(md).toContain('> Always verify zero before measuring.');
    expect(md).toContain('```\ntwist = 150 * (d * d) / len\nprint(twist)\n```');
    expect(htmlToMarkdown('<pre>if (a &lt; b) {\n  return 1;\n}</pre>')).toBe(
      '```\nif (a < b) {\n  return 1;\n}\n```',
    );
  });

  it('preserves nested unordered and ordered lists accurately', () => {
    const html = `
      <ul>
        <li>Bench Check
          <ol>
            <li>Verify clear chamber</li>
            <li>Inspect muzzle crown</li>
          </ol>
        </li>
        <li>Calibrate micrometer</li>
      </ul>
    `;
    const md = htmlToMarkdown(html);
    expect(md).toBe(
      [
        '- Bench Check',
        '  1. Verify clear chamber',
        '  2. Inspect muzzle crown',
        '- Calibrate micrometer',
      ].join('\n'),
    );
  });

  it('renders Canvas HTML tables as GFM Markdown tables', () => {
    const html = `
      <table>
        <thead>
          <tr><th>Caliber</th><th>Nominal SAAMI PSI</th></tr>
        </thead>
        <tbody>
          <tr><td>.223 Rem | 5.56</td><td>55,000 PSI</td></tr>
          <tr><td>.308 Win</td><td>62,000 PSI</td></tr>
        </tbody>
      </table>
    `;
    const md = htmlToMarkdown(html);
    expect(md).toBe(
      [
        '| Caliber | Nominal SAAMI PSI |',
        '| --- | --- |',
        '| .223 Rem \\| 5.56 | 55,000 PSI |',
        '| .308 Win | 62,000 PSI |',
      ].join('\n'),
    );
  });

  it('strips executable tags and neutralizes unsafe link schemes while preserving safe links', () => {
    const html = `
      <script>alert("xss")</script>
      <style>body { color: red; }</style>
      <iframe src="https://evil.example"></iframe>
      <p>Read <a href="https://classroom.sdi.edu/courses/101/syllabus">Course Syllabus</a>
      and avoid <a href="javascript:alert(1)">Click Here</a>
      or <a href="  DaTa:text/html,<script>1</script>">Bad Data Link</a>.</p>
    `;
    const md = htmlToMarkdown(html);
    expect(md).not.toContain('alert(');
    expect(md).not.toContain('javascript:');
    expect(md).not.toContain('DaTa:');
    expect(md).toContain('[Course Syllabus](https://classroom.sdi.edu/courses/101/syllabus)');
    expect(md).toContain('Click Here');
    expect(md).toContain('Bad Data Link');
  });
});
