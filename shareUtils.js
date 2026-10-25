// ============================================================
// shareUtils.js - Clipboard copy + DOCX file export/share
// ============================================================

import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { buildDocxBase64 } from './docxExport';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Returns 'copied' | 'shared' | false
export async function copyText(text) {
  const value = String(text || '');
  try {
    await Clipboard.setStringAsync(value);
    return 'copied';
  } catch (e) {
    // Clipboard native module missing (old dev build): fall back to the share sheet
    try {
      await Share.share({ message: value });
      return 'shared';
    } catch (e2) {
      return false;
    }
  }
}

// ASCII-only file names avoid file:// URI encoding problems on Android/iOS.
export function docxFileName(baseName, fallback) {
  let base = String(baseName || '');
  try {
    base = base.normalize('NFKD');
  } catch (e) {
    // normalize() unavailable on this JS engine: keep the raw string
  }
  const ascii = base
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return `${ascii || fallback || 'lesson'}.docx`;
}

// Writes the .docx into the cache folder and opens the OS share sheet
// (Save to Files, Drive, email, WhatsApp, Word...).
export async function exportDocx({ title, markdown, fileName, dialogTitle }) {
  const base64 = buildDocxBase64({ title, markdown });
  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) return { shared: false, uri };
  await Sharing.shareAsync(uri, {
    mimeType: DOCX_MIME,
    UTI: 'org.openxmlformats.wordprocessingml.document',
    dialogTitle: dialogTitle || title
  });
  return { shared: true, uri };
}
