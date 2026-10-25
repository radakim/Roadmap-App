/* eslint-env jest */
// Native module mocks for jest-expo (no device / simulator needed)

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-secure-store', () => {
  const store = {};
  return {
    __store: store,
    getItemAsync: jest.fn(async (k) => (k in store ? store[k] : null)),
    setItemAsync: jest.fn(async (k, v) => { store[k] = v; }),
    deleteItemAsync: jest.fn(async (k) => { delete store[k]; })
  };
});

jest.mock('expo-clipboard', () => {
  const state = { text: '' };
  return {
    __state: state,
    setStringAsync: jest.fn(async (v) => { state.text = v; return true; }),
    getStringAsync: jest.fn(async () => state.text)
  };
});

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => {})
}));

jest.mock('expo-file-system/legacy', () => {
  const files = {};
  return {
    __files: files,
    cacheDirectory: 'file:///cache/',
    EncodingType: { UTF8: 'utf8', Base64: 'base64' },
    writeAsStringAsync: jest.fn(async (uri, data, opts) => { files[uri] = { data, opts }; }),
    readAsStringAsync: jest.fn(async (uri) => (files[uri] ? files[uri].data : ''))
  };
});

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null }))
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  setNotificationChannelAsync: jest.fn(async () => {}),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  AndroidImportance: { MAX: 5, HIGH: 4 },
  SchedulableTriggerInputTypes: { DAILY: 'daily' }
}));
