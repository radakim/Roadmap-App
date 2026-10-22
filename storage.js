import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildHuaweiRoadmap, buildFullStackRoadmap, buildHabitsRoadmap } from './templates';

export const STORAGE_KEY_V2 = 'life_roadmaps_v2';
export const LEGACY_KEY_V1 = 'huawei_roadmap_v1';

// Default initial state with rich presets
export function getInitialAppState() {
  const huawei = buildHuaweiRoadmap();
  const fullstack = buildFullStackRoadmap();
  const habits = buildHabitsRoadmap();

  return {
    version: 2,
    activeRoadmapId: huawei.id,
    roadmaps: [huawei, fullstack, habits],
    syncUrl: '',
    streak: { count: 0, lastDate: '' },
    reminder: { enabled: true, time: '20:00' }
  };
}

// Load data with automatic legacy migration
export async function loadAppState() {
  try {
    const rawV2 = await AsyncStorage.getItem(STORAGE_KEY_V2);
    if (rawV2) {
      const parsed = JSON.parse(rawV2);
      if (parsed && Array.isArray(parsed.roadmaps) && parsed.roadmaps.length > 0) {
        return parsed;
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
        // Save migrated state immediately
        await AsyncStorage.setItem(STORAGE_KEY_V2, JSON.stringify(initial));
        return initial;
      } catch (e) {
        console.warn('Failed parsing legacy v1 data', e);
      }
    }

    // First time open
    await AsyncStorage.setItem(STORAGE_KEY_V2, JSON.stringify(initial));
    return initial;
  } catch (err) {
    console.error('Error loading app state:', err);
    return getInitialAppState();
  }
}

// Save app state
export async function saveAppState(state) {
  try {
    if (!state) return;
    await AsyncStorage.setItem(STORAGE_KEY_V2, JSON.stringify(state));
  } catch (err) {
    console.error('Error saving app state:', err);
  }
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
