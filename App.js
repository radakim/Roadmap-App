import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Vibration,
  ActivityIndicator,
  AppState,
  BackHandler,
  useWindowDimensions
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
// SDK 54: the classic API lives in /legacy (the root import throws at runtime)
import * as FileSystem from 'expo-file-system/legacy';
import {
  loadAppState,
  scheduleSave,
  flushPendingSave,
  syncWithCloud,
  updateStreakRecord,
  getInitialAppState,
  sanitizeForExport,
  migrateState
} from './storage';
import {
  createCustomRoadmap,
  TEMPLATE_LIST,
  CATEGORIES,
  COLOR_PALETTE,
  ICON_OPTIONS
} from './templates';
import {
  scheduleDailyStudyReminder,
  cancelDailyReminder,
  requestNotificationPermission,
  sendTimerCompleteNotification,
  sendTaskStartNotification,
  sendTestAlarmNotification,
  setNotificationLanguage
} from './notifications';
import {
  validateApiKey,
  generateRoadmapWithAI,
  generateLessonContentWithAI,
  generatePracticeAndQuizWithAI,
  normalizeModel,
  normalizeProvider,
  detectProvider,
  providerName,
  scheduleLabels,
  DEEPSEEK_MODELS,
  OPENAI_MODELS,
  DEFAULT_AI_PROVIDER,
  DEFAULT_AI_MODEL,
  DEFAULT_OPENAI_MODEL
} from './aiService';
import { translate, LANGUAGES, categoryLabel, modeLabel, templateText } from './i18n';
import { toDays, planScheduleResize, flattenDays, getLockedDayCount, MAX_ROADMAP_DAYS } from './schedule';
import { toPracticeView, practiceToMarkdown, compileJourneyNotes, optionLetter } from './contentExport';
import { copyText, exportDocx, docxFileName } from './shareUtils';
import MarkdownView from './MarkdownView';
import NotesEditor from './NotesEditor';
import styles from './styles';

const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
const DURATION_PRESETS = {
  days: ['7', '14', '30', '60', '90', '180', '365'],
  weeks: ['1', '2', '4', '8', '12', '26', '52']
};
const TEXT_FILE_EXT = /\.(txt|md|markdown|csv|json|log|ya?ml|xml|html?|conf|cfg|ini|py|js|ts|sh)$/i;
const BINARY_FILE_EXT = /\.(docx?|pdf|pptx?|xlsx?|odt|rtf|pages|key|zip|png|jpe?g|gif|heic)$/i;

export default function App() {
  // App state
  const [appData, setAppData] = useState(null);
  // Desktop web layout: sidebar navigation + multi-column content
  const { width: windowWidth } = useWindowDimensions();
  const isWide = Platform.OS === 'web' && windowWidth >= 960;
  const [activeTab, setActiveTab] = useState('today'); // 'today' | 'roadmaps' | 'timeline' | 'settings'
  const [screen, setScreen] = useState('main'); // 'main' | 'lesson' | 'practice' | 'notes' (full-page screens)
  const [openPhaseId, setOpenPhaseId] = useState(null);

  // Modals state
  const [createRoadmapModal, setCreateRoadmapModal] = useState(false);
  const [editRoadmapModal, setEditRoadmapModal] = useState(false);
  const [taskModal, setTaskModal] = useState(false);
  const [timerSettingsModal, setTimerSettingsModal] = useState(false);
  const [editDayModal, setEditDayModal] = useState(false);
  const [backupModal, setBackupModal] = useState(false);
  const [backupText, setBackupText] = useState('');
  const [reminderModal, setReminderModal] = useState(false);

  // ================= AI Feature States (DeepSeek + ChatGPT) =================
  const [aiSettingsModal, setAiSettingsModal] = useState(false);
  const [aiProviderDraft, setAiProviderDraft] = useState(DEFAULT_AI_PROVIDER); // 'deepseek' | 'openai'
  const [aiKeyDraft, setAiKeyDraft] = useState('');
  const [aiModelDraft, setAiModelDraft] = useState(DEFAULT_AI_MODEL);
  const [aiValidating, setAiValidating] = useState(false);
  const [aiValidationStatus, setAiValidationStatus] = useState(null); // { valid: bool, msg: string }
  const [aiPaymentGuideModal, setAiPaymentGuideModal] = useState(false);

  // 1. AI Roadmap Generator
  const [aiRoadmapModal, setAiRoadmapModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiDurationValue, setAiDurationValue] = useState('30');
  const [aiDurationUnit, setAiDurationUnit] = useState('days'); // 'days' | 'weeks'
  const [aiLevel, setAiLevel] = useState('Beginner');
  const [aiFocus, setAiFocus] = useState('Practical Labs & Projects');
  const [aiRoadmapInstructions, setAiRoadmapInstructions] = useState('');
  const [aiRoadmapLang, setAiRoadmapLang] = useState('auto'); // 'auto' | 'en' | 'zh'
  const [aiGeneratingRoadmap, setAiGeneratingRoadmap] = useState(false);

  // 2. AI Lesson & Course Content
  const [aiLessonLoading, setAiLessonLoading] = useState(false);
  const [lessonInstructions, setLessonInstructions] = useState('');
  const [lessonLang, setLessonLang] = useState('auto');
  const [showLessonOptions, setShowLessonOptions] = useState(false);
  const [aiUploadModal, setAiUploadModal] = useState(false);
  const [aiUploadDraft, setAiUploadDraft] = useState('');
  const [aiUploadTarget, setAiUploadTarget] = useState('day'); // 'day' | 'global' | 'lesson'
  const [aiUploadedFileName, setAiUploadedFileName] = useState('');

  // 3. AI Practice & Quiz
  const [aiPracticeLoading, setAiPracticeLoading] = useState(false);
  const [practiceInstructions, setPracticeInstructions] = useState('');
  const [practiceLang, setPracticeLang] = useState('auto');
  const [showPracticeOptions, setShowPracticeOptions] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState({});

  // Journey notes safety net
  const [lastClearedNote, setLastClearedNote] = useState(null); // { roadmapId, day, text }
  const notesEditorRef = useRef(null);

  // Reminder alarm state
  const [reminderTimeDraft, setReminderTimeDraft] = useState('20:00');
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [studyAlertVisible, setStudyAlertVisible] = useState(false);

  // Roadmap Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formCategory, setFormCategory] = useState(CATEGORIES[0]);
  const [formIcon, setFormIcon] = useState('🎯');
  const [formColor, setFormColor] = useState(COLOR_PALETTE[0]);
  const [formTotalDays, setFormTotalDays] = useState('30');
  const [formPhaseGrouping, setFormPhaseGrouping] = useState('30'); // '7' for weekly, '30' for monthly
  const [editingRoadmapId, setEditingRoadmapId] = useState(null);
  const [formDurationValue, setFormDurationValue] = useState('30');
  const [formDurationUnit, setFormDurationUnit] = useState('days');

  // Schedule change preview (duration edits)
  const [schedulePlan, setSchedulePlan] = useState(null);

  // Day topic edit state
  const [editDayNumber, setEditDayNumber] = useState(1);
  const [editDayTopicDraft, setEditDayTopicDraft] = useState('');
  const [editDayObjectivesDraft, setEditDayObjectivesDraft] = useState('');

  // Task Form state
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDur, setNewTaskDur] = useState('30 mins');
  const [newTaskPriority, setNewTaskPriority] = useState('Medium');
  const [editingTaskId, setEditingTaskId] = useState(null); // null = adding new

  // Routine Modes draft (used inside the editable modal)
  const [routineModeDraft, setRoutineModeDraft] = useState([]);

  // Routine Timer state
  const [activeTimerMode, setActiveTimerMode] = useState('learn');
  const [timerLeft, setTimerLeft] = useState(20 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  // Linked task: the task currently driving the timer
  const [activeTaskId, setActiveTaskId] = useState(null);

  // Sync draft
  const [syncUrlDraft, setSyncUrlDraft] = useState('');

  // Sync debounce ref
  const syncTimerRef = useRef(null);
  const appDataRef = useRef(null);
  appDataRef.current = appData;

  // Language (interface + default AI content language)
  const lang = appData?.settings?.language || 'en';
  const t = useCallback((key, params) => translate(lang, key, params), [lang]);
  const langName = (code) => (LANGUAGES.find((l) => l.code === code) || LANGUAGES[0]).label;
  const resolveContentLang = (override) => (override && override !== 'auto' ? override : lang);

  useEffect(() => {
    setNotificationLanguage(lang);
  }, [lang]);

  // 1. Initial Load — restore all state including timer session
  useEffect(() => {
    requestNotificationPermission();
    loadAppState().then((data) => {
      setAppData(data);
      const active = data.roadmaps.find((r) => r.id === data.activeRoadmapId) || data.roadmaps[0];
      if (active && active.phases && active.phases.length > 0) {
        setOpenPhaseId(active.phases[0].id);
      }
      if (data.reminder) {
        setReminderEnabled(data.reminder.enabled !== false);
        setReminderTimeDraft(data.reminder.time || '20:00');
      }
      // Restore timer session from persisted state
      if (data.timerState) {
        setActiveTimerMode(data.timerState.activeMode || 'learn');
        setTimerLeft(data.timerState.timeLeft || 20 * 60);
        setIsTimerRunning(false); // always start paused for safety
        setActiveTaskId(data.timerState.activeTaskId || null);
      }
      if (data.__loadFailed) {
        const l = data.settings?.language || 'en';
        Alert.alert(translate(l, 'storage.loadFailedTitle'), translate(l, 'storage.loadFailedBody'));
      }
    });
  }, []);

  // 2. Persist state changes (debounced, only changed records are written)
  useEffect(() => {
    if (appData) {
      // Write immediately while the app is going to the background
      scheduleSave(appData, AppState.currentState === 'active' ? 350 : 0);
    }
  }, [appData]);

  // Flush unsaved notes + state when the app goes to the background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        if (notesEditorRef.current) notesEditorRef.current.flush();
        setTimeout(() => flushPendingSave(), 0);
      }
    });
    return () => sub.remove();
  }, []);

  // Android hardware back closes full-page screens
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen !== 'main') {
        closeScreen();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen]);

  // Active Roadmap
  const activeRoadmap = useMemo(() => {
    if (!appData || !appData.roadmaps || appData.roadmaps.length === 0) return null;
    return (
      appData.roadmaps.find((r) => r.id === appData.activeRoadmapId) ||
      appData.roadmaps[0]
    );
  }, [appData]);

  // Current day info inside active roadmap
  const currentDayInfo = useMemo(() => {
    if (!activeRoadmap) return { day: 1, topic: t('today.noRoadmap'), phaseTitle: '', objectives: '' };
    const curDay = activeRoadmap.currentDay || 1;
    let foundTopic = t('schedule.placeholderTopic', { day: curDay });
    let foundPhaseTitle = '';
    let foundObjectives = '';

    if (activeRoadmap.phases) {
      for (const phase of activeRoadmap.phases) {
        if (curDay >= phase.startDay && curDay <= phase.endDay) {
          foundPhaseTitle = phase.title;
          const dayObj = phase.days.find((d) => d.day === curDay);
          if (dayObj && dayObj.topic) {
            foundTopic = dayObj.topic;
            foundObjectives = dayObj.objectives || '';
          }
          break;
        }
      }
    }

    return {
      day: curDay,
      topic: foundTopic,
      phaseTitle: foundPhaseTitle,
      objectives: foundObjectives
    };
  }, [activeRoadmap, t]);

  // Ordered list of all days (used for AI context + journey notes export)
  const flatDays = useMemo(
    () => (activeRoadmap ? flattenDays(activeRoadmap, scheduleLabels(lang)) : []),
    [activeRoadmap, lang]
  );
  const topicForDay = (d) => (flatDays[d - 1] && flatDays[d - 1].topic) || t('schedule.placeholderTopic', { day: d });

  // Routine modes for active roadmap
  const routineModes = useMemo(() => {
    if (activeRoadmap && Array.isArray(activeRoadmap.routineModes) && activeRoadmap.routineModes.length > 0) {
      return activeRoadmap.routineModes;
    }
    return [
      { id: 'm1', label: 'learn', dur: 20 },
      { id: 'm2', label: 'practise', dur: 30 },
      { id: 'm3', label: 'review', dur: 10 }
    ];
  }, [activeRoadmap]);

  // Active roadmap tasks & completion (declared before the effects that use them)
  const currentDay = activeRoadmap ? activeRoadmap.currentDay : 1;
  const isCurrentDayDone = activeRoadmap ? activeRoadmap.doneDays.includes(currentDay) : false;
  const activeRoadmapDoneCount = activeRoadmap ? activeRoadmap.doneDays.length : 0;
  const activeRoadmapTotalDays = activeRoadmap ? activeRoadmap.totalDays : 1;
  const activeRoadmapPct = Math.round((activeRoadmapDoneCount / activeRoadmapTotalDays) * 100);

  // Default tasks if not set
  const dayTasks = useMemo(() => {
    if (!activeRoadmap) return [];
    if (activeRoadmap.tasks && activeRoadmap.tasks[currentDay]) {
      return activeRoadmap.tasks[currentDay];
    }
    return [
      { id: 't_def_1', title: t('tasks.defLearn', { topic: currentDayInfo.topic }), dur: '25 mins', priority: 'High', done: false },
      { id: 't_def_2', title: t('tasks.defPractice'), dur: '30 mins', priority: 'Medium', done: false },
      { id: 't_def_3', title: t('tasks.defReview'), dur: '10 mins', priority: 'Low', done: false }
    ];
  }, [activeRoadmap, currentDay, currentDayInfo, t]);

  // Quiz answers belong to one roadmap day
  useEffect(() => {
    setQuizAnswers({});
  }, [activeRoadmap?.id, currentDay]);

  // Study Alarm Ticker (in-app check every 10s + phone notification)
  useEffect(() => {
    if (!reminderEnabled || !reminderTimeDraft) return;

    const checkAlarmTime = () => {
      const now = new Date();
      const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (currentHHMM === reminderTimeDraft && !studyAlertVisible) {
        setStudyAlertVisible(true);
        try {
          Vibration.vibrate([0, 500, 200, 500]);
        } catch (e) {}
        Alert.alert(
          t('alarm.ringTitle'),
          t('alarm.ringBody', { time: reminderTimeDraft, day: currentDay }),
          [
            { text: t('alarm.startNow'), onPress: () => setIsTimerRunning(true) },
            { text: t('common.dismiss'), style: 'cancel' }
          ]
        );
      }
    };

    checkAlarmTime();
    const interval = setInterval(checkAlarmTime, 10000);
    return () => clearInterval(interval);
  }, [reminderEnabled, reminderTimeDraft, studyAlertVisible, currentDay, t]);

  // Persist timer state whenever it changes (so it survives app close)
  const persistTimerState = (mode, left, taskId) => {
    setAppData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        timerState: {
          activeMode: mode,
          timeLeft: left,
          isRunning: false, // always false — timer pauses on close
          activeTaskId: taskId
        }
      };
    });
  };

  // Timer Tick
  useEffect(() => {
    if (!isTimerRunning) return;
    const interval = setInterval(() => {
      setTimerLeft((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          setIsTimerRunning(false);
          // Fire real phone push notification
          const linkedTask = activeTaskId
            ? dayTasks.find((tk) => tk.id === activeTaskId)
            : null;
          sendTimerCompleteNotification(modeLabel(lang, activeTimerMode), linkedTask ? linkedTask.title : null);
          Alert.alert(
            t('timer.completeTitle'),
            linkedTask
              ? t('timer.completeTask', { task: linkedTask.title })
              : t('timer.completeMode', { mode: modeLabel(lang, activeTimerMode).toUpperCase() })
          );
          // Clear linked task and persist
          setActiveTaskId(null);
          persistTimerState(activeTimerMode, 0, null);
          return 0;
        }
        // Persist every 10 seconds to avoid excessive writes
        if (next % 10 === 0) {
          persistTimerState(activeTimerMode, next, activeTaskId);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning, activeTimerMode, activeTaskId, dayTasks, t, lang]);

  // Switch timer mode
  const selectTimerMode = (modeObj) => {
    setIsTimerRunning(false);
    setActiveTimerMode(modeObj.label);
    const seconds = modeObj.dur * 60;
    setTimerLeft(seconds);
    setActiveTaskId(null);
    persistTimerState(modeObj.label, seconds, null);
  };

  // Link a task to the timer (tap ▶ on any task row)
  const handleSelectTask = (task) => {
    setIsTimerRunning(false);
    // Parse duration string like '25 mins', '1 hour', '45 mins'
    let durMins = 25;
    if (task.dur) {
      const hourMatch = task.dur.match(/(\d+)\s*(hour|小时)/i);
      const minMatch = task.dur.match(/(\d+)\s*(min|分钟)/i);
      if (hourMatch) durMins = parseInt(hourMatch[1], 10) * 60;
      else if (minMatch) durMins = parseInt(minMatch[1], 10);
    }
    const label = 'custom';
    const seconds = durMins * 60;
    setActiveTimerMode(label);
    setTimerLeft(seconds);
    setActiveTaskId(task.id);
    persistTimerState(label, seconds, task.id);
    Alert.alert(
      t('timer.linkedTitle'),
      t('timer.linkedBody', { task: task.title, mins: durMins }),
      [{ text: t('common.gotIt') }]
    );
  };

  const timerFormatted = useMemo(() => {
    const mins = Math.floor(timerLeft / 60);
    const secs = timerLeft % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [timerLeft]);

  // Day Note
  const currentDayNote = useMemo(() => {
    if (!activeRoadmap || !activeRoadmap.notes) return '';
    return activeRoadmap.notes[currentDay] || '';
  }, [activeRoadmap, currentDay]);

  // Day Lesson (AI or Custom Uploaded)
  const currentDayLesson = useMemo(() => {
    if (!activeRoadmap || !activeRoadmap.lessons) return null;
    return activeRoadmap.lessons[currentDay] || null;
  }, [activeRoadmap, currentDay]);

  // Day Practice & Quiz (AI Generated) — supports old and new saved formats
  const currentDayQuiz = useMemo(() => {
    if (!activeRoadmap || !activeRoadmap.quizzes) return null;
    return toPracticeView(activeRoadmap.quizzes[currentDay] || null, [
      t('practice.col.device'), t('practice.col.interface'), t('practice.col.ip'),
      t('practice.col.gateway'), t('practice.col.vlan'), t('practice.col.purpose')
    ]);
  }, [activeRoadmap, currentDay, t]);

  // Day & Global Reference Documents (context for AI)
  const currentDayRefDocObj = useMemo(() => {
    if (!activeRoadmap || !activeRoadmap.referenceDocs) return null;
    return activeRoadmap.referenceDocs[currentDay] || null;
  }, [activeRoadmap, currentDay]);

  const currentDayRefDoc = typeof currentDayRefDocObj === 'string'
    ? currentDayRefDocObj
    : (currentDayRefDocObj?.content || '');

  const globalRefDoc = activeRoadmap?.globalReferenceDoc || '';

  // Save Reminder Settings
  const handleSaveReminder = async () => {
    if (!reminderEnabled) {
      await cancelDailyReminder();
      setAppData((prev) => ({
        ...prev,
        reminder: { enabled: false, time: reminderTimeDraft }
      }));
      setReminderModal(false);
      Alert.alert(t('alarm.disabledTitle'), t('alarm.disabledBody'));
      return;
    }

    const ok = await scheduleDailyStudyReminder(
      reminderTimeDraft,
      activeRoadmap ? activeRoadmap.title : 'Life Roadmap',
      currentDay
    );

    setAppData((prev) => ({
      ...prev,
      reminder: { enabled: true, time: reminderTimeDraft }
    }));
    setReminderModal(false);

    Alert.alert(
      t('alarm.savedTitle'),
      ok ? t('alarm.savedBody', { time: reminderTimeDraft }) : t('alarm.savedNoPerm', { time: reminderTimeDraft })
    );
  };

  // Handlers for roadmap state update
  const updateRoadmapById = (id, updater) => {
    setAppData((prev) => {
      const updatedRoadmaps = prev.roadmaps.map((r) => {
        if (r.id === id) {
          return typeof updater === 'function' ? updater(r) : { ...r, ...updater };
        }
        return r;
      });
      return { ...prev, roadmaps: updatedRoadmaps };
    });
  };

  const updateActiveRoadmap = (updater) => {
    if (!activeRoadmap) return;
    updateRoadmapById(activeRoadmap.id, updater);
  };

  // Switch Active Roadmap
  const switchActiveRoadmap = (id) => {
    setAppData((prev) => ({ ...prev, activeRoadmapId: id }));
    const target = appData.roadmaps.find((r) => r.id === id);
    if (target && target.phases && target.phases.length > 0) {
      setOpenPhaseId(target.phases[0].id);
    }
  };

  // Navigate Days
  const jumpToDay = (dayNum) => {
    if (!activeRoadmap) return;
    if (notesEditorRef.current) notesEditorRef.current.flush();
    const bounded = Math.max(1, Math.min(activeRoadmap.totalDays, dayNum));
    updateActiveRoadmap((r) => ({ ...r, currentDay: bounded }));

    if (activeRoadmap.phases) {
      const phase = activeRoadmap.phases.find((p) => bounded >= p.startDay && bounded <= p.endDay);
      if (phase) {
        setOpenPhaseId(phase.id);
      }
    }
  };

  // Toggle Day Completed
  const toggleDayCompleted = () => {
    if (!activeRoadmap) return;
    const day = activeRoadmap.currentDay;
    const isDone = activeRoadmap.doneDays.includes(day);

    let updatedDoneDays;
    let updatedTasks = { ...(activeRoadmap.tasks || {}) };

    if (isDone) {
      updatedDoneDays = activeRoadmap.doneDays.filter((d) => d !== day);
    } else {
      updatedDoneDays = [...activeRoadmap.doneDays, day];
      updatedTasks[day] = dayTasks.map((tk) => ({ ...tk, done: true }));
      setStudyAlertVisible(false);
    }

    let updatedStreak = appData.streak;
    if (!isDone) {
      updatedStreak = updateStreakRecord(appData.streak);
    }

    setAppData((prev) => {
      const roadmaps = prev.roadmaps.map((r) => {
        if (r.id === activeRoadmap.id) {
          const updated = {
            ...r,
            doneDays: updatedDoneDays,
            tasks: updatedTasks
          };
          syncWithCloud(prev.syncUrl, updated, day);
          return updated;
        }
        return r;
      });
      return { ...prev, roadmaps, streak: updatedStreak };
    });
  };

  // Tasks actions
  const toggleTask = (taskId) => {
    const updated = dayTasks.map((tk) => (tk.id === taskId ? { ...tk, done: !tk.done } : tk));
    updateActiveRoadmap((r) => ({
      ...r,
      tasks: { ...(r.tasks || {}), [currentDay]: updated }
    }));
  };

  const deleteTask = (taskId) => {
    const updated = dayTasks.filter((tk) => tk.id !== taskId);
    updateActiveRoadmap((r) => ({
      ...r,
      tasks: { ...(r.tasks || {}), [currentDay]: updated }
    }));
  };

  const addTask = () => {
    if (!newTaskTitle.trim()) return;
    if (editingTaskId) {
      // Edit existing task
      const updated = dayTasks.map((tk) =>
        tk.id === editingTaskId
          ? { ...tk, title: newTaskTitle.trim(), dur: newTaskDur.trim() || '30 mins', priority: newTaskPriority }
          : tk
      );
      updateActiveRoadmap((r) => ({
        ...r,
        tasks: { ...(r.tasks || {}), [currentDay]: updated }
      }));
      // If this task was linked to the timer, update the timer duration too
      if (activeTaskId === editingTaskId) {
        const durStr = newTaskDur.trim() || '30 mins';
        const hourMatch = durStr.match(/(\d+)\s*(hour|小时)/i);
        const minMatch = durStr.match(/(\d+)\s*(min|分钟)/i);
        let durMins = 25;
        if (hourMatch) durMins = parseInt(hourMatch[1], 10) * 60;
        else if (minMatch) durMins = parseInt(minMatch[1], 10);
        setTimerLeft(durMins * 60);
        persistTimerState('custom', durMins * 60, editingTaskId);
      }
    } else {
      // Add new task
      const newTask = {
        id: 'task_' + Date.now(),
        title: newTaskTitle.trim(),
        dur: newTaskDur.trim() || '30 mins',
        priority: newTaskPriority,
        done: false
      };
      updateActiveRoadmap((r) => ({
        ...r,
        tasks: { ...(r.tasks || {}), [currentDay]: [...dayTasks, newTask] }
      }));
    }
    setNewTaskTitle('');
    setNewTaskDur('30 mins');
    setNewTaskPriority('Medium');
    setEditingTaskId(null);
    setTaskModal(false);
  };

  const openEditTask = (task) => {
    setEditingTaskId(task.id);
    setNewTaskTitle(task.title);
    setNewTaskDur(task.dur || '30 mins');
    setNewTaskPriority(task.priority || 'Medium');
    setTaskModal(true);
  };

  const openAddTask = () => {
    setEditingTaskId(null);
    setNewTaskTitle('');
    setNewTaskDur('30 mins');
    setNewTaskPriority('Medium');
    setTaskModal(true);
  };

  // Open timer settings with editable draft
  const openTimerSettings = () => {
    setRoutineModeDraft(routineModes.map((m) => ({ ...m })));
    setTimerSettingsModal(true);
  };

  const saveRoutineModes = () => {
    // Filter out any mode with blank label or 0 duration
    const valid = routineModeDraft.filter((m) => m.label.trim() && m.dur > 0);
    updateActiveRoadmap((r) => ({ ...r, routineModes: valid }));
    setTimerSettingsModal(false);
  };

  // ================= JOURNEY NOTES =================
  // Notes are stored for (roadmap, day); no length limit anywhere.
  const commitNote = (roadmapId, day, text) => {
    updateRoadmapById(roadmapId, (r) => ({
      ...r,
      notes: { ...(r.notes || {}), [day]: text }
    }));

    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      const latest = appDataRef.current;
      const rm = latest && latest.roadmaps.find((r) => r.id === roadmapId);
      if (latest && rm && latest.syncUrl) {
        syncWithCloud(latest.syncUrl, rm, day);
      }
    }, 2000);
  };

  const handleNoteChange = (text) => {
    if (!activeRoadmap) return;
    commitNote(activeRoadmap.id, currentDay, text);
  };

  const appendToNote = (extra) => {
    // Read the editor's latest text so nothing typed is overwritten
    const base = (notesEditorRef.current && notesEditorRef.current.getText()) ?? currentDayNote;
    if (notesEditorRef.current) notesEditorRef.current.flush();
    handleNoteChange((base || '') + extra);
  };

  const handleClearNote = () => {
    const text = (notesEditorRef.current && notesEditorRef.current.getText()) ?? currentDayNote;
    if (!text) return;
    Alert.alert(t('notes.clearTitle'), t('notes.clearBody', { count: text.length.toLocaleString() }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('notes.clearConfirm'),
        style: 'destructive',
        onPress: () => {
          setLastClearedNote({ roadmapId: activeRoadmap.id, day: currentDay, text });
          if (notesEditorRef.current) notesEditorRef.current.flush();
          handleNoteChange('');
        }
      }
    ]);
  };

  const handleUndoClear = () => {
    if (!lastClearedNote) return;
    const current = (notesEditorRef.current && notesEditorRef.current.getText()) ?? currentDayNote;
    // Keep anything typed after clearing, below the restored text
    const restored = current ? `${lastClearedNote.text}\n\n${current}` : lastClearedNote.text;
    commitNote(lastClearedNote.roadmapId, lastClearedNote.day, restored);
    setLastClearedNote(null);
  };

  const doCopy = async (text) => {
    if (!text || !text.trim()) {
      Alert.alert(t('copy.emptyTitle'), t('copy.emptyBody'));
      return;
    }
    const res = await copyText(text);
    if (res === 'copied') Alert.alert(t('copy.doneTitle'), t('copy.doneBody', { count: text.length.toLocaleString() }));
    else if (!res) Alert.alert(t('copy.failedTitle'), t('copy.failedBody'));
  };

  const handleCopyAllNotes = () => {
    const current = (notesEditorRef.current && notesEditorRef.current.getText()) ?? currentDayNote;
    const merged = { ...activeRoadmap, notes: { ...(activeRoadmap.notes || {}), [currentDay]: current } };
    const { text: allText, count } = compileJourneyNotes(merged, topicForDay, {
      dayHeader: (d, topic) => t('notes.dayHeader', { day: d, topic })
    });
    Alert.alert(t('notes.copyAllTitle'), t('notes.copyAllBody'), [
      { text: t('notes.copyThisDay', { day: currentDay }), onPress: () => doCopy(current) },
      { text: t('notes.copyAllDays', { count }), onPress: () => doCopy(count > 0 ? allText : '') },
      { text: t('common.cancel'), style: 'cancel' }
    ]);
  };

  // Open Edit Day Topic Modal
  const openEditDayModal = (dayNum) => {
    setEditDayNumber(dayNum);
    let currentTopic = '';
    let currentObjectives = '';
    if (activeRoadmap && activeRoadmap.phases) {
      for (const p of activeRoadmap.phases) {
        const found = p.days.find((d) => d.day === dayNum);
        if (found) {
          currentTopic = found.topic;
          currentObjectives = found.objectives || '';
          break;
        }
      }
    }
    setEditDayTopicDraft(currentTopic);
    setEditDayObjectivesDraft(currentObjectives);
    setEditDayModal(true);
  };

  // Save edited day topic + objectives
  const saveEditedDayTopic = () => {
    if (!activeRoadmap) return;
    const objectives = editDayObjectivesDraft.trim();
    const updatedPhases = activeRoadmap.phases.map((phase) => {
      if (editDayNumber >= phase.startDay && editDayNumber <= phase.endDay) {
        return {
          ...phase,
          days: phase.days.map((d) => {
            if (d.day !== editDayNumber) return d;
            const next = { ...d, topic: editDayTopicDraft.trim() || t('schedule.placeholderTopic', { day: editDayNumber }) };
            if (objectives) next.objectives = objectives;
            else delete next.objectives;
            return next;
          })
        };
      }
      return phase;
    });

    updateActiveRoadmap((r) => ({ ...r, phases: updatedPhases }));
    setEditDayModal(false);
  };

  // Open Create Roadmap Modal
  const openCreateRoadmap = () => {
    setFormTitle('');
    setFormDesc('');
    setFormCategory(CATEGORIES[0]);
    setFormIcon('🎯');
    setFormColor(COLOR_PALETTE[0]);
    setFormTotalDays('30');
    setFormPhaseGrouping('30');
    setCreateRoadmapModal(true);
  };

  // Save New Roadmap
  const handleCreateRoadmap = () => {
    if (!formTitle.trim()) {
      Alert.alert(t('create.titleRequired'), t('create.titleRequiredBody'));
      return;
    }
    const days = Math.min(MAX_ROADMAP_DAYS, parseInt(formTotalDays, 10) || 30);
    const phaseBlock = parseInt(formPhaseGrouping, 10) || (days <= 21 ? 7 : 30);

    const newRoadmap = createCustomRoadmap({
      title: formTitle,
      description: formDesc,
      category: formCategory,
      icon: formIcon,
      color: formColor,
      totalDays: days,
      phaseLength: phaseBlock
    });

    setAppData((prev) => ({
      ...prev,
      roadmaps: [newRoadmap, ...prev.roadmaps],
      activeRoadmapId: newRoadmap.id
    }));

    setCreateRoadmapModal(false);
    setActiveTab('today');
  };

  // Add Preset Template Roadmap
  const addPresetRoadmap = (template) => {
    const fresh = template.builder();
    fresh.id = `${template.id}_${Date.now()}`;
    setAppData((prev) => ({
      ...prev,
      roadmaps: [...prev.roadmaps, fresh],
      activeRoadmapId: fresh.id
    }));
    Alert.alert(t('templates.addedTitle'), t('templates.addedBody', { title: fresh.title }));
    setActiveTab('today');
  };

  // Open Edit Roadmap Info (+ duration)
  const openEditRoadmap = (r) => {
    setEditingRoadmapId(r.id);
    setFormTitle(r.title);
    setFormDesc(r.description || '');
    setFormCategory(r.category || CATEGORIES[0]);
    setFormIcon(r.icon || '🎯');
    setFormColor(r.color || COLOR_PALETTE[0]);
    setFormDurationValue(String(r.totalDays || 30));
    setFormDurationUnit('days');
    setEditRoadmapModal(true);
  };

  // Save Roadmap Info Edits; duration changes go through a preview first
  const handleSaveRoadmapEdits = () => {
    if (!editingRoadmapId || !formTitle.trim()) return;
    const target = appData.roadmaps.find((r) => r.id === editingRoadmapId);
    if (!target) return;
    const infoUpdate = {
      title: formTitle.trim(),
      description: formDesc.trim(),
      category: formCategory,
      icon: formIcon,
      color: formColor
    };
    const newTotal = toDays(formDurationValue, formDurationUnit);
    if (!newTotal) {
      Alert.alert(t('duration.invalidTitle'), t('duration.invalidBody', { max: MAX_ROADMAP_DAYS }));
      return;
    }

    if (newTotal !== target.totalDays) {
      const plan = planScheduleResize(target, newTotal, scheduleLabels(lang));
      if (!plan.ok) {
        Alert.alert(
          t('schedule.errTitle'),
          plan.error === 'belowLocked'
            ? t('schedule.errBelowLocked', { min: plan.minDays })
            : t('duration.invalidBody', { max: MAX_ROADMAP_DAYS })
        );
        return;
      }
      setEditRoadmapModal(false);
      setSchedulePlan({ ...plan, roadmapId: target.id, roadmapTitle: infoUpdate.title, infoUpdate });
      return;
    }

    updateRoadmapById(editingRoadmapId, (r) => ({ ...r, ...infoUpdate }));
    setEditRoadmapModal(false);
  };

  // Apply a confirmed schedule change (recomputed on the latest data)
  const confirmScheduleChange = () => {
    if (!schedulePlan) return;
    const { roadmapId, newTotal, infoUpdate } = schedulePlan;
    const latest = appDataRef.current && appDataRef.current.roadmaps.find((r) => r.id === roadmapId);
    const applied = Boolean(latest && planScheduleResize(latest, newTotal, scheduleLabels(lang)).ok);
    setAppData((prev) => ({
      ...prev,
      roadmaps: prev.roadmaps.map((r) => {
        if (r.id !== roadmapId) return r;
        const fresh = planScheduleResize(r, newTotal, scheduleLabels(lang));
        if (!fresh.ok) return { ...r, ...infoUpdate };
        return { ...fresh.roadmap, ...infoUpdate };
      })
    }));
    if (activeRoadmap && activeRoadmap.id === roadmapId) setOpenPhaseId(null);
    setSchedulePlan(null);
    setTimeout(() => {
      Alert.alert(
        applied ? t('schedule.appliedTitle') : t('schedule.errTitle'),
        applied ? t('schedule.appliedBody', { days: newTotal }) : t('schedule.errBelowLocked', { min: schedulePlan.minDays })
      );
    }, 50);
  };

  // Duplicate Roadmap
  const duplicateRoadmap = (r) => {
    const clone = {
      ...r,
      id: 'roadmap_' + Date.now(),
      title: t('roadmaps.copySuffix', { title: r.title }),
      currentDay: 1,
      doneDays: [],
      notes: {},
      tasks: {}
    };
    setAppData((prev) => ({
      ...prev,
      roadmaps: [...prev.roadmaps, clone],
      activeRoadmapId: clone.id
    }));
    Alert.alert(t('roadmaps.duplicatedTitle'), t('roadmaps.duplicatedBody', { title: r.title }));
  };

  // Delete Roadmap
  const deleteRoadmap = (r) => {
    if (appData.roadmaps.length <= 1) {
      Alert.alert(t('roadmaps.cannotDeleteTitle'), t('roadmaps.cannotDeleteBody'));
      return;
    }
    Alert.alert(t('roadmaps.deleteTitle'), t('roadmaps.deleteBody', { title: r.title }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          setAppData((prev) => {
            const remaining = prev.roadmaps.filter((item) => item.id !== r.id);
            const nextActiveId = prev.activeRoadmapId === r.id ? remaining[0].id : prev.activeRoadmapId;
            return {
              ...prev,
              roadmaps: remaining,
              activeRoadmapId: nextActiveId
            };
          });
        }
      }
    ]);
  };

  // Reset current roadmap
  const resetCurrentRoadmapProgress = () => {
    if (!activeRoadmap) return;
    Alert.alert(
      t('reset.roadmapTitle'),
      t('reset.roadmapBody', { title: activeRoadmap.title }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('reset.roadmapConfirm'),
          style: 'destructive',
          onPress: () => {
            updateActiveRoadmap((r) => ({
              ...r,
              currentDay: 1,
              doneDays: [],
              notes: {},
              tasks: {}
            }));
          }
        }
      ]
    );
  };

  // Factory reset everything
  const factoryResetAll = () => {
    Alert.alert(
      t('reset.allTitle'),
      t('reset.allBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('reset.allConfirm'),
          style: 'destructive',
          onPress: () => {
            const initial = getInitialAppState();
            setAppData({ ...initial, settings: { ...initial.settings, language: lang } });
          }
        }
      ]
    );
  };

  // Export / Backup JSON (API key is never included)
  const handleExportData = () => {
    const json = JSON.stringify(sanitizeForExport(appData), null, 2);
    setBackupText(json);
    setBackupModal(true);
  };

  const handleImportData = () => {
    let parsed;
    try {
      parsed = JSON.parse(backupText);
    } catch (e) {
      Alert.alert(t('backup.importFailedTitle'), t('backup.importFailedBody'));
      return;
    }
    if (!parsed || !Array.isArray(parsed.roadmaps) || parsed.roadmaps.length === 0) {
      Alert.alert(t('backup.invalidTitle'), t('backup.invalidBody'));
      return;
    }
    Alert.alert(t('backup.confirmTitle'), t('backup.confirmBody', { count: parsed.roadmaps.length }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('backup.confirmReplace'),
        style: 'destructive',
        onPress: () => {
          const restored = migrateState(parsed);
          // Backups never carry the API key: keep the one on this device
          const keepKey = appData?.aiConfig?.apiKey || '';
          restored.aiConfig = { ...restored.aiConfig, apiKey: restored.aiConfig.apiKey || keepKey };
          if (!restored.roadmaps.some((r) => r.id === restored.activeRoadmapId)) {
            restored.activeRoadmapId = restored.roadmaps[0].id;
          }
          setAppData(restored);
          setBackupModal(false);
          Alert.alert(t('backup.restoredTitle'), t('backup.restoredBody'));
        }
      }
    ]);
  };

  const handleChangeLanguage = (code) => {
    setAppData((prev) => ({ ...prev, settings: { ...(prev.settings || {}), language: code } }));
  };

  // ================= AI HANDLERS (DeepSeek + OpenAI Integration) =================
  const getAiParams = () => {
    const provider = normalizeProvider(appData?.aiConfig?.provider);
    return {
      apiKey: appData?.aiConfig?.apiKey || '',
      provider,
      model: normalizeModel(provider, appData?.aiConfig?.model)
    };
  };

  // Full context of a day: roadmap + phase + topic + objectives + neighbours
  const getDayContext = (day) => {
    const entry = flatDays[day - 1] || {};
    const phase =
      (activeRoadmap.phases || []).find((p) => p.id === entry.phaseId) ||
      (activeRoadmap.phases || []).find((p) => day >= p.startDay && day <= p.endDay);
    return {
      roadmap: activeRoadmap,
      roadmapTitle: activeRoadmap.title,
      day,
      topic: entry.topic || currentDayInfo.topic,
      phaseTitle: phase ? phase.title : '',
      objectives: entry.objectives || '',
      prevTopic: day > 1 && flatDays[day - 2] ? flatDays[day - 2].topic : '',
      nextTopic: flatDays[day] ? flatDays[day].topic : ''
    };
  };

  const openAISettings = () => {
    const prov = normalizeProvider(appData?.aiConfig?.provider);
    const key = appData?.aiConfig?.apiKey || '';
    setAiProviderDraft(prov);
    // Google keys from the old Gemini integration do not work with DeepSeek
    setAiKeyDraft(key.startsWith('AIzaSy') ? '' : key);
    setAiModelDraft(normalizeModel(prov, appData?.aiConfig?.model));
    setAiValidationStatus(null);
    setAiSettingsModal(true);
  };

  const handleSaveAISettings = () => {
    setAppData((prev) => ({
      ...prev,
      aiConfig: {
        ...(prev.aiConfig || {}),
        provider: aiProviderDraft,
        apiKey: aiKeyDraft.trim(),
        model: normalizeModel(aiProviderDraft, aiModelDraft)
      }
    }));
    setAiSettingsModal(false);
    Alert.alert(t('aiSettings.savedTitle'), t('aiSettings.savedBody', { provider: providerName(aiProviderDraft) }));
  };

  const handleTestApiKey = async () => {
    const provName = providerName(aiProviderDraft);
    if (!aiKeyDraft.trim()) {
      Alert.alert(t('aiSettings.emptyKeyTitle'), t('aiSettings.emptyKeyBody', { provider: provName }));
      return;
    }
    setAiValidating(true);
    setAiValidationStatus(null);
    const result = await validateApiKey(aiKeyDraft.trim(), aiProviderDraft, lang);
    setAiValidating(false);
    if (result.valid) {
      setAiValidationStatus({ valid: true, msg: t('aiSettings.keyValid', { provider: provName }) });
    } else {
      setAiValidationStatus({ valid: false, msg: result.error || t('aiSettings.connFailed') });
    }
  };

  const openAIRoadmapModal = () => {
    setAiPrompt('');
    setAiDurationValue('30');
    setAiDurationUnit('days');
    setAiLevel('Beginner');
    setAiFocus('Practical Labs & Projects');
    setAiRoadmapInstructions('');
    setAiRoadmapLang('auto');
    setAiRoadmapModal(true);
  };

  const aiTotalDays = toDays(aiDurationValue, aiDurationUnit);

  const handleGenerateAIRoadmap = async () => {
    if (!aiPrompt.trim()) {
      Alert.alert(t('aiRoadmap.goalRequiredTitle'), t('aiRoadmap.goalRequiredBody'));
      return;
    }
    if (!aiTotalDays || aiTotalDays > MAX_ROADMAP_DAYS) {
      Alert.alert(t('duration.invalidTitle'), t('duration.invalidBody', { max: MAX_ROADMAP_DAYS }));
      return;
    }
    setAiGeneratingRoadmap(true);
    try {
      const newRoadmap = await generateRoadmapWithAI({
        prompt: aiPrompt,
        totalDays: aiTotalDays,
        durationUnit: aiDurationUnit,
        experienceLevel: aiLevel,
        focusArea: aiFocus,
        customInstructions: aiRoadmapInstructions,
        language: resolveContentLang(aiRoadmapLang),
        ...getAiParams()
      });

      setAppData((prev) => ({
        ...prev,
        roadmaps: [newRoadmap, ...prev.roadmaps],
        activeRoadmapId: newRoadmap.id
      }));

      setAiRoadmapModal(false);
      setActiveTab('today');
      Alert.alert(
        t('aiRoadmap.createdTitle'),
        t('aiRoadmap.createdBody', { title: newRoadmap.title, days: newRoadmap.totalDays })
      );
    } catch (err) {
      Alert.alert(t('aiRoadmap.failedTitle'), err.message || t('aiRoadmap.failedBody'));
    } finally {
      setAiGeneratingRoadmap(false);
    }
  };

  // ---------- Full-page screens ----------
  const openLessonScreen = () => {
    setLessonInstructions((currentDayLesson && currentDayLesson.customInstructions) || '');
    setLessonLang('auto');
    setShowLessonOptions(!currentDayLesson);
    setScreen('lesson');
  };

  const openPracticeScreen = () => {
    const saved = activeRoadmap?.quizzes?.[currentDay];
    setPracticeInstructions((saved && saved.customInstructions) || '');
    setPracticeLang('auto');
    setShowPracticeOptions(!saved);
    setScreen('practice');
  };

  const openNotesScreen = () => {
    setScreen('notes');
  };

  const closeScreen = () => {
    if (notesEditorRef.current) notesEditorRef.current.flush();
    setScreen('main');
  };

  // Pick Document File (.txt, .md, .csv, .json ...) using DocumentPicker + FileSystem
  const handlePickDocumentFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/*', 'application/json', '*/*'],
        copyToCacheDirectory: true,
        multiple: false
      });
      const asset = result.assets ? result.assets[0] : (result.canceled ? null : result);
      if (!asset || asset.canceled || result.canceled) return;

      const name = asset.name || '';
      if (BINARY_FILE_EXT.test(name) && !TEXT_FILE_EXT.test(name)) {
        Alert.alert(t('upload.binaryTitle'), t('upload.binaryBody', { name }));
        return;
      }

      // Web: the picker returns a blob: URI, which expo-file-system cannot read
      const content = Platform.OS === 'web'
        ? await (asset.file ? asset.file.text() : fetch(asset.uri).then((r) => r.text()))
        : await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.UTF8
        });
      // eslint-disable-next-line no-control-regex
      const binaryChars = (content.slice(0, 4000).match(/[\u0000-\u0008\u000E-\u001F�]/g) || []).length;
      if (binaryChars > 20) {
        Alert.alert(t('upload.binaryTitle'), t('upload.binaryBody', { name }));
        return;
      }
      if (!content || !content.trim()) {
        Alert.alert(t('upload.emptyFileTitle'), t('upload.emptyFileBody'));
        return;
      }
      setAiUploadDraft(content);
      setAiUploadedFileName(name || t('upload.document'));
      Alert.alert(
        t('upload.loadedTitle'),
        t('upload.loadedBody', { name, chars: content.length.toLocaleString(), words: Math.round(content.length / 5).toLocaleString() })
      );
    } catch (err) {
      Alert.alert(t('upload.importFailedTitle'), err.message || t('upload.importFailedBody'));
    }
  };

  // Save Reference Document (Day, Global, or Direct Lesson)
  const handleSaveReferenceDoc = (target = aiUploadTarget) => {
    if (!aiUploadDraft.trim()) {
      Alert.alert(t('upload.emptyDocTitle'), t('upload.emptyDocBody'));
      return;
    }

    if (target === 'global') {
      updateActiveRoadmap((r) => ({
        ...r,
        globalReferenceDoc: aiUploadDraft.trim(),
        globalReferenceDocName: aiUploadedFileName || t('upload.globalDocName')
      }));
      setAiUploadModal(false);
      Alert.alert(t('upload.globalSavedTitle'), t('upload.globalSavedBody', { chars: aiUploadDraft.trim().length.toLocaleString() }));
    } else if (target === 'lesson') {
      const doSave = () => {
        const customLesson = {
          day: currentDay,
          topic: currentDayInfo.topic,
          content: aiUploadDraft.trim(),
          generatedAt: new Date().toISOString(),
          type: 'custom'
        };
        updateActiveRoadmap((r) => ({
          ...r,
          lessons: { ...(r.lessons || {}), [currentDay]: customLesson }
        }));
        setAiUploadModal(false);
        Alert.alert(t('upload.lessonSavedTitle'), t('upload.lessonSavedBody', { day: currentDay }));
      };
      if (currentDayLesson && currentDayLesson.content !== aiUploadDraft.trim()) {
        Alert.alert(t('lesson.replaceTitle'), t('lesson.replaceBody'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('lesson.replaceConfirm'), style: 'destructive', onPress: doSave }
        ]);
      } else {
        doSave();
      }
    } else {
      // Day reference doc (default)
      updateActiveRoadmap((r) => ({
        ...r,
        referenceDocs: {
          ...(r.referenceDocs || {}),
          [currentDay]: {
            content: aiUploadDraft.trim(),
            name: aiUploadedFileName || t('upload.dayDocName', { day: currentDay }),
            updatedAt: new Date().toISOString()
          }
        }
      }));
      setAiUploadModal(false);
      Alert.alert(t('upload.daySavedTitle'), t('upload.daySavedBody', { day: currentDay, chars: aiUploadDraft.trim().length.toLocaleString() }));
    }
  };

  const handleRemoveReferenceDoc = (target) => {
    Alert.alert(t('upload.removeTitle'), t('upload.removeBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('upload.removeConfirm'),
        style: 'destructive',
        onPress: () => {
          if (target === 'global') {
            updateActiveRoadmap((r) => {
              const { globalReferenceDoc, globalReferenceDocName, ...rest } = r;
              return rest;
            });
          } else {
            updateActiveRoadmap((r) => {
              const docs = { ...(r.referenceDocs || {}) };
              delete docs[currentDay];
              return { ...r, referenceDocs: docs };
            });
          }
          setAiUploadModal(false);
        }
      }
    ]);
  };

  const openUploadModal = (target) => {
    if (target === 'global') {
      setAiUploadDraft(globalRefDoc);
      setAiUploadedFileName(activeRoadmap?.globalReferenceDocName || '');
    } else if (target === 'lesson') {
      setAiUploadDraft(currentDayLesson && currentDayLesson.type === 'custom' ? currentDayLesson.content : '');
      setAiUploadedFileName('');
    } else {
      setAiUploadDraft(currentDayRefDoc);
      setAiUploadedFileName(currentDayRefDocObj?.name || '');
    }
    setAiUploadTarget(target);
    setAiUploadModal(true);
  };

  const handleSaveAndGenerateNow = async () => {
    if (!aiUploadDraft.trim()) {
      Alert.alert(t('upload.emptyDocTitle'), t('upload.emptyDocBody'));
      return;
    }
    const docText = aiUploadDraft.trim();
    const target = aiUploadTarget === 'global' ? 'global' : 'day';
    if (target === 'global') {
      updateActiveRoadmap((r) => ({
        ...r,
        globalReferenceDoc: docText,
        globalReferenceDocName: aiUploadedFileName || t('upload.globalDocName')
      }));
    } else {
      updateActiveRoadmap((r) => ({
        ...r,
        referenceDocs: {
          ...(r.referenceDocs || {}),
          [currentDay]: {
            content: docText,
            name: aiUploadedFileName || t('upload.dayDocName', { day: currentDay }),
            updatedAt: new Date().toISOString()
          }
        }
      }));
    }
    setAiUploadModal(false);
    setScreen('lesson');
    // Generate immediately with the document just saved
    await triggerLessonGeneration(
      target === 'global' ? { globalOverride: docText } : { dayOverride: docText }
    );
  };

  const triggerLessonGeneration = async ({ dayOverride, globalOverride } = {}) => {
    if (!activeRoadmap) return;
    const day = currentDay;
    const roadmapId = activeRoadmap.id;
    setAiLessonLoading(true);
    try {
      const lesson = await generateLessonContentWithAI({
        ...getDayContext(day),
        ...getAiParams(),
        language: resolveContentLang(lessonLang),
        customInstructions: lessonInstructions,
        dayReference: dayOverride ?? currentDayRefDoc,
        globalReference: globalOverride ?? globalRefDoc
      });

      updateRoadmapById(roadmapId, (r) => ({
        ...r,
        lessons: { ...(r.lessons || {}), [day]: lesson }
      }));
      setShowLessonOptions(false);
    } catch (err) {
      Alert.alert(t('lesson.errTitle'), err.message || t('lesson.errBody'));
    } finally {
      setAiLessonLoading(false);
    }
  };

  const handleGenerateAILesson = () => {
    if (currentDayLesson && currentDayLesson.type === 'custom') {
      Alert.alert(t('lesson.replaceTitle'), t('lesson.replaceBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('lesson.replaceConfirm'), style: 'destructive', onPress: () => triggerLessonGeneration() }
      ]);
      return;
    }
    triggerLessonGeneration();
  };

  const handleCopyLesson = () => {
    if (!currentDayLesson) return;
    doCopy(currentDayLesson.content);
  };

  const runDocxExport = async ({ markdown, baseName, fallback }) => {
    try {
      const res = await exportDocx({
        title: activeRoadmap.title,
        markdown,
        fileName: docxFileName(baseName, fallback),
        dialogTitle: t('export.dialogTitle')
      });
      if (!res.shared) Alert.alert(t('export.savedTitle'), t('export.savedBody', { uri: res.uri }));
    } catch (err) {
      Alert.alert(t('export.failedTitle'), err.message || t('export.failedBody'));
    }
  };

  const handleExportLessonDocx = () => {
    if (!currentDayLesson) return;
    runDocxExport({
      markdown: currentDayLesson.content,
      baseName: `Day ${currentDay} ${currentDayInfo.topic}`,
      fallback: `Day-${currentDay}-lesson`
    });
  };

  const practiceMarkdown = () =>
    practiceToMarkdown(currentDayQuiz, {
      dayTitle: (d, topic) => t('practice.docTitle', { day: d, topic }),
      lab: t('practice.lab'),
      objectives: t('practice.objectives'),
      environment: t('practice.environment'),
      diagram: t('practice.diagram'),
      table: t('practice.table'),
      exercises: t('practice.exercises'),
      exercise: t('practice.exercise'),
      verification: t('practice.verification'),
      steps: t('practice.steps'),
      troubleshooting: t('practice.troubleshooting'),
      problem: t('practice.problem'),
      diagnosis: t('practice.diagnosis'),
      solution: t('practice.solution'),
      checklist: t('practice.checklist'),
      finalVerification: t('practice.finalVerification'),
      quiz: t('practice.quiz'),
      answer: t('practice.answer'),
      tasks: t('practice.tasks'),
      nextDay: t('practice.nextDay')
    }, { day: currentDay, topic: currentDayInfo.topic });

  const handleGenerateAIPractice = async () => {
    if (!activeRoadmap) return;
    const day = currentDay;
    const roadmapId = activeRoadmap.id;
    setAiPracticeLoading(true);
    try {
      const practice = await generatePracticeAndQuizWithAI({
        ...getDayContext(day),
        ...getAiParams(),
        language: resolveContentLang(practiceLang),
        customInstructions: practiceInstructions,
        lessonContent: currentDayLesson ? currentDayLesson.content : '',
        dayReference: currentDayRefDoc,
        globalReference: globalRefDoc
      });

      updateRoadmapById(roadmapId, (r) => ({
        ...r,
        quizzes: { ...(r.quizzes || {}), [day]: practice }
      }));
      setQuizAnswers({});
      setShowPracticeOptions(false);
    } catch (err) {
      Alert.alert(t('practice.errTitle'), err.message || t('practice.errBody'));
    } finally {
      setAiPracticeLoading(false);
    }
  };

  const handleSelectQuizOption = (qIdx, optIdx) => {
    setQuizAnswers((prev) => ({
      ...prev,
      [qIdx]: optIdx
    }));
  };

  const handleImportPracticeTasks = (practiceTasks) => {
    if (!Array.isArray(practiceTasks) || practiceTasks.length === 0) return;
    const formatted = practiceTasks.map((tk, idx) => ({
      id: 'task_ai_' + Date.now() + '_' + idx,
      title: tk.title,
      dur: tk.dur || '25 mins',
      priority: tk.priority || 'Medium',
      done: false
    }));

    updateActiveRoadmap((r) => ({
      ...r,
      tasks: { ...(r.tasks || {}), [currentDay]: [...dayTasks, ...formatted] }
    }));

    Alert.alert(
      t('practice.importedTitle'),
      t('practice.importedBody', { count: formatted.length, day: currentDay })
    );
  };

  if (!appData || !activeRoadmap) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <StatusBar style="light" />
        <Text style={{ color: '#94a3b8', fontSize: 16 }}>{t('common.loading')}</Text>
      </View>
    );
  }

  const accentColor = activeRoadmap.color || '#10b981';
  const priorityLabel = (p) => (p === 'High' ? t('priority.high') : p === 'Low' ? t('priority.low') : t('priority.medium'));
  const lockedDays = getLockedDayCount(activeRoadmap);

  // Small reusable pieces
  const renderLanguagePicker = (value, onChange) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {[{ code: 'auto', label: t('gen.langAuto', { lang: langName(lang) }) }, ...LANGUAGES].map((opt) => (
        <TouchableOpacity
          key={opt.code}
          style={[styles.langChip, value === opt.code && { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' }]}
          onPress={() => onChange(opt.code)}
        >
          <Text style={{ color: value === opt.code ? '#fff' : '#cbd5e1', fontSize: 12, fontWeight: '600' }}>{opt.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderDurationPicker = ({ value, unit, onValue, onUnit, color, disabled }) => {
    const days = toDays(value, unit);
    return (
      <View>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
          {['days', 'weeks'].map((u) => (
            <TouchableOpacity
              key={u}
              style={[styles.choiceChip, { flex: 1 }, unit === u && { backgroundColor: color, borderColor: color }]}
              onPress={() => onUnit(u)}
              disabled={disabled}
            >
              <Text style={{ color: unit === u ? '#fff' : '#cbd5e1', textAlign: 'center', fontWeight: '700', fontSize: 12 }}>
                {t(u === 'days' ? 'duration.unitDays' : 'duration.unitWeeks')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {DURATION_PRESETS[unit].map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.choiceChip, value === d && { backgroundColor: color, borderColor: color }]}
              onPress={() => onValue(d)}
              disabled={disabled}
            >
              <Text style={{ color: value === d ? '#fff' : '#cbd5e1', fontSize: 12, fontWeight: '700' }}>
                {t(unit === 'days' ? 'duration.nDays' : 'duration.nWeeks', { n: d })}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={value}
          onChangeText={(v) => onValue(v.replace(/[^0-9]/g, ''))}
          placeholder={t(unit === 'days' ? 'duration.customDays' : 'duration.customWeeks')}
          placeholderTextColor="#64748b"
          editable={!disabled}
        />
        <Text style={{ color: days && days <= MAX_ROADMAP_DAYS ? '#94a3b8' : '#f87171', fontSize: 11, marginTop: 4 }}>
          {days && days <= MAX_ROADMAP_DAYS
            ? t('duration.equals', { days })
            : t('duration.invalidBody', { max: MAX_ROADMAP_DAYS })}
        </Text>
      </View>
    );
  };

  const renderScreenHeader = (kicker, kickerColor, title) => (
    <View style={styles.screenHeader}>
      <TouchableOpacity style={styles.screenBackBtn} onPress={closeScreen}>
        <Text style={styles.screenBackText}>‹ {t('common.back')}</Text>
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={{ color: kickerColor, fontSize: 11, fontWeight: '800' }} numberOfLines={1}>{kicker}</Text>
        <Text style={[styles.h1, { fontSize: 15, marginTop: 2 }]} numberOfLines={2}>{title}</Text>
      </View>
    </View>
  );

  const renderReferenceStatus = () => (
    <View style={styles.infoBox}>
      <Text style={{ color: '#cbd5e1', fontSize: 12, fontWeight: '700', marginBottom: 6 }}>{t('gen.referenceTitle')}</Text>
      {currentDayRefDoc ? (
        <TouchableOpacity onPress={() => openUploadModal('day')} style={{ marginBottom: 6 }}>
          <Text style={{ color: '#c7d2fe', fontSize: 11, fontWeight: '700' }}>
            📄 {t('gen.dayDocAttached', { day: currentDay, chars: currentDayRefDoc.length.toLocaleString() })}
          </Text>
          <Text style={{ color: '#94a3b8', fontSize: 10 }} numberOfLines={1}>
            {currentDayRefDocObj?.name || t('upload.document')}: {currentDayRefDoc.replace(/\s+/g, ' ').slice(0, 60)}…
          </Text>
        </TouchableOpacity>
      ) : null}
      {globalRefDoc ? (
        <TouchableOpacity onPress={() => openUploadModal('global')} style={{ marginBottom: 6 }}>
          <Text style={{ color: '#a7f3d0', fontSize: 11, fontWeight: '700' }}>
            🌐 {t('gen.globalDocAttached', { chars: globalRefDoc.length.toLocaleString() })}
          </Text>
          <Text style={{ color: '#94a3b8', fontSize: 10 }} numberOfLines={1}>
            {activeRoadmap.globalReferenceDocName || t('upload.document')}: {globalRefDoc.replace(/\s+/g, ' ').slice(0, 60)}…
          </Text>
        </TouchableOpacity>
      ) : null}
      {!currentDayRefDoc && !globalRefDoc ? (
        <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6 }}>{t('gen.noReference')}</Text>
      ) : null}
      <Text style={{ color: '#64748b', fontSize: 10, marginBottom: 8 }}>{t('gen.referenceNote')}</Text>
      <TouchableOpacity
        style={[styles.btnSmall, { backgroundColor: '#3b82f6', alignSelf: 'flex-start' }]}
        onPress={() => openUploadModal(currentDayRefDoc ? 'day' : globalRefDoc ? 'global' : 'day')}
      >
        <Text style={styles.btnSmallText}>📎 {t('gen.attachDocument')}</Text>
      </TouchableOpacity>
    </View>
  );

  // ================= WEB: DESKTOP SIDEBAR =================
  const renderSidebar = () => {
    const goTab = (id) => {
      if (screen !== 'main') closeScreen();
      if (id === 'settings') setSyncUrlDraft(appData.syncUrl || '');
      setActiveTab(id);
    };
    const navItem = ({ key, icon, label, active, onPress }) => (
      <TouchableOpacity
        key={key}
        style={[styles.webNavItem, active && styles.webNavItemActive]}
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
      >
        <Text style={styles.webNavIcon}>{icon}</Text>
        <Text style={[styles.webNavLabel, active && { color: '#f8fafc' }]} numberOfLines={1}>{label}</Text>
        {active && <View style={[styles.activeDot, { backgroundColor: accentColor, marginTop: 0 }]} />}
      </TouchableOpacity>
    );
    const aiProvider = normalizeProvider(appData.aiConfig?.provider);
    const hasKey = !!appData.aiConfig?.apiKey && !appData.aiConfig.apiKey.startsWith('AIzaSy');

    return (
      <View style={styles.webSidebar}>
        <ScrollView contentContainerStyle={styles.webSidebarInner} showsVerticalScrollIndicator={false}>
          <View style={styles.webBrand}>
            <Text style={{ fontSize: 22 }}>🗺️</Text>
            <Text style={styles.webBrandText}>{t('web.appName')}</Text>
          </View>

          {/* Active roadmap + progress */}
          <TouchableOpacity style={[styles.webRoadmapCard, { borderColor: `${accentColor}44` }]} onPress={() => goTab('roadmaps')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[styles.roadmapIconBubble, { backgroundColor: `${accentColor}25` }]}>
                <Text style={{ fontSize: 18 }}>{activeRoadmap.icon || '🎯'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.roadmapHeaderTitle} numberOfLines={2}>{activeRoadmap.title}</Text>
                <Text style={styles.roadmapHeaderSubtitle} numberOfLines={1}>
                  {t('header.dayOf', { day: activeRoadmap.currentDay, total: activeRoadmap.totalDays })}
                </Text>
              </View>
            </View>
            <View style={[styles.progressBarTrack, { marginTop: 10 }]}>
              <View style={[styles.progressBarThumb, { width: `${activeRoadmapPct}%`, backgroundColor: accentColor }]} />
            </View>
            <Text style={[styles.progressPctText, { color: accentColor, marginTop: 6 }]}>
              {activeRoadmapDoneCount}/{activeRoadmap.totalDays} ({activeRoadmapPct}%)
            </Text>
          </TouchableOpacity>

          <Text style={styles.webSectionLabel}>{t('web.menu')}</Text>
          {[
            { id: 'today', icon: '⚡', label: t('tab.focus') },
            { id: 'roadmaps', icon: '🗺️', label: t('tab.roadmaps') },
            { id: 'timeline', icon: '📅', label: t('tab.timeline') },
            { id: 'settings', icon: '⚙️', label: t('tab.settings') }
          ].map((tab) => navItem({
            key: tab.id,
            icon: tab.icon,
            label: tab.label,
            active: screen === 'main' && activeTab === tab.id,
            onPress: () => goTab(tab.id)
          }))}

          <Text style={styles.webSectionLabel}>{t('web.dayStudy', { day: currentDay })}</Text>
          {navItem({ key: 'lesson', icon: '📖', label: t('today.lessonBtn'), active: screen === 'lesson', onPress: openLessonScreen })}
          {navItem({ key: 'practice', icon: '🧪', label: t('today.practiceBtn'), active: screen === 'practice', onPress: openPracticeScreen })}
          {navItem({ key: 'notes', icon: '📝', label: t('web.notes'), active: screen === 'notes', onPress: openNotesScreen })}

          <View style={{ flex: 1 }} />

          <View style={styles.webSidebarFooter}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity
                style={[styles.badgePill, reminderEnabled && { borderColor: `${accentColor}55`, backgroundColor: `${accentColor}15` }]}
                onPress={() => setReminderModal(true)}
              >
                <Text style={{ fontSize: 12 }}>⏰</Text>
                <Text style={[styles.badgePillText, reminderEnabled && { color: accentColor }]}>
                  {reminderEnabled ? reminderTimeDraft : t('common.off')}
                </Text>
              </TouchableOpacity>
              <View style={[styles.badgePill, styles.streakPill]}>
                <Text style={{ fontSize: 12 }}>🔥</Text>
                <Text style={styles.streakPillText}>
                  {t('header.streakDays', { n: appData.streak ? appData.streak.count || 0 : 0 })}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={openAISettings}>
              <Text style={{ color: hasKey ? '#34d399' : '#a78bfa', fontSize: 11, fontWeight: '700' }} numberOfLines={1}>
                🤖 {hasKey
                  ? `${providerName(aiProvider)} · ${normalizeModel(aiProvider, appData.aiConfig?.model)}`
                  : t('web.aiSetup')}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  };

  // ================= MAIN TABBED LAYOUT =================
  const renderMain = () => (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

      {/* ================= MODERN TOP BAR (CLEAN DYNAMIC ISLAND CLEARANCE) ================= */}
      {/* Desktop web shows this information in the sidebar instead */}
      {!isWide && (
      <View style={styles.topHeader}>
        {/* Top Row: Active Roadmap + Quick Badges */}
        <View style={styles.topHeaderRow}>
          <TouchableOpacity
            style={styles.roadmapHeaderBtn}
            onPress={() => setActiveTab('roadmaps')}
            activeOpacity={0.7}
          >
            <View style={[styles.roadmapIconBubble, { backgroundColor: `${accentColor}25` }]}>
              <Text style={{ fontSize: 18 }}>{activeRoadmap.icon || '🎯'}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.roadmapHeaderTitle} numberOfLines={1}>
                  {activeRoadmap.title}
                </Text>
                <Text style={{ color: '#64748b', fontSize: 10, marginLeft: 5 }}>▼</Text>
              </View>
              <Text style={styles.roadmapHeaderSubtitle} numberOfLines={1}>
                {categoryLabel(lang, activeRoadmap.category)} · {t('common.nDays', { n: activeRoadmap.totalDays })}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Badges on Right */}
          <View style={styles.headerBadgesRow}>
            <TouchableOpacity
              style={[
                styles.badgePill,
                reminderEnabled && { borderColor: `${accentColor}55`, backgroundColor: `${accentColor}15` }
              ]}
              onPress={() => setReminderModal(true)}
            >
              <Text style={{ fontSize: 12 }}>⏰</Text>
              <Text style={[styles.badgePillText, reminderEnabled && { color: accentColor }]}>
                {reminderEnabled ? reminderTimeDraft : t('common.off')}
              </Text>
            </TouchableOpacity>

            <View style={[styles.badgePill, styles.streakPill]}>
              <Text style={{ fontSize: 12 }}>🔥</Text>
              <Text style={styles.streakPillText}>
                {t('header.streakDays', { n: appData.streak ? appData.streak.count || 0 : 0 })}
              </Text>
            </View>
          </View>
        </View>

        {/* Bottom Row of Header: Progress Track & Info */}
        <View style={styles.topHeaderProgressRow}>
          <View style={styles.rowBetween}>
            <Text style={styles.progressLabel}>
              {t('header.dayOf', { day: activeRoadmap.currentDay, total: activeRoadmap.totalDays })}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.progressPctText, { color: accentColor }]}>
                {activeRoadmapDoneCount}/{activeRoadmap.totalDays} ({activeRoadmapPct}%)
              </Text>
              <Text style={styles.offlineText}>• ⚡ {t('header.offline')}</Text>
            </View>
          </View>
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarThumb, { width: `${activeRoadmapPct}%`, backgroundColor: accentColor }]} />
          </View>
        </View>
      </View>
      )}

      {/* ================= TAB CONTENT ================= */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={isWide ? styles.webContent : { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 110 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* TAB 1: TODAY / FOCUS VIEW */}
        {activeTab === 'today' && (
          <View>
            {/* LIVE STUDY ALARM BANNER (When alarm time arrives) */}
            {studyAlertVisible && !isCurrentDayDone && (
              <View style={[styles.alertBannerCard, { borderColor: accentColor }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 26 }}>⏰</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.alertBannerTitle}>{t('alarm.bannerTitle')}</Text>
                    <Text style={styles.alertBannerSub}>
                      {t('alarm.bannerSub', { time: reminderTimeDraft })}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity
                    style={[styles.btnPrimary, { flex: 1, backgroundColor: accentColor }]}
                    onPress={() => {
                      setIsTimerRunning(true);
                      setStudyAlertVisible(false);
                    }}
                  >
                    <Text style={styles.btnPrimaryText}>▶ {t('timer.start')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnPrimary, styles.btnGray]}
                    onPress={() => setStudyAlertVisible(false)}
                  >
                    <Text style={styles.btnPrimaryText}>{t('common.dismiss')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={isWide ? styles.webColumns : null}>
            <View style={isWide ? styles.webCol : null}>
            {/* Hero Day Focus Card */}
            <View style={[styles.heroCard, { borderColor: `${accentColor}33` }]}>
              <View style={styles.rowBetween}>
                <View style={[styles.phaseTag, { backgroundColor: `${accentColor}20`, flexShrink: 1 }]}>
                  <Text style={[styles.phaseTagText, { color: accentColor }]} numberOfLines={1}>
                    {currentDayInfo.phaseTitle || t('today.phaseDay', { day: currentDay })}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.editIconBtn}
                  onPress={() => openEditDayModal(currentDay)}
                >
                  <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '600' }}>✎ {t('today.editTopic')}</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.heroTopic}>{currentDayInfo.topic}</Text>
              <Text style={styles.heroSub}>
                {t('header.dayOf', { day: currentDay, total: activeRoadmap.totalDays })} · {categoryLabel(lang, activeRoadmap.category)}
              </Text>
              {currentDayInfo.objectives ? (
                <Text style={[styles.sub, { marginTop: 6, color: '#cbd5e1' }]} numberOfLines={3}>
                  🎯 {currentDayInfo.objectives}
                </Text>
              ) : null}

              {/* AI Study Superchargers Row */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <TouchableOpacity
                  style={[
                    styles.aiHeroActionBtn,
                    { borderColor: currentDayLesson ? `${accentColor}88` : '#334155', backgroundColor: currentDayLesson ? `${accentColor}18` : '#131d33' }
                  ]}
                  onPress={openLessonScreen}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 16 }}>📖</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.aiHeroActionTitle, { color: '#fff' }]}>{t('today.lessonBtn')}</Text>
                    <Text style={[styles.aiHeroActionSub, { color: currentDayLesson ? accentColor : '#94a3b8' }]}>
                      {currentDayLesson ? t('today.lessonReady') : t('today.lessonGenerate')}
                    </Text>
                  </View>
                  <Text style={{ color: accentColor, fontSize: 12, fontWeight: '800' }}>›</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.aiHeroActionBtn,
                    { borderColor: currentDayQuiz ? '#8b5cf688' : '#334155', backgroundColor: currentDayQuiz ? '#8b5cf618' : '#131d33' }
                  ]}
                  onPress={openPracticeScreen}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 16 }}>⚡</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.aiHeroActionTitle, { color: '#fff' }]}>{t('today.practiceBtn')}</Text>
                    <Text style={[styles.aiHeroActionSub, { color: currentDayQuiz ? '#a78bfa' : '#94a3b8' }]}>
                      {currentDayQuiz ? t('today.practiceReady') : t('today.practiceGenerate')}
                    </Text>
                  </View>
                  <Text style={{ color: '#a78bfa', fontSize: 12, fontWeight: '800' }}>›</Text>
                </TouchableOpacity>
              </View>

              {/* Day Navigation & Complete Action */}
              <View style={[styles.rowBetween, { marginTop: 16 }]}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    onPress={() => jumpToDay(currentDay - 1)}
                    style={[styles.smallNavBtn, currentDay <= 1 && styles.btnDisabled]}
                    disabled={currentDay <= 1}
                  >
                    <Text style={styles.navBtnText}>‹ {t('today.prev')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => jumpToDay(currentDay + 1)}
                    style={[styles.smallNavBtn, currentDay >= activeRoadmap.totalDays && styles.btnDisabled]}
                    disabled={currentDay >= activeRoadmap.totalDays}
                  >
                    <Text style={styles.navBtnText}>{t('today.next')} ›</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[
                    styles.markDoneBtn,
                    isCurrentDayDone ? { backgroundColor: '#10b981' } : { backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1 }
                  ]}
                  onPress={toggleDayCompleted}
                >
                  <Text style={[styles.markDoneBtnText, isCurrentDayDone ? { color: '#fff' } : { color: '#cbd5e1' }]}>
                    {isCurrentDayDone ? t('today.dayCompleted') : t('today.markCompleted')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Routine / Pomodoro Focus Timer */}
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>⏱ {t('timer.title')}</Text>
                <TouchableOpacity onPress={openTimerSettings}>
                  <Text style={{ color: '#64748b', fontSize: 12, fontWeight: '600' }}>⚙️ {t('timer.modes')}</Text>
                </TouchableOpacity>
              </View>

              {/* Active Task Banner */}
              {activeTaskId && (() => {
                const linked = dayTasks.find((tk) => tk.id === activeTaskId);
                return linked ? (
                  <View style={[styles.activeTaskBanner, { borderColor: `${accentColor}66`, backgroundColor: `${accentColor}18` }]}>
                    <Text style={{ fontSize: 14 }}>🎯</Text>
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={{ color: '#94a3b8', fontSize: 10, fontWeight: '600' }}>{t('timer.linkedTask')}</Text>
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
                        {linked.title}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => {
                      setActiveTaskId(null);
                      persistTimerState(activeTimerMode, timerLeft, null);
                    }}>
                      <Text style={{ color: '#64748b', fontSize: 13 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ) : null;
              })()}

              {/* Mode Selectors */}
              <View style={[styles.timerModesRow, { flexWrap: 'wrap' }]}>
                {routineModes.map((m) => (
                  <TouchableOpacity
                    key={m.id || m.label}
                    onPress={() => selectTimerMode(m)}
                    style={[
                      styles.timerModeChip,
                      activeTimerMode === m.label && !activeTaskId && { backgroundColor: accentColor }
                    ]}
                  >
                    <Text
                      style={{
                        color: activeTimerMode === m.label && !activeTaskId ? '#fff' : '#94a3b8',
                        fontSize: 12,
                        fontWeight: '700'
                      }}
                    >
                      {modeLabel(lang, m.label).toUpperCase()} ({m.dur}{t('timer.minShort')})
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Timer Clock */}
              <Text style={[
                styles.timerDisplay,
                activeTaskId && { color: accentColor }
              ]}>{timerFormatted}</Text>

              {/* Controls */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[
                    styles.btnPrimary,
                    { flex: 1, backgroundColor: isTimerRunning ? '#f59e0b' : accentColor }
                  ]}
                  onPress={() => {
                    const next = !isTimerRunning;
                    setIsTimerRunning(next);
                    // When starting, send a silent phone notification
                    if (next && timerLeft > 0) {
                      const linked = activeTaskId ? dayTasks.find((tk) => tk.id === activeTaskId) : null;
                      if (linked) {
                        const durMins = Math.ceil(timerLeft / 60);
                        sendTaskStartNotification(linked.title, durMins);
                      }
                    }
                  }}
                >
                  <Text style={styles.btnPrimaryText}>
                    {isTimerRunning ? `⏸ ${t('timer.pause')}` : `▶ ${t('timer.start')}`}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnPrimary, styles.btnGray]}
                  onPress={() => {
                    if (activeTaskId) {
                      // Reset to linked task duration
                      const linked = dayTasks.find((tk) => tk.id === activeTaskId);
                      if (linked) {
                        handleSelectTask(linked);
                        return;
                      }
                    }
                    const cur = routineModes.find((m) => m.label === activeTimerMode) || routineModes[0];
                    selectTimerMode(cur);
                  }}
                >
                  <Text style={styles.btnPrimaryText}>{t('timer.reset')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            </View>
            <View style={isWide ? styles.webCol : null}>
            {/* Daily Tasks Checklist */}
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={[styles.cardTitle, { flex: 1 }]}>✅ {t('tasks.title', { day: currentDay })}</Text>
                <TouchableOpacity
                  style={[styles.btnSmall, { backgroundColor: accentColor }]}
                  onPress={openAddTask}
                >
                  <Text style={styles.btnSmallText}>+ {t('tasks.add')}</Text>
                </TouchableOpacity>
              </View>

              {dayTasks.length === 0 ? (
                <Text style={styles.emptyNote}>{t('tasks.empty', { day: currentDay })}</Text>
              ) : (
                dayTasks.map((task) => (
                  <View
                    key={task.id}
                    style={[
                      styles.taskItem,
                      activeTaskId === task.id && {
                        borderColor: accentColor,
                        borderWidth: 1.5,
                        backgroundColor: `${accentColor}10`
                      }
                    ]}
                  >
                    <TouchableOpacity
                      onPress={() => toggleTask(task.id)}
                      style={[
                        styles.taskCheckbox,
                        task.done && { backgroundColor: accentColor, borderColor: accentColor }
                      ]}
                    >
                      {task.done && <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>✓</Text>}
                    </TouchableOpacity>

                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.taskTitle,
                          task.done && { textDecorationLine: 'line-through', color: '#64748b' }
                        ]}
                      >
                        {task.title}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 3 }}>
                        <Text style={styles.taskMetaBadge}>{task.dur}</Text>
                        {task.priority && (
                          <Text
                            style={[
                              styles.taskMetaBadge,
                              task.priority === 'High'
                                ? { color: '#f87171' }
                                : task.priority === 'Medium'
                                ? { color: '#fbbf24' }
                                : { color: '#94a3b8' }
                            ]}
                          >
                            {priorityLabel(task.priority)}
                          </Text>
                        )}
                      </View>
                    </View>

                    {/* ✎ Edit + ▶ Focus + 🗑 Delete row */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <TouchableOpacity
                        onPress={() => openEditTask(task)}
                        style={[styles.taskFocusBtn, { backgroundColor: '#172338' }]}
                      >
                        <Text style={{ color: '#94a3b8', fontSize: 12 }}>✎</Text>
                      </TouchableOpacity>

                      {!task.done && (
                        <TouchableOpacity
                          onPress={() => handleSelectTask(task)}
                          style={[
                            styles.taskFocusBtn,
                            activeTaskId === task.id
                              ? { backgroundColor: accentColor }
                              : { backgroundColor: '#172338' }
                          ]}
                        >
                          <Text style={{
                            color: activeTaskId === task.id ? '#fff' : '#64748b',
                            fontSize: 11,
                            fontWeight: '700'
                          }}>
                            {activeTaskId === task.id ? '⏱' : '▶'}
                          </Text>
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity onPress={() => deleteTask(task.id)}>
                        <Text style={{ color: '#f87171', padding: 4, fontSize: 14 }}>🗑</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}

              {/* Daily Notes / Reflections Card (Compact Preview -> Tap to open Full-Page Editor) */}
              <View style={[styles.card, { marginTop: 14, borderColor: '#1e293b' }]}>
                <View style={styles.rowBetween}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, paddingRight: 6 }}>
                    <Text style={{ fontSize: 20 }}>📝</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, { fontSize: 13 }]}>{t('notes.cardTitle', { day: currentDay })}</Text>
                      <Text style={{ color: currentDayNote ? '#34d399' : '#64748b', fontSize: 11, marginTop: 1 }}>
                        {currentDayNote ? t('notes.charsLogged', { count: currentDayNote.length.toLocaleString() }) : t('notes.noneYet')}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.btnSmall, { backgroundColor: accentColor }]}
                    onPress={openNotesScreen}
                  >
                    <Text style={styles.btnSmallText}>📖 {t('notes.fullPage')}</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.notePreviewBox}
                  onPress={openNotesScreen}
                  activeOpacity={0.8}
                >
                  {currentDayNote.trim() ? (
                    <Text style={styles.notePreviewText} numberOfLines={3}>
                      {currentDayNote}
                    </Text>
                  ) : (
                    <Text style={{ color: '#475569', fontSize: 12, fontStyle: 'italic', lineHeight: 18 }}>
                      {t('notes.previewHint')}
                    </Text>
                  )}
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 }}>
                    <Text style={{ color: accentColor, fontSize: 11, fontWeight: '700' }}>
                      ✎ {t('notes.tapToEdit')} ›
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
            </View>
            </View>
          </View>
        )}

        {/* TAB 2: ROADMAPS HUB */}
        {activeTab === 'roadmaps' && (
          <View>
            <View style={[styles.rowBetween, { marginBottom: 14, flexWrap: 'wrap', gap: 8 }]}>
              <View>
                <Text style={styles.h1}>{t('roadmaps.title')}</Text>
                <Text style={styles.sub}>{t('roadmaps.count', { n: appData.roadmaps.length })}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  style={[styles.btnPrimary, { backgroundColor: '#8b5cf6', paddingHorizontal: 12, paddingVertical: 8 }]}
                  onPress={openAIRoadmapModal}
                >
                  <Text style={styles.btnPrimaryText}>✨ {t('roadmaps.aiGenerator')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnPrimary, { backgroundColor: '#10b981', paddingHorizontal: 12, paddingVertical: 8 }]}
                  onPress={openCreateRoadmap}
                >
                  <Text style={styles.btnPrimaryText}>+ {t('roadmaps.manual')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* List of Roadmaps */}
            <View style={isWide ? styles.webGrid : null}>
            {appData.roadmaps.map((r) => {
              const isSelected = r.id === activeRoadmap.id;
              const doneCnt = r.doneDays ? r.doneDays.length : 0;
              const tot = r.totalDays || 30;
              const pct = Math.round((doneCnt / tot) * 100);
              const rColor = r.color || '#10b981';

              return (
                <View
                  key={r.id}
                  style={[
                    styles.roadmapCard,
                    isSelected && { borderColor: rColor, borderWidth: 1.5 },
                    isWide && styles.webGridItem
                  ]}
                >
                  <View style={styles.rowBetween}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      <Text style={{ fontSize: 26 }}>{r.icon || '🎯'}</Text>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={styles.roadmapCardTitle}>{r.title}</Text>
                          {isSelected && (
                            <View style={[styles.activePill, { backgroundColor: `${rColor}22` }]}>
                              <Text style={[styles.activePillText, { color: rColor }]}>{t('common.active')}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.roadmapCardCategory}>{categoryLabel(lang, r.category)} · {t('common.nDays', { n: tot })}</Text>
                      </View>
                    </View>
                  </View>

                  {r.description ? (
                    <Text style={styles.roadmapCardDesc} numberOfLines={2}>
                      {r.description}
                    </Text>
                  ) : null}

                  {/* Progress Bar */}
                  <View style={{ marginTop: 10 }}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.sub}>
                        {t('roadmaps.progress', { day: r.currentDay || 1, total: tot })}
                      </Text>
                      <Text style={{ color: rColor, fontSize: 12, fontWeight: '700' }}>
                        {doneCnt}/{tot} ({pct}%)
                      </Text>
                    </View>
                    <View style={styles.bar}>
                      <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: rColor }]} />
                    </View>
                  </View>

                  {/* Actions */}
                  <View style={styles.roadmapActionsRow}>
                    <TouchableOpacity
                      style={[
                        styles.actionChip,
                        isSelected ? { backgroundColor: `${rColor}25`, borderColor: rColor } : {}
                      ]}
                      onPress={() => {
                        switchActiveRoadmap(r.id);
                        setActiveTab('today');
                      }}
                    >
                      <Text style={{ color: isSelected ? rColor : '#cbd5e1', fontSize: 12, fontWeight: '600' }}>
                        {isSelected ? t('roadmaps.inFocus') : t('roadmaps.openFocus')}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionChip} onPress={() => openEditRoadmap(r)}>
                      <Text style={{ color: '#94a3b8', fontSize: 12 }}>✎ {t('roadmaps.editDuration')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionChip} onPress={() => duplicateRoadmap(r)}>
                      <Text style={{ color: '#94a3b8', fontSize: 12 }}>📋 {t('roadmaps.duplicate')}</Text>
                    </TouchableOpacity>

                    {appData.roadmaps.length > 1 && (
                      <TouchableOpacity
                        style={[styles.actionChip, { borderColor: '#ef444433' }]}
                        onPress={() => deleteRoadmap(r)}
                      >
                        <Text style={{ color: '#f87171', fontSize: 12 }}>🗑</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
            </View>

            {/* Ready-to-Use Templates */}
            <View style={{ marginTop: 24, marginBottom: 10 }}>
              <Text style={styles.h2}>📚 {t('templates.title')}</Text>
              <Text style={styles.sub}>{t('templates.sub')}</Text>
            </View>

            <View style={isWide ? styles.webGrid : null}>
            {TEMPLATE_LIST.map((tmpl) => (
              <View key={tmpl.id} style={[styles.templateCard, isWide && styles.webGridItem]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <Text style={{ fontSize: 24 }}>{tmpl.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.roadmapCardTitle}>{templateText(lang, tmpl.id, 'title', tmpl.title)}</Text>
                    <Text style={styles.sub}>{t('common.nDays', { n: tmpl.days })} · {categoryLabel(lang, tmpl.category)}</Text>
                    <Text style={[styles.sub, { marginTop: 4 }]} numberOfLines={2}>{templateText(lang, tmpl.id, 'desc', tmpl.desc)}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.btnSmall, { backgroundColor: tmpl.color, alignSelf: 'center', marginTop: 8 }]}
                  onPress={() => addPresetRoadmap(tmpl)}
                >
                  <Text style={styles.btnSmallText}>+ {t('templates.use')}</Text>
                </TouchableOpacity>
              </View>
            ))}
            </View>
          </View>
        )}

        {/* TAB 3: TIMELINE & CURRICULUM VIEW */}
        {activeTab === 'timeline' && (
          <View>
            <View style={[styles.rowBetween, { marginBottom: 12 }]}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.h1}>{t('timeline.title')}</Text>
                <Text style={styles.sub}>
                  {t('timeline.sub', { title: activeRoadmap.title, days: activeRoadmap.totalDays })}
                </Text>
              </View>
              <View style={{ gap: 6 }}>
                <TouchableOpacity
                  style={[styles.btnSmall, { backgroundColor: accentColor }]}
                  onPress={() => openEditDayModal(currentDay)}
                >
                  <Text style={styles.btnSmallText}>✎ {t('timeline.editDay')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnSmall, { backgroundColor: '#334155' }]}
                  onPress={() => openEditRoadmap(activeRoadmap)}
                >
                  <Text style={styles.btnSmallText}>📏 {t('timeline.adjustDuration')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Phases Accordions */}
            {activeRoadmap.phases && activeRoadmap.phases.map((phase) => {
              const isOpen = openPhaseId === phase.id;
              const phaseDoneCount = phase.days.filter((d) =>
                activeRoadmap.doneDays.includes(d.day)
              ).length;
              const phaseTotal = phase.days.length;

              return (
                <View key={phase.id} style={styles.phaseCard}>
                  <TouchableOpacity
                    onPress={() => setOpenPhaseId(isOpen ? null : phase.id)}
                    style={styles.rowBetween}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.phaseCardTitle}>{phase.title}</Text>
                      <Text style={styles.sub}>
                        {t('timeline.daysRange', { start: phase.startDay, end: phase.endDay })}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: accentColor, fontSize: 12, fontWeight: '700' }}>
                        {phaseDoneCount}/{phaseTotal}
                      </Text>
                      <Text style={{ color: '#64748b', fontSize: 14 }}>{isOpen ? '▲' : '▼'}</Text>
                    </View>
                  </TouchableOpacity>

                  {isOpen && (
                    <View style={{ marginTop: 12 }}>
                      {/* Days Grid Chips */}
                      <View style={styles.daysGrid}>
                        {phase.days.map((d) => {
                          const isCurrent = d.day === activeRoadmap.currentDay;
                          const isDone = activeRoadmap.doneDays.includes(d.day);

                          return (
                            <TouchableOpacity
                              key={d.day}
                              onPress={() => jumpToDay(d.day)}
                              style={[
                                styles.dayGridCell,
                                isDone && { backgroundColor: `${accentColor}30`, borderColor: accentColor },
                                isCurrent && { backgroundColor: accentColor, borderColor: '#fff', borderWidth: 2 }
                              ]}
                            >
                              <Text
                                style={{
                                  color: isCurrent ? '#fff' : isDone ? accentColor : '#cbd5e1',
                                  fontSize: 12,
                                  fontWeight: '700'
                                }}
                              >
                                {d.day}
                              </Text>
                              {isDone && (
                                <Text style={{ color: isCurrent ? '#fff' : accentColor, fontSize: 8 }}>✓</Text>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {/* Topics List for this Phase */}
                      <View style={{ marginTop: 14, borderTopColor: '#1e293b', borderTopWidth: 1, paddingTop: 10 }}>
                        {phase.days.map((d) => {
                          const isCurrent = d.day === activeRoadmap.currentDay;
                          const isDone = activeRoadmap.doneDays.includes(d.day);

                          return (
                            <TouchableOpacity
                              key={d.day}
                              onPress={() => {
                                jumpToDay(d.day);
                                setActiveTab('today');
                              }}
                              style={[
                                styles.dayTopicRow,
                                isCurrent && { backgroundColor: `${accentColor}20` }
                              ]}
                            >
                              <View
                                style={[
                                  styles.dayNumberCircle,
                                  isDone && { backgroundColor: accentColor }
                                ]}
                              >
                                <Text
                                  style={{
                                    color: isDone ? '#fff' : '#94a3b8',
                                    fontSize: 10,
                                    fontWeight: 'bold'
                                  }}
                                >
                                  {d.day}
                                </Text>
                              </View>
                              <Text
                                style={[
                                  styles.dayTopicText,
                                  isDone && { color: '#94a3b8', textDecorationLine: 'line-through' }
                                ]}
                                numberOfLines={2}
                              >
                                {d.topic}
                              </Text>
                              <TouchableOpacity
                                onPress={() => openEditDayModal(d.day)}
                                style={{ padding: 4 }}
                              >
                                <Text style={{ color: '#64748b', fontSize: 12 }}>✎</Text>
                              </TouchableOpacity>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* TAB 4: SETTINGS & TOOLS */}
        {activeTab === 'settings' && (
          <View>
            <Text style={styles.h1}>{t('settings.title')}</Text>
            <Text style={[styles.sub, { marginBottom: 14 }]}>
              {t('settings.sub')}
            </Text>

            <View style={isWide ? styles.webColumns : null}>
            <View style={isWide ? styles.webCol : null}>
            {/* Language Card */}
            <View style={[styles.card, { borderColor: '#38bdf866', borderWidth: 1.5 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 24 }}>🌐</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{t('settings.languageTitle')}</Text>
                  <Text style={[styles.sub, { marginTop: 2 }]}>{t('settings.languageSub')}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                {LANGUAGES.map((l) => (
                  <TouchableOpacity
                    key={l.code}
                    style={[styles.choiceChip, { flex: 1, paddingVertical: 10 }, lang === l.code && { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' }]}
                    onPress={() => handleChangeLanguage(l.code)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: lang === l.code }}
                  >
                    <Text style={{ color: lang === l.code ? '#fff' : '#cbd5e1', textAlign: 'center', fontWeight: '700' }}>
                      {lang === l.code ? '✓ ' : ''}{l.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* AI Engine Integration Card */}
            <View style={[styles.card, { borderColor: appData.aiConfig?.apiKey ? '#10b98166' : '#8b5cf666', borderWidth: 1.5 }]}>
              <View style={styles.rowBetween}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <Text style={{ fontSize: 26 }}>🤖</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{t('settings.aiTitle')}</Text>
                    <Text style={{ color: appData.aiConfig?.apiKey ? '#34d399' : '#a78bfa', fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                      {appData.aiConfig?.apiKey
                        ? t('settings.aiConnected', { model: normalizeModel(appData.aiConfig?.provider, appData.aiConfig?.model) })
                        : t('settings.aiNoKey')}
                    </Text>
                  </View>
                </View>
              </View>

              <Text style={[styles.sub, { marginTop: 8, lineHeight: 18 }]}>
                {t('settings.aiDesc')}
              </Text>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <TouchableOpacity
                  style={[styles.btnPrimary, { flex: 1, backgroundColor: '#8b5cf6' }]}
                  onPress={openAISettings}
                >
                  <Text style={styles.btnPrimaryText}>⚙️ {t('settings.aiConfigure')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btnPrimary, { backgroundColor: '#1e293b', borderColor: '#475569', borderWidth: 1 }]}
                  onPress={() => setAiPaymentGuideModal(true)}
                >
                  <Text style={[styles.btnPrimaryText, { color: '#cbd5e1' }]}>💳 {t('settings.aiGuide')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Study Alarm Card */}
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <Text style={{ fontSize: 20 }}>⏰</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{t('alarm.title')}</Text>
                    <Text style={styles.sub}>
                      {reminderEnabled ? t('alarm.setFor', { time: reminderTimeDraft }) : t('alarm.disabled')}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.btnSmall, { backgroundColor: accentColor }]}
                  onPress={() => setReminderModal(true)}
                >
                  <Text style={styles.btnSmallText}>{t('common.change')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Stats Overview Card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>📊 {t('stats.title')}</Text>
              <View style={[styles.rowBetween, { marginTop: 12 }]}>
                <View style={styles.statBox}>
                  <Text style={styles.statNumber}>🔥 {appData.streak ? appData.streak.count || 0 : 0}</Text>
                  <Text style={styles.statLabel}>{t('stats.streak')}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statNumber}>🗺️ {appData.roadmaps.length}</Text>
                  <Text style={styles.statLabel}>{t('stats.roadmaps')}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statNumber}>
                    ✅ {appData.roadmaps.reduce((acc, r) => acc + (r.doneDays ? r.doneDays.length : 0), 0)}
                  </Text>
                  <Text style={styles.statLabel}>{t('stats.days')}</Text>
                </View>
              </View>
            </View>

            </View>
            <View style={isWide ? styles.webCol : null}>
            {/* Offline & Account Info Card */}
            <View style={[styles.card, { borderColor: '#10b98133' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 20 }}>⚡</Text>
                <Text style={[styles.cardTitle, { color: '#34d399' }]}>{t('settings.offlineTitle')}</Text>
              </View>
              <Text style={[styles.sub, { marginTop: 6, lineHeight: 18 }]}>
                {t('settings.offlineBody')}
              </Text>
            </View>

            {/* Cloud Sync Card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>☁️ {t('sync.title')}</Text>
              <Text style={[styles.sub, { marginVertical: 6 }]}>
                {t('sync.body')}
              </Text>
              <TextInput
                style={styles.input}
                value={syncUrlDraft}
                onChangeText={setSyncUrlDraft}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="https://script.google.com/macros/s/.../exec"
                placeholderTextColor="#64748b"
              />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TouchableOpacity
                  style={[styles.btnPrimary, { flex: 1, backgroundColor: accentColor }]}
                  onPress={() => {
                    setAppData((prev) => ({ ...prev, syncUrl: syncUrlDraft.trim() }));
                    syncWithCloud(syncUrlDraft.trim(), activeRoadmap, currentDay);
                    Alert.alert(t('sync.savedTitle'), t('sync.savedBody'));
                  }}
                >
                  <Text style={styles.btnPrimaryText}>{t('sync.save')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Backup & Restore */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>💾 {t('backup.title')}</Text>
              <Text style={[styles.sub, { marginVertical: 6 }]}>
                {t('backup.body')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                <TouchableOpacity
                  style={[styles.btnPrimary, styles.btnGray, { flex: 1 }]}
                  onPress={handleExportData}
                >
                  <Text style={styles.btnPrimaryText}>📋 {t('backup.export')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnPrimary, styles.btnGray, { flex: 1 }]}
                  onPress={() => {
                    setBackupText('');
                    setBackupModal(true);
                  }}
                >
                  <Text style={styles.btnPrimaryText}>📥 {t('backup.import')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Reset Actions */}
            <View style={[styles.card, { borderColor: '#ef444433' }]}>
              <Text style={[styles.cardTitle, { color: '#f87171' }]}>⚠️ {t('reset.zoneTitle')}</Text>
              <Text style={[styles.sub, { marginVertical: 6 }]}>
                {t('reset.zoneBody')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                <TouchableOpacity
                  style={[styles.btnPrimary, { flex: 1, backgroundColor: '#334155' }]}
                  onPress={resetCurrentRoadmapProgress}
                >
                  <Text style={[styles.btnPrimaryText, { color: '#fca5a5' }]}>{t('reset.roadmapBtn')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnPrimary, { backgroundColor: '#7f1d1d', paddingHorizontal: 12 }]}
                  onPress={factoryResetAll}
                >
                  <Text style={styles.btnPrimaryText}>{t('reset.allBtn')}</Text>
                </TouchableOpacity>
              </View>
            </View>
            </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ================= MODERN BOTTOM NAVIGATION (IPHONE HOME BAR SAFE) ================= */}
      {!isWide && (
      <View style={styles.bottomNav}>
        {[
          { id: 'today', icon: '⚡', label: t('tab.focus') },
          { id: 'roadmaps', icon: '🗺️', label: t('tab.roadmaps') },
          { id: 'timeline', icon: '📅', label: t('tab.timeline') },
          { id: 'settings', icon: '⚙️', label: t('tab.settings') }
        ].map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.navTab, activeTab === tab.id && styles.navTabActive]}
            onPress={() => {
              if (tab.id === 'settings') setSyncUrlDraft(appData.syncUrl || '');
              setActiveTab(tab.id);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab.id }}
          >
            <Text style={{ fontSize: 20 }}>{tab.icon}</Text>
            <Text style={[styles.navLabel, activeTab === tab.id && { color: accentColor }]}>{tab.label}</Text>
            {activeTab === tab.id && <View style={[styles.activeDot, { backgroundColor: accentColor }]} />}
          </TouchableOpacity>
        ))}
      </View>
      )}
    </KeyboardAvoidingView>
  );

  // ================= FULL PAGE: COURSE LESSON =================
  const renderLessonScreen = () => (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {renderScreenHeader(t('lesson.kicker', { day: currentDay }), accentColor, currentDayInfo.topic)}

      {/* Toolbar: generate + copy + export (uploading lives in Generation options) */}
      <View style={styles.screenToolbar}>
        <TouchableOpacity
          style={[styles.toolbarBtn, { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6', flexGrow: 1 }]}
          onPress={handleGenerateAILesson}
          disabled={aiLessonLoading}
          testID="lesson-generate"
        >
          {aiLessonLoading ? <ActivityIndicator size="small" color="#fff" /> : (
            <Text style={styles.toolbarBtnText}>🤖 {currentDayLesson ? t('lesson.regenerate') : t('lesson.generate')}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toolbarBtn, !currentDayLesson && styles.btnDisabled]}
          onPress={handleCopyLesson}
          disabled={!currentDayLesson}
          testID="lesson-copy"
        >
          <Text style={styles.toolbarBtnText}>📋 {t('common.copy')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toolbarBtn, !currentDayLesson && styles.btnDisabled]}
          onPress={handleExportLessonDocx}
          disabled={!currentDayLesson}
          testID="lesson-export"
        >
          <Text style={styles.toolbarBtnText}>📄 {t('export.docx')}</Text>
        </TouchableOpacity>
        {currentDayLesson && (
          <TouchableOpacity
            style={styles.toolbarBtn}
            onPress={() => {
              appendToNote(`\n\n${t('lesson.summaryHeader', { day: currentDay })}\n` + currentDayLesson.content.slice(0, 600) + '…');
              Alert.alert(t('notes.appendedTitle'), t('notes.appendedBody'));
            }}
          >
            <Text style={styles.toolbarBtnText}>📝 {t('lesson.addToNotes')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.screenScroll} contentContainerStyle={[styles.screenScrollContent, isWide && styles.webScreenContent]} keyboardShouldPersistTaps="handled">
        {/* Generation options: custom instructions, language, reference documents */}
        <View style={styles.optionsPanel}>
          <TouchableOpacity style={styles.rowBetween} onPress={() => setShowLessonOptions(!showLessonOptions)}>
            <Text style={[styles.cardTitle, { fontSize: 13 }]}>⚙️ {t('gen.optionsTitle')}</Text>
            <Text style={{ color: '#64748b', fontSize: 12 }}>{showLessonOptions ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {!showLessonOptions ? (
            <Text style={{ color: '#64748b', fontSize: 11, marginTop: 4 }} numberOfLines={1}>
              {t('gen.optionsSummary', {
                lang: langName(resolveContentLang(lessonLang)),
                instructions: lessonInstructions.trim() ? t('gen.instructionsSet') : t('gen.instructionsNone'),
                docs: (currentDayRefDoc ? 1 : 0) + (globalRefDoc ? 1 : 0)
              })}
            </Text>
          ) : (
            <View>
              <Text style={styles.inputLabel}>{t('gen.instructionsLabel')}</Text>
              <TextInput
                style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                multiline
                value={lessonInstructions}
                onChangeText={setLessonInstructions}
                placeholder={t('gen.instructionsPlaceholder')}
                placeholderTextColor="#64748b"
                testID="lesson-instructions"
              />
              <Text style={styles.inputLabel}>{t('gen.languageLabel')}</Text>
              {renderLanguagePicker(lessonLang, setLessonLang)}
              {renderReferenceStatus()}
              <Text style={{ color: '#64748b', fontSize: 10, marginTop: 8 }}>
                {t('gen.contextNote', { phase: currentDayInfo.phaseTitle || '-', day: currentDay })}
              </Text>
            </View>
          )}
        </View>

        {/* Lesson Body */}
        {aiLessonLoading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#8b5cf6" />
            <Text style={{ color: '#cbd5e1', fontSize: 14, fontWeight: '700', marginTop: 12, textAlign: 'center' }}>
              {t('lesson.loading', { day: currentDay })}
            </Text>
            <Text style={{ color: '#64748b', fontSize: 12, marginTop: 4, textAlign: 'center', paddingHorizontal: 20 }}>
              {t('lesson.loadingSub', { topic: currentDayInfo.topic })}
            </Text>
          </View>
        ) : currentDayLesson ? (
          <View>
            <View style={styles.lessonMetaBadge}>
              <Text style={{ color: '#38bdf8', fontSize: 11, fontWeight: '700', flex: 1 }}>
                {currentDayLesson.type === 'custom'
                  ? t('lesson.badgeCustom')
                  : currentDayLesson.type === 'demo'
                  ? t('lesson.badgeDemo')
                  : t('lesson.badgeAi')}
                {currentDayLesson.language ? ` · ${langName(currentDayLesson.language)}` : ''}
              </Text>
              <Text style={{ color: '#64748b', fontSize: 10 }}>
                {currentDayLesson.generatedAt ? new Date(currentDayLesson.generatedAt).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US') : ''}
              </Text>
            </View>
            {currentDayLesson.topic && currentDayLesson.topic !== currentDayInfo.topic ? (
              <View style={[styles.infoBox, { borderColor: '#f59e0b66', marginBottom: 10, marginTop: 0 }]}>
                <Text style={{ color: '#fbbf24', fontSize: 11 }}>
                  ⚠️ {t('lesson.topicChanged', { topic: currentDayLesson.topic })}
                </Text>
              </View>
            ) : null}
            <View style={styles.lessonTextContainer}>
              <MarkdownView content={currentDayLesson.content} accentColor={accentColor} />
            </View>
            <Text style={{ color: '#475569', fontSize: 10, marginTop: 8, textAlign: 'right' }}>
              {t('lesson.length', { count: currentDayLesson.content.length.toLocaleString() })}
            </Text>
          </View>
        ) : (
          <View style={{ paddingVertical: 36, alignItems: 'center', backgroundColor: '#090f1d', borderRadius: 10, borderWidth: 1, borderColor: '#1e293b' }}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>📖</Text>
            <Text style={{ color: '#f8fafc', fontSize: 15, fontWeight: '700', textAlign: 'center' }}>
              {t('lesson.emptyTitle', { day: currentDay })}
            </Text>
            <Text style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', marginHorizontal: 20, marginTop: 6, lineHeight: 18 }}>
              {t('lesson.emptyBody')}
            </Text>
            <TouchableOpacity
              style={[styles.btnSmall, { backgroundColor: '#334155', marginTop: 12 }]}
              onPress={() => openUploadModal('lesson')}
            >
              <Text style={styles.btnSmallText}>✏️ {t('lesson.writeOwn')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );

  // ================= FULL PAGE: PRACTICE, LAB & QUIZ =================
  const renderPracticeScreen = () => {
    const quiz = currentDayQuiz;
    const lab = quiz && quiz.lab;
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {renderScreenHeader(t('practice.kicker', { day: currentDay }), '#a78bfa', currentDayInfo.topic)}

        <View style={styles.screenToolbar}>
          <TouchableOpacity
            style={[styles.toolbarBtn, { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6', flexGrow: 1 }]}
            onPress={handleGenerateAIPractice}
            disabled={aiPracticeLoading}
            testID="practice-generate"
          >
            {aiPracticeLoading ? <ActivityIndicator size="small" color="#fff" /> : (
              <Text style={styles.toolbarBtnText}>⚡ {quiz ? t('practice.regenerate') : t('practice.generate')}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolbarBtn, !quiz && styles.btnDisabled]}
            onPress={() => doCopy(practiceMarkdown())}
            disabled={!quiz}
          >
            <Text style={styles.toolbarBtnText}>📋 {t('common.copy')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolbarBtn, !quiz && styles.btnDisabled]}
            onPress={() => runDocxExport({
              markdown: practiceMarkdown(),
              baseName: `Day ${currentDay} practice ${currentDayInfo.topic}`,
              fallback: `Day-${currentDay}-practice`
            })}
            disabled={!quiz}
          >
            <Text style={styles.toolbarBtnText}>📄 {t('export.docx')}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.screenScroll} contentContainerStyle={[styles.screenScrollContent, isWide && styles.webScreenContent]} keyboardShouldPersistTaps="handled">
          <View style={styles.optionsPanel}>
            <TouchableOpacity style={styles.rowBetween} onPress={() => setShowPracticeOptions(!showPracticeOptions)}>
              <Text style={[styles.cardTitle, { fontSize: 13 }]}>⚙️ {t('gen.optionsTitle')}</Text>
              <Text style={{ color: '#64748b', fontSize: 12 }}>{showPracticeOptions ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {!showPracticeOptions ? (
              <Text style={{ color: '#64748b', fontSize: 11, marginTop: 4 }} numberOfLines={1}>
                {t('gen.optionsSummary', {
                  lang: langName(resolveContentLang(practiceLang)),
                  instructions: practiceInstructions.trim() ? t('gen.instructionsSet') : t('gen.instructionsNone'),
                  docs: (currentDayRefDoc ? 1 : 0) + (globalRefDoc ? 1 : 0)
                })}
              </Text>
            ) : (
              <View>
                <Text style={styles.inputLabel}>{t('gen.instructionsLabel')}</Text>
                <TextInput
                  style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                  multiline
                  value={practiceInstructions}
                  onChangeText={setPracticeInstructions}
                  placeholder={t('gen.practicePlaceholder')}
                  placeholderTextColor="#64748b"
                />
                <Text style={styles.inputLabel}>{t('gen.languageLabel')}</Text>
                {renderLanguagePicker(practiceLang, setPracticeLang)}
                {renderReferenceStatus()}
                <Text style={{ color: '#64748b', fontSize: 10, marginTop: 8 }}>
                  {currentDayLesson ? t('gen.usesLesson') : t('gen.noLessonYet')}
                </Text>
              </View>
            )}
          </View>

          {aiPracticeLoading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#8b5cf6" />
              <Text style={{ color: '#cbd5e1', fontSize: 14, fontWeight: '700', marginTop: 12 }}>
                {t('practice.loading')}
              </Text>
              <Text style={{ color: '#64748b', fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                {t('practice.loadingSub', { topic: currentDayInfo.topic })}
              </Text>
            </View>
          ) : quiz ? (
            <View>
              {quiz.isDemo ? (
                <View style={[styles.infoBox, { marginTop: 0, marginBottom: 10 }]}>
                  <Text style={{ color: '#94a3b8', fontSize: 11 }}>{t('practice.demoNote')}</Text>
                </View>
              ) : null}

              {/* 1. Lab Exercise */}
              {lab && (
                <View style={styles.quizSectionCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Text style={{ fontSize: 18 }}>🧪</Text>
                    <Text style={[styles.cardTitle, { color: '#38bdf8', flex: 1 }]}>
                      {lab.title || t('practice.lab')}
                    </Text>
                  </View>
                  {lab.scenario ? (
                    <Text style={[styles.sub, { marginBottom: 8, color: '#e2e8f0', lineHeight: 18 }]} selectable>
                      {lab.scenario}
                    </Text>
                  ) : null}

                  {lab.objectives.length > 0 && (
                    <View style={{ backgroundColor: '#090f1d', borderRadius: 6, padding: 8, marginBottom: 8 }}>
                      <Text style={{ color: '#a5b4fc', fontSize: 11, fontWeight: '700', marginBottom: 4 }}>🎯 {t('practice.objectives')}</Text>
                      {lab.objectives.map((o, i) => (
                        <Text key={i} style={{ color: '#cbd5e1', fontSize: 12, marginVertical: 1 }} selectable>• {o}</Text>
                      ))}
                    </View>
                  )}

                  {lab.environment ? (
                    <View style={{ backgroundColor: '#090f1d', borderRadius: 6, padding: 8, marginBottom: 8 }}>
                      <Text style={{ color: '#fbbf24', fontSize: 11, fontWeight: '700' }}>
                        🛠 {t('practice.environment')}
                      </Text>
                      <Text style={{ color: '#cbd5e1', fontSize: 12, marginTop: 2 }} selectable>
                        {lab.environment}
                      </Text>
                    </View>
                  ) : null}

                  {lab.diagram ? (
                    <View style={{ backgroundColor: '#030712', borderRadius: 6, marginBottom: 8, borderWidth: 1, borderColor: '#1e293b' }}>
                      <Text style={{ color: '#38bdf8', fontSize: 11, fontWeight: '700', marginBottom: 4, padding: 8, paddingBottom: 0 }}>
                        🗺 {t('practice.diagram')}
                      </Text>
                      <ScrollView horizontal contentContainerStyle={{ padding: 8 }}>
                        <Text style={{ color: '#93c5fd', fontSize: 11, fontFamily: MONO, lineHeight: 15 }} selectable>
                          {lab.diagram}
                        </Text>
                      </ScrollView>
                    </View>
                  ) : null}

                  {lab.table ? (
                    <View style={{ backgroundColor: '#090f1d', borderRadius: 6, padding: 8, marginBottom: 8 }}>
                      <Text style={{ color: '#34d399', fontSize: 11, fontWeight: '700', marginBottom: 4 }}>
                        📋 {t('practice.table')}
                      </Text>
                      <ScrollView horizontal>
                        <View>
                          {[lab.table.columns, ...lab.table.rows].map((row, rIdx) => (
                            <View key={rIdx} style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1e293b' }}>
                              {lab.table.columns.map((_, cIdx) => (
                                <Text
                                  key={cIdx}
                                  style={{ width: 130, padding: 5, color: rIdx === 0 ? '#fff' : '#cbd5e1', fontSize: 11, fontWeight: rIdx === 0 ? '800' : '400' }}
                                  selectable
                                >
                                  {row[cIdx] || ''}
                                </Text>
                              ))}
                            </View>
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  ) : null}

                  {lab.exercises.length > 0 ? (
                    <View style={{ marginVertical: 6 }}>
                      <Text style={{ color: '#a78bfa', fontSize: 12, fontWeight: '800', marginBottom: 6 }}>
                        🎯 {t('practice.exercises')}
                      </Text>
                      {lab.exercises.map((ex, exIdx) => (
                        <View key={exIdx} style={{ backgroundColor: '#090f1d', borderRadius: 8, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: '#1e293b' }}>
                          <Text style={{ color: '#f8fafc', fontSize: 12, fontWeight: '700' }} selectable>
                            {ex.title || `${t('practice.exercise')} ${exIdx + 1}`}
                          </Text>
                          {ex.instructions ? (
                            <Text style={{ color: '#cbd5e1', fontSize: 12, marginTop: 4, lineHeight: 18 }} selectable>{ex.instructions}</Text>
                          ) : null}
                          {ex.commands ? (
                            <ScrollView horizontal style={{ backgroundColor: '#030712', borderRadius: 4, marginVertical: 4 }} contentContainerStyle={{ padding: 6 }}>
                              <Text style={{ color: '#4ade80', fontSize: 11, fontFamily: MONO }} selectable>
                                {ex.commands}
                              </Text>
                            </ScrollView>
                          ) : null}
                          {ex.verification ? (
                            <Text style={{ color: '#38bdf8', fontSize: 11, marginTop: 2 }} selectable>
                              ✓ {t('practice.verification')}: {ex.verification}
                            </Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  ) : lab.steps.length > 0 && (
                    <View style={{ backgroundColor: '#090f1d', borderRadius: 8, padding: 10, marginVertical: 6 }}>
                      <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: '700', marginBottom: 4 }}>
                        {t('practice.steps')}
                      </Text>
                      {lab.steps.map((st, sIdx) => (
                        <Text key={sIdx} style={{ color: '#cbd5e1', fontSize: 12, marginVertical: 2 }} selectable>
                          • {st}
                        </Text>
                      ))}
                    </View>
                  )}

                  {lab.troubleshooting && (
                    <View style={{ backgroundColor: '#1c1917', borderColor: '#f59e0b', borderWidth: 1, borderRadius: 8, padding: 8, marginVertical: 6 }}>
                      <Text style={{ color: '#fbbf24', fontSize: 11, fontWeight: '800', marginBottom: 4 }}>
                        ⚠️ {t('practice.troubleshooting')}
                      </Text>
                      {lab.troubleshooting.problem ? (
                        <Text style={{ color: '#f87171', fontSize: 12, fontWeight: '700' }} selectable>
                          {t('practice.problem')}: {lab.troubleshooting.problem}
                        </Text>
                      ) : null}
                      {lab.troubleshooting.diagnosis ? (
                        <View style={{ backgroundColor: '#090f1d', borderRadius: 4, padding: 6, marginVertical: 4 }}>
                          <Text style={{ color: '#94a3b8', fontSize: 10, fontWeight: '700' }}>{t('practice.diagnosis')}:</Text>
                          <Text style={{ color: '#38bdf8', fontSize: 11, fontFamily: MONO }} selectable>
                            {lab.troubleshooting.diagnosis}
                          </Text>
                        </View>
                      ) : null}
                      {lab.troubleshooting.solution ? (
                        <Text style={{ color: '#34d399', fontSize: 12, marginTop: 2 }} selectable>
                          {t('practice.solution')}: {lab.troubleshooting.solution}
                        </Text>
                      ) : null}
                    </View>
                  )}

                  {lab.checklist.length > 0 && (
                    <View style={{ backgroundColor: '#090f1d', borderRadius: 6, padding: 8, marginVertical: 4 }}>
                      <Text style={{ color: '#a5b4fc', fontSize: 11, fontWeight: '700', marginBottom: 4 }}>
                        ✅ {t('practice.checklist')}
                      </Text>
                      {lab.checklist.map((chk, cIdx) => (
                        <Text key={cIdx} style={{ color: '#cbd5e1', fontSize: 12, marginVertical: 1 }} selectable>
                          ☐ {chk}
                        </Text>
                      ))}
                    </View>
                  )}

                  {lab.verification ? (
                    <Text style={{ color: '#34d399', fontSize: 12, marginTop: 4 }} selectable>
                      ✓ {t('practice.finalVerification')}: {lab.verification}
                    </Text>
                  ) : null}
                </View>
              )}

              {/* 2. Interactive Quiz Questions */}
              {quiz.quiz.length > 0 && (
                <View style={styles.quizSectionCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Text style={{ fontSize: 18 }}>🧩</Text>
                    <Text style={[styles.cardTitle, { color: '#c084fc', flex: 1 }]}>
                      {t('practice.quizTitle', { n: quiz.quiz.length })}
                    </Text>
                  </View>

                  {quiz.quiz.map((q, qIdx) => {
                    const answered = quizAnswers[qIdx] !== undefined;
                    const selectedOpt = quizAnswers[qIdx];
                    const isCorrect = selectedOpt === q.answerIndex;

                    return (
                      <View key={qIdx} style={styles.quizQuestionBox}>
                        <Text style={styles.quizQuestionText} selectable>
                          Q{qIdx + 1}. {q.question}
                        </Text>

                        {q.options.map((opt, optIdx) => {
                          let optStyle = styles.quizOptionBtn;
                          let textStyle = { color: '#cbd5e1', fontSize: 12 };

                          if (answered) {
                            if (optIdx === q.answerIndex) {
                              optStyle = [styles.quizOptionBtn, styles.quizOptCorrect];
                              textStyle = { color: '#34d399', fontWeight: '700', fontSize: 12 };
                            } else if (optIdx === selectedOpt && !isCorrect) {
                              optStyle = [styles.quizOptionBtn, styles.quizOptWrong];
                              textStyle = { color: '#f87171', fontWeight: '700', fontSize: 12 };
                            }
                          }

                          return (
                            <TouchableOpacity
                              key={optIdx}
                              style={optStyle}
                              onPress={() => handleSelectQuizOption(qIdx, optIdx)}
                              activeOpacity={0.7}
                            >
                              <Text style={textStyle}>
                                {optionLetter(optIdx)}. {opt}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}

                        {answered && (
                          <View style={[styles.quizExplanationBox, isCorrect ? { borderColor: '#10b98166' } : { borderColor: '#f59e0b66' }]}>
                            <Text style={{ color: isCorrect ? '#34d399' : '#fbbf24', fontSize: 11, fontWeight: '700' }}>
                              {isCorrect ? t('practice.correct') : t('practice.explanation', { letter: optionLetter(q.answerIndex) })}
                            </Text>
                            <Text style={{ color: '#cbd5e1', fontSize: 12, marginTop: 2 }} selectable>
                              {q.explanation}
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              {/* 3. Actionable Tasks + Import to Routine Timer */}
              {quiz.tasks.length > 0 && (
                <View style={styles.quizSectionCard}>
                  <View style={styles.rowBetween}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <Text style={{ fontSize: 18 }}>⏱</Text>
                      <Text style={[styles.cardTitle, { color: '#fbbf24' }]}>{t('practice.tasks')}</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.btnSmall, { backgroundColor: '#10b981' }]}
                      onPress={() => handleImportPracticeTasks(quiz.tasks)}
                    >
                      <Text style={styles.btnSmallText}>➕ {t('practice.importTasks')}</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.sub, { marginTop: 4, marginBottom: 8 }]}>
                    {t('practice.importHint')}
                  </Text>

                  {quiz.tasks.map((tsk, tIdx) => (
                    <View key={tIdx} style={styles.practiceTaskRow}>
                      <Text style={{ color: '#fff', fontSize: 12, flex: 1 }}>{tsk.title}</Text>
                      <View style={[styles.badgePill, { paddingVertical: 2, paddingHorizontal: 6 }]}>
                        <Text style={{ color: '#fbbf24', fontSize: 10, fontWeight: '700' }}>{tsk.dur || '25 mins'}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {quiz.nextDayConnection ? (
                <View style={styles.quizSectionCard}>
                  <Text style={[styles.cardTitle, { color: '#38bdf8', marginBottom: 4 }]}>➡️ {t('practice.nextDay')}</Text>
                  <Text style={{ color: '#cbd5e1', fontSize: 12, lineHeight: 18 }} selectable>{quiz.nextDayConnection}</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={{ paddingVertical: 36, alignItems: 'center', backgroundColor: '#090f1d', borderRadius: 10, borderWidth: 1, borderColor: '#1e293b' }}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>⚡</Text>
              <Text style={{ color: '#f8fafc', fontSize: 15, fontWeight: '700' }}>
                {t('practice.emptyTitle')}
              </Text>
              <Text style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', marginHorizontal: 20, marginTop: 6, lineHeight: 18 }}>
                {t('practice.emptyBody')}
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  // ================= FULL PAGE: JOURNEY NOTES EDITOR =================
  const canUndoClear = lastClearedNote && lastClearedNote.roadmapId === activeRoadmap.id && lastClearedNote.day === currentDay;
  const renderNotesScreen = () => (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.fullNoteHeader}>
        <TouchableOpacity style={[styles.screenBackBtn, { marginRight: 8 }]} onPress={closeScreen}>
          <Text style={styles.screenBackText}>✓ {t('common.done')}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={{ color: accentColor, fontSize: 11, fontWeight: '800' }}>
            {t('notes.kicker', { day: currentDay })}
          </Text>
          <Text style={[styles.h1, { fontSize: 15, marginTop: 2 }]} numberOfLines={1}>
            {currentDayInfo.topic}
          </Text>
        </View>
      </View>

      <View style={[styles.screenToolbar, { alignItems: 'center' }]}>
        <TouchableOpacity style={styles.toolbarBtn} onPress={handleCopyAllNotes} testID="notes-copy-all">
          <Text style={styles.toolbarBtnText}>📋 {t('notes.copyAll')}</Text>
        </TouchableOpacity>
        {currentDayLesson && (
          <TouchableOpacity
            style={styles.toolbarBtn}
            onPress={() => {
              appendToNote(`\n\n${t('lesson.summaryHeader', { day: currentDay })}\n` + currentDayLesson.content.slice(0, 600) + '…');
              Alert.alert(t('notes.appendedTitle'), t('notes.appendedBody'));
            }}
          >
            <Text style={[styles.toolbarBtnText, { color: '#38bdf8' }]}>+ {t('notes.insertSummary')}</Text>
          </TouchableOpacity>
        )}
        {canUndoClear ? (
          <TouchableOpacity style={[styles.toolbarBtn, { borderColor: '#f59e0b' }]} onPress={handleUndoClear}>
            <Text style={[styles.toolbarBtnText, { color: '#fbbf24' }]}>↩ {t('notes.undoClear')}</Text>
          </TouchableOpacity>
        ) : currentDayNote.length > 0 ? (
          <TouchableOpacity style={styles.toolbarBtn} onPress={handleClearNote}>
            <Text style={[styles.toolbarBtnText, { color: '#f87171' }]}>🗑 {t('notes.clear')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <NotesEditor
        key={`${activeRoadmap.id}:${currentDay}`}
        ref={notesEditorRef}
        style={styles.fullPageTextInput}
        value={currentDayNote}
        onCommit={handleNoteChange}
        counterLabel={(len) => t('notes.counter', { count: len.toLocaleString() })}
        counterStyle={{ color: '#94a3b8', fontSize: 11 }}
        counterContainerStyle={styles.fullNoteSubBar}
        placeholder={t('notes.placeholder')}
        placeholderTextColor="#475569"
        autoFocus={false}
        testID="notes-editor"
      />
    </KeyboardAvoidingView>
  );

  const editingRoadmap = editingRoadmapId ? appData.roadmaps.find((r) => r.id === editingRoadmapId) : null;

  return (
    <View style={[styles.root, isWide && styles.webRoot]}>
      <StatusBar style="light" />

      {isWide && renderSidebar()}
      <View style={isWide ? styles.webMain : { flex: 1 }}>
        {screen === 'lesson'
          ? renderLessonScreen()
          : screen === 'practice'
          ? renderPracticeScreen()
          : screen === 'notes'
          ? renderNotesScreen()
          : renderMain()}
      </View>

      {/* ================= MODAL: STUDY ALARM & NOTIFICATION PICKER ================= */}
      <Modal visible={reminderModal} transparent animationType="slide" onRequestClose={() => setReminderModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.rowBetween}>
                <Text style={styles.h1}>⏰ {t('alarm.title')}</Text>
                <TouchableOpacity onPress={() => setReminderModal(false)}>
                  <Text style={{ color: '#94a3b8', fontSize: 18 }}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.sub, { marginVertical: 8 }]}>
                {t('alarm.modalSub')}
              </Text>

              {/* Toggle Enable/Disable */}
              <View style={[styles.rowBetween, { backgroundColor: '#090f1d', padding: 12, borderRadius: 10, marginVertical: 8 }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{t('alarm.enable')}</Text>
                <TouchableOpacity
                  style={[
                    styles.choiceChip,
                    reminderEnabled ? { backgroundColor: '#10b981' } : { backgroundColor: '#334155' }
                  ]}
                  onPress={() => setReminderEnabled(!reminderEnabled)}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>{reminderEnabled ? t('common.on') : t('common.off')}</Text>
                </TouchableOpacity>
              </View>

              {/* Quick Preset Hours */}
              <Text style={styles.inputLabel}>{t('alarm.quickSelect')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {['07:00', '09:00', '12:00', '18:00', '20:00', '21:30', '22:00'].map((time) => (
                  <TouchableOpacity
                    key={time}
                    style={[
                      styles.choiceChip,
                      reminderTimeDraft === time && { backgroundColor: accentColor, borderColor: accentColor }
                    ]}
                    onPress={() => setReminderTimeDraft(time)}
                  >
                    <Text style={{ color: reminderTimeDraft === time ? '#fff' : '#cbd5e1', fontSize: 12 }}>
                      {time}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Custom Time Input */}
              <Text style={styles.inputLabel}>{t('alarm.customTime')}</Text>
              <TextInput
                style={styles.input}
                value={reminderTimeDraft}
                onChangeText={setReminderTimeDraft}
                placeholder="20:30"
                placeholderTextColor="#64748b"
              />

              {/* Test Push Notification */}
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: '#2563eb', marginTop: 12, marginBottom: 4 }]}
                onPress={() => {
                  try { Vibration.vibrate([0, 500, 200, 500]); } catch (e) {}
                  sendTestAlarmNotification(reminderTimeDraft);
                  setStudyAlertVisible(true);
                  setReminderModal(false);
                  Alert.alert(
                    t('alarm.testSentTitle'),
                    t('alarm.testSentBody', { time: reminderTimeDraft }),
                    [
                      { text: t('alarm.startNow'), onPress: () => setIsTimerRunning(true) },
                      { text: t('common.gotIt'), style: 'cancel' }
                    ]
                  );
                }}
              >
                <Text style={styles.btnPrimaryText}>🔔 {t('alarm.test')}</Text>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <TouchableOpacity
                  style={[styles.btnPrimary, styles.btnGray]}
                  onPress={() => setReminderModal(false)}
                >
                  <Text style={styles.btnPrimaryText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnPrimary, { backgroundColor: accentColor }]}
                  onPress={handleSaveReminder}
                >
                  <Text style={styles.btnPrimaryText}>{t('alarm.save')}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: CREATE CUSTOM ROADMAP ================= */}
      <Modal visible={createRoadmapModal} transparent animationType="slide" onRequestClose={() => setCreateRoadmapModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.rowBetween}>
                <Text style={styles.h1}>{t('create.title')}</Text>
                <TouchableOpacity onPress={() => setCreateRoadmapModal(false)}>
                  <Text style={{ color: '#94a3b8', fontSize: 18 }}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.sub, { marginBottom: 12 }]}>
                {t('create.sub')}
              </Text>

              <Text style={styles.inputLabel}>{t('create.titleLabel')}</Text>
              <TextInput
                style={styles.input}
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder={t('create.titlePlaceholder')}
                placeholderTextColor="#64748b"
              />

              <Text style={styles.inputLabel}>{t('create.descLabel')}</Text>
              <TextInput
                style={styles.input}
                value={formDesc}
                onChangeText={setFormDesc}
                placeholder={t('create.descPlaceholder')}
                placeholderTextColor="#64748b"
              />

              <Text style={styles.inputLabel}>{t('create.durationLabel')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {['7', '14', '30', '60', '90', '180', '365'].map((val) => (
                  <TouchableOpacity
                    key={val}
                    style={[
                      styles.choiceChip,
                      formTotalDays === val && { backgroundColor: formColor, borderColor: formColor }
                    ]}
                    onPress={() => setFormTotalDays(val)}
                  >
                    <Text
                      style={{
                        color: formTotalDays === val ? '#fff' : '#cbd5e1',
                        fontSize: 12,
                        fontWeight: '600'
                      }}
                    >
                      {t('duration.nDays', { n: val })}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                value={formTotalDays}
                onChangeText={(v) => setFormTotalDays(v.replace(/[^0-9]/g, ''))}
                placeholder={t('create.durationPlaceholder')}
                placeholderTextColor="#64748b"
              />

              <Text style={styles.inputLabel}>{t('create.phasesLabel')}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                {[{ v: '7', k: 'create.weekly' }, { v: '30', k: 'create.monthly' }].map((opt) => (
                  <TouchableOpacity
                    key={opt.v}
                    style={[
                      styles.choiceChip,
                      { flex: 1 },
                      formPhaseGrouping === opt.v && { backgroundColor: formColor, borderColor: formColor }
                    ]}
                    onPress={() => setFormPhaseGrouping(opt.v)}
                  >
                    <Text style={{ color: formPhaseGrouping === opt.v ? '#fff' : '#cbd5e1', textAlign: 'center' }}>
                      {t(opt.k)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>{t('create.iconLabel')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {ICON_OPTIONS.map((ico) => (
                  <TouchableOpacity
                    key={ico}
                    style={[
                      styles.emojiChip,
                      formIcon === ico && { borderColor: formColor, borderWidth: 2, backgroundColor: '#334155' }
                    ]}
                    onPress={() => setFormIcon(ico)}
                  >
                    <Text style={{ fontSize: 18 }}>{ico}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>{t('create.colorLabel')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {COLOR_PALETTE.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorDot,
                      { backgroundColor: c },
                      formColor === c && { borderColor: '#fff', borderWidth: 2.5 }
                    ]}
                    onPress={() => setFormColor(c)}
                  />
                ))}
              </View>

              <Text style={styles.inputLabel}>{t('create.categoryLabel')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.choiceChip,
                      formCategory === cat && { backgroundColor: formColor, borderColor: formColor }
                    ]}
                    onPress={() => setFormCategory(cat)}
                  >
                    <Text
                      style={{
                        color: formCategory === cat ? '#fff' : '#cbd5e1',
                        fontSize: 11,
                        fontWeight: '600'
                      }}
                    >
                      {categoryLabel(lang, cat)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.btnPrimary, styles.btnGray]}
                  onPress={() => setCreateRoadmapModal(false)}
                >
                  <Text style={styles.btnPrimaryText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnPrimary, { backgroundColor: formColor }]}
                  onPress={handleCreateRoadmap}
                >
                  <Text style={styles.btnPrimaryText}>{t('create.submit')}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: EDIT ROADMAP INFO + DURATION ================= */}
      <Modal visible={editRoadmapModal} transparent animationType="fade" onRequestClose={() => setEditRoadmapModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.h1}>{t('edit.title')}</Text>
              <Text style={styles.inputLabel}>{t('edit.titleLabel')}</Text>
              <TextInput
                style={styles.input}
                value={formTitle}
                onChangeText={setFormTitle}
                placeholderTextColor="#64748b"
              />
              <Text style={styles.inputLabel}>{t('edit.descLabel')}</Text>
              <TextInput
                style={styles.input}
                value={formDesc}
                onChangeText={setFormDesc}
                placeholderTextColor="#64748b"
              />

              {/* Duration */}
              <Text style={styles.inputLabel}>{t('edit.durationLabel')}</Text>
              {editingRoadmap ? (
                <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6 }}>
                  {t('edit.durationInfo', {
                    days: editingRoadmap.totalDays,
                    done: (editingRoadmap.doneDays || []).length,
                    locked: getLockedDayCount(editingRoadmap)
                  })}
                </Text>
              ) : null}
              {renderDurationPicker({
                value: formDurationValue,
                unit: formDurationUnit,
                onValue: setFormDurationValue,
                onUnit: (u) => {
                  // Convert the current value so the duration does not jump
                  const days = toDays(formDurationValue, formDurationUnit);
                  setFormDurationUnit(u);
                  if (days) setFormDurationValue(String(u === 'weeks' ? Math.max(1, Math.round(days / 7)) : days));
                },
                color: formColor
              })}

              <Text style={styles.inputLabel}>{t('create.iconLabel')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {ICON_OPTIONS.map((ico) => (
                  <TouchableOpacity
                    key={ico}
                    style={[
                      styles.emojiChip,
                      formIcon === ico && { borderColor: formColor, borderWidth: 2, backgroundColor: '#334155' }
                    ]}
                    onPress={() => setFormIcon(ico)}
                  >
                    <Text style={{ fontSize: 18 }}>{ico}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                <TouchableOpacity
                  style={[styles.btnPrimary, styles.btnGray]}
                  onPress={() => setEditRoadmapModal(false)}
                >
                  <Text style={styles.btnPrimaryText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnPrimary, { backgroundColor: formColor }]}
                  onPress={handleSaveRoadmapEdits}
                  testID="edit-roadmap-save"
                >
                  <Text style={styles.btnPrimaryText}>{t('edit.save')}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: SCHEDULE CHANGE PREVIEW ================= */}
      <Modal visible={!!schedulePlan} transparent animationType="fade" onRequestClose={() => setSchedulePlan(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '90%' }]}>
            {schedulePlan ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.h1}>📅 {t('schedule.previewTitle')}</Text>
                <Text style={[styles.sub, { marginTop: 4 }]}>{schedulePlan.roadmapTitle}</Text>

                <View style={[styles.infoBox, schedulePlan.significant && { borderColor: '#f59e0b' }]}>
                  <Text style={{ color: '#f8fafc', fontSize: 16, fontWeight: '800' }} testID="schedule-preview-summary">
                    {t('schedule.fromTo', {
                      from: schedulePlan.oldTotal,
                      to: schedulePlan.newTotal,
                      delta: schedulePlan.delta > 0 ? `+${schedulePlan.delta}` : String(schedulePlan.delta)
                    })}
                  </Text>
                  {schedulePlan.significant ? (
                    <Text style={{ color: '#fbbf24', fontSize: 12, fontWeight: '700', marginTop: 4 }}>⚠️ {t('schedule.significant')}</Text>
                  ) : null}
                </View>

                <View style={styles.previewRow}>
                  <Text>🔒</Text>
                  <Text style={styles.previewText}>
                    {schedulePlan.lockedDays > 0
                      ? t('schedule.lockedInfo', { locked: schedulePlan.lockedDays })
                      : t('schedule.noneLocked')}
                  </Text>
                </View>
                <View style={styles.previewRow}>
                  <Text>{schedulePlan.delta > 0 ? '↔️' : '🗜'}</Text>
                  <Text style={styles.previewText}>
                    {schedulePlan.delta > 0
                      ? t('schedule.stretchInfo', { from: schedulePlan.remainingOld, to: schedulePlan.remainingNew, added: schedulePlan.addedDays })
                      : schedulePlan.remainingNew > 0
                      ? t('schedule.compressInfo', { from: schedulePlan.remainingOld, to: schedulePlan.remainingNew, merged: schedulePlan.mergedDays })
                      : t('schedule.dropInfo', { count: schedulePlan.droppedDays })}
                  </Text>
                </View>
                {schedulePlan.movedItems > 0 ? (
                  <View style={styles.previewRow}>
                    <Text>📦</Text>
                    <Text style={styles.previewText}>{t('schedule.movedInfo', { count: schedulePlan.movedItems })}</Text>
                  </View>
                ) : null}
                {schedulePlan.mergedDataDays > 0 ? (
                  <View style={styles.previewRow}>
                    <Text>🧩</Text>
                    <Text style={styles.previewText}>{t('schedule.mergedDataInfo', { count: schedulePlan.mergedDataDays })}</Text>
                  </View>
                ) : null}
                {schedulePlan.archivedItems > 0 ? (
                  <View style={styles.previewRow}>
                    <Text>🗄</Text>
                    <Text style={styles.previewText}>{t('schedule.archivedInfo', { count: schedulePlan.archivedItems })}</Text>
                  </View>
                ) : null}
                <View style={styles.previewRow}>
                  <Text>✅</Text>
                  <Text style={styles.previewText}>{t('schedule.preservedInfo')}</Text>
                </View>

                <Text style={[styles.inputLabel, { marginTop: 14 }]}>{t('schedule.newPhases')}</Text>
                {schedulePlan.phasesAfter.slice(0, 15).map((p) => (
                  <View key={p.id} style={styles.previewPhaseRow}>
                    <Text style={{ color: '#e2e8f0', fontSize: 12, flex: 1 }} numberOfLines={2}>{p.title}</Text>
                    <Text style={{ color: accentColor, fontSize: 12, fontWeight: '700' }}>{p.startDay}–{p.endDay}</Text>
                  </View>
                ))}
                {schedulePlan.phasesAfter.length > 15 ? (
                  <Text style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>
                    {t('schedule.morePhases', { count: schedulePlan.phasesAfter.length - 15 })}
                  </Text>
                ) : null}

                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                  <TouchableOpacity style={[styles.btnPrimary, styles.btnGray]} onPress={() => setSchedulePlan(null)}>
                    <Text style={styles.btnPrimaryText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnPrimary, { backgroundColor: schedulePlan.significant ? '#f59e0b' : accentColor }]}
                    onPress={confirmScheduleChange}
                    testID="schedule-confirm"
                  >
                    <Text style={styles.btnPrimaryText}>{t('schedule.apply')}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: EDIT DAY TOPIC ================= */}
      <Modal visible={editDayModal} transparent animationType="fade" onRequestClose={() => setEditDayModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.h1}>{t('editDay.title', { day: editDayNumber })}</Text>
            <Text style={[styles.sub, { marginBottom: 10 }]}>
              {t('editDay.sub')}
            </Text>
            <TextInput
              style={styles.input}
              value={editDayTopicDraft}
              onChangeText={setEditDayTopicDraft}
              placeholder={t('editDay.placeholder')}
              placeholderTextColor="#64748b"
              autoFocus
            />
            <Text style={styles.inputLabel}>{t('editDay.objectivesLabel')}</Text>
            <TextInput
              style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
              multiline
              value={editDayObjectivesDraft}
              onChangeText={setEditDayObjectivesDraft}
              placeholder={t('editDay.objectivesPlaceholder')}
              placeholderTextColor="#64748b"
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.btnPrimary, styles.btnGray]}
                onPress={() => setEditDayModal(false)}
              >
                <Text style={styles.btnPrimaryText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: accentColor }]}
                onPress={saveEditedDayTopic}
              >
                <Text style={styles.btnPrimaryText}>{t('editDay.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: ADD / EDIT TASK ================= */}
      <Modal visible={taskModal} transparent animationType="fade" onRequestClose={() => { setTaskModal(false); setEditingTaskId(null); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.rowBetween}>
              <Text style={styles.h1}>{editingTaskId ? `✎ ${t('tasks.editTitle')}` : `➕ ${t('tasks.addTitle')}`}</Text>
              <TouchableOpacity onPress={() => {
                setTaskModal(false);
                setEditingTaskId(null);
              }}>
                <Text style={{ color: '#94a3b8', fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.sub, { marginBottom: 10 }]}>
              {editingTaskId ? t('tasks.editSub', { day: currentDay }) : t('tasks.addSub', { day: currentDay })}
            </Text>

            <Text style={styles.inputLabel}>{t('tasks.nameLabel')}</Text>
            <TextInput
              style={styles.input}
              value={newTaskTitle}
              onChangeText={setNewTaskTitle}
              placeholder={t('tasks.namePlaceholder')}
              placeholderTextColor="#64748b"
              autoFocus
            />

            <Text style={styles.inputLabel}>{t('tasks.durationLabel')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {['10 mins', '15 mins', '20 mins', '25 mins', '30 mins', '45 mins', '60 mins', '90 mins'].map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[
                    styles.choiceChip,
                    newTaskDur === d && { backgroundColor: accentColor, borderColor: accentColor }
                  ]}
                  onPress={() => setNewTaskDur(d)}
                >
                  <Text style={{
                    color: newTaskDur === d ? '#fff' : '#cbd5e1',
                    fontSize: 11,
                    fontWeight: '600'
                  }}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              value={newTaskDur}
              onChangeText={setNewTaskDur}
              placeholder={t('tasks.durationPlaceholder')}
              placeholderTextColor="#64748b"
            />

            <Text style={styles.inputLabel}>{t('tasks.priorityLabel')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {['High', 'Medium', 'Low'].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.choiceChip,
                    { flex: 1 },
                    newTaskPriority === p && { backgroundColor: accentColor, borderColor: accentColor }
                  ]}
                  onPress={() => setNewTaskPriority(p)}
                >
                  <Text
                    style={{
                      color: newTaskPriority === p ? '#fff' : '#cbd5e1',
                      textAlign: 'center',
                      fontWeight: '600'
                    }}
                  >
                    {priorityLabel(p)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                style={[styles.btnPrimary, styles.btnGray]}
                onPress={() => { setTaskModal(false); setEditingTaskId(null); }}
              >
                <Text style={styles.btnPrimaryText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: accentColor }]}
                onPress={addTask}
              >
                <Text style={styles.btnPrimaryText}>{editingTaskId ? t('common.saveChanges') : t('tasks.addTitle')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: TIMER CUSTOM MODES (fully editable) ================= */}
      <Modal visible={timerSettingsModal} transparent animationType="slide" onRequestClose={() => setTimerSettingsModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '88%' }]}>
            <View style={styles.rowBetween}>
              <Text style={styles.h1}>⚙️ {t('timer.modesTitle')}</Text>
              <TouchableOpacity onPress={() => setTimerSettingsModal(false)}>
                <Text style={{ color: '#94a3b8', fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.sub, { marginBottom: 4 }]}>
              {t('timer.modesSub')}
            </Text>

            <View style={{ backgroundColor: '#090f1d', borderRadius: 10, padding: 10, marginVertical: 8, borderWidth: 1, borderColor: '#1e293b' }}>
              <Text style={{ color: '#94a3b8', fontSize: 11, lineHeight: 16 }}>
                💡 <Text style={{ color: '#f8fafc', fontWeight: '700' }}>{t('timer.howItWorks')}</Text>{' '}
                {t('timer.howItWorksBody')}
              </Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 340 }}>
              {routineModeDraft.map((mode, idx) => (
                <View
                  key={idx}
                  style={[styles.modeEditRow, activeTimerMode === mode.label && !activeTaskId && { borderColor: accentColor }]}
                >
                  <TextInput
                    style={styles.modeNameInput}
                    value={mode.label}
                    onChangeText={(val) => {
                      const next = [...routineModeDraft];
                      next[idx] = { ...next[idx], label: val };
                      setRoutineModeDraft(next);
                    }}
                    placeholder={t('timer.modeName')}
                    placeholderTextColor="#475569"
                  />

                  <View style={styles.modeMinControls}>
                    <TouchableOpacity
                      style={styles.modeMinBtn}
                      onPress={() => {
                        const next = [...routineModeDraft];
                        next[idx] = { ...next[idx], dur: Math.max(1, next[idx].dur - 5) };
                        setRoutineModeDraft(next);
                      }}
                    >
                      <Text style={{ color: '#f87171', fontWeight: '900', fontSize: 16 }}>−</Text>
                    </TouchableOpacity>

                    <Text style={{ color: accentColor, fontWeight: '800', fontSize: 15, minWidth: 36, textAlign: 'center' }}>
                      {mode.dur}{t('timer.minShort')}
                    </Text>

                    <TouchableOpacity
                      style={styles.modeMinBtn}
                      onPress={() => {
                        const next = [...routineModeDraft];
                        next[idx] = { ...next[idx], dur: Math.min(180, next[idx].dur + 5) };
                        setRoutineModeDraft(next);
                      }}
                    >
                      <Text style={{ color: '#34d399', fontWeight: '900', fontSize: 16 }}>+</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.modeSelectBtn,
                      { backgroundColor: activeTimerMode === mode.label && !activeTaskId ? accentColor : '#172338' }
                    ]}
                    onPress={() => {
                      selectTimerMode(mode);
                      setTimerSettingsModal(false);
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 12 }}>▶</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setRoutineModeDraft(routineModeDraft.filter((_, i) => i !== idx))}
                  >
                    <Text style={{ color: '#f87171', fontSize: 14, paddingLeft: 4 }}>🗑</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: '#172338', marginTop: 10, borderWidth: 1, borderColor: '#233550', borderStyle: 'dashed' }]}
              onPress={() => {
                setRoutineModeDraft([...routineModeDraft, { id: 'm_' + Date.now(), label: 'Custom', dur: 25 }]);
              }}
            >
              <Text style={{ color: '#94a3b8', fontWeight: '600', fontSize: 13 }}>+ {t('timer.addMode')}</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
              <TouchableOpacity
                style={[styles.btnPrimary, styles.btnGray]}
                onPress={() => setTimerSettingsModal(false)}
              >
                <Text style={styles.btnPrimaryText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: accentColor }]}
                onPress={saveRoutineModes}
              >
                <Text style={styles.btnPrimaryText}>✓ {t('timer.saveModes')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: BACKUP JSON ================= */}
      <Modal visible={backupModal} transparent animationType="fade" onRequestClose={() => setBackupModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '80%' }]}>
            <Text style={styles.h1}>{t('backup.modalTitle')}</Text>
            <Text style={[styles.sub, { marginVertical: 6 }]}>
              {t('backup.modalSub')}
            </Text>
            <TextInput
              style={[styles.input, { height: 180, textAlignVertical: 'top', fontFamily: MONO, fontSize: 11 }]}
              multiline
              value={backupText}
              onChangeText={setBackupText}
              placeholder={t('backup.placeholder')}
              placeholderTextColor="#64748b"
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <TouchableOpacity
                style={[styles.btnPrimary, styles.btnGray]}
                onPress={() => setBackupModal(false)}
              >
                <Text style={styles.btnPrimaryText}>{t('common.close')}</Text>
              </TouchableOpacity>
              {backupText ? (
                <TouchableOpacity
                  style={[styles.btnPrimary, styles.btnGray]}
                  onPress={() => doCopy(backupText)}
                >
                  <Text style={styles.btnPrimaryText}>📋 {t('common.copy')}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: '#10b981' }]}
                onPress={handleImportData}
              >
                <Text style={styles.btnPrimaryText}>{t('backup.apply')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: AI SETTINGS (DEEPSEEK + OPENAI) ================= */}
      <Modal visible={aiSettingsModal} transparent animationType="slide" onRequestClose={() => setAiSettingsModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '92%' }]}>
            <View style={styles.rowBetween}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <Text style={{ fontSize: 24 }}>⚙️</Text>
                <Text style={styles.h1}>{t('aiSettings.title')}</Text>
              </View>
              <TouchableOpacity onPress={() => setAiSettingsModal(false)}>
                <Text style={{ color: '#94a3b8', fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.sub, { marginBottom: 12 }]}>
              {t('aiSettings.sub')}
            </Text>

            {/* Provider Tabs */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
              <TouchableOpacity
                style={[
                  styles.providerTabBtn,
                  aiProviderDraft === 'deepseek' && { backgroundColor: '#3b82f6', borderColor: '#3b82f6' }
                ]}
                onPress={() => {
                  setAiProviderDraft('deepseek');
                  if (!aiModelDraft.startsWith('deepseek')) setAiModelDraft(DEFAULT_AI_MODEL);
                  setAiValidationStatus(null);
                }}
              >
                <Text style={{ color: aiProviderDraft === 'deepseek' ? '#fff' : '#94a3b8', fontSize: 12, fontWeight: '700' }}>
                  🐋 {t('aiSettings.deepseek')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.providerTabBtn,
                  aiProviderDraft === 'openai' && { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' }
                ]}
                onPress={() => {
                  setAiProviderDraft('openai');
                  if (aiModelDraft.startsWith('deepseek')) setAiModelDraft(DEFAULT_OPENAI_MODEL);
                  setAiValidationStatus(null);
                }}
              >
                <Text style={{ color: aiProviderDraft === 'openai' ? '#fff' : '#94a3b8', fontSize: 12, fontWeight: '700' }}>
                  🤖 {t('aiSettings.openai')}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>
                {aiProviderDraft === 'deepseek' ? t('aiSettings.deepseekKeyLabel') : t('aiSettings.openaiKeyLabel')}
              </Text>
              <TextInput
                style={[styles.input, { fontFamily: MONO, fontSize: 13 }]}
                value={aiKeyDraft}
                onChangeText={(val) => {
                  setAiKeyDraft(val);
                  setAiValidationStatus(null);
                  // Only switch when the key format is unambiguous (both providers use sk-)
                  const detected = val.trim().length > 30 ? detectProvider(val) : aiProviderDraft;
                  if (detected !== aiProviderDraft) {
                    setAiProviderDraft(detected);
                    setAiModelDraft(detected === 'openai' ? DEFAULT_OPENAI_MODEL : DEFAULT_AI_MODEL);
                  }
                }}
                secureTextEntry={aiKeyDraft.length > 8}
                placeholder={aiProviderDraft === 'deepseek' ? 'sk-...' : 'sk-proj-...'}
                placeholderTextColor="#64748b"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={{ color: '#64748b', fontSize: 10, marginTop: 4 }}>🔐 {t('aiSettings.keyStorage')}</Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 8 }}>
                <TouchableOpacity
                  style={[styles.btnSmall, { backgroundColor: '#334155', paddingHorizontal: 12 }]}
                  onPress={handleTestApiKey}
                  disabled={aiValidating}
                >
                  {aiValidating ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.btnSmallText}>🔍 {t('aiSettings.test')}</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setAiPaymentGuideModal(true)}>
                  <Text style={{ color: '#38bdf8', fontSize: 12, fontWeight: '600' }}>
                    ❓ {t('aiSettings.guideLink')}
                  </Text>
                </TouchableOpacity>
              </View>

              {aiValidationStatus && (
                <View
                  style={[
                    styles.aiValidationBox,
                    aiValidationStatus.valid
                      ? { borderColor: '#10b981', backgroundColor: '#10b98115' }
                      : { borderColor: '#ef4444', backgroundColor: '#ef444415' }
                  ]}
                >
                  <Text style={{ color: aiValidationStatus.valid ? '#34d399' : '#f87171', fontSize: 12, fontWeight: '700' }}>
                    {aiValidationStatus.valid ? t('aiSettings.connOk') : t('aiSettings.connFailed')}
                  </Text>
                  <Text style={{ color: '#cbd5e1', fontSize: 11, marginTop: 2 }}>
                    {aiValidationStatus.msg}
                  </Text>
                </View>
              )}

              <Text style={[styles.inputLabel, { marginTop: 14 }]}>
                {aiProviderDraft === 'deepseek' ? t('aiSettings.deepseekModel') : t('aiSettings.openaiModel')}
              </Text>
              {(aiProviderDraft === 'deepseek' ? DEEPSEEK_MODELS : OPENAI_MODELS).map((m) => {
                const isSelected = aiModelDraft === m.id;
                const activeColor = aiProviderDraft === 'deepseek' ? '#3b82f6' : '#8b5cf6';
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[
                      styles.modelOptionCard,
                      isSelected && { borderColor: activeColor, backgroundColor: `${activeColor}18` }
                    ]}
                    onPress={() => setAiModelDraft(m.id)}
                  >
                    <View style={styles.rowBetween}>
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', flex: 1 }}>{m.name}</Text>
                      {isSelected && (
                        <View style={[styles.activePill, { backgroundColor: `${activeColor}33` }]}>
                          <Text style={[styles.activePillText, { color: activeColor }]}>{t('common.active')}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 4 }}>
                      {t('aiSettings.cost')}: <Text style={{ color: '#fbbf24' }}>{m.cost}</Text>
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <Text style={styles.inputLabel}>{t('aiSettings.customModel')}</Text>
              <TextInput
                style={[styles.input, { fontFamily: MONO, fontSize: 12 }]}
                value={aiModelDraft}
                onChangeText={(v) => setAiModelDraft(v.trim())}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={aiProviderDraft === 'deepseek' ? DEFAULT_AI_MODEL : DEFAULT_OPENAI_MODEL}
                placeholderTextColor="#64748b"
              />

              <View style={{ backgroundColor: '#090f1d', borderRadius: 8, padding: 10, marginTop: 10, borderWidth: 1, borderColor: '#1e293b' }}>
                <Text style={{ color: '#94a3b8', fontSize: 11, lineHeight: 16 }}>
                  💡 {t('aiSettings.freeTip')}
                </Text>
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.btnPrimary, styles.btnGray]}
                onPress={() => setAiSettingsModal(false)}
              >
                <Text style={styles.btnPrimaryText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: aiProviderDraft === 'deepseek' ? '#3b82f6' : '#8b5cf6' }]}
                onPress={handleSaveAISettings}
              >
                <Text style={styles.btnPrimaryText}>{t('aiSettings.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: PAYMENT, KEY SETUP & DISTRIBUTION GUIDE ================= */}
      <Modal visible={aiPaymentGuideModal} transparent animationType="fade" onRequestClose={() => setAiPaymentGuideModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '90%' }]}>
            <View style={styles.rowBetween}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <Text style={{ fontSize: 24 }}>📚</Text>
                <Text style={styles.h1}>{t('guide.title')}</Text>
              </View>
              <TouchableOpacity onPress={() => setAiPaymentGuideModal(false)}>
                <Text style={{ color: '#94a3b8', fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.sub, { marginBottom: 12 }]}>
              {t('guide.sub')}
            </Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.cardTitle, { color: '#38bdf8', marginTop: 4, marginBottom: 8 }]}>
                🐋 {t('guide.deepseekTitle')}
              </Text>
              {[1, 2].map((n) => (
                <View key={`g${n}`} style={styles.guideStepCard}>
                  <View style={[styles.stepNumBadge, { backgroundColor: '#3b82f6' }]}>
                    <Text style={styles.stepNumText}>{n}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.guideStepTitle}>{t(`guide.deepseek${n}Title`)}</Text>
                    <Text style={styles.guideStepDesc}>{t(`guide.deepseek${n}Body`)}</Text>
                  </View>
                </View>
              ))}

              <Text style={[styles.cardTitle, { color: '#c084fc', marginTop: 14, marginBottom: 8 }]}>
                🤖 {t('guide.openaiTitle')}
              </Text>
              {[1, 2].map((n) => (
                <View key={`o${n}`} style={styles.guideStepCard}>
                  <View style={[styles.stepNumBadge, { backgroundColor: '#8b5cf6' }]}>
                    <Text style={styles.stepNumText}>{n}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.guideStepTitle}>{t(`guide.openai${n}Title`)}</Text>
                    <Text style={styles.guideStepDesc}>{t(`guide.openai${n}Body`)}</Text>
                  </View>
                </View>
              ))}

              <Text style={[styles.cardTitle, { color: '#34d399', marginTop: 14, marginBottom: 8 }]}>
                📱 {t('guide.distTitle')}
              </Text>
              <View style={styles.guideCallout}>
                <Text style={{ color: '#34d399', fontSize: 12, fontWeight: '700' }}>
                  {t('guide.distHeading')}
                </Text>
                <Text style={{ color: '#cbd5e1', fontSize: 11, lineHeight: 18, marginTop: 4 }}>
                  {t('guide.distBody')}
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: '#8b5cf6', marginTop: 12 }]}
              onPress={() => setAiPaymentGuideModal(false)}
            >
              <Text style={styles.btnPrimaryText}>{t('guide.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: AI ROADMAP GENERATOR ================= */}
      <Modal visible={aiRoadmapModal} transparent animationType="slide" onRequestClose={() => !aiGeneratingRoadmap && setAiRoadmapModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '92%' }]}>
            <View style={styles.rowBetween}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <Text style={{ fontSize: 24 }}>✨</Text>
                <Text style={styles.h1}>{t('aiRoadmap.title')}</Text>
              </View>
              <TouchableOpacity onPress={() => !aiGeneratingRoadmap && setAiRoadmapModal(false)}>
                <Text style={{ color: '#94a3b8', fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.sub, { marginBottom: 12 }]}>
              {t('aiRoadmap.sub')}
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>{t('aiRoadmap.goalLabel')}</Text>
              <TextInput
                style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
                multiline
                value={aiPrompt}
                onChangeText={setAiPrompt}
                placeholder={t('aiRoadmap.goalPlaceholder')}
                placeholderTextColor="#64748b"
                editable={!aiGeneratingRoadmap}
                testID="ai-roadmap-goal"
              />

              <Text style={styles.inputLabel}>{t('aiRoadmap.durationLabel')}</Text>
              {renderDurationPicker({
                value: aiDurationValue,
                unit: aiDurationUnit,
                onValue: setAiDurationValue,
                onUnit: (u) => {
                  setAiDurationUnit(u);
                  setAiDurationValue(u === 'weeks' ? '4' : '30');
                },
                color: '#8b5cf6',
                disabled: aiGeneratingRoadmap
              })}

              <Text style={styles.inputLabel}>{t('aiRoadmap.levelLabel')}</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                {['Beginner', 'Intermediate', 'Advanced'].map((lvl) => (
                  <TouchableOpacity
                    key={lvl}
                    style={[
                      styles.choiceChip,
                      aiLevel === lvl && { backgroundColor: '#3b82f6', borderColor: '#3b82f6' }
                    ]}
                    onPress={() => setAiLevel(lvl)}
                    disabled={aiGeneratingRoadmap}
                  >
                    <Text style={{ color: aiLevel === lvl ? '#fff' : '#cbd5e1', fontSize: 12, fontWeight: '600' }}>
                      {t(`level.${lvl}`)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>{t('aiRoadmap.focusLabel')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                {[
                  { v: 'Practical Labs & Projects', k: 'focus.practical' },
                  { v: 'Certification & Exam', k: 'focus.cert' },
                  { v: 'Balanced Masterclass', k: 'focus.balanced' }
                ].map((f) => (
                  <TouchableOpacity
                    key={f.v}
                    style={[
                      styles.choiceChip,
                      aiFocus === f.v && { backgroundColor: '#10b981', borderColor: '#10b981' }
                    ]}
                    onPress={() => setAiFocus(f.v)}
                    disabled={aiGeneratingRoadmap}
                  >
                    <Text style={{ color: aiFocus === f.v ? '#fff' : '#cbd5e1', fontSize: 12 }}>
                      {t(f.k)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>{t('gen.instructionsLabel')}</Text>
              <TextInput
                style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
                multiline
                value={aiRoadmapInstructions}
                onChangeText={setAiRoadmapInstructions}
                placeholder={t('aiRoadmap.instructionsPlaceholder')}
                placeholderTextColor="#64748b"
                editable={!aiGeneratingRoadmap}
              />

              <Text style={styles.inputLabel}>{t('gen.languageLabel')}</Text>
              {renderLanguagePicker(aiRoadmapLang, setAiRoadmapLang)}

              <View style={[styles.infoBox, { marginTop: 12 }]}>
                <Text style={{ color: '#94a3b8', fontSize: 11 }}>
                  {appData.aiConfig?.apiKey
                    ? t('aiRoadmap.usingModel', { model: normalizeModel(appData.aiConfig?.provider, appData.aiConfig?.model) })
                    : t('aiRoadmap.noKey')}
                </Text>
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.btnPrimary, styles.btnGray]}
                onPress={() => setAiRoadmapModal(false)}
                disabled={aiGeneratingRoadmap}
              >
                <Text style={styles.btnPrimaryText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: '#8b5cf6', minWidth: 140 }]}
                onPress={handleGenerateAIRoadmap}
                disabled={aiGeneratingRoadmap}
                testID="ai-roadmap-generate"
              >
                {aiGeneratingRoadmap ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.btnPrimaryText}>{t('aiRoadmap.generating')}</Text>
                  </View>
                ) : (
                  <Text style={styles.btnPrimaryText}>🚀 {t('aiRoadmap.generate', { days: aiTotalDays || '?' })}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: REFERENCE DOCUMENT UPLOAD HUB ================= */}
      <Modal visible={aiUploadModal} transparent animationType="slide" onRequestClose={() => setAiUploadModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '92%' }]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.rowBetween}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.h1}>📁 {t('upload.title')}</Text>
                  <Text style={styles.sub}>{t('upload.daySub', { day: currentDay, topic: currentDayInfo.topic })}</Text>
                </View>
                <TouchableOpacity onPress={() => setAiUploadModal(false)}>
                  <Text style={{ color: '#94a3b8', fontSize: 18 }}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Target Selector Tabs */}
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                {[
                  { id: 'day', label: `📄 ${t('upload.tabDay', { day: currentDay })}`, bg: '#6366f1', border: '#818cf8' },
                  { id: 'global', label: `🌐 ${t('upload.tabGlobal')}`, bg: '#10b981', border: '#34d399' },
                  { id: 'lesson', label: `✏️ ${t('upload.tabLesson')}`, bg: '#3b82f6', border: '#60a5fa' }
                ].map((tab) => (
                  <TouchableOpacity
                    key={tab.id}
                    style={[
                      styles.filterPill,
                      aiUploadTarget === tab.id ? { backgroundColor: tab.bg, borderColor: tab.border } : {}
                    ]}
                    onPress={() => {
                      if (tab.id !== aiUploadTarget && !aiUploadDraft.trim()) openUploadModal(tab.id);
                      else setAiUploadTarget(tab.id);
                    }}
                  >
                    <Text style={[styles.filterPillText, aiUploadTarget === tab.id ? { color: '#fff', fontWeight: '700' } : {}]}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>
                {aiUploadTarget === 'day'
                  ? t('upload.dayHint', { day: currentDay })
                  : aiUploadTarget === 'global'
                  ? t('upload.globalHint')
                  : t('upload.lessonHint')}
              </Text>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 6, flexWrap: 'wrap' }}>
                <TouchableOpacity
                  style={[styles.btnSmall, { backgroundColor: '#3b82f6', flexDirection: 'row', alignItems: 'center', gap: 6 }]}
                  onPress={handlePickDocumentFile}
                >
                  <Text style={{ fontSize: 13 }}>📂</Text>
                  <Text style={styles.btnSmallText}>{t('upload.pickFile')}</Text>
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {aiUploadDraft.length > 0 && (
                    <TouchableOpacity
                      style={[styles.btnSmall, { backgroundColor: '#334155' }]}
                      onPress={() => {
                        setAiUploadDraft('');
                        setAiUploadedFileName('');
                      }}
                    >
                      <Text style={styles.btnSmallText}>🧹 {t('upload.clearText')}</Text>
                    </TouchableOpacity>
                  )}
                  {((aiUploadTarget === 'day' && currentDayRefDoc) || (aiUploadTarget === 'global' && globalRefDoc)) ? (
                    <TouchableOpacity
                      style={[styles.btnSmall, { backgroundColor: '#7f1d1d' }]}
                      onPress={() => handleRemoveReferenceDoc(aiUploadTarget)}
                    >
                      <Text style={styles.btnSmallText}>🗑 {t('upload.removeConfirm')}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {aiUploadDraft.length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <View style={[styles.badgePill, { backgroundColor: '#1e293b', borderColor: '#475569', borderWidth: 1 }]}>
                    <Text style={{ color: '#38bdf8', fontSize: 10, fontWeight: '700' }}>
                      {aiUploadedFileName ? `📄 ${aiUploadedFileName}` : `📝 ${t('upload.textEntered')}`}: {t('upload.stats', { chars: aiUploadDraft.length.toLocaleString(), words: Math.round(aiUploadDraft.length / 5).toLocaleString() })}
                    </Text>
                  </View>
                </View>
              )}

              <TextInput
                style={[styles.input, { height: 220, textAlignVertical: 'top', fontSize: 12, lineHeight: 18 }]}
                multiline
                value={aiUploadDraft}
                onChangeText={setAiUploadDraft}
                placeholder={t('upload.placeholder')}
                placeholderTextColor="#64748b"
              />

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                <TouchableOpacity
                  style={[styles.btnPrimary, styles.btnGray]}
                  onPress={() => setAiUploadModal(false)}
                >
                  <Text style={styles.btnPrimaryText}>{t('common.cancel')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btnPrimary, { backgroundColor: '#10b981' }]}
                  onPress={() => handleSaveReferenceDoc(aiUploadTarget)}
                >
                  <Text style={styles.btnPrimaryText}>💾 {aiUploadTarget === 'lesson' ? t('upload.saveLesson') : t('upload.save')}</Text>
                </TouchableOpacity>

                {aiUploadTarget !== 'lesson' && (
                  <TouchableOpacity
                    style={[styles.btnPrimary, { backgroundColor: '#8b5cf6' }]}
                    onPress={handleSaveAndGenerateNow}
                  >
                    <Text style={styles.btnPrimaryText}>⚡ {t('upload.saveGenerate')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
