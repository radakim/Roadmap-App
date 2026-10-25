// ============================================================
// shareUtils.web.js - Clipboard copy + DOCX download (browser)
// Metro picks this file instead of shareUtils.js on web.
// ============================================================

import { buildDocxBase64 } from './docxExport';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Returns 'copied' | false
export async function copyText(text) {
  const value = String(text || '');
  try {
    await navigator.clipboard.writeText(value);
    return 'copied';
  } catch (e) {
    // Older browsers / non-HTTPS: fall back to a hidden textarea
    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok ? 'copied' : false;
    } catch (e2) {
      return false;
    }
  }
}

export function docxFileName(baseName, fallback) {
  let base = String(baseName || '');
  try {
    base = base.normalize('NFKD');
  } catch (e) {
    // keep the raw string
  }
  const ascii = base
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return `${ascii || fallback || 'lesson'}.docx`;
}

// Builds the .docx and triggers a browser download
export async function exportDocx({ title, markdown, fileName }) {
  const base64 = buildDocxBase64({ title, markdown });
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: DOCX_MIME }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { shared: true, uri: fileName };
}
