// ============================================================
// backup.js  -  JSON Backup / Restore helpers
// Uses: expo-file-system, expo-sharing, expo-document-picker
// No user account required - pure local file operations
// ============================================================

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Alert } from 'react-native';

// Export: write JSON to cache dir then open OS share-sheet
export async function exportBackupFile(appData) {
  try {
    const json = JSON.stringify(appData, null, 2);
    const dateTag = new Date().toISOString().slice(0, 10);
    const fileName = `life_roadmap_backup_${dateTag}.json`;
    const fileUri = FileSystem.cacheDirectory + fileName;

    await FileSystem.writeAsStringAsync(fileUri, json, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      Alert.alert(
        'Sharing not available',
        'Backup saved to app cache:\n' + fileUri
      );
      return { success: false, reason: 'sharing_unavailable', uri: fileUri };
    }

    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/json',
      dialogTitle: 'Save your Life Roadmap backup',
      UTI: 'public.json',
    });

    return { success: true, uri: fileUri };
  } catch (err) {
    console.error('exportBackupFile error:', err);
    Alert.alert('Export Failed', err.message || 'Could not export backup file.');
    return { success: false, reason: err.message };
  }
}

// Import: open OS file-picker -> read -> parse -> validate
export async function importBackupFile() {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'text/plain', '*/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });

    // Expo SDK 49+ returns result.assets array
    const asset = result.assets ? result.assets[0] : result;

    if (!asset || asset.canceled || result.canceled) {
      return { success: false, reason: 'canceled' };
    }

    const fileUri = asset.uri;
    if (!fileUri) {
      return { success: false, reason: 'no_uri' };
    }

    const raw = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      Alert.alert('Invalid File', 'The selected file is not valid JSON.');
      return { success: false, reason: 'invalid_json' };
    }

    if (!parsed || !Array.isArray(parsed.roadmaps)) {
      Alert.alert(
        'Invalid Backup',
        'The JSON file does not look like a Life Roadmap backup (missing "roadmaps" array).'
      );
      return { success: false, reason: 'invalid_schema' };
    }

    return { success: true, data: parsed };
  } catch (err) {
    console.error('importBackupFile error:', err);
    Alert.alert('Import Failed', err.message || 'Could not read the selected file.');
    return { success: false, reason: err.message };
  }
}
