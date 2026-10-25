import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  loadAppState,
  saveAppState,
  scheduleSave,
  flushPendingSave,
  sanitizeForExport,
  isStorageReadOnly,
  getInitialAppState,
  STORAGE_KEY_V2,
  STORAGE_KEY_V3
} from '../storage';

function v2Fixture() {
  const s = getInitialAppState();
  s.version = 2;
  delete s.settings;
  s.aiConfig = { provider: 'gemini', apiKey: 'AIzaSyOLDPLAINKEY', model: 'gemini-1.5-flash', temperature: 0.7 };
  const r = s.roadmaps[0];
  r.currentDay = 6;
  r.doneDays = [1, 2, 3, 4, 5];
  r.notes = { 1: 'first note', 5: 'fifth note' };
  r.lessons = { 2: { day: 2, topic: 'IPv4', content: '# Lesson 2', type: 'ai' } };
  r.quizzes = { 2: { day: 2, quiz: [{ question: 'q', options: ['a', 'b'], answerIndex: 0 }] } };
  r.referenceDocs = { 3: { content: 'doc', name: 'd.txt' } };
  r.globalReferenceDoc = 'global doc';
  return s;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  Object.keys(SecureStore.__store).forEach((k) => delete SecureStore.__store[k]);
  jest.clearAllMocks();
});

test('existing v2 data migrates without loss, v2 backup is kept, key moves to secure storage', async () => {
  const v2 = v2Fixture();
  await AsyncStorage.setItem(STORAGE_KEY_V2, JSON.stringify(v2));

  const loaded = await loadAppState();
  const r = loaded.roadmaps[0];
  expect(r.doneDays).toEqual([1, 2, 3, 4, 5]);
  expect(r.notes).toEqual({ 1: 'first note', 5: 'fifth note' });
  expect(r.lessons[2].content).toBe('# Lesson 2');
  expect(r.globalReferenceDoc).toBe('global doc');
  expect(loaded.aiConfig.apiKey).toBe('AIzaSyOLDPLAINKEY');
  expect(loaded.aiConfig.model).toBe('gemini-2.5-flash');
  expect(['en', 'zh']).toContain(loaded.settings.language);

  // Key now in secure storage and scrubbed from the v2 backup copy
  expect(SecureStore.__store.life_roadmap_ai_api_key).toBe('AIzaSyOLDPLAINKEY');
  const v2After = JSON.parse(await AsyncStorage.getItem(STORAGE_KEY_V2));
  expect(v2After.aiConfig.apiKey).toBe('');
  expect(v2After.roadmaps[0].notes).toEqual({ 1: 'first note', 5: 'fifth note' });

  // Save writes v3 shards, never the key in plain text
  expect(await saveAppState(loaded)).toBe(true);
  const keys = await AsyncStorage.getAllKeys();
  expect(keys).toContain(STORAGE_KEY_V3);
  const plain = (await AsyncStorage.multiGet(keys)).map(([, v]) => v).join('\n');
  expect(plain).not.toContain('AIzaSyOLDPLAINKEY');

  // Reload from v3 is identical
  const again = await loadAppState();
  const norm = (rs) => rs.map((x) => ({ lessons: {}, quizzes: {}, referenceDocs: {}, ...x }));
  expect(norm(again.roadmaps)).toEqual(norm(loaded.roadmaps));
  expect(again.aiConfig.apiKey).toBe('AIzaSyOLDPLAINKEY');
});

test('very long notes (5 MB) save and load completely with no limit', async () => {
  const state = await loadAppState();
  const big = 'Line of notes 你好 '.repeat(300000); // ~5.4M chars
  const r = state.roadmaps[0];
  const next = { ...state, roadmaps: [{ ...r, notes: { ...r.notes, 1: big, 2: 'short' } }, ...state.roadmaps.slice(1)] };
  expect(await saveAppState(next)).toBe(true);
  const loaded = await loadAppState();
  expect(loaded.roadmaps[0].notes[1].length).toBe(big.length);
  expect(loaded.roadmaps[0].notes[1]).toBe(big);
  expect(loaded.roadmaps[0].notes[2]).toBe('short');
});

test('only changed records are rewritten on save', async () => {
  const state = await loadAppState();
  await saveAppState(state);
  const r = state.roadmaps[0];
  const withNote = (text) => ({ ...state, roadmaps: [{ ...r, notes: { ...r.notes, 7: text } }, ...state.roadmaps.slice(1)] });
  const noteKey = `lr3:rm:${encodeURIComponent(r.id)}:notes:7`;

  AsyncStorage.multiSet.mockClear();
  await saveAppState(withNote('typed'));
  let written = AsyncStorage.multiSet.mock.calls.flatMap((c) => c[0].map(([k]) => k));
  // New day key: the note shard plus the meta index that lists it
  expect(written.sort()).toEqual([STORAGE_KEY_V3, noteKey].sort());

  AsyncStorage.multiSet.mockClear();
  await saveAppState(withNote('typed more'));
  written = AsyncStorage.multiSet.mock.calls.flatMap((c) => c[0].map(([k]) => k));
  // Editing an existing note rewrites only that note (plus the small meta timestamp)
  expect(written.filter((k) => k !== STORAGE_KEY_V3)).toEqual([noteKey]);
});

test('debounced auto-save persists the latest state', async () => {
  const state = await loadAppState();
  const r = state.roadmaps[0];
  scheduleSave({ ...state, roadmaps: [{ ...r, notes: { 1: 'a' } }, ...state.roadmaps.slice(1)] });
  scheduleSave({ ...state, roadmaps: [{ ...r, notes: { 1: 'ab' } }, ...state.roadmaps.slice(1)] });
  await flushPendingSave();
  const loaded = await loadAppState();
  expect(loaded.roadmaps[0].notes[1]).toBe('ab');
});

test('a failed load never overwrites existing data', async () => {
  await AsyncStorage.setItem(STORAGE_KEY_V2, '{ this is corrupt json');
  const loaded = await loadAppState();
  expect(loaded.__loadFailed).toBe(true);
  expect(isStorageReadOnly()).toBe(true);
  expect(await saveAppState(loaded)).toBe(false);
  expect(await AsyncStorage.getItem(STORAGE_KEY_V2)).toBe('{ this is corrupt json');
  expect(await AsyncStorage.getItem(STORAGE_KEY_V3)).toBeNull();
});

test('deleting a roadmap removes its shards; other data stays', async () => {
  const state = await loadAppState();
  const [a, b, c] = state.roadmaps;
  await saveAppState({ ...state, roadmaps: [{ ...a, notes: { 1: 'keep' } }, { ...b, notes: { 1: 'gone' } }, c] });
  await saveAppState({ ...state, roadmaps: [{ ...a, notes: { 1: 'keep' } }, c] });
  const keys = await AsyncStorage.getAllKeys();
  expect(keys.some((k) => k.includes(encodeURIComponent(b.id)))).toBe(false);
  const loaded = await loadAppState();
  expect(loaded.roadmaps.map((r) => r.id)).toEqual([a.id, c.id]);
  expect(loaded.roadmaps[0].notes[1]).toBe('keep');
});

test('exports never include the API key', () => {
  const s = { ...getInitialAppState(), aiConfig: { provider: 'openai', apiKey: 'sk-secret', model: 'gpt-4o-mini' } };
  const out = sanitizeForExport(s);
  expect(JSON.stringify(out)).not.toContain('sk-secret');
  expect(s.aiConfig.apiKey).toBe('sk-secret'); // original untouched
});
