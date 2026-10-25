import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildHuaweiRoadmap, buildFullStackRoadmap, buildHabitsRoadmap } from './templates';
import { normalizeModel, normalizeProvider, DEFAULT_AI_MODEL } from './aiService';
import { detectDeviceLanguage, normalizeLanguage } from './i18n';

// ------------------------------------------------------------
// Storage layout
//   v1  'huawei_roadmap_v1'   - original single-roadmap app (migrated)
//   v2  'life_roadmaps_v2'    - whole app state in ONE value (kept untouched as a backup)
//   v3  'life_roadmaps_v3'    - meta + one key per roadmap + one key per day item
// v3 exists because a single value grows with every lesson and note: it is
// rewritten on every keystroke and, on Android, values over ~2 MB cannot be
// read back. Sharding keeps each value small and only changed keys are written,
// so notes have no practical length limit.
// ------------------------------------------------------------
export const STORAGE_KEY_V3 = 'life_roadmaps_v3';
export const STORAGE_KEY_V2 = 'life_roadmaps_v2';
export const LEGACY_KEY_V1 = 'huawei_roadmap_v1';
const SHARD_PREFIX = 'lr3:rm:';
const SECURE_KEY_NAME = 'life_roadmap_ai_api_key';

// Per-day fields that are stored one key per day
export const SHARDED_DAY_FIELDS = ['notes', 'lessons', 'quizzes', 'referenceDocs'];

// API key lives in the OS keychain / keystore when available
let SecureStore = null;
try {
  // eslint-disable-next-line global-require
  SecureStore = require('expo-secure-store');
} catch (e) {
  SecureStore = null;
}

async function secureGet() {
  try {
    if (SecureStore && SecureStore.getItemAsync) return (await SecureStore.getItemAsync(SECURE_KEY_NAME)) || '';
  } catch (e) {
    console.warn('SecureStore read failed', e);
  }
  return null; // null = secure storage unavailable
}

async function secureSet(value) {
  try {
    if (SecureStore && SecureStore.setItemAsync) {
      if (value) await SecureStore.setItemAsync(SECURE_KEY_NAME, value);
      else await SecureStore.deleteItemAsync(SECURE_KEY_NAME);
      return true;
    }
  } catch (e) {
    console.warn('SecureStore write failed', e);
  }
  return false;
}

export function defaultAiConfig() {
  return {
    provider: 'deepseek',
    apiKey: '',
    model: DEFAULT_AI_MODEL,
    temperature: 0.7
  };
}

// Default initial state with rich presets
export function getInitialAppState() {
  const huawei = buildHuaweiRoadmap();
  const fullstack = buildFullStackRoadmap();
  const habits = buildHabitsRoadmap();

  return {
    version: 3,
    activeRoadmapId: huawei.id,
    roadmaps: [huawei, fullstack, habits],
    syncUrl: '',
    streak: { count: 0, lastDate: '' },
    reminder: { enabled: true, time: '20:00' },
    // Timer state — persisted so closing the app doesn't lose the session
    timerState: {
      activeMode: 'learn',   // label string
      timeLeft: 20 * 60,     // seconds
      isRunning: false,      // always paused on restore for safety
      activeTaskId: null     // id of the linked task, or null
    },
    // AI Configuration (DeepSeek + OpenAI)
    aiConfig: defaultAiConfig(),
    // Interface + default AI content language ('en' | 'zh')
    settings: { language: detectDeviceLanguage() }
  };
}

// Fill in fields added by newer versions without touching user data
export function migrateState(parsed) {
  const state = { ...parsed };
  if (!state.aiConfig) {
    state.aiConfig = defaultAiConfig();
  } else {
    // Gemini (older versions) is no longer offered: anything but OpenAI moves to DeepSeek
    const provider = normalizeProvider(state.aiConfig.provider);
    state.aiConfig = { ...state.aiConfig, provider, model: normalizeModel(provider, state.aiConfig.model) };
  }
  state.settings = {
    ...(state.settings || {}),
    language: normalizeLanguage(state.settings?.language) || detectDeviceLanguage()
  };
  state.roadmaps = state.roadmaps.map((r) => ({
    ...r,
    doneDays: Array.isArray(r.doneDays) ? r.doneDays : [],
    notes: r.notes || {},
    tasks: r.tasks || {}
  }));
  state.version = 3;
  return state;
}

// ---------------- Shard (de)serialization ----------------
const enc = (s) => encodeURIComponent(String(s));

export function shardKeysFor(state) {
  // Returns [key, value] pairs (value is a JS value, serialized later)
  const { roadmaps = [], ...app } = state;
  const pairs = [];
  roadmaps.forEach((r) => {
    const base = SHARD_PREFIX + enc(r.id);
    const core = { ...r };
    SHARDED_DAY_FIELDS.forEach((f) => { delete core[f]; });
    delete core.globalReferenceDoc;
    delete core.archivedDays;
    pairs.push([base, core]);
    SHARDED_DAY_FIELDS.forEach((f) => {
      Object.keys(r[f] || {}).forEach((day) => {
        const v = r[f][day];
        if (v !== undefined && v !== null) pairs.push([`${base}:${f}:${enc(day)}`, v]);
      });
    });
    if (r.globalReferenceDoc) pairs.push([`${base}:globalRef`, r.globalReferenceDoc]);
    if (Array.isArray(r.archivedDays) && r.archivedDays.length) pairs.push([`${base}:archive`, r.archivedDays]);
  });
  return { app, roadmapIds: roadmaps.map((r) => r.id), pairs };
}

export function rebuildFromShards(meta, valuesByKey) {
  const roadmaps = (meta.roadmapIds || []).map((id) => {
    const base = SHARD_PREFIX + enc(id);
    const coreRaw = valuesByKey[base];
    if (coreRaw === undefined) return null;
    const r = { ...coreRaw };
    SHARDED_DAY_FIELDS.forEach((f) => { r[f] = {}; });
    Object.keys(valuesByKey).forEach((key) => {
      if (!key.startsWith(base + ':')) return;
      const rest = key.slice(base.length + 1);
      if (rest === 'globalRef') { r.globalReferenceDoc = valuesByKey[key]; return; }
      if (rest === 'archive') { r.archivedDays = valuesByKey[key]; return; }
      const sep = rest.indexOf(':');
      if (sep < 0) return;
      const field = rest.slice(0, sep);
      const day = decodeURIComponent(rest.slice(sep + 1));
      if (SHARDED_DAY_FIELDS.includes(field)) r[field][day] = valuesByKey[key];
    });
    return r;
  }).filter(Boolean);
  return { ...(meta.app || {}), roadmaps };
}

// ---------------- Load ----------------
let readOnly = false;          // true when existing data could not be read: never overwrite it
let lastWritten = new Map();   // key -> serialized string last persisted
let lastWrittenRefs = new Map(); // key -> JS value reference last persisted

export function isStorageReadOnly() {
  return readOnly;
}

// Returns { state, movedToSecure }
async function attachSecureKey(state) {
  const secureKey = await secureGet();
  const plainKey = state.aiConfig?.apiKey || '';
  if (secureKey === null) return { state, movedToSecure: false }; // no secure storage on this platform
  if (secureKey) {
    lastWritten.set('__secure_key__', secureKey);
    return { state: { ...state, aiConfig: { ...state.aiConfig, apiKey: secureKey } }, movedToSecure: false };
  }
  if (plainKey && (await secureSet(plainKey))) {
    // Older versions kept the key in plain AsyncStorage: it now lives in the keychain
    lastWritten.set('__secure_key__', plainKey);
    return { state, movedToSecure: true };
  }
  return { state, movedToSecure: false };
}

async function loadV3() {
  const rawMeta = await AsyncStorage.getItem(STORAGE_KEY_V3);
  if (!rawMeta) return null;
  const meta = JSON.parse(rawMeta);
  const keys = Array.isArray(meta.keys) ? meta.keys : [];
  const valuesByKey = {};
  const missing = [];
  // Read in batches to keep each native call small
  for (let i = 0; i < keys.length; i += 200) {
    const batch = await AsyncStorage.multiGet(keys.slice(i, i + 200));
    batch.forEach(([k, v]) => {
      if (v === null || v === undefined) missing.push(k);
      else {
        valuesByKey[k] = JSON.parse(v);
        lastWritten.set(k, v);
      }
    });
  }
  if (missing.length) console.warn(`Storage: ${missing.length} shard(s) missing`, missing.slice(0, 5));
  lastWritten.set(STORAGE_KEY_V3, rawMeta);
  const state = rebuildFromShards(meta, valuesByKey);
  if (!Array.isArray(state.roadmaps) || state.roadmaps.length === 0) return null;
  return state;
}

// Load data with automatic legacy migration
export async function loadAppState() {
  readOnly = false;
  lastWritten = new Map();
  lastWrittenRefs = new Map();
  try {
    const v3 = await loadV3();
    if (v3) {
      return (await attachSecureKey(migrateState(v3))).state;
    }

    const rawV2 = await AsyncStorage.getItem(STORAGE_KEY_V2);
    if (rawV2) {
      const parsed = JSON.parse(rawV2);
      if (parsed && Array.isArray(parsed.roadmaps) && parsed.roadmaps.length > 0) {
        // Migrate to v3 on the next save; the v2 value is left in place as a backup
        const { state, movedToSecure } = await attachSecureKey(migrateState(parsed));
        if (movedToSecure && parsed.aiConfig && parsed.aiConfig.apiKey) {
          // Scrub the plain-text key from the v2 backup copy (data otherwise unchanged)
          await AsyncStorage.setItem(STORAGE_KEY_V2, JSON.stringify({ ...parsed, aiConfig: { ...parsed.aiConfig, apiKey: '' } }));
        }
        return state;
      }
    }

    // Check for legacy v1 data
    const rawV1 = await AsyncStorage.getItem(LEGACY_KEY_V1);
    const initial = getInitialAppState();

    if (rawV1) {
      try {
        const legacy = JSON.parse(rawV1);
        // Migrate into Huawei roadmap
        const huaweiIndex = initial.roadmaps.findIndex((r) => r.id === 'huawei_networking_ai');
        if (huaweiIndex >= 0) {
          initial.roadmaps[huaweiIndex].currentDay = legacy.day || 1;
          initial.roadmaps[huaweiIndex].doneDays = Array.isArray(legacy.done) ? legacy.done : [];
          initial.roadmaps[huaweiIndex].notes = legacy.notes || {};
          initial.roadmaps[huaweiIndex].tasks = legacy.tasks || {};
        }
        if (legacy.url) {
          initial.syncUrl = legacy.url;
        }
        await saveAppState(initial);
        return initial;
      } catch (e) {
        console.warn('Failed parsing legacy v1 data', e);
      }
    }

    // First time open
    await saveAppState(initial);
    return initial;
  } catch (err) {
    // Existing data could not be read. Do NOT replace it with defaults on disk.
    console.error('Error loading app state:', err);
    readOnly = true;
    return { ...getInitialAppState(), __loadFailed: true };
  }
}

// ---------------- Save ----------------
export async function saveAppState(state) {
  if (!state || readOnly || state.__loadFailed) return false;
  try {
    // API key goes to secure storage when available
    let apiKeyForMeta = state.aiConfig?.apiKey || '';
    if (SecureStore) {
      const prevKey = lastWritten.get('__secure_key__');
      if (prevKey !== apiKeyForMeta) {
        const ok = await secureSet(apiKeyForMeta);
        if (ok) lastWritten.set('__secure_key__', apiKeyForMeta);
      }
      if (lastWritten.get('__secure_key__') === apiKeyForMeta) apiKeyForMeta = '';
    }

    const { app, roadmapIds, pairs } = shardKeysFor(state);
    const toSet = [];
    const keys = [];
    const nextRefs = new Map();
    pairs.forEach(([key, value]) => {
      keys.push(key);
      nextRefs.set(key, value);
      // Same object reference as last save => unchanged, skip serialization
      if (lastWrittenRefs.get(key) === value && lastWritten.has(key)) return;
      const json = JSON.stringify(value);
      if (lastWritten.get(key) !== json) toSet.push([key, json]);
    });

    const meta = {
      version: 3,
      savedAt: new Date().toISOString(),
      app: { ...app, aiConfig: { ...(app.aiConfig || {}), apiKey: apiKeyForMeta } },
      roadmapIds,
      keys
    };
    const { savedAt, ...metaForCompare } = meta;
    const metaCompare = JSON.stringify(metaForCompare);
    const metaChanged = lastWritten.get('__meta_compare__') !== metaCompare;

    for (let i = 0; i < toSet.length; i += 100) {
      await AsyncStorage.multiSet(toSet.slice(i, i + 100));
    }
    toSet.forEach(([k, v]) => lastWritten.set(k, v));
    lastWrittenRefs = nextRefs;

    if (metaChanged || toSet.length > 0) {
      // Meta is written last so it never points at shards that were not saved
      const metaJson = JSON.stringify(meta);
      await AsyncStorage.setItem(STORAGE_KEY_V3, metaJson);
      lastWritten.set(STORAGE_KEY_V3, metaJson);
      lastWritten.set('__meta_compare__', metaCompare);
    }

    // Remove shards that no longer exist (e.g. deleted roadmap) only after meta is updated
    const keySet = new Set(keys);
    const stale = [...lastWritten.keys()].filter((k) => k.startsWith(SHARD_PREFIX) && !keySet.has(k));
    if (stale.length) {
      await AsyncStorage.multiRemove(stale);
      stale.forEach((k) => lastWritten.delete(k));
    }
    return true;
  } catch (err) {
    console.error('Error saving app state:', err);
    return false;
  }
}

// Debounced auto-save (typing in notes no longer rewrites everything per keystroke)
let pendingState = null;
let pendingTimer = null;
let saving = Promise.resolve();

export function scheduleSave(state, delay = 350) {
  pendingState = state;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => { flushPendingSave(); }, delay);
}

export function flushPendingSave() {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  const state = pendingState;
  pendingState = null;
  if (!state) return saving;
  saving = saving.then(() => saveAppState(state)).catch(() => false);
  return saving;
}

// Strip secrets before a state leaves the device (backups, exports)
export function sanitizeForExport(state) {
  if (!state) return state;
  const { __loadFailed, ...rest } = state;
  return { ...rest, aiConfig: { ...(rest.aiConfig || {}), apiKey: '' } };
}

// Helper: Send sync payload to Google Apps Script / Webhook
export async function syncWithCloud(syncUrl, roadmap, day) {
  if (!syncUrl || !roadmap) return;
  try {
    const isDone = roadmap.doneDays.includes(day);
    const note = (roadmap.notes && roadmap.notes[day]) || '';
    const dayTasks = (roadmap.tasks && roadmap.tasks[day]) || [];

    const payload = {
      timestamp: new Date().toISOString(),
      roadmapId: roadmap.id,
      roadmapTitle: roadmap.title,
      day,
      status: isDone ? 'Completed' : 'In Progress',
      notes: note,
      tasksTotal: dayTasks.length,
      tasksCompleted: dayTasks.filter((t) => t.done).length,
      overallProgress: Math.round((roadmap.doneDays.length / (roadmap.totalDays || 1)) * 100) + '%'
    };

    await fetch(syncUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    // Silent catch for network or CORS issues
    console.warn('Sync failed:', err);
  }
}

// Calculate streak when completing tasks or days
export function updateStreakRecord(currentStreak) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const lastDate = currentStreak ? currentStreak.lastDate : '';
  let count = currentStreak ? currentStreak.count || 0 : 0;

  if (lastDate === todayStr) {
    return { count, lastDate: todayStr };
  }

  // Check if yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  if (lastDate === yesterdayStr) {
    count += 1;
  } else if (!lastDate) {
    count = 1;
  } else {
    // Missed a day -> reset to 1
    count = 1;
  }

  return { count, lastDate: todayStr };
}
