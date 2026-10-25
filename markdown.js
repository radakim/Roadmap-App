// ============================================================
// markdown.js - Lightweight Markdown parser shared by the
// lesson viewer (MarkdownView) and the DOCX exporter.
// Supports: headings, fenced code, bullets, numbered lists,
// checkboxes, tables, quotes, horizontal rules, **bold**,
// *italic* and `inline code`.
// ============================================================

const FENCE = /^\s*(```|~~~)\s*([\w+-]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const BULLET = /^(\s*)([-*+])\s+(.*)$/;
const NUMBERED = /^(\s*)(\d+[.)])\s+(.*)$/;
const CHECKBOX = /^\[( |x|X)\]\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

export function parseMarkdownBlocks(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let para = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: 'paragraph', text: para.join('\n') });
      para = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = line.match(FENCE);
    if (fence) {
      flushPara();
      const marker = fence[1];
      const code = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(marker)) {
        code.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'code', lang: fence[2] || '', text: code.join('\n') });
      continue;
    }

    if (!line.trim()) {
      flushPara();
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      flushPara();
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      continue;
    }

    if (HR.test(line)) {
      flushPara();
      blocks.push({ type: 'hr' });
      continue;
    }

    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      flushPara();
      const rows = [splitRow(line)];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      i--;
      blocks.push({ type: 'table', rows });
      continue;
    }

    const quote = line.match(QUOTE);
    if (quote) {
      flushPara();
      const q = [quote[1]];
      while (i + 1 < lines.length && QUOTE.test(lines[i + 1])) {
        i++;
        q.push(lines[i].match(QUOTE)[1]);
      }
      blocks.push({ type: 'quote', text: q.join('\n') });
      continue;
    }

    const bullet = line.match(BULLET);
    if (bullet) {
      flushPara();
      const level = Math.min(4, Math.floor(bullet[1].replace(/\t/g, '  ').length / 2));
      const cb = bullet[3].match(CHECKBOX);
      if (cb) {
        blocks.push({ type: 'bullet', level, checked: cb[1].toLowerCase() === 'x', text: cb[2] });
      } else {
        blocks.push({ type: 'bullet', level, text: bullet[3] });
      }
      continue;
    }

    const numbered = line.match(NUMBERED);
    if (numbered) {
      flushPara();
      const level = Math.min(4, Math.floor(numbered[1].replace(/\t/g, '  ').length / 2));
      blocks.push({ type: 'numbered', level, marker: numbered[2], text: numbered[3] });
      continue;
    }

    para.push(line);
  }
  flushPara();
  return blocks;
}

// Inline spans: **bold**, __bold__, *italic*, _italic_, `code`
export function parseInline(text) {
  const src = String(text || '');
  const spans = [];
  const re = /(\*\*([^*]+?)\*\*|__([^_]+?)__|`([^`]+?)`|\*([^*\s][^*]*?)\*|(?<![\w])_([^_\s][^_]*?)_(?![\w]))/g;
  let last = 0;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) spans.push({ text: src.slice(last, m.index) });
    if (m[2] !== undefined || m[3] !== undefined) spans.push({ text: m[2] ?? m[3], bold: true });
    else if (m[4] !== undefined) spans.push({ text: m[4], code: true });
    else spans.push({ text: m[5] ?? m[6], italic: true });
    last = m.index + m[0].length;
  }
  if (last < src.length) spans.push({ text: src.slice(last) });
  return spans;
}

// Plain-text rendering (used for clipboard copy)
export function stripInline(text) {
  return parseInline(text).map((s) => s.text).join('');
}
