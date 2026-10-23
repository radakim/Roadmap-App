// ============================================================
// Notification System — expo-notifications
// Real push notifications to the Android/iOS notification bar
// ============================================================

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Set how foreground notifications are shown
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ─── Permission Request ──────────────────────────────────────
export async function requestNotificationPermission() {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;

    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.warn('Notification permission denied');
      return false;
    }

    // Android: create a notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('study-alarm', {
        name: 'Daily Study Alarm',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 200, 500],
        lightColor: '#10b981',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });

      await Notifications.setNotificationChannelAsync('timer-complete', {
        name: 'Focus Timer',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 300, 150, 300],
        lightColor: '#10b981',
        sound: 'default',
        enableVibrate: true,
        showBadge: false,
      });
    }

    return true;
  } catch (err) {
    console.warn('requestNotificationPermission error:', err);
    return false;
  }
}

// ─── Schedule Daily Study Reminder ──────────────────────────
// Schedules a repeating daily notification at the specified HH:MM
export async function scheduleDailyStudyReminder(
  timeStr = '20:00',
  roadmapTitle = 'Life Roadmap',
  day = 1
) {
  try {
    // Cancel existing daily reminders first
    await cancelDailyReminder();

    const [hours, minutes] = timeStr.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return false;

    await Notifications.scheduleNotificationAsync({
      identifier: 'daily-study-alarm',
      content: {
        title: '⏰ Daily Study Time!',
        body: `Time to focus on "${roadmapTitle}" — Day ${day}. Let's crush it! 🚀`,
        sound: 'default',
        data: { type: 'daily-alarm', day },
        ...(Platform.OS === 'android' && { channelId: 'study-alarm' }),
      },
      trigger: {
        hour: hours,
        minute: minutes,
        repeats: true,
        // Android 13+ needs type hint
        type: Notifications.SchedulableTriggerInputTypes?.DAILY ?? 'daily',
      },
    });

    return true;
  } catch (err) {
    console.warn('scheduleDailyStudyReminder error:', err);
    return false;
  }
}

// ─── Cancel Daily Reminder ───────────────────────────────────
export async function cancelDailyReminder() {
  try {
    await Notifications.cancelScheduledNotificationAsync('daily-study-alarm');
  } catch (err) {
    // ignore — identifier might not exist
  }
}

// ─── Immediate: Timer Session Complete ───────────────────────
export async function sendTimerCompleteNotification(modeLabel = 'Focus', taskTitle = null) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🎉 Session Complete!',
        body: taskTitle
          ? `"${taskTitle}" focus session finished. Take a short break!`
          : `${modeLabel.toUpperCase()} session done! Great work — take a 5-min break.`,
        sound: 'default',
        data: { type: 'timer-complete' },
        ...(Platform.OS === 'android' && { channelId: 'timer-complete' }),
      },
      trigger: null, // immediate
    });
  } catch (err) {
    console.warn('sendTimerCompleteNotification error:', err);
  }
}

// ─── Immediate: Task Linked to Timer ─────────────────────────
export async function sendTaskStartNotification(taskTitle, minutes) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '▶ Focus Session Started',
        body: `${minutes} min timer running for: "${taskTitle}"`,
        sound: null,
        data: { type: 'task-start' },
        ...(Platform.OS === 'android' && { channelId: 'timer-complete' }),
      },
      trigger: null, // immediate
    });
  } catch (err) {
    console.warn('sendTaskStartNotification error:', err);
  }
}

// ─── Test Alarm (fire in 3 seconds) ──────────────────────────
export async function sendTestAlarmNotification(timeStr = '20:00') {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔔 Test Alarm!',
        body: `This is how your daily study alarm looks at ${timeStr}. You're all set! ✅`,
        sound: 'default',
        data: { type: 'test-alarm' },
        ...(Platform.OS === 'android' && { channelId: 'study-alarm' }),
      },
      trigger: { seconds: 3 },
    });
  } catch (err) {
    console.warn('sendTestAlarmNotification error:', err);
  }
}
