// ============================================================
// Notification System — web version (browser Notification API)
// Metro picks this file instead of notifications.js on web.
// Reminders only fire while the app tab is open.
// ============================================================

import { translate } from './i18n';

let notifLang = 'en';
export function setNotificationLanguage(lang) {
  notifLang = lang || 'en';
}
const tn = (key, params) => translate(notifLang, key, params);

const supported = () => typeof window !== 'undefined' && 'Notification' in window;

function show(title, body) {
  if (!supported() || Notification.permission !== 'granted') return;
  try {
    // eslint-disable-next-line no-new
    new Notification(title, { body, icon: '/favicon.ico' });
  } catch (e) {
    console.warn('Notification failed', e);
  }
}

// ─── Permission Request ──────────────────────────────────────
export async function requestNotificationPermission() {
  if (!supported()) return false;
  if (Notification.permission === 'granted') return true;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch (e) {
    return false;
  }
}

// ─── Daily Study Reminder (setTimeout, re-armed every day) ──
let dailyTimer = null;

export async function scheduleDailyStudyReminder(timeStr = '20:00', roadmapTitle = 'Life Roadmap', day = 1) {
  await cancelDailyReminder();
  const [hours, minutes] = timeStr.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return false;

  const arm = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    dailyTimer = setTimeout(() => {
      show(tn('notif.dailyTitle'), tn('notif.dailyBody', { roadmap: roadmapTitle, day }));
      arm();
    }, next - now);
  };
  arm();
  return true;
}

export async function cancelDailyReminder() {
  if (dailyTimer) clearTimeout(dailyTimer);
  dailyTimer = null;
}

// ─── Immediate notifications ─────────────────────────────────
export async function sendTimerCompleteNotification(modeLabel = 'Focus', taskTitle = null) {
  show(
    tn('notif.sessionTitle'),
    taskTitle
      ? tn('notif.sessionTaskBody', { task: taskTitle })
      : tn('notif.sessionModeBody', { mode: modeLabel.toUpperCase() })
  );
}

export async function sendTaskStartNotification(taskTitle, minutes) {
  show(tn('notif.startTitle'), tn('notif.startBody', { minutes, task: taskTitle }));
}

export async function sendTestAlarmNotification(timeStr = '20:00') {
  setTimeout(() => show(tn('notif.testTitle'), tn('notif.testBody', { time: timeStr })), 3000);
}
