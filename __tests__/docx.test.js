import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { buildDocx, buildDocxBase64, utf8Encode, bytesToBase64, markdownToDocumentXml } from '../docxExport';
import { parseMarkdownBlocks, parseInline } from '../markdown';

const SAMPLE = `# Day 4 — Docker Networking
## Overview
Plain **bold** and *italic* and \`inline code\`.

### PART 1 — Core Lesson
- Bridge networks
  - nested bullet
- [ ] checkbox item
1. First step
2. Second step

\`\`\`bash
docker network create my-net
docker run --rm --network my-net alpine ping -c 1 web
\`\`\`

| Network | Driver | Scope |
| --- | --- | --- |
| bridge | bridge | local |
| host | host | local |

> Quote line

---
中文内容：容器网络 & <special> "chars"`;

describe('markdown parser', () => {
  test('parses block types', () => {
    const types = parseMarkdownBlocks(SAMPLE).map((b) => b.type);
    expect(types).toEqual(expect.arrayContaining(['heading', 'paragraph', 'bullet', 'numbered', 'code', 'table', 'quote', 'hr']));
    const table = parseMarkdownBlocks(SAMPLE).find((b) => b.type === 'table');
    expect(table.rows).toEqual([['Network', 'Driver', 'Scope'], ['bridge', 'bridge', 'local'], ['host', 'host', 'local']]);
  });
  test('inline spans', () => {
    expect(parseInline('a **b** c `d` *e*')).toEqual([
      { text: 'a ' }, { text: 'b', bold: true }, { text: ' c ' }, { text: 'd', code: true }, { text: ' ' }, { text: 'e', italic: true }
    ]);
  });
  test('very long content is fully parsed (no truncation)', () => {
    const long = Array.from({ length: 3000 }, (_, i) => `Paragraph ${i} ${'x'.repeat(50)}\n`).join('\n');
    const blocks = parseMarkdownBlocks(long);
    expect(blocks).toHaveLength(3000);
    expect(blocks[2999].text).toContain('Paragraph 2999');
  });
});

describe('docx export', () => {
  test('utf8 + base64 helpers match Node', () => {
    const s = 'Hello 世界 😀 & <x>';
    expect(Buffer.from(utf8Encode(s)).toString('utf8')).toBe(s);
    const bytes = utf8Encode(s);
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    for (const n of [0, 1, 2, 3, 4, 5]) {
      const b = Uint8Array.from(Array.from({ length: n }, (_, i) => i * 37));
      expect(bytesToBase64(b)).toBe(Buffer.from(b).toString('base64'));
    }
  });

  test('document.xml is well-formed and escapes special characters', () => {
    const xml = markdownToDocumentXml(SAMPLE, 'Roadmap & <Title>');
    expect(xml).toContain('Roadmap &amp; &lt;Title&gt;');
    expect(xml).toContain('&lt;special&gt; &quot;chars&quot;');
    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('Heading1');
  });

  test('produces a valid .docx that macOS textutil / unzip can read', () => {
    const bytes = buildDocx({ title: 'DevOps Roadmap', markdown: SAMPLE });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docx-'));
    const file = path.join(dir, 'lesson.docx');
    fs.writeFileSync(file, Buffer.from(bytes));

    // ZIP integrity
    const unzipList = execFileSync('unzip', ['-t', file]).toString();
    expect(unzipList).toMatch(/No errors detected/);

    // Base64 path used on device decodes to identical bytes
    expect(Buffer.from(buildDocxBase64({ title: 'DevOps Roadmap', markdown: SAMPLE }), 'base64').length).toBe(bytes.length);

    // Word-compatible reader (macOS textutil) extracts the text
    if (process.platform === 'darwin') {
      const out = path.join(dir, 'lesson.txt');
      execFileSync('textutil', ['-convert', 'txt', file, '-output', out]);
      const text = fs.readFileSync(out, 'utf8');
      expect(text).toContain('DevOps Roadmap');
      expect(text).toContain('Docker Networking');
      expect(text).toContain('docker network create my-net');
      expect(text).toContain('中文内容：容器网络');
      expect(text).toContain('bridge');
    }
  });

  test('large lesson (200k chars) exports completely', () => {
    const md = Array.from({ length: 2000 }, (_, i) => `## Section ${i}\n${'Lorem ipsum dolor sit amet. '.repeat(3)}`).join('\n\n');
    const bytes = buildDocx({ title: 'Big', markdown: md });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docx-'));
    const file = path.join(dir, 'big.docx');
    fs.writeFileSync(file, Buffer.from(bytes));
    expect(execFileSync('unzip', ['-t', file]).toString()).toMatch(/No errors detected/);
    if (process.platform === 'darwin') {
      const out = path.join(dir, 'big.txt');
      execFileSync('textutil', ['-convert', 'txt', file, '-output', out]);
      expect(fs.readFileSync(out, 'utf8')).toContain('Section 1999');
    }
  });
});
