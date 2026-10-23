import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Vibration,
  ActivityIndicator,
  StatusBar as RNStatusBar
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import {
  loadAppState,
  saveAppState,
  syncWithCloud,
  updateStreakRecord,
  getInitialAppState
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
  sendTestAlarmNotification
} from './notifications';
import {
  validateApiKey,
  generateRoadmapWithAI,
  generateLessonContentWithAI,
  generatePracticeAndQuizWithAI,
  detectProvider,
  PROVIDERS,
  GEMINI_MODELS,
  OPENAI_MODELS,
  DEFAULT_AI_PROVIDER,
  DEFAULT_AI_MODEL
} from './aiService';

export default function App() {
  // App state
  const [appData, setAppData] = useState(null);
  const [activeTab, setActiveTab] = useState('today'); // 'today' | 'roadmaps' | 'timeline' | 'settings'
  const [openPhaseId, setOpenPhaseId] = useState(null);

  // Modals state
  const [createRoadmapModal, setCreateRoadmapModal] = useState(false);
  const [editRoadmapModal, setEditRoadmapModal] = useState(false);
  const [taskModal, setTaskModal] = useState(false);
  const [syncModal, setSyncModal] = useState(false);
  const [timerSettingsModal, setTimerSettingsModal] = useState(false);
  const [editDayModal, setEditDayModal] = useState(false);
  const [backupModal, setBackupModal] = useState(false);
  const [backupText, setBackupText] = useState('');
  const [reminderModal, setReminderModal] = useState(false);
  const [fullNoteModal, setFullNoteModal] = useState(false);

  // ================= AI Feature States (Gemini + ChatGPT) =================
  const [aiSettingsModal, setAiSettingsModal] = useState(false);
  const [aiProviderDraft, setAiProviderDraft] = useState(DEFAULT_AI_PROVIDER); // 'gemini' | 'openai'
  const [aiKeyDraft, setAiKeyDraft] = useState('');
  const [aiModelDraft, setAiModelDraft] = useState(DEFAULT_AI_MODEL);
  const [aiValidating, setAiValidating] = useState(false);
  const [aiValidationStatus, setAiValidationStatus] = useState(null); // { valid: bool, msg: string }
  const [aiPaymentGuideModal, setAiPaymentGuideModal] = useState(false);

  // 1. AI Roadmap Generator
  const [aiRoadmapModal, setAiRoadmapModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiTotalDays, setAiTotalDays] = useState('30');
  const [aiLevel, setAiLevel] = useState('Beginner');
  const [aiFocus, setAiFocus] = useState('Practical Labs & Projects');
  const [aiGeneratingRoadmap, setAiGeneratingRoadmap] = useState(false);

  // 2. AI Lesson & Course Content
  const [aiLessonModal, setAiLessonModal] = useState(false);
  const [aiLessonLoading, setAiLessonLoading] = useState(false);
  const [aiUploadModal, setAiUploadModal] = useState(false);
  const [aiUploadDraft, setAiUploadDraft] = useState('');
  const [aiUploadTarget, setAiUploadTarget] = useState('day'); // 'day' | 'global' | 'lesson'
  const [aiUploadedFileName, setAiUploadedFileName] = useState('');

  // 3. AI Practice & Quiz
  const [aiPracticeModal, setAiPracticeModal] = useState(false);
  const [aiPracticeLoading, setAiPracticeLoading] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState({});

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

  // Day topic edit state
  const [editDayNumber, setEditDayNumber] = useState(1);
  const [editDayTopicDraft, setEditDayTopicDraft] = useState('');

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
    });
  }, []);

  // 2. Persist state changes
  useEffect(() => {
    if (appData) {
      saveAppState(appData);
    }
  }, [appData]);

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
    if (!activeRoadmap) return { day: 1, topic: 'No roadmap active', phaseTitle: '' };
    const curDay = activeRoadmap.currentDay || 1;
    let foundTopic = `Focus Day ${curDay}`;
    let foundPhaseTitle = '';

    if (activeRoadmap.phases) {
      for (const phase of activeRoadmap.phases) {
        if (curDay >= phase.startDay && curDay <= phase.endDay) {
          foundPhaseTitle = phase.title;
          const dayObj = phase.days.find((d) => d.day === curDay);
          if (dayObj && dayObj.topic) {
            foundTopic = dayObj.topic;
          }
          break;
        }
      }
    }

    return {
      day: curDay,
      topic: foundTopic,
      phaseTitle: foundPhaseTitle
    };
  }, [activeRoadmap]);

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
          '⏰ Daily Study Time!',
          `Your daily study alarm (${reminderTimeDraft}) is ringing! Ready to focus on Day ${currentDay}?`,
          [
            { text: 'Start Session Now', onPress: () => setIsTimerRunning(true) },
            { text: 'Dismiss', style: 'cancel' }
          ]
        );
      }
    };

    checkAlarmTime();
    const interval = setInterval(checkAlarmTime, 10000);
    return () => clearInterval(interval);
  }, [reminderEnabled, reminderTimeDraft, studyAlertVisible, currentDay]);

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
            ? dayTasks.find((t) => t.id === activeTaskId)
            : null;
          sendTimerCompleteNotification(activeTimerMode, linkedTask ? linkedTask.title : null);
          Alert.alert(
            'Session Complete 🎉',
            linkedTask
              ? `"${linkedTask.title}" focus session done! Take a well-earned break.`
              : `${activeTimerMode.toUpperCase()} session finished! Great work.`
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
  }, [isTimerRunning, activeTimerMode, activeTaskId, dayTasks]);

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
      const hourMatch = task.dur.match(/(\d+)\s*hour/i);
      const minMatch = task.dur.match(/(\d+)\s*min/i);
      if (hourMatch) durMins = parseInt(hourMatch[1], 10) * 60;
      else if (minMatch) durMins = parseInt(minMatch[1], 10);
    }
    const label = 'custom';
    const seconds = durMins * 60;
    setActiveTimerMode(label);
    setTimerLeft(seconds);
    setActiveTaskId(task.id);
    persistTimerState(label, seconds, task.id);
    // Scroll hint — show a brief alert
    Alert.alert(
      '⏱ Task Linked to Timer',
      `"${task.title}"\n${durMins} min session loaded. Hit Start Session to begin!`,
      [{ text: 'Got it!' }]
    );
  };

  const timerFormatted = useMemo(() => {
    const mins = Math.floor(timerLeft / 60);
    const secs = timerLeft % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [timerLeft]);

  // Active roadmap tasks & completion
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
      { id: 't_def_1', title: `Learn: ${currentDayInfo.topic}`, dur: '25 mins', priority: 'High', done: false },
      { id: 't_def_2', title: 'Hands-on practice & exercises', dur: '30 mins', priority: 'Medium', done: false },
      { id: 't_def_3', title: 'Review notes & summarize takeaways', dur: '10 mins', priority: 'Low', done: false }
    ];
  }, [activeRoadmap, currentDay, currentDayInfo]);

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

  // Day Practice & Quiz (AI Generated)
  const currentDayQuiz = useMemo(() => {
    if (!activeRoadmap || !activeRoadmap.quizzes) return null;
    return activeRoadmap.quizzes[currentDay] || null;
  }, [activeRoadmap, currentDay]);

  // Day & Global Reference Documents (HCIA Material Context for AI)
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
      Alert.alert('Reminder Disabled', 'Daily study alerts have been turned off.');
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
      '⏰ Study Alarm Saved!',
      ok
        ? `Daily alarm set for ${reminderTimeDraft} every day.\nYou'll receive a phone notification in your notification bar + an in-app banner.`
        : `Alarm saved for ${reminderTimeDraft}. Grant notification permission in Settings for phone bar alerts.`
    );
  };

  // Handlers for active roadmap state update
  const updateActiveRoadmap = (updater) => {
    if (!activeRoadmap) return;
    setAppData((prev) => {
      const updatedRoadmaps = prev.roadmaps.map((r) => {
        if (r.id === activeRoadmap.id) {
          return typeof updater === 'function' ? updater(r) : { ...r, ...updater };
        }
        return r;
      });
      return { ...prev, roadmaps: updatedRoadmaps };
    });
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
      updatedTasks[day] = dayTasks.map((t) => ({ ...t, done: true }));
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
    const updated = dayTasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t));
    updateActiveRoadmap((r) => ({
      ...r,
      tasks: { ...(r.tasks || {}), [currentDay]: updated }
    }));
  };

  const deleteTask = (taskId) => {
    const updated = dayTasks.filter((t) => t.id !== taskId);
    updateActiveRoadmap((r) => ({
      ...r,
      tasks: { ...(r.tasks || {}), [currentDay]: updated }
    }));
  };

  const addTask = () => {
    if (!newTaskTitle.trim()) return;
    if (editingTaskId) {
      // Edit existing task
      const updated = dayTasks.map((t) =>
        t.id === editingTaskId
          ? { ...t, title: newTaskTitle.trim(), dur: newTaskDur.trim() || '30 mins', priority: newTaskPriority }
          : t
      );
      updateActiveRoadmap((r) => ({
        ...r,
        tasks: { ...(r.tasks || {}), [currentDay]: updated }
      }));
      // If this task was linked to the timer, update the timer duration too
      if (activeTaskId === editingTaskId) {
        const durStr = newTaskDur.trim() || '30 mins';
        const hourMatch = durStr.match(/(\d+)\s*hour/i);
        const minMatch = durStr.match(/(\d+)\s*min/i);
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

  // Notes action
  const handleNoteChange = (text) => {
    updateActiveRoadmap((r) => ({
      ...r,
      notes: { ...(r.notes || {}), [currentDay]: text }
    }));

    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      if (appData && activeRoadmap && appData.syncUrl) {
        syncWithCloud(appData.syncUrl, activeRoadmap, currentDay);
      }
    }, 2000);
  };

  // Open Edit Day Topic Modal
  const openEditDayModal = (dayNum) => {
    setEditDayNumber(dayNum);
    let currentTopic = '';
    if (activeRoadmap && activeRoadmap.phases) {
      for (const p of activeRoadmap.phases) {
        const found = p.days.find((d) => d.day === dayNum);
        if (found) {
          currentTopic = found.topic;
          break;
        }
      }
    }
    setEditDayTopicDraft(currentTopic);
    setEditDayModal(true);
  };

  // Save edited day topic
  const saveEditedDayTopic = () => {
    if (!activeRoadmap) return;
    const updatedPhases = activeRoadmap.phases.map((phase) => {
      if (editDayNumber >= phase.startDay && editDayNumber <= phase.endDay) {
        return {
          ...phase,
          days: phase.days.map((d) =>
            d.day === editDayNumber ? { ...d, topic: editDayTopicDraft.trim() || `Day ${editDayNumber}` } : d
          )
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
      Alert.alert('Title required', 'Please enter a title for your roadmap.');
      return;
    }
    const days = parseInt(formTotalDays, 10) || 30;
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
    Alert.alert('Template Added! 🎉', `"${fresh.title}" has been added to your roadmaps.`);
    setActiveTab('today');
  };

  // Open Edit Roadmap Info
  const openEditRoadmap = (r) => {
    setEditingRoadmapId(r.id);
    setFormTitle(r.title);
    setFormDesc(r.description || '');
    setFormCategory(r.category || CATEGORIES[0]);
    setFormIcon(r.icon || '🎯');
    setFormColor(r.color || COLOR_PALETTE[0]);
    setEditRoadmapModal(true);
  };

  // Save Roadmap Info Edits
  const handleSaveRoadmapEdits = () => {
    if (!editingRoadmapId || !formTitle.trim()) return;
    setAppData((prev) => ({
      ...prev,
      roadmaps: prev.roadmaps.map((r) => {
        if (r.id === editingRoadmapId) {
          return {
            ...r,
            title: formTitle.trim(),
            description: formDesc.trim(),
            category: formCategory,
            icon: formIcon,
            color: formColor
          };
        }
        return r;
      })
    }));
    setEditRoadmapModal(false);
  };

  // Duplicate Roadmap
  const duplicateRoadmap = (r) => {
    const clone = {
      ...r,
      id: 'roadmap_' + Date.now(),
      title: `${r.title} (Copy)`,
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
    Alert.alert('Roadmap Duplicated', `Created a copy of "${r.title}".`);
  };

  // Delete Roadmap
  const deleteRoadmap = (r) => {
    if (appData.roadmaps.length <= 1) {
      Alert.alert('Cannot delete', 'You need to have at least one roadmap active.');
      return;
    }
    Alert.alert('Delete Roadmap?', `Are you sure you want to delete "${r.title}"? All progress in this roadmap will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
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
      'Reset Progress?',
      `Reset completed days, notes, and tasks for "${activeRoadmap.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Progress',
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
      'Reset All App Data?',
      'This will erase all roadmaps and reset to default templates.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Factory Reset',
          style: 'destructive',
          onPress: () => {
            const initial = getInitialAppState();
            setAppData(initial);
          }
        }
      ]
    );
  };

  // Export / Backup JSON
  const handleExportData = () => {
    const json = JSON.stringify(appData, null, 2);
    setBackupText(json);
    setBackupModal(true);
  };

  const handleImportData = () => {
    try {
      const parsed = JSON.parse(backupText);
      if (parsed && Array.isArray(parsed.roadmaps)) {
        setAppData(parsed);
        setBackupModal(false);
        Alert.alert('Backup Restored! 🎉', 'Your roadmaps have been restored successfully.');
      } else {
        Alert.alert('Invalid Format', 'JSON must include roadmaps array.');
      }
    } catch (e) {
      Alert.alert('Import Failed', 'Invalid JSON string provided.');
    }
  };

  // ================= AI HANDLERS (Gemini + OpenAI Integration) =================
  const openAISettings = () => {
    const prov = appData?.aiConfig?.provider || 'gemini';
    setAiProviderDraft(prov);
    setAiKeyDraft(appData?.aiConfig?.apiKey || '');
    setAiModelDraft(appData?.aiConfig?.model || (prov === 'openai' ? 'gpt-4o-mini' : 'gemini-1.5-flash'));
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
        model: aiModelDraft
      }
    }));
    setAiSettingsModal(false);
    Alert.alert('AI Config Saved', `${aiProviderDraft === 'gemini' ? 'Google Gemini' : 'OpenAI'} configuration updated.`);
  };

  const handleTestApiKey = async () => {
    if (!aiKeyDraft.trim()) {
      Alert.alert('Empty Key', `Please enter your ${aiProviderDraft === 'gemini' ? 'Google Gemini' : 'OpenAI'} API key.`);
      return;
    }
    setAiValidating(true);
    setAiValidationStatus(null);
    const result = await validateApiKey(aiKeyDraft.trim(), aiProviderDraft);
    setAiValidating(false);
    if (result.valid) {
      setAiValidationStatus({ valid: true, msg: `${aiProviderDraft === 'gemini' ? 'Google Gemini' : 'OpenAI'} API Key is valid and active!` });
    } else {
      setAiValidationStatus({ valid: false, msg: result.error || 'Connection failed.' });
    }
  };

  const openAIRoadmapModal = () => {
    setAiPrompt('');
    setAiTotalDays('30');
    setAiLevel('Beginner');
    setAiFocus('Practical Labs & Projects');
    setAiRoadmapModal(true);
  };

  const handleGenerateAIRoadmap = async () => {
    if (!aiPrompt.trim()) {
      Alert.alert('Goal Required', 'Please enter what you want to learn or master.');
      return;
    }
    setAiGeneratingRoadmap(true);
    try {
      const apiKey = appData?.aiConfig?.apiKey || '';
      const provider = appData?.aiConfig?.provider || 'gemini';
      const model = appData?.aiConfig?.model || (provider === 'openai' ? 'gpt-4o-mini' : 'gemini-1.5-flash');
      const newRoadmap = await generateRoadmapWithAI({
        prompt: aiPrompt,
        totalDays: parseInt(aiTotalDays, 10) || 30,
        experienceLevel: aiLevel,
        focusArea: aiFocus,
        apiKey,
        provider,
        model
      });

      setAppData((prev) => ({
        ...prev,
        roadmaps: [newRoadmap, ...prev.roadmaps],
        activeRoadmapId: newRoadmap.id
      }));

      setAiRoadmapModal(false);
      setActiveTab('today');
      Alert.alert(
        '🎉 Roadmap Created!',
        `"${newRoadmap.title}" (${newRoadmap.totalDays} Days) has been generated and set as your active focus roadmap!`
      );
    } catch (err) {
      Alert.alert('Generation Failed', err.message || 'Could not generate roadmap.');
    } finally {
      setAiGeneratingRoadmap(false);
    }
  };

  const openAILessonModal = () => {
    setAiLessonModal(true);
  };

  // Pick Document File (.txt, .md, .doc, .json) using DocumentPicker + FileSystem
  const handlePickDocumentFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/*', 'application/json', '*/*'],
        copyToCacheDirectory: true,
        multiple: false
      });
      const asset = result.assets ? result.assets[0] : (result.canceled ? null : result);
      if (!asset || asset.canceled) return;

      const content = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8
      });
      if (!content || !content.trim()) {
        Alert.alert('Empty File', 'The selected file does not contain readable text.');
        return;
      }
      setAiUploadDraft(content);
      setAiUploadedFileName(asset.name || 'Document');
      Alert.alert(
        'Document Loaded! 📄',
        `Imported "${asset.name}" (${content.length} characters, ~${Math.round(content.length / 5)} words).\n\nTap "Save Document" to attach as reference context or "Save & Generate AI Lesson Now"!`
      );
    } catch (err) {
      Alert.alert('Import Failed', err.message || 'Could not read document file.');
    }
  };

  // Save Reference Document (Day, Global, or Direct Lesson)
  const handleSaveReferenceDoc = (target = aiUploadTarget) => {
    if (!aiUploadDraft.trim()) {
      Alert.alert('Empty Document', 'Please paste text or pick a document file.');
      return;
    }

    if (target === 'global') {
      updateActiveRoadmap((r) => ({
        ...r,
        globalReferenceDoc: aiUploadDraft.trim(),
        globalReferenceDocName: aiUploadedFileName || 'Roadmap HCIA Reference'
      }));
      setAiUploadModal(false);
      Alert.alert(
        'Global HCIA Document Saved! 🌐',
        `Saved as roadmap-wide reference (${aiUploadDraft.trim().length} chars). All daily AI lessons will synthesize this material!`
      );
    } else if (target === 'lesson') {
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
      Alert.alert('Lesson Saved 📝', `Direct custom lesson saved for Day ${currentDay}.`);
    } else {
      // Day reference doc (default)
      updateActiveRoadmap((r) => ({
        ...r,
        referenceDocs: {
          ...(r.referenceDocs || {}),
          [currentDay]: {
            content: aiUploadDraft.trim(),
            name: aiUploadedFileName || `Day ${currentDay} Reference`,
            updatedAt: new Date().toISOString()
          }
        }
      }));
      setAiUploadModal(false);
      Alert.alert(
        'Day Reference Saved! 📄',
        `Day ${currentDay} reference document saved (${aiUploadDraft.trim().length} chars).\n\nWhen you tap "Generate Lesson", the AI will directly analyze and cite this document!`
      );
    }
  };

  const handleSaveAndGenerateNow = async () => {
    if (!aiUploadDraft.trim()) {
      Alert.alert('Empty Document', 'Please paste text or pick a document file.');
      return;
    }
    const docText = aiUploadDraft.trim();
    const docName = aiUploadedFileName || `Day ${currentDay} Reference`;

    // Save as day reference doc
    updateActiveRoadmap((r) => ({
      ...r,
      referenceDocs: {
        ...(r.referenceDocs || {}),
        [currentDay]: {
          content: docText,
          name: docName,
          updatedAt: new Date().toISOString()
        }
      }
    }));
    setAiUploadModal(false);

    // Immediately trigger lesson generation with this document
    await triggerLessonGenerationWithContext(docText);
  };

  const triggerLessonGenerationWithContext = async (contextOverride) => {
    setAiLessonLoading(true);
    try {
      const apiKey = appData?.aiConfig?.apiKey || '';
      const provider = appData?.aiConfig?.provider || 'gemini';
      const model = appData?.aiConfig?.model || (provider === 'openai' ? 'gpt-4o-mini' : 'gemini-1.5-flash');

      const dayDocObj = activeRoadmap?.referenceDocs?.[currentDay];
      const dayDoc = typeof dayDocObj === 'string' ? dayDocObj : (dayDocObj?.content || '');
      const globalDoc = activeRoadmap?.globalReferenceDoc || '';
      const customContext = contextOverride || dayDoc || globalDoc || '';

      const lesson = await generateLessonContentWithAI({
        roadmapTitle: activeRoadmap.title,
        day: currentDay,
        topic: currentDayInfo.topic,
        apiKey,
        provider,
        model,
        customContext
      });

      updateActiveRoadmap((r) => ({
        ...r,
        lessons: { ...(r.lessons || {}), [currentDay]: lesson }
      }));
    } catch (err) {
      Alert.alert('Lesson Generation Error', err.message || 'Could not generate lesson.');
    } finally {
      setAiLessonLoading(false);
    }
  };

  const handleGenerateAILesson = async () => {
    await triggerLessonGenerationWithContext();
  };

  const handleSaveCustomLesson = () => {
    handleSaveReferenceDoc('lesson');
  };

  const openAIPracticeModal = () => {
    setAiPracticeModal(true);
  };

  const handleGenerateAIPractice = async () => {
    setAiPracticeLoading(true);
    try {
      const apiKey = appData?.aiConfig?.apiKey || '';
      const provider = appData?.aiConfig?.provider || 'gemini';
      const model = appData?.aiConfig?.model || (provider === 'openai' ? 'gpt-4o-mini' : 'gemini-1.5-flash');
      const lessonContent = currentDayLesson ? currentDayLesson.content : '';

      const dayDocObj = activeRoadmap?.referenceDocs?.[currentDay];
      const dayDoc = typeof dayDocObj === 'string' ? dayDocObj : (dayDocObj?.content || '');
      const globalDoc = activeRoadmap?.globalReferenceDoc || '';
      const customContext = dayDoc || globalDoc || '';

      const practice = await generatePracticeAndQuizWithAI({
        roadmapTitle: activeRoadmap.title,
        day: currentDay,
        topic: currentDayInfo.topic,
        lessonContent,
        customContext,
        apiKey,
        provider,
        model
      });

      updateActiveRoadmap((r) => ({
        ...r,
        quizzes: { ...(r.quizzes || {}), [currentDay]: practice }
      }));
      setQuizAnswers({});
    } catch (err) {
      Alert.alert('Practice Generation Error', err.message || 'Could not generate practice.');
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
    const formatted = practiceTasks.map((t, idx) => ({
      id: 'task_ai_' + Date.now() + '_' + idx,
      title: t.title,
      dur: t.dur || '25 mins',
      priority: t.priority || 'Medium',
      done: false
    }));

    updateActiveRoadmap((r) => ({
      ...r,
      tasks: { ...(r.tasks || {}), [currentDay]: [...dayTasks, ...formatted] }
    }));

    Alert.alert(
      'Tasks Imported! ⏱',
      `${formatted.length} tasks added to Day ${currentDay}.\nTap ▶ Focus on any task to link it to your Routine Timer!`
    );
  };

  if (!appData || !activeRoadmap) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <StatusBar style="light" />
        <Text style={{ color: '#94a3b8', fontSize: 16 }}>Loading your life roadmaps...</Text>
      </View>
    );
  }

  const accentColor = activeRoadmap.color || '#10b981';

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        
        {/* ================= MODERN TOP BAR (CLEAN DYNAMIC ISLAND CLEARANCE) ================= */}
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
                  {activeRoadmap.category} · {activeRoadmap.totalDays} Days
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
                  {reminderEnabled ? reminderTimeDraft : 'Off'}
                </Text>
              </TouchableOpacity>

              <View style={[styles.badgePill, styles.streakPill]}>
                <Text style={{ fontSize: 12 }}>🔥</Text>
                <Text style={styles.streakPillText}>
                  {appData.streak ? appData.streak.count || 0 : 0}d
                </Text>
              </View>
            </View>
          </View>

          {/* Bottom Row of Header: Progress Track & Info */}
          <View style={styles.topHeaderProgressRow}>
            <View style={styles.rowBetween}>
              <Text style={styles.progressLabel}>
                Day {activeRoadmap.currentDay} of {activeRoadmap.totalDays}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.progressPctText, { color: accentColor }]}>
                  {activeRoadmapDoneCount}/{activeRoadmap.totalDays} ({activeRoadmapPct}%)
                </Text>
                <Text style={styles.offlineText}>• ⚡ Offline</Text>
              </View>
            </View>
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarThumb, { width: `${activeRoadmapPct}%`, backgroundColor: accentColor }]} />
            </View>
          </View>
        </View>

        {/* ================= TAB CONTENT ================= */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 110 }}
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
                      <Text style={styles.alertBannerTitle}>It's Study Time!</Text>
                      <Text style={styles.alertBannerSub}>
                        Daily focus session ({reminderTimeDraft}) is waiting.
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
                      <Text style={styles.btnPrimaryText}>▶ Start Session</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btnPrimary, styles.btnGray]}
                      onPress={() => setStudyAlertVisible(false)}
                    >
                      <Text style={styles.btnPrimaryText}>Dismiss</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Hero Day Focus Card */}
              <View style={[styles.heroCard, { borderColor: `${accentColor}33` }]}>
                <View style={styles.rowBetween}>
                  <View style={[styles.phaseTag, { backgroundColor: `${accentColor}20` }]}>
                    <Text style={[styles.phaseTagText, { color: accentColor }]}>
                      {currentDayInfo.phaseTitle || `Phase · Day ${currentDay}`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.editIconBtn}
                    onPress={() => openEditDayModal(currentDay)}
                  >
                    <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '600' }}>✎ Edit Topic</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.heroTopic}>{currentDayInfo.topic}</Text>
                <Text style={styles.heroSub}>
                  Day {currentDay} of {activeRoadmap.totalDays} · {activeRoadmap.category}
                </Text>

                {/* AI Study Superchargers Row */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <TouchableOpacity
                    style={[
                      styles.aiHeroActionBtn,
                      { borderColor: currentDayLesson ? `${accentColor}88` : '#334155', backgroundColor: currentDayLesson ? `${accentColor}18` : '#131d33' }
                    ]}
                    onPress={openAILessonModal}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 16 }}>📖</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.aiHeroActionTitle, { color: '#fff' }]}>Course Lesson</Text>
                      <Text style={[styles.aiHeroActionSub, { color: currentDayLesson ? accentColor : '#94a3b8' }]}>
                        {currentDayLesson ? '✓ Lesson Ready' : 'AI Generate / Upload'}
                      </Text>
                    </View>
                    <Text style={{ color: accentColor, fontSize: 12, fontWeight: '800' }}>›</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.aiHeroActionBtn,
                      { borderColor: currentDayQuiz ? '#8b5cf688' : '#334155', backgroundColor: currentDayQuiz ? '#8b5cf618' : '#131d33' }
                    ]}
                    onPress={openAIPracticeModal}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 16 }}>⚡</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.aiHeroActionTitle, { color: '#fff' }]}>Practice & Quiz</Text>
                      <Text style={[styles.aiHeroActionSub, { color: currentDayQuiz ? '#a78bfa' : '#94a3b8' }]}>
                        {currentDayQuiz ? '✓ Lab & Quiz Ready' : 'AI Lab Challenge'}
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
                      <Text style={styles.navBtnText}>‹ Prev</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => jumpToDay(currentDay + 1)}
                      style={[styles.smallNavBtn, currentDay >= activeRoadmap.totalDays && styles.btnDisabled]}
                      disabled={currentDay >= activeRoadmap.totalDays}
                    >
                      <Text style={styles.navBtnText}>Next ›</Text>
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
                      {isCurrentDayDone ? '✓ Day Completed' : 'Mark Completed'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Routine / Pomodoro Focus Timer */}
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>⏱ Focus & Routine Timer</Text>
                  <TouchableOpacity onPress={openTimerSettings}>
                    <Text style={{ color: '#64748b', fontSize: 12, fontWeight: '600' }}>⚙️ Modes</Text>
                  </TouchableOpacity>
                </View>

                {/* Active Task Banner */}
                {activeTaskId && (() => {
                  const linked = dayTasks.find((t) => t.id === activeTaskId);
                  return linked ? (
                    <View style={[styles.activeTaskBanner, { borderColor: `${accentColor}66`, backgroundColor: `${accentColor}18` }]}>
                      <Text style={{ fontSize: 14 }}>🎯</Text>
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={{ color: '#94a3b8', fontSize: 10, fontWeight: '600' }}>LINKED TASK</Text>
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
                        {m.label.toUpperCase()} ({m.dur}m)
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
                        const linked = activeTaskId ? dayTasks.find((t) => t.id === activeTaskId) : null;
                        if (linked) {
                          const durMins = Math.ceil(timerLeft / 60);
                          sendTaskStartNotification(linked.title, durMins);
                        }
                      }
                    }}
                  >
                    <Text style={styles.btnPrimaryText}>
                      {isTimerRunning ? '⏸ Pause' : '▶ Start Session'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnPrimary, styles.btnGray]}
                    onPress={() => {
                      if (activeTaskId) {
                        // Reset to linked task duration
                        const linked = dayTasks.find((t) => t.id === activeTaskId);
                        if (linked) {
                          handleSelectTask(linked);
                          return;
                        }
                      }
                      const cur = routineModes.find((m) => m.label === activeTimerMode) || routineModes[0];
                      selectTimerMode(cur);
                    }}
                  >
                    <Text style={styles.btnPrimaryText}>Reset</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Daily Tasks Checklist */}
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>✅ Day {currentDay} Action Tasks</Text>
                  <TouchableOpacity
                    style={[styles.btnSmall, { backgroundColor: accentColor }]}
                    onPress={openAddTask}
                  >
                    <Text style={styles.btnSmallText}>+ Add Task</Text>
                  </TouchableOpacity>
                </View>

                {dayTasks.length === 0 ? (
                  <Text style={styles.emptyNote}>No tasks added for Day {currentDay} yet. Tap + Add Task above!</Text>
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
                              {task.priority}
                            </Text>
                          )}
                        </View>
                      </View>

                      {/* ✎ Edit + ▶ Focus + 🗑 Delete row */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        {/* ✎ Edit button */}
                        <TouchableOpacity
                          onPress={() => openEditTask(task)}
                          style={[styles.taskFocusBtn, { backgroundColor: '#172338' }]}
                        >
                          <Text style={{ color: '#94a3b8', fontSize: 12 }}>✎</Text>
                        </TouchableOpacity>

                        {/* ▶ Focus button (only for incomplete tasks) */}
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

                        {/* 🗑 Delete */}
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
                        <Text style={[styles.cardTitle, { fontSize: 13 }]}>Day {currentDay} Notes & Journal</Text>
                        <Text style={{ color: currentDayNote ? '#34d399' : '#64748b', fontSize: 11, marginTop: 1 }}>
                          {currentDayNote ? `${currentDayNote.length} characters logged` : 'No notes written yet'}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[styles.btnSmall, { backgroundColor: accentColor }]}
                      onPress={() => setFullNoteModal(true)}
                    >
                      <Text style={styles.btnSmallText}>📖 Full Page</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Clean 3-line truncated preview or tap prompt */}
                  <TouchableOpacity
                    style={styles.notePreviewBox}
                    onPress={() => setFullNoteModal(true)}
                    activeOpacity={0.8}
                  >
                    {currentDayNote.trim() ? (
                      <Text style={styles.notePreviewText} numberOfLines={3}>
                        {currentDayNote}
                      </Text>
                    ) : (
                      <Text style={{ color: '#475569', fontSize: 12, fontStyle: 'italic', lineHeight: 18 }}>
                        Tap here or hit "Full Page" to open the distraction-free full-screen editor, log commands, or insert AI lesson summaries...
                      </Text>
                    )}
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 }}>
                      <Text style={{ color: accentColor, fontSize: 11, fontWeight: '700' }}>
                        ✎ Tap to open & edit full screen ›
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* TAB 2: ROADMAPS HUB */}
          {activeTab === 'roadmaps' && (
            <View>
              <View style={[styles.rowBetween, { marginBottom: 14 }]}>
                <View>
                  <Text style={styles.h1}>Life & Study Roadmaps</Text>
                  <Text style={styles.sub}>{appData.roadmaps.length} active roadmaps</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    style={[styles.btnPrimary, { backgroundColor: '#8b5cf6', paddingHorizontal: 12, paddingVertical: 8 }]}
                    onPress={openAIRoadmapModal}
                  >
                    <Text style={styles.btnPrimaryText}>✨ AI Generator</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnPrimary, { backgroundColor: '#10b981', paddingHorizontal: 12, paddingVertical: 8 }]}
                    onPress={openCreateRoadmap}
                  >
                    <Text style={styles.btnPrimaryText}>+ Manual</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* List of Roadmaps */}
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
                      isSelected && { borderColor: rColor, borderWidth: 1.5 }
                    ]}
                  >
                    <View style={styles.rowBetween}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                        <Text style={{ fontSize: 26 }}>{r.icon || '🎯'}</Text>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.roadmapCardTitle}>{r.title}</Text>
                            {isSelected && (
                              <View style={[styles.activePill, { backgroundColor: `${rColor}22` }]}>
                                <Text style={[styles.activePillText, { color: rColor }]}>Active</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.roadmapCardCategory}>{r.category} · {tot} Days</Text>
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
                          Progress: Day {r.currentDay || 1} of {tot}
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
                          {isSelected ? '✓ In Focus' : 'Open Focus'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.actionChip} onPress={() => openEditRoadmap(r)}>
                        <Text style={{ color: '#94a3b8', fontSize: 12 }}>✎ Edit</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.actionChip} onPress={() => duplicateRoadmap(r)}>
                        <Text style={{ color: '#94a3b8', fontSize: 12 }}>📋 Copy</Text>
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

              {/* Ready-to-Use Templates */}
              <View style={{ marginTop: 24, marginBottom: 10 }}>
                <Text style={styles.h2}>📚 Ready-Made Templates</Text>
                <Text style={styles.sub}>Start a proven life or career roadmap with 1-tap</Text>
              </View>

              {TEMPLATE_LIST.map((tmpl) => (
                <View key={tmpl.id} style={styles.templateCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <Text style={{ fontSize: 24 }}>{tmpl.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.roadmapCardTitle}>{tmpl.title}</Text>
                      <Text style={styles.sub}>{tmpl.days} Days · {tmpl.category}</Text>
                      <Text style={[styles.sub, { marginTop: 4 }]} numberOfLines={2}>{tmpl.desc}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.btnSmall, { backgroundColor: tmpl.color, alignSelf: 'center', marginTop: 8 }]}
                    onPress={() => addPresetRoadmap(tmpl)}
                  >
                    <Text style={styles.btnSmallText}>+ Use Template</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* TAB 3: TIMELINE & CURRICULUM VIEW */}
          {activeTab === 'timeline' && (
            <View>
              <View style={[styles.rowBetween, { marginBottom: 12 }]}>
                <View>
                  <Text style={styles.h1}>Timeline & Milestones</Text>
                  <Text style={styles.sub}>
                    {activeRoadmap.title} · {activeRoadmap.totalDays} Days Overview
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.btnSmall, { backgroundColor: accentColor }]}
                  onPress={() => openEditDayModal(currentDay)}
                >
                  <Text style={styles.btnSmallText}>✎ Edit Day</Text>
                </TouchableOpacity>
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
                          Days {phase.startDay}–{phase.endDay}
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
              <Text style={styles.h1}>Settings & Life Tools</Text>
              <Text style={[styles.sub, { marginBottom: 14 }]}>
                AI ChatGPT engine, study alarms & offline cloud sync
              </Text>

              {/* OpenAI ChatGPT Integration Card */}
              <View style={[styles.card, { borderColor: appData.aiConfig?.apiKey ? '#10b98166' : '#8b5cf666', borderWidth: 1.5 }]}>
                <View style={styles.rowBetween}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <Text style={{ fontSize: 26 }}>🤖</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>OpenAI ChatGPT Engine</Text>
                      <Text style={{ color: appData.aiConfig?.apiKey ? '#34d399' : '#a78bfa', fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                        {appData.aiConfig?.apiKey
                          ? `🟢 Connected · ${appData.aiConfig?.model || DEFAULT_AI_MODEL}`
                          : '⚪ Key Not Set (Using Demo Preview)'}
                      </Text>
                    </View>
                  </View>
                </View>

                <Text style={[styles.sub, { marginTop: 8, lineHeight: 18 }]}>
                  Powers 3 AI Features: Custom Roadmap Generator, Daily Course Lesson Creator, and Practice Lab & Quiz Generator.
                </Text>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <TouchableOpacity
                    style={[styles.btnPrimary, { flex: 1, backgroundColor: '#8b5cf6' }]}
                    onPress={openAISettings}
                  >
                    <Text style={styles.btnPrimaryText}>⚙️ Configure Key & Model</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.btnPrimary, { backgroundColor: '#1e293b', borderColor: '#475569', borderWidth: 1 }]}
                    onPress={() => setAiPaymentGuideModal(true)}
                  >
                    <Text style={[styles.btnPrimaryText, { color: '#cbd5e1' }]}>💳 Payment Guide</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Study Alarm Card */}
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 20 }}>⏰</Text>
                    <View>
                      <Text style={styles.cardTitle}>Daily Study Alarm</Text>
                      <Text style={styles.sub}>
                        {reminderEnabled ? `Alert set for ${reminderTimeDraft} every day` : 'Reminder currently disabled'}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.btnSmall, { backgroundColor: accentColor }]}
                    onPress={() => setReminderModal(true)}
                  >
                    <Text style={styles.btnSmallText}>Change</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Stats Overview Card */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>📊 Consistency Stats</Text>
                <View style={[styles.rowBetween, { marginTop: 12 }]}>
                  <View style={styles.statBox}>
                    <Text style={styles.statNumber}>🔥 {appData.streak ? appData.streak.count || 0 : 0}</Text>
                    <Text style={styles.statLabel}>Day Streak</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statNumber}>🗺️ {appData.roadmaps.length}</Text>
                    <Text style={styles.statLabel}>Total Roadmaps</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statNumber}>
                      ✅ {appData.roadmaps.reduce((acc, r) => acc + (r.doneDays ? r.doneDays.length : 0), 0)}
                    </Text>
                    <Text style={styles.statLabel}>Days Conquered</Text>
                  </View>
                </View>
              </View>

              {/* Offline & Account Info Card */}
              <View style={[styles.card, { borderColor: '#10b98133' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 20 }}>⚡</Text>
                  <Text style={[styles.cardTitle, { color: '#34d399' }]}>100% Offline & Private</Text>
                </View>
                <Text style={[styles.sub, { marginTop: 6, lineHeight: 18 }]}>
                  All your data, checklists, lab notes, and streaks are saved directly on your phone storage. No accounts, logins, or internet connection needed.
                </Text>
              </View>

              {/* Cloud Sync Card */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>☁️ Cloud & Google Sheets Sync (Optional)</Text>
                <Text style={[styles.sub, { marginVertical: 6 }]}>
                  Optionally paste your Google Apps Script webhook URL to sync notes and progress to your personal Google Sheet.
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
                      Alert.alert('Saved!', 'Cloud sync webhook updated.');
                    }}
                  >
                    <Text style={styles.btnPrimaryText}>Save Webhook URL</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Backup & Restore */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>💾 Backup & Restore</Text>
                <Text style={[styles.sub, { marginVertical: 6 }]}>
                  Export all your roadmaps and journal notes as JSON to keep safe or transfer to another phone.
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                  <TouchableOpacity
                    style={[styles.btnPrimary, styles.btnGray, { flex: 1 }]}
                    onPress={handleExportData}
                  >
                    <Text style={styles.btnPrimaryText}>📋 Export JSON</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnPrimary, styles.btnGray, { flex: 1 }]}
                    onPress={() => {
                      setBackupText('');
                      setBackupModal(true);
                    }}
                  >
                    <Text style={styles.btnPrimaryText}>📥 Import JSON</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Reset Actions */}
              <View style={[styles.card, { borderColor: '#ef444433' }]}>
                <Text style={[styles.cardTitle, { color: '#f87171' }]}>⚠️ Reset Zone</Text>
                <Text style={[styles.sub, { marginVertical: 6 }]}>
                  Reset active roadmap progress or reset the entire app to initial templates.
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                  <TouchableOpacity
                    style={[styles.btnPrimary, { flex: 1, backgroundColor: '#334155' }]}
                    onPress={resetCurrentRoadmapProgress}
                  >
                    <Text style={[styles.btnPrimaryText, { color: '#fca5a5' }]}>Reset Active Roadmap</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnPrimary, { backgroundColor: '#7f1d1d', paddingHorizontal: 12 }]}
                    onPress={factoryResetAll}
                  >
                    <Text style={styles.btnPrimaryText}>Factory Reset</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* ================= MODERN BOTTOM NAVIGATION (IPHONE HOME BAR SAFE) ================= */}
        <View style={styles.bottomNav}>
          <TouchableOpacity
            style={[styles.navTab, activeTab === 'today' && styles.navTabActive]}
            onPress={() => setActiveTab('today')}
          >
            <Text style={{ fontSize: 20 }}>⚡</Text>
            <Text style={[styles.navLabel, activeTab === 'today' && { color: accentColor }]}>Focus</Text>
            {activeTab === 'today' && <View style={[styles.activeDot, { backgroundColor: accentColor }]} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navTab, activeTab === 'roadmaps' && styles.navTabActive]}
            onPress={() => setActiveTab('roadmaps')}
          >
            <Text style={{ fontSize: 20 }}>🗺️</Text>
            <Text style={[styles.navLabel, activeTab === 'roadmaps' && { color: accentColor }]}>Roadmaps</Text>
            {activeTab === 'roadmaps' && <View style={[styles.activeDot, { backgroundColor: accentColor }]} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navTab, activeTab === 'timeline' && styles.navTabActive]}
            onPress={() => setActiveTab('timeline')}
          >
            <Text style={{ fontSize: 20 }}>📅</Text>
            <Text style={[styles.navLabel, activeTab === 'timeline' && { color: accentColor }]}>Timeline</Text>
            {activeTab === 'timeline' && <View style={[styles.activeDot, { backgroundColor: accentColor }]} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navTab, activeTab === 'settings' && styles.navTabActive]}
            onPress={() => {
              setSyncUrlDraft(appData.syncUrl || '');
              setActiveTab('settings');
            }}
          >
            <Text style={{ fontSize: 20 }}>⚙️</Text>
            <Text style={[styles.navLabel, activeTab === 'settings' && { color: accentColor }]}>Settings</Text>
            {activeTab === 'settings' && <View style={[styles.activeDot, { backgroundColor: accentColor }]} />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ================= MODAL: STUDY ALARM & NOTIFICATION PICKER ================= */}
      <Modal visible={reminderModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.rowBetween}>
                <Text style={styles.h1}>⏰ Daily Study Alarm</Text>
                <TouchableOpacity onPress={() => setReminderModal(false)}>
                  <Text style={{ color: '#94a3b8', fontSize: 18 }}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.sub, { marginVertical: 8 }]}>
                Set a daily study time. You'll get a phone notification + in-app banner so you never miss a session!
              </Text>

              {/* Toggle Enable/Disable */}
              <View style={[styles.rowBetween, { backgroundColor: '#090f1d', padding: 12, borderRadius: 10, marginVertical: 8 }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Enable Daily Alert</Text>
                <TouchableOpacity
                  style={[
                    styles.choiceChip,
                    reminderEnabled ? { backgroundColor: '#10b981' } : { backgroundColor: '#334155' }
                  ]}
                  onPress={() => setReminderEnabled(!reminderEnabled)}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>{reminderEnabled ? 'ON' : 'OFF'}</Text>
                </TouchableOpacity>
              </View>

              {/* Quick Preset Hours */}
              <Text style={styles.inputLabel}>Quick Select Time</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {[
                  { label: '07:00 AM', time: '07:00' },
                  { label: '09:00 AM', time: '09:00' },
                  { label: '12:00 PM', time: '12:00' },
                  { label: '06:00 PM', time: '18:00' },
                  { label: '08:00 PM', time: '20:00' },
                  { label: '09:30 PM', time: '21:30' },
                  { label: '10:00 PM', time: '22:00' }
                ].map((p) => (
                  <TouchableOpacity
                    key={p.time}
                    style={[
                      styles.choiceChip,
                      reminderTimeDraft === p.time && { backgroundColor: accentColor, borderColor: accentColor }
                    ]}
                    onPress={() => setReminderTimeDraft(p.time)}
                  >
                    <Text style={{ color: reminderTimeDraft === p.time ? '#fff' : '#cbd5e1', fontSize: 12 }}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Custom Time Input */}
              <Text style={styles.inputLabel}>Custom Time (24h format HH:MM)</Text>
              <TextInput
                style={styles.input}
                value={reminderTimeDraft}
                onChangeText={setReminderTimeDraft}
                placeholder="e.g. 20:30"
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
                    '🔔 Test Alarm Sent!',
                    `A real phone notification will appear in ~3 seconds.\nThis is exactly how your ${reminderTimeDraft} alarm will look!`,
                    [
                      { text: 'Start Session Now', onPress: () => setIsTimerRunning(true) },
                      { text: 'Got it!', style: 'cancel' }
                    ]
                  );
                }}
              >
                <Text style={styles.btnPrimaryText}>🔔 Test Phone Notification</Text>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <TouchableOpacity
                  style={[styles.btnPrimary, styles.btnGray]}
                  onPress={() => setReminderModal(false)}
                >
                  <Text style={styles.btnPrimaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnPrimary, { backgroundColor: accentColor }]}
                  onPress={handleSaveReminder}
                >
                  <Text style={styles.btnPrimaryText}>Save Alarm</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>


      {/* ================= MODAL: CREATE CUSTOM ROADMAP ================= */}
      <Modal visible={createRoadmapModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.rowBetween}>
                <Text style={styles.h1}>Create New Roadmap</Text>
                <TouchableOpacity onPress={() => setCreateRoadmapModal(false)}>
                  <Text style={{ color: '#94a3b8', fontSize: 18 }}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.sub, { marginBottom: 12 }]}>
                Design a custom timeline for study, career, fitness, or daily life.
              </Text>

              <Text style={styles.inputLabel}>Roadmap Title *</Text>
              <TextInput
                style={styles.input}
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder="e.g. Master Cloud Architecture & AWS"
                placeholderTextColor="#64748b"
              />

              <Text style={styles.inputLabel}>Goal / Description</Text>
              <TextInput
                style={styles.input}
                value={formDesc}
                onChangeText={setFormDesc}
                placeholder="What is your main target or daily habit?"
                placeholderTextColor="#64748b"
              />

              <Text style={styles.inputLabel}>Custom Timeline Duration (Days)</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {[
                  { label: '7 Days', val: '7' },
                  { label: '14 Days', val: '14' },
                  { label: '30 Days', val: '30' },
                  { label: '60 Days', val: '60' },
                  { label: '90 Days', val: '90' },
                  { label: '180 Days', val: '180' },
                  { label: '365 Days', val: '365' }
                ].map((preset) => (
                  <TouchableOpacity
                    key={preset.val}
                    style={[
                      styles.choiceChip,
                      formTotalDays === preset.val && { backgroundColor: formColor, borderColor: formColor }
                    ]}
                    onPress={() => setFormTotalDays(preset.val)}
                  >
                    <Text
                      style={{
                        color: formTotalDays === preset.val ? '#fff' : '#cbd5e1',
                        fontSize: 12,
                        fontWeight: '600'
                      }}
                    >
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={formTotalDays}
                onChangeText={setFormTotalDays}
                placeholder="Or type any number of days (e.g. 45, 100)"
                placeholderTextColor="#64748b"
              />

              <Text style={styles.inputLabel}>Organize Phases By</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <TouchableOpacity
                  style={[
                    styles.choiceChip,
                    { flex: 1 },
                    formPhaseGrouping === '7' && { backgroundColor: formColor, borderColor: formColor }
                  ]}
                  onPress={() => setFormPhaseGrouping('7')}
                >
                  <Text style={{ color: formPhaseGrouping === '7' ? '#fff' : '#cbd5e1', textAlign: 'center' }}>
                    7-Day Weekly Sprints
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.choiceChip,
                    { flex: 1 },
                    formPhaseGrouping === '30' && { backgroundColor: formColor, borderColor: formColor }
                  ]}
                  onPress={() => setFormPhaseGrouping('30')}
                >
                  <Text style={{ color: formPhaseGrouping === '30' ? '#fff' : '#cbd5e1', textAlign: 'center' }}>
                    30-Day Monthly Blocks
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Icon Emoji</Text>
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

              <Text style={styles.inputLabel}>Color Accent</Text>
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

              <Text style={styles.inputLabel}>Category</Text>
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
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.btnPrimary, styles.btnGray]}
                  onPress={() => setCreateRoadmapModal(false)}
                >
                  <Text style={styles.btnPrimaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnPrimary, { backgroundColor: formColor }]}
                  onPress={handleCreateRoadmap}
                >
                  <Text style={styles.btnPrimaryText}>Create Roadmap</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: EDIT ROADMAP INFO ================= */}
      <Modal visible={editRoadmapModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.h1}>Edit Roadmap</Text>
            <Text style={styles.inputLabel}>Title</Text>
            <TextInput
              style={styles.input}
              value={formTitle}
              onChangeText={setFormTitle}
              placeholderTextColor="#64748b"
            />
            <Text style={styles.inputLabel}>Description</Text>
            <TextInput
              style={styles.input}
              value={formDesc}
              onChangeText={setFormDesc}
              placeholderTextColor="#64748b"
            />
            <Text style={styles.inputLabel}>Icon Emoji</Text>
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
                <Text style={styles.btnPrimaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: formColor }]}
                onPress={handleSaveRoadmapEdits}
              >
                <Text style={styles.btnPrimaryText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: EDIT DAY TOPIC ================= */}
      <Modal visible={editDayModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.h1}>Edit Day {editDayNumber} Topic</Text>
            <Text style={[styles.sub, { marginBottom: 10 }]}>
              Customize what you focus on for this day.
            </Text>
            <TextInput
              style={styles.input}
              value={editDayTopicDraft}
              onChangeText={setEditDayTopicDraft}
              placeholder="e.g. OSPF Multi-Area Troubleshooting Lab"
              placeholderTextColor="#64748b"
              autoFocus
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.btnPrimary, styles.btnGray]}
                onPress={() => setEditDayModal(false)}
              >
                <Text style={styles.btnPrimaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: accentColor }]}
                onPress={saveEditedDayTopic}
              >
                <Text style={styles.btnPrimaryText}>Save Topic</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: ADD / EDIT TASK ================= */}
      <Modal visible={taskModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.rowBetween}>
              <Text style={styles.h1}>{editingTaskId ? '✎ Edit Task' : '➕ Add Task'}</Text>
              <TouchableOpacity onPress={() => {
                setTaskModal(false);
                setEditingTaskId(null);
              }}>
                <Text style={{ color: '#94a3b8', fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.sub, { marginBottom: 10 }]}>
              {editingTaskId ? 'Update this task for Day ' : 'Add a concrete step for Day '}{currentDay}
            </Text>

            <Text style={styles.inputLabel}>Task Name</Text>
            <TextInput
              style={styles.input}
              value={newTaskTitle}
              onChangeText={setNewTaskTitle}
              placeholder="e.g. Complete eNSP BGP Lab 1"
              placeholderTextColor="#64748b"
              autoFocus
            />

            <Text style={styles.inputLabel}>Duration</Text>
            {/* Quick Duration Chips */}
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
            {/* Free-text input for custom duration */}
            <TextInput
              style={styles.input}
              value={newTaskDur}
              onChangeText={setNewTaskDur}
              placeholder="Or type: e.g. 45 mins, 1 hour 30 mins"
              placeholderTextColor="#64748b"
            />

            <Text style={styles.inputLabel}>Priority</Text>
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
                    {p}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                style={[styles.btnPrimary, styles.btnGray]}
                onPress={() => { setTaskModal(false); setEditingTaskId(null); }}
              >
                <Text style={styles.btnPrimaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: accentColor }]}
                onPress={addTask}
              >
                <Text style={styles.btnPrimaryText}>{editingTaskId ? 'Save Changes' : 'Add Task'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: CLOUD SYNC CONFIG ================= */}
      <Modal visible={syncModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.h1}>Cloud Sync (Google Sheets / Webhook)</Text>
            <Text style={[styles.sub, { marginVertical: 8 }]}>
              Paste your Google Apps Script Web App URL to sync all notes, task progress, and days. Leave blank for 100% offline Local Mode.
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
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.btnPrimary, styles.btnGray]}
                onPress={() => setSyncModal(false)}
              >
                <Text style={styles.btnPrimaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: accentColor }]}
                onPress={() => {
                  setAppData((prev) => ({ ...prev, syncUrl: syncUrlDraft.trim() }));
                  syncWithCloud(syncUrlDraft.trim(), activeRoadmap, currentDay);
                  setSyncModal(false);
                }}
              >
                <Text style={styles.btnPrimaryText}>Save Sync</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: TIMER CUSTOM MODES (fully editable) ================= */}
      <Modal visible={timerSettingsModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '88%' }]}>
            <View style={styles.rowBetween}>
              <Text style={styles.h1}>⚙️ Routine Timer Modes</Text>
              <TouchableOpacity onPress={() => setTimerSettingsModal(false)}>
                <Text style={{ color: '#94a3b8', fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.sub, { marginBottom: 4 }]}>
              Tap ▶ to start a mode. Edit names & minutes directly.
            </Text>

            {/* ─── Logic explanation banner ─── */}
            <View style={{ backgroundColor: '#090f1d', borderRadius: 10, padding: 10, marginVertical: 8, borderWidth: 1, borderColor: '#1e293b' }}>
              <Text style={{ color: '#94a3b8', fontSize: 11, lineHeight: 16 }}>
                💡 <Text style={{ color: '#f8fafc', fontWeight: '700' }}>How it works:</Text>{' '}
                <Text style={{ color: '#fbbf24', fontWeight: '600' }}>Timer Modes</Text> = reusable session types (how you work).{' '}
                <Text style={{ color: accentColor, fontWeight: '600' }}>Task ▶ button</Text> = links a specific to-do item to the timer (what you’re working on). Both drive the same timer.
              </Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 340 }}>
              {routineModeDraft.map((mode, idx) => (
                <View
                  key={idx}
                  style={[styles.modeEditRow, activeTimerMode === mode.label && !activeTaskId && { borderColor: accentColor }]}
                >
                  {/* Editable name */}
                  <TextInput
                    style={styles.modeNameInput}
                    value={mode.label}
                    onChangeText={(val) => {
                      const next = [...routineModeDraft];
                      next[idx] = { ...next[idx], label: val };
                      setRoutineModeDraft(next);
                    }}
                    placeholder="Mode name"
                    placeholderTextColor="#475569"
                  />

                  {/* − min + controls */}
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
                      {mode.dur}m
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

                  {/* ▶ Select now */}
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

                  {/* 🗑 Delete mode */}
                  <TouchableOpacity
                    onPress={() => setRoutineModeDraft(routineModeDraft.filter((_, i) => i !== idx))}
                  >
                    <Text style={{ color: '#f87171', fontSize: 14, paddingLeft: 4 }}>🗑</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            {/* Add new mode */}
            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: '#172338', marginTop: 10, borderWidth: 1, borderColor: '#233550', borderStyle: 'dashed' }]}
              onPress={() => {
                setRoutineModeDraft([...routineModeDraft, { id: 'm_' + Date.now(), label: 'Custom', dur: 25 }]);
              }}
            >
              <Text style={{ color: '#94a3b8', fontWeight: '600', fontSize: 13 }}>+ Add Mode</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
              <TouchableOpacity
                style={[styles.btnPrimary, styles.btnGray]}
                onPress={() => setTimerSettingsModal(false)}
              >
                <Text style={styles.btnPrimaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: accentColor }]}
                onPress={saveRoutineModes}
              >
                <Text style={styles.btnPrimaryText}>✓ Save Modes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: BACKUP JSON ================= */}
      <Modal visible={backupModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '80%' }]}>
            <Text style={styles.h1}>JSON Backup / Restore</Text>
            <Text style={[styles.sub, { marginVertical: 6 }]}>
              Copy this JSON or paste your saved JSON to restore data.
            </Text>
            <TextInput
              style={[styles.input, { height: 180, textAlignVertical: 'top', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11 }]}
              multiline
              value={backupText}
              onChangeText={setBackupText}
              placeholder="Paste JSON data here..."
              placeholderTextColor="#64748b"
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <TouchableOpacity
                style={[styles.btnPrimary, styles.btnGray]}
                onPress={() => setBackupModal(false)}
              >
                <Text style={styles.btnPrimaryText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: '#10b981' }]}
                onPress={handleImportData}
              >
                <Text style={styles.btnPrimaryText}>Import & Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: STUDY ALARM & NOTIFICATION PICKER ================= */}
      <Modal visible={reminderModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.rowBetween}>
              <Text style={styles.h1}>⏰ Daily Study Alarm</Text>
              <TouchableOpacity onPress={() => setReminderModal(false)}>
                <Text style={{ color: '#94a3b8', fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.sub, { marginVertical: 8 }]}>
              Set a dedicated daily time to study. The app alerts you with sound, vibration, and banner so you stay on track!
            </Text>

            {/* Toggle Enable/Disable */}
            <View style={[styles.rowBetween, { backgroundColor: '#090f1d', padding: 12, borderRadius: 10, marginVertical: 8 }]}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>Enable Daily Alert</Text>
              <TouchableOpacity
                style={[
                  styles.choiceChip,
                  reminderEnabled ? { backgroundColor: '#10b981' } : { backgroundColor: '#334155' }
                ]}
                onPress={() => setReminderEnabled(!reminderEnabled)}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>{reminderEnabled ? 'ON' : 'OFF'}</Text>
              </TouchableOpacity>
            </View>

            {/* Quick Preset Hours */}
            <Text style={styles.inputLabel}>Quick Select Time</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {[
                { label: '07:00 AM', time: '07:00' },
                { label: '09:00 AM', time: '09:00' },
                { label: '12:00 PM', time: '12:00' },
                { label: '06:00 PM', time: '18:00' },
                { label: '08:00 PM', time: '20:00' },
                { label: '09:30 PM', time: '21:30' },
                { label: '10:00 PM', time: '22:00' }
              ].map((p) => (
                <TouchableOpacity
                  key={p.time}
                  style={[
                    styles.choiceChip,
                    reminderTimeDraft === p.time && { backgroundColor: accentColor, borderColor: accentColor }
                  ]}
                  onPress={() => setReminderTimeDraft(p.time)}
                >
                  <Text style={{ color: reminderTimeDraft === p.time ? '#fff' : '#cbd5e1', fontSize: 12 }}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom Time Input */}
            <Text style={styles.inputLabel}>Custom Time (24h format HH:MM)</Text>
            <TextInput
              style={styles.input}
              value={reminderTimeDraft}
              onChangeText={setReminderTimeDraft}
              placeholder="e.g. 20:30"
              placeholderTextColor="#64748b"
            />

            {/* Test Alarm Button */}
            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: '#2563eb', marginTop: 12, marginBottom: 4 }]}
              onPress={() => {
                try {
                  Vibration.vibrate([0, 500, 200, 500]);
                } catch (e) {}
                setStudyAlertVisible(true);
                setReminderModal(false);
                Alert.alert(
                  '🔔 Test Alarm Ringing!',
                  `This is how your daily study alarm will alert you at ${reminderTimeDraft}!`,
                  [
                    { text: 'Start Session Now', onPress: () => setIsTimerRunning(true) },
                    { text: 'Got it!', style: 'cancel' }
                  ]
                );
              }}
            >
              <Text style={styles.btnPrimaryText}>🔔 Test Alarm Alert Now</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <TouchableOpacity
                style={[styles.btnPrimary, styles.btnGray]}
                onPress={() => setReminderModal(false)}
              >
                <Text style={styles.btnPrimaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: accentColor }]}
                onPress={handleSaveReminder}
              >
                <Text style={styles.btnPrimaryText}>Save Alarm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: AI SETTINGS (GEMINI + OPENAI) ================= */}
      <Modal visible={aiSettingsModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '92%' }]}>
            <View style={styles.rowBetween}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 24 }}>⚙️</Text>
                <Text style={styles.h1}>AI Engine Configuration</Text>
              </View>
              <TouchableOpacity onPress={() => setAiSettingsModal(false)}>
                <Text style={{ color: '#94a3b8', fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.sub, { marginBottom: 12 }]}>
              Choose your AI provider (Google Gemini with Free Tier, or OpenAI ChatGPT).
            </Text>

            {/* Provider Tabs */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
              <TouchableOpacity
                style={[
                  styles.providerTabBtn,
                  aiProviderDraft === 'gemini' && { backgroundColor: '#3b82f6', borderColor: '#3b82f6' }
                ]}
                onPress={() => {
                  setAiProviderDraft('gemini');
                  if (!aiModelDraft.startsWith('gemini')) setAiModelDraft('gemini-1.5-flash');
                  setAiValidationStatus(null);
                }}
              >
                <Text style={{ color: aiProviderDraft === 'gemini' ? '#fff' : '#94a3b8', fontSize: 12, fontWeight: '700' }}>
                  🌐 Google Gemini (Free)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.providerTabBtn,
                  aiProviderDraft === 'openai' && { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' }
                ]}
                onPress={() => {
                  setAiProviderDraft('openai');
                  if (!aiModelDraft.startsWith('gpt')) setAiModelDraft('gpt-4o-mini');
                  setAiValidationStatus(null);
                }}
              >
                <Text style={{ color: aiProviderDraft === 'openai' ? '#fff' : '#94a3b8', fontSize: 12, fontWeight: '700' }}>
                  🤖 OpenAI (ChatGPT)
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
              {/* API Key Input */}
              <Text style={styles.inputLabel}>
                {aiProviderDraft === 'gemini' ? 'Google Gemini API Key (starts with AIzaSy...)' : 'OpenAI Secret API Key (starts with sk-...)'}
              </Text>
              <TextInput
                style={[styles.input, { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13 }]}
                value={aiKeyDraft}
                onChangeText={(val) => {
                  setAiKeyDraft(val);
                  setAiValidationStatus(null);
                  if (val.trim().startsWith('sk-') && aiProviderDraft !== 'openai') {
                    setAiProviderDraft('openai');
                    setAiModelDraft('gpt-4o-mini');
                  } else if (val.trim().startsWith('AIzaSy') && aiProviderDraft !== 'gemini') {
                    setAiProviderDraft('gemini');
                    setAiModelDraft('gemini-1.5-flash');
                  }
                }}
                secureTextEntry={aiKeyDraft.length > 8}
                placeholder={aiProviderDraft === 'gemini' ? 'AIzaSy...' : 'sk-proj-...'}
                placeholderTextColor="#64748b"
                autoCapitalize="none"
                autoCorrect={false}
              />

              {/* Test Key Button & Status Badge */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 8 }}>
                <TouchableOpacity
                  style={[styles.btnSmall, { backgroundColor: '#334155', paddingHorizontal: 12 }]}
                  onPress={handleTestApiKey}
                  disabled={aiValidating}
                >
                  {aiValidating ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.btnSmallText}>🔍 Test Connection</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setAiPaymentGuideModal(true)}>
                  <Text style={{ color: '#38bdf8', fontSize: 12, fontWeight: '600' }}>
                    ❓ Setup & Free Key Guide
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
                    {aiValidationStatus.valid ? '✅ Connection Successful!' : '❌ Connection Failed'}
                  </Text>
                  <Text style={{ color: '#cbd5e1', fontSize: 11, marginTop: 2 }}>
                    {aiValidationStatus.msg}
                  </Text>
                </View>
              )}

              {/* Model Selection */}
              <Text style={[styles.inputLabel, { marginTop: 14 }]}>
                {aiProviderDraft === 'gemini' ? 'Gemini Model' : 'OpenAI Model'}
              </Text>
              {(aiProviderDraft === 'gemini' ? GEMINI_MODELS : OPENAI_MODELS).map((m) => {
                const isSelected = aiModelDraft === m.id;
                const activeColor = aiProviderDraft === 'gemini' ? '#3b82f6' : '#8b5cf6';
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
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{m.name}</Text>
                      {isSelected && (
                        <View style={[styles.activePill, { backgroundColor: `${activeColor}33` }]}>
                          <Text style={[styles.activePillText, { color: activeColor }]}>Active</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 4 }}>
                      Rate/Cost: <Text style={{ color: '#fbbf24' }}>{m.cost}</Text>
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {/* Distribution & Free Tier Tip */}
              <View style={{ backgroundColor: '#090f1d', borderRadius: 8, padding: 10, marginTop: 10, borderWidth: 1, borderColor: '#1e293b' }}>
                <Text style={{ color: '#94a3b8', fontSize: 11, lineHeight: 16 }}>
                  💡 <Text style={{ color: '#38bdf8', fontWeight: '700' }}>Free Tier Tip:</Text> Google Gemini provides up to 15 free requests per minute on <Text style={{ color: '#fbbf24' }}>aistudio.google.com</Text> with zero credit card required!
                </Text>
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.btnPrimary, styles.btnGray]}
                onPress={() => setAiSettingsModal(false)}
              >
                <Text style={styles.btnPrimaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: aiProviderDraft === 'gemini' ? '#3b82f6' : '#8b5cf6' }]}
                onPress={handleSaveAISettings}
              >
                <Text style={styles.btnPrimaryText}>Save Settings</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: PAYMENT, KEY SETUP & DISTRIBUTION GUIDE ================= */}
      <Modal visible={aiPaymentGuideModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '90%' }]}>
            <View style={styles.rowBetween}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 24 }}>📚</Text>
                <Text style={styles.h1}>AI Keys & Distribution Guide</Text>
              </View>
              <TouchableOpacity onPress={() => setAiPaymentGuideModal(false)}>
                <Text style={{ color: '#94a3b8', fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.sub, { marginBottom: 12 }]}>
              Step-by-step guides for Google Gemini (Free), OpenAI, and enabling AI for all installed app users.
            </Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* SECTION A: Google Gemini Free Tier */}
              <Text style={[styles.cardTitle, { color: '#38bdf8', marginTop: 4, marginBottom: 8 }]}>
                🌐 Option 1: Google Gemini (100% Free Tier)
              </Text>

              <View style={styles.guideStepCard}>
                <View style={[styles.stepNumBadge, { backgroundColor: '#3b82f6' }]}>
                  <Text style={styles.stepNumText}>1</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.guideStepTitle}>Get Free Key at Google AI Studio</Text>
                  <Text style={styles.guideStepDesc}>
                    Go to <Text style={{ color: '#38bdf8' }}>aistudio.google.com</Text> and sign in with any Google account. No credit card required.
                  </Text>
                </View>
              </View>

              <View style={styles.guideStepCard}>
                <View style={[styles.stepNumBadge, { backgroundColor: '#3b82f6' }]}>
                  <Text style={styles.stepNumText}>2</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.guideStepTitle}>Click "Get API Key" → Create Key</Text>
                  <Text style={styles.guideStepDesc}>
                    Click "Create API key in new project", copy the key (starts with <Text style={{ color: '#fbbf24' }}>AIzaSy...</Text>), paste it into this app, and select Google Gemini!
                  </Text>
                </View>
              </View>

              {/* SECTION B: OpenAI Setup */}
              <Text style={[styles.cardTitle, { color: '#c084fc', marginTop: 14, marginBottom: 8 }]}>
                🤖 Option 2: OpenAI (ChatGPT Pay-as-you-go)
              </Text>

              <View style={styles.guideStepCard}>
                <View style={[styles.stepNumBadge, { backgroundColor: '#8b5cf6' }]}>
                  <Text style={styles.stepNumText}>1</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.guideStepTitle}>OpenAI Platform & $5 Deposit</Text>
                  <Text style={styles.guideStepDesc}>
                    Sign up at <Text style={{ color: '#38bdf8' }}>platform.openai.com</Text>. Go to <Text style={{ color: '#fbbf24' }}>Settings → Billing</Text> and deposit $5 USD. You can set a monthly spend limit so you never get overcharged.
                  </Text>
                </View>
              </View>

              <View style={styles.guideStepCard}>
                <View style={[styles.stepNumBadge, { backgroundColor: '#8b5cf6' }]}>
                  <Text style={styles.stepNumText}>2</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.guideStepTitle}>Generate Secret Key (sk-...)</Text>
                  <Text style={styles.guideStepDesc}>
                    Go to <Text style={{ color: '#38bdf8' }}>platform.openai.com/api-keys</Text>, tap "+ Create new secret key", and copy it into the app.
                  </Text>
                </View>
              </View>

              {/* SECTION C: Multi-User Distribution */}
              <Text style={[styles.cardTitle, { color: '#34d399', marginTop: 14, marginBottom: 8 }]}>
                📱 Option 3: Giving AI to ALL Users of your APK / IPA
              </Text>

              <View style={styles.guideCallout}>
                <Text style={{ color: '#34d399', fontSize: 12, fontWeight: '700' }}>
                  How to make AI work for all users without asking them for a key:
                </Text>
                <Text style={{ color: '#cbd5e1', fontSize: 11, lineHeight: 18, marginTop: 4 }}>
                  1. <Text style={{ fontWeight: '700', color: '#fff' }}>Embedded Shared Key (Easiest):</Text> In your code file <Text style={{ color: '#fbbf24' }}>aiService.js</Text>, set <Text style={{ color: '#38bdf8' }}>EMBEDDED_DEFAULT_KEY = "your_key"</Text>. When you compile your APK, all installed users will automatically have live AI out-of-the-box!{'\n\n'}
                  2. <Text style={{ fontWeight: '700', color: '#fff' }}>Free Serverless Proxy (100% Secure):</Text> If distributing to the public App Store / Play Store, deploy a free 20-line Cloudflare Worker where your key stays on the server, and your app calls the worker.
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: '#8b5cf6', marginTop: 12 }]}
              onPress={() => setAiPaymentGuideModal(false)}
            >
              <Text style={styles.btnPrimaryText}>Close Guide</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: FULL-SCREEN DAY NOTES EDITOR ================= */}
      <Modal visible={fullNoteModal} animationType="slide" statusBarTranslucent>
        <View style={[styles.root, { backgroundColor: '#0a0f1d' }]}>
          <StatusBar style="light" />

          {/* Full Note Top Bar */}
          <View style={styles.fullNoteHeader}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ color: accentColor, fontSize: 11, fontWeight: '800' }}>
                DAY {currentDay} JOURNAL & REFLECTIONS
              </Text>
              <Text style={[styles.h1, { fontSize: 15, marginTop: 2 }]} numberOfLines={1}>
                {currentDayInfo.topic}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {currentDayNote ? (
                <TouchableOpacity
                  style={[styles.btnSmall, { backgroundColor: '#1e293b', borderColor: '#475569', borderWidth: 1 }]}
                  onPress={() => {
                    Alert.alert(
                      'Clear Note?',
                      'Are you sure you want to erase today’s notes?',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Clear', style: 'destructive', onPress: () => handleNoteChange('') }
                      ]
                    );
                  }}
                >
                  <Text style={{ color: '#f87171', fontSize: 12 }}>🗑 Clear</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={[styles.btnSmall, { backgroundColor: accentColor, paddingHorizontal: 16 }]}
                onPress={() => setFullNoteModal(false)}
              >
                <Text style={styles.btnSmallText}>✓ Done</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Full Note Sub-bar with AI shortcut */}
          <View style={styles.fullNoteSubBar}>
            <Text style={{ color: '#94a3b8', fontSize: 11 }}>
              {currentDayNote.length} characters · Auto-saved locally
            </Text>
            {currentDayLesson && (
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                onPress={() => {
                  const summary = `\n\n--- [AI Lesson Key Takeaways - Day ${currentDay}] ---\n` + currentDayLesson.content.slice(0, 500) + '...';
                  handleNoteChange((currentDayNote || '') + summary);
                  Alert.alert('Appended!', 'Key takeaways from AI course lesson added to notes.');
                }}
              >
                <Text style={{ color: '#38bdf8', fontSize: 11, fontWeight: '700' }}>
                  + Insert AI Lesson Summary
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Full-Screen Text Input */}
          <TextInput
            style={styles.fullPageTextInput}
            multiline
            value={currentDayNote}
            onChangeText={handleNoteChange}
            placeholder="Type your complete daily study notes, code snippets, network commands, lab reflections, or questions here..."
            placeholderTextColor="#475569"
            autoFocus={false}
            textAlignVertical="top"
          />
        </View>
      </Modal>

      {/* ================= MODAL: AI ROADMAP GENERATOR ================= */}
      <Modal visible={aiRoadmapModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '90%' }]}>
            <View style={styles.rowBetween}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 24 }}>✨</Text>
                <Text style={styles.h1}>AI Roadmap Generator</Text>
              </View>
              <TouchableOpacity onPress={() => !aiGeneratingRoadmap && setAiRoadmapModal(false)}>
                <Text style={{ color: '#94a3b8', fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.sub, { marginBottom: 12 }]}>
              Describe your goal and let ChatGPT architect a multi-phase, day-by-day learning plan.
            </Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>What do you want to learn or master?</Text>
              <TextInput
                style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
                multiline
                value={aiPrompt}
                onChangeText={setAiPrompt}
                placeholder="e.g. Huawei HCIA Cloud Service & Storage, Full Stack React Native, Kubernetes & DevOps..."
                placeholderTextColor="#64748b"
                editable={!aiGeneratingRoadmap}
              />

              {/* Total Duration Chips */}
              <Text style={styles.inputLabel}>Roadmap Duration</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {['14', '30', '60', '90', '180'].map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[
                      styles.choiceChip,
                      aiTotalDays === d && { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' }
                    ]}
                    onPress={() => setAiTotalDays(d)}
                    disabled={aiGeneratingRoadmap}
                  >
                    <Text style={{ color: aiTotalDays === d ? '#fff' : '#cbd5e1', fontSize: 12, fontWeight: '700' }}>
                      {d} Days
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Experience Level */}
              <Text style={styles.inputLabel}>Experience Level</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
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
                      {lvl}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Focus Area */}
              <Text style={styles.inputLabel}>Learning Focus</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {[
                  'Practical Labs & Projects',
                  'Certification & Exam',
                  'Balanced Masterclass'
                ].map((f) => (
                  <TouchableOpacity
                    key={f}
                    style={[
                      styles.choiceChip,
                      aiFocus === f && { backgroundColor: '#10b981', borderColor: '#10b981' }
                    ]}
                    onPress={() => setAiFocus(f)}
                    disabled={aiGeneratingRoadmap}
                  >
                    <Text style={{ color: aiFocus === f ? '#fff' : '#cbd5e1', fontSize: 12 }}>
                      {f}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Status Note */}
              <View style={{ backgroundColor: '#090f1d', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#1e293b' }}>
                <Text style={{ color: '#94a3b8', fontSize: 11 }}>
                  {appData.aiConfig?.apiKey
                    ? `🟢 Using connected ${appData.aiConfig?.model || DEFAULT_AI_MODEL} model`
                    : '⚪ No API key set. Will generate demo preview roadmap.'}
                </Text>
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.btnPrimary, styles.btnGray]}
                onPress={() => setAiRoadmapModal(false)}
                disabled={aiGeneratingRoadmap}
              >
                <Text style={styles.btnPrimaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: '#8b5cf6', minWidth: 140 }]}
                onPress={handleGenerateAIRoadmap}
                disabled={aiGeneratingRoadmap}
              >
                {aiGeneratingRoadmap ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.btnPrimaryText}>Architecting...</Text>
                  </View>
                ) : (
                  <Text style={styles.btnPrimaryText}>🚀 Generate Roadmap</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: COURSE LESSON & CONTENT ================= */}
      <Modal visible={aiLessonModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '92%', paddingBottom: 16 }]}>
            {/* Header */}
            <View style={styles.rowBetween}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ color: accentColor, fontSize: 11, fontWeight: '800' }}>
                  DAY {currentDay} • 4-PART LEARNING SYSTEM
                </Text>
                <Text style={[styles.h1, { fontSize: 16, marginTop: 2 }]} numberOfLines={1}>
                  {currentDayInfo.topic}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setAiLessonModal(false)}>
                <Text style={{ color: '#94a3b8', fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Reference Document Status Banner */}
            {currentDayRefDoc ? (
              <View style={{ backgroundColor: '#1e1b4b', borderColor: '#818cf8', borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, paddingRight: 6 }}>
                  <Text style={{ color: '#c7d2fe', fontSize: 11, fontWeight: '700' }}>
                    📄 Day {currentDay} Reference Attached ({currentDayRefDoc.length.toLocaleString()} chars)
                  </Text>
                  <Text style={{ color: '#94a3b8', fontSize: 10 }} numberOfLines={1}>
                    {currentDayRefDocObj?.name || 'HCIA Material'}: {currentDayRefDoc.replace(/\s+/g, ' ').slice(0, 55)}...
                  </Text>
                </View>
                <TouchableOpacity
                  style={{ backgroundColor: '#6366f1', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 }}
                  onPress={() => {
                    setAiUploadDraft(currentDayRefDoc);
                    setAiUploadedFileName(currentDayRefDocObj?.name || '');
                    setAiUploadTarget('day');
                    setAiUploadModal(true);
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>Edit Doc</Text>
                </TouchableOpacity>
              </View>
            ) : globalRefDoc ? (
              <View style={{ backgroundColor: '#0f291e', borderColor: '#34d399', borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, paddingRight: 6 }}>
                  <Text style={{ color: '#a7f3d0', fontSize: 11, fontWeight: '700' }}>
                    🌐 Roadmap HCIA Document Attached ({globalRefDoc.length.toLocaleString()} chars)
                  </Text>
                  <Text style={{ color: '#94a3b8', fontSize: 10 }} numberOfLines={1}>
                    {activeRoadmap?.globalReferenceDocName || 'Global Material'}: {globalRefDoc.replace(/\s+/g, ' ').slice(0, 55)}...
                  </Text>
                </View>
                <TouchableOpacity
                  style={{ backgroundColor: '#059669', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 }}
                  onPress={() => {
                    setAiUploadDraft(globalRefDoc);
                    setAiUploadedFileName(activeRoadmap?.globalReferenceDocName || '');
                    setAiUploadTarget('global');
                    setAiUploadModal(true);
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>Edit Doc</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ backgroundColor: '#0f172a', borderColor: '#334155', borderWidth: 1, borderRadius: 8, padding: 7, marginTop: 8 }}>
                <Text style={{ color: '#94a3b8', fontSize: 10 }}>
                  💡 Have HCIA syllabus or notes? Tap <Text style={{ color: '#38bdf8', fontWeight: '700' }}>"📤 Upload / Doc"</Text> to attach so AI synthesizes your material!
                </Text>
              </View>
            )}

            {/* Quick action bar */}
            <View style={{ flexDirection: 'row', gap: 6, marginVertical: 10 }}>
              <TouchableOpacity
                style={[styles.btnSmall, { backgroundColor: '#8b5cf6', flex: 1 }]}
                onPress={handleGenerateAILesson}
                disabled={aiLessonLoading}
              >
                {aiLessonLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.btnSmallText}>🤖 {currentDayLesson ? 'Regenerate Lesson' : 'Generate 4-Part Lesson'}</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnSmall, { backgroundColor: '#334155' }]}
                onPress={() => {
                  if (currentDayRefDoc) {
                    setAiUploadDraft(currentDayRefDoc);
                    setAiUploadedFileName(currentDayRefDocObj?.name || '');
                    setAiUploadTarget('day');
                  } else if (globalRefDoc) {
                    setAiUploadDraft(globalRefDoc);
                    setAiUploadedFileName(activeRoadmap?.globalReferenceDocName || '');
                    setAiUploadTarget('global');
                  } else if (currentDayLesson && currentDayLesson.type === 'custom') {
                    setAiUploadDraft(currentDayLesson.content);
                    setAiUploadedFileName('');
                    setAiUploadTarget('lesson');
                  } else {
                    setAiUploadDraft('');
                    setAiUploadedFileName('');
                    setAiUploadTarget('day');
                  }
                  setAiUploadModal(true);
                }}
              >
                <Text style={styles.btnSmallText}>📤 Upload / Doc</Text>
              </TouchableOpacity>

              {currentDayLesson && (
                <TouchableOpacity
                  style={[styles.btnSmall, { backgroundColor: '#1e293b', borderColor: '#475569', borderWidth: 1 }]}
                  onPress={() => {
                    const snippet = `\n\n[Lesson Summary - Day ${currentDay}]\n` + currentDayLesson.content.slice(0, 400) + '...';
                    handleNoteChange((currentDayNote || '') + snippet);
                    Alert.alert('Appended!', 'Key points added to your Day Notes.');
                  }}
                >
                  <Text style={styles.btnSmallText}>📝 Add to Notes</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Lesson Body */}
            {aiLessonLoading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#8b5cf6" />
                <Text style={{ color: '#cbd5e1', fontSize: 14, fontWeight: '700', marginTop: 12 }}>
                  Synthesizing Day {currentDay} 4-Part Daily System...
                </Text>
                <Text style={{ color: '#64748b', fontSize: 12, marginTop: 4, textAlign: 'center', paddingHorizontal: 20 }}>
                  Generating Theory, Huawei VRP CLI Practice, eNSP Hands-on Lab, and Assessment
                </Text>
              </View>
            ) : currentDayLesson ? (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
                <View style={styles.lessonMetaBadge}>
                  <Text style={{ color: '#38bdf8', fontSize: 11, fontWeight: '700' }}>
                    {currentDayLesson.type === 'custom' ? '📝 CUSTOM UPLOADED LESSON' : '🤖 AI 4-PART LEARNING SYSTEM'}
                  </Text>
                  <Text style={{ color: '#64748b', fontSize: 10 }}>
                    {currentDayLesson.generatedAt ? new Date(currentDayLesson.generatedAt).toLocaleDateString() : ''}
                  </Text>
                </View>

                <View style={styles.lessonTextContainer}>
                  <Text style={styles.lessonBodyText}>
                    {currentDayLesson.content}
                  </Text>
                </View>
              </ScrollView>
            ) : (
              <View style={{ paddingVertical: 36, alignItems: 'center', backgroundColor: '#090f1d', borderRadius: 10, borderWidth: 1, borderColor: '#1e293b' }}>
                <Text style={{ fontSize: 36, marginBottom: 8 }}>📖</Text>
                <Text style={{ color: '#f8fafc', fontSize: 15, fontWeight: '700' }}>
                  No Lesson Notes for Day {currentDay} Yet
                </Text>
                <Text style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', marginHorizontal: 20, marginTop: 6, lineHeight: 18 }}>
                  Tap <Text style={{ color: '#c084fc', fontWeight: '700' }}>"🤖 Generate 4-Part Lesson"</Text> to synthesize theory, Huawei CLI, and eNSP labs, or <Text style={{ color: '#38bdf8', fontWeight: '700' }}>"📤 Upload / Doc"</Text> to attach your HCIA study materials.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.btnPrimary, styles.btnGray, { marginTop: 12 }]}
              onPress={() => setAiLessonModal(false)}
            >
              <Text style={styles.btnPrimaryText}>Close Lesson</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: HCIA DOCUMENT UPLOAD & REFERENCE HUB ================= */}
      <Modal visible={aiUploadModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '92%' }]}>
            {/* Header */}
            <View style={styles.rowBetween}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.h1}>📁 HCIA Documents & Notes</Text>
                <Text style={styles.sub}>Day {currentDay}: {currentDayInfo.topic}</Text>
              </View>
              <TouchableOpacity onPress={() => setAiUploadModal(false)}>
                <Text style={{ color: '#94a3b8', fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Target Selector Tabs */}
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, marginBottom: 6 }}>
              <TouchableOpacity
                style={[
                  styles.filterPill,
                  aiUploadTarget === 'day' ? { backgroundColor: '#6366f1', borderColor: '#818cf8' } : {}
                ]}
                onPress={() => setAiUploadTarget('day')}
              >
                <Text style={[styles.filterPillText, aiUploadTarget === 'day' ? { color: '#fff', fontWeight: '700' } : {}]}>
                  📄 Day {currentDay} Doc
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.filterPill,
                  aiUploadTarget === 'global' ? { backgroundColor: '#10b981', borderColor: '#34d399' } : {}
                ]}
                onPress={() => setAiUploadTarget('global')}
              >
                <Text style={[styles.filterPillText, aiUploadTarget === 'global' ? { color: '#fff', fontWeight: '700' } : {}]}>
                  🌐 Roadmap HCIA Doc
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.filterPill,
                  aiUploadTarget === 'lesson' ? { backgroundColor: '#3b82f6', borderColor: '#60a5fa' } : {}
                ]}
                onPress={() => setAiUploadTarget('lesson')}
              >
                <Text style={[styles.filterPillText, aiUploadTarget === 'lesson' ? { color: '#fff', fontWeight: '700' } : {}]}>
                  ✏️ Direct Lesson
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>
              {aiUploadTarget === 'day'
                ? `Saved to Day ${currentDay}. AI will analyze this document when generating Day ${currentDay}'s lesson and lab.`
                : aiUploadTarget === 'global'
                ? 'Saved as roadmap-wide reference. AI will analyze this for all days in this roadmap.'
                : 'Saves directly as lesson content without AI generation.'}
            </Text>

            {/* File Pick & Clear Toolbar */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <TouchableOpacity
                style={[styles.btnSmall, { backgroundColor: '#3b82f6', flexDirection: 'row', alignItems: 'center', gap: 6 }]}
                onPress={handlePickDocumentFile}
              >
                <Text style={{ fontSize: 13 }}>📂</Text>
                <Text style={styles.btnSmallText}>Pick File (.txt, .md, .doc, .json)</Text>
              </TouchableOpacity>

              {aiUploadDraft.length > 0 && (
                <TouchableOpacity
                  style={[styles.btnSmall, { backgroundColor: '#334155' }]}
                  onPress={() => {
                    setAiUploadDraft('');
                    setAiUploadedFileName('');
                  }}
                >
                  <Text style={styles.btnSmallText}>🧹 Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Document stats badge */}
            {aiUploadDraft.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <View style={[styles.badgePill, { backgroundColor: '#1e293b', borderColor: '#475569', borderWidth: 1 }]}>
                  <Text style={{ color: '#38bdf8', fontSize: 10, fontWeight: '700' }}>
                    {aiUploadedFileName ? `📄 ${aiUploadedFileName}` : '📝 Text Entered'}: {aiUploadDraft.length.toLocaleString()} characters (~{Math.round(aiUploadDraft.length / 5).toLocaleString()} words)
                  </Text>
                </View>
              </View>
            )}

            <TextInput
              style={[styles.input, { height: 220, textAlignVertical: 'top', fontSize: 12, lineHeight: 18 }]}
              multiline
              value={aiUploadDraft}
              onChangeText={setAiUploadDraft}
              placeholder="Paste your HCIA study guide, Huawei VRP command reference, official syllabus, lab guide, or personal notes here...&#10;&#10;When you tap 'Save & Generate', AI will view this document and build the complete 4-part lesson!"
              placeholderTextColor="#64748b"
            />

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 6, marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.btnPrimary, styles.btnGray]}
                onPress={() => setAiUploadModal(false)}
              >
                <Text style={styles.btnPrimaryText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: '#10b981' }]}
                onPress={() => handleSaveReferenceDoc(aiUploadTarget)}
              >
                <Text style={styles.btnPrimaryText}>💾 Save Document</Text>
              </TouchableOpacity>

              {aiUploadTarget !== 'lesson' && (
                <TouchableOpacity
                  style={[styles.btnPrimary, { backgroundColor: '#8b5cf6' }]}
                  onPress={handleSaveAndGenerateNow}
                >
                  <Text style={styles.btnPrimaryText}>⚡ Save & Generate AI</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: AI PRACTICE, LAB & QUIZ ================= */}
      <Modal visible={aiPracticeModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '92%', paddingBottom: 16 }]}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ color: '#a78bfa', fontSize: 11, fontWeight: '800' }}>
                  DAY {currentDay} • PRACTICE & ASSESSMENT
                </Text>
                <Text style={[styles.h1, { fontSize: 16, marginTop: 2 }]} numberOfLines={1}>
                  {currentDayInfo.topic}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setAiPracticeModal(false)}>
                <Text style={{ color: '#94a3b8', fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Top Generate Button */}
            <View style={{ marginVertical: 10 }}>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: '#8b5cf6' }]}
                onPress={handleGenerateAIPractice}
                disabled={aiPracticeLoading}
              >
                {aiPracticeLoading ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.btnPrimaryText}>Generating Hands-on Lab & Quiz...</Text>
                  </View>
                ) : (
                  <Text style={styles.btnPrimaryText}>
                    ⚡ {currentDayQuiz ? 'Regenerate Practice & Quiz' : 'Generate Practice Challenge'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Practice Body */}
            {aiPracticeLoading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#8b5cf6" />
                <Text style={{ color: '#cbd5e1', fontSize: 14, fontWeight: '700', marginTop: 12 }}>
                  Building your interactive challenge...
                </Text>
                <Text style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
                  Creating eNSP lab scenario, quiz questions & focus tasks
                </Text>
              </View>
            ) : currentDayQuiz ? (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 440 }}>
                {/* 1. Lab Exercise */}
                {currentDayQuiz.lab && (
                  <View style={styles.quizSectionCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Text style={{ fontSize: 18 }}>🧪</Text>
                      <Text style={[styles.cardTitle, { color: '#38bdf8' }]}>
                        {currentDayQuiz.lab.title || 'Hands-on Lab Exercise'}
                      </Text>
                    </View>
                    <Text style={[styles.sub, { marginBottom: 8, color: '#e2e8f0' }]}>
                      {currentDayQuiz.lab.scenario}
                    </Text>

                    {/* Equipment */}
                    {currentDayQuiz.lab.equipment && (
                      <View style={{ backgroundColor: '#090f1d', borderRadius: 6, padding: 8, marginBottom: 8 }}>
                        <Text style={{ color: '#fbbf24', fontSize: 11, fontWeight: '700' }}>
                          🛠 EQUIPMENT / SIMULATOR:
                        </Text>
                        <Text style={{ color: '#cbd5e1', fontSize: 11, marginTop: 2 }}>
                          {currentDayQuiz.lab.equipment}
                        </Text>
                      </View>
                    )}

                    {/* Topology Diagram */}
                    {currentDayQuiz.lab.topology && (
                      <View style={{ backgroundColor: '#030712', borderRadius: 6, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: '#1e293b' }}>
                        <Text style={{ color: '#38bdf8', fontSize: 11, fontWeight: '700', marginBottom: 4 }}>
                          🌐 NETWORK TOPOLOGY:
                        </Text>
                        <Text style={{ color: '#93c5fd', fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 14 }}>
                          {currentDayQuiz.lab.topology}
                        </Text>
                      </View>
                    )}

                    {/* IP Addressing Table */}
                    {Array.isArray(currentDayQuiz.lab.ipTable) && currentDayQuiz.lab.ipTable.length > 0 && (
                      <View style={{ backgroundColor: '#090f1d', borderRadius: 6, padding: 8, marginBottom: 8 }}>
                        <Text style={{ color: '#34d399', fontSize: 11, fontWeight: '700', marginBottom: 4 }}>
                          📋 IP ADDRESSING & VLAN TABLE:
                        </Text>
                        {currentDayQuiz.lab.ipTable.map((row, rIdx) => (
                          <View key={rIdx} style={{ borderBottomWidth: 1, borderBottomColor: '#1e293b', paddingVertical: 4 }}>
                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                              {row.device} • {row.interface}
                            </Text>
                            <Text style={{ color: '#94a3b8', fontSize: 10 }}>
                              IP: {row.ip} {row.vlan && row.vlan !== 'N/A' ? `| VLAN: ${row.vlan}` : ''} {row.purpose ? `(${row.purpose})` : ''}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Practical Exercises */}
                    {Array.isArray(currentDayQuiz.lab.exercises) && currentDayQuiz.lab.exercises.length > 0 ? (
                      <View style={{ marginVertical: 6 }}>
                        <Text style={{ color: '#a78bfa', fontSize: 12, fontWeight: '800', marginBottom: 6 }}>
                          🎯 PRACTICAL EXERCISES (MINIMUM 3):
                        </Text>
                        {currentDayQuiz.lab.exercises.map((ex, exIdx) => (
                          <View key={exIdx} style={{ backgroundColor: '#090f1d', borderRadius: 8, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: '#1e293b' }}>
                            <Text style={{ color: '#f8fafc', fontSize: 12, fontWeight: '700' }}>
                              {ex.title}
                            </Text>
                            {ex.commands && (
                              <View style={{ backgroundColor: '#030712', borderRadius: 4, padding: 6, marginVertical: 4 }}>
                                <Text style={{ color: '#4ade80', fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                                  {ex.commands}
                                </Text>
                              </View>
                            )}
                            {ex.verification && (
                              <Text style={{ color: '#38bdf8', fontSize: 10, marginTop: 2 }}>
                                ✓ Verification: {ex.verification}
                              </Text>
                            )}
                          </View>
                        ))}
                      </View>
                    ) : Array.isArray(currentDayQuiz.lab.steps) && (
                      <View style={{ backgroundColor: '#090f1d', borderRadius: 8, padding: 10, marginVertical: 6 }}>
                        <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: '700', marginBottom: 4 }}>
                          LAB STEPS:
                        </Text>
                        {currentDayQuiz.lab.steps.map((st, sIdx) => (
                          <Text key={sIdx} style={{ color: '#cbd5e1', fontSize: 12, marginVertical: 2 }}>
                            • {st}
                          </Text>
                        ))}
                      </View>
                    )}

                    {/* Troubleshooting Scenario */}
                    {currentDayQuiz.lab.troubleshooting && (
                      <View style={{ backgroundColor: '#1c1917', borderColor: '#f59e0b', borderWidth: 1, borderRadius: 8, padding: 8, marginVertical: 6 }}>
                        <Text style={{ color: '#fbbf24', fontSize: 11, fontWeight: '800', marginBottom: 4 }}>
                          ⚠️ TROUBLESHOOTING SCENARIO:
                        </Text>
                        <Text style={{ color: '#f87171', fontSize: 11, fontWeight: '700' }}>
                          Mistake: {currentDayQuiz.lab.troubleshooting.brokenConfig}
                        </Text>
                        {currentDayQuiz.lab.troubleshooting.diagnosticCommands && (
                          <View style={{ backgroundColor: '#090f1d', borderRadius: 4, padding: 6, marginVertical: 4 }}>
                            <Text style={{ color: '#94a3b8', fontSize: 10, fontWeight: '700' }}>Diagnostics:</Text>
                            <Text style={{ color: '#38bdf8', fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                              {currentDayQuiz.lab.troubleshooting.diagnosticCommands}
                            </Text>
                          </View>
                        )}
                        <Text style={{ color: '#34d399', fontSize: 11, marginTop: 2 }}>
                          Fix: {currentDayQuiz.lab.troubleshooting.solution}
                        </Text>
                      </View>
                    )}

                    {/* Completion Checklist */}
                    {Array.isArray(currentDayQuiz.lab.checklist) && currentDayQuiz.lab.checklist.length > 0 && (
                      <View style={{ backgroundColor: '#090f1d', borderRadius: 6, padding: 8, marginVertical: 4 }}>
                        <Text style={{ color: '#a5b4fc', fontSize: 11, fontWeight: '700', marginBottom: 4 }}>
                          ✅ COMPLETION CHECKLIST:
                        </Text>
                        {currentDayQuiz.lab.checklist.map((chk, cIdx) => (
                          <Text key={cIdx} style={{ color: '#cbd5e1', fontSize: 11, marginVertical: 1 }}>
                            [ ] {chk}
                          </Text>
                        ))}
                      </View>
                    )}

                    {currentDayQuiz.lab.verification && (
                      <Text style={{ color: '#34d399', fontSize: 11, marginTop: 4 }}>
                        ✓ Final Verification: {currentDayQuiz.lab.verification}
                      </Text>
                    )}
                  </View>
                )}

                {/* 2. Interactive Quiz Questions */}
                {Array.isArray(currentDayQuiz.quiz) && currentDayQuiz.quiz.length > 0 && (
                  <View style={styles.quizSectionCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <Text style={{ fontSize: 18 }}>🧩</Text>
                      <Text style={[styles.cardTitle, { color: '#c084fc' }]}>
                        Interactive Knowledge Check ({currentDayQuiz.quiz.length} Questions)
                      </Text>
                    </View>

                    {currentDayQuiz.quiz.map((q, qIdx) => {
                      const answered = quizAnswers[qIdx] !== undefined;
                      const selectedOpt = quizAnswers[qIdx];
                      const isCorrect = selectedOpt === q.answerIndex;

                      return (
                        <View key={qIdx} style={styles.quizQuestionBox}>
                          <Text style={styles.quizQuestionText}>
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
                            } else if (selectedOpt === optIdx) {
                              optStyle = [styles.quizOptionBtn, { borderColor: '#8b5cf6' }];
                            }

                            return (
                              <TouchableOpacity
                                key={optIdx}
                                style={optStyle}
                                onPress={() => handleSelectQuizOption(qIdx, optIdx)}
                                activeOpacity={0.7}
                              >
                                <Text style={textStyle}>
                                  {['A', 'B', 'C', 'D'][optIdx]}. {opt}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}

                          {answered && (
                            <View style={[styles.quizExplanationBox, isCorrect ? { borderColor: '#10b98166' } : { borderColor: '#f59e0b66' }]}>
                              <Text style={{ color: isCorrect ? '#34d399' : '#fbbf24', fontSize: 11, fontWeight: '700' }}>
                                {isCorrect ? '✅ Correct!' : '💡 Explanation:'}
                              </Text>
                              <Text style={{ color: '#cbd5e1', fontSize: 11, marginTop: 2 }}>
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
                {Array.isArray(currentDayQuiz.tasks) && currentDayQuiz.tasks.length > 0 && (
                  <View style={styles.quizSectionCard}>
                    <View style={styles.rowBetween}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 18 }}>⏱</Text>
                        <Text style={[styles.cardTitle, { color: '#fbbf24' }]}>Actionable Practice Tasks</Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.btnSmall, { backgroundColor: '#10b981' }]}
                        onPress={() => handleImportPracticeTasks(currentDayQuiz.tasks)}
                      >
                        <Text style={styles.btnSmallText}>➕ Import to Timer</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={[styles.sub, { marginTop: 4, marginBottom: 8 }]}>
                      Tap "Import to Timer" to populate the 30m CLI, 40m Hands-on Lab, and 20m Assessment into Today's action tasks!
                    </Text>

                    {currentDayQuiz.tasks.map((tsk, tIdx) => (
                      <View key={tIdx} style={styles.practiceTaskRow}>
                        <Text style={{ color: '#fff', fontSize: 12, flex: 1 }}>{tsk.title}</Text>
                        <View style={[styles.badgePill, { paddingVertical: 2, paddingHorizontal: 6 }]}>
                          <Text style={{ color: '#fbbf24', fontSize: 10, fontWeight: '700' }}>{tsk.dur || '25 mins'}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            ) : (
              <View style={{ paddingVertical: 36, alignItems: 'center', backgroundColor: '#090f1d', borderRadius: 10, borderWidth: 1, borderColor: '#1e293b' }}>
                <Text style={{ fontSize: 36, marginBottom: 8 }}>⚡</Text>
                <Text style={{ color: '#f8fafc', fontSize: 15, fontWeight: '700' }}>
                  No Practice Lab Generated Yet
                </Text>
                <Text style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', marginHorizontal: 20, marginTop: 6, lineHeight: 18 }}>
                  Tap the button above to generate a hands-on lab scenario, 3 comprehension quiz questions, and actionable tasks for the Routine Timer!
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.btnPrimary, styles.btnGray, { marginTop: 12 }]}
              onPress={() => setAiPracticeModal(false)}
            >
              <Text style={styles.btnPrimaryText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0f1d',
    // Dynamic Island clearance: 58px on modern iOS, or status bar height on Android
    paddingTop: Platform.OS === 'ios' ? 58 : (RNStatusBar.currentHeight ? RNStatusBar.currentHeight + 8 : 36)
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  topHeader: {
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12
  },
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  roadmapHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10
  },
  roadmapIconBubble: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155'
  },
  roadmapHeaderTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800'
  },
  roadmapHeaderSubtitle: {
    color: '#8295b3',
    fontSize: 11,
    marginTop: 2
  },
  headerBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#172338',
    borderColor: '#233550',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 6
  },
  badgePillText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700'
  },
  streakPill: {
    backgroundColor: '#f59e0b18',
    borderColor: '#f59e0b44'
  },
  streakPillText: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '800'
  },
  topHeaderProgressRow: {
    marginTop: 10
  },
  progressLabel: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600'
  },
  progressPctText: {
    fontSize: 12,
    fontWeight: '700'
  },
  offlineText: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '600'
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: '#172338',
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden'
  },
  progressBarThumb: {
    height: 4,
    borderRadius: 2
  },
  alertBannerCard: {
    backgroundColor: '#131e33',
    borderWidth: 1.5,
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    shadowColor: '#10b981',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4
  },
  alertBannerTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800'
  },
  alertBannerSub: {
    color: '#cbd5e1',
    fontSize: 12,
    marginTop: 2
  },
  h1: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800'
  },
  h2: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700'
  },
  sub: {
    color: '#8295b3',
    fontSize: 12
  },
  heroCard: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2
  },
  phaseTag: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  phaseTagText: {
    fontSize: 11,
    fontWeight: '700'
  },
  editIconBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4
  },
  heroTopic: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '800',
    marginTop: 10,
    marginBottom: 4,
    lineHeight: 25
  },
  heroSub: {
    color: '#8295b3',
    fontSize: 12
  },
  smallNavBtn: {
    backgroundColor: '#172338',
    borderColor: '#233550',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  btnDisabled: {
    opacity: 0.35
  },
  navBtnText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600'
  },
  markDoneBtn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  markDoneBtnText: {
    fontSize: 12,
    fontWeight: '700'
  },
  card: {
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700'
  },
  timerModesRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12
  },
  timerModeChip: {
    backgroundColor: '#172338',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10
  },
  timerDisplay: {
    color: '#f8fafc',
    fontSize: 48,
    fontWeight: '900',
    textAlign: 'center',
    marginVertical: 14,
    letterSpacing: 2,
    fontVariant: ['tabular-nums']
  },
  btnPrimary: {
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16
  },
  btnPrimaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13
  },
  btnGray: {
    backgroundColor: '#1e293b'
  },
  btnSmall: {
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  btnSmallText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#090f1d',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginTop: 8
  },
  taskCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#475569',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  taskTitle: {
    color: '#f1f5f9',
    fontSize: 13,
    fontWeight: '600'
  },
  taskMetaBadge: {
    color: '#64748b',
    fontSize: 11
  },
  emptyNote: {
    color: '#64748b',
    fontSize: 12,
    fontStyle: 'italic',
    marginVertical: 8
  },
  notesInput: {
    backgroundColor: '#090f1d',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    minHeight: 110,
    color: '#e2e8f0',
    marginTop: 8,
    textAlignVertical: 'top',
    fontSize: 13,
    lineHeight: 18
  },
  roadmapCard: {
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12
  },
  roadmapCardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700'
  },
  roadmapCardCategory: {
    color: '#8295b3',
    fontSize: 11,
    marginTop: 2
  },
  roadmapCardDesc: {
    color: '#cbd5e1',
    fontSize: 12,
    marginTop: 8,
    lineHeight: 16
  },
  activePill: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  activePillText: {
    fontSize: 10,
    fontWeight: '800'
  },
  bar: {
    height: 6,
    backgroundColor: '#090f1d',
    borderRadius: 3,
    marginTop: 6,
    overflow: 'hidden'
  },
  barFill: {
    height: 6
  },
  roadmapActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    borderTopColor: '#1e293b',
    borderTopWidth: 1,
    paddingTop: 10
  },
  actionChip: {
    backgroundColor: '#172338',
    borderColor: '#233550',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  templateCard: {
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10
  },
  phaseCard: {
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10
  },
  phaseCardTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700'
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8
  },
  dayGridCell: {
    width: 38,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#090f1d',
    borderColor: '#1e293b',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  dayTopicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4
  },
  dayNumberCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#172338',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  dayTopicText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '500',
    flex: 1
  },
  statBox: {
    alignItems: 'center',
    flex: 1
  },
  statNumber: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800'
  },
  statLabel: {
    color: '#8295b3',
    fontSize: 11,
    marginTop: 2
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: Platform.OS === 'ios' ? 84 : 64,
    backgroundColor: '#0c1322',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: Platform.OS === 'ios' ? 22 : 4
  },
  navTab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 12
  },
  navTabActive: {},
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 3
  },
  navLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#020617cc',
    justifyContent: 'center',
    padding: 16
  },
  modalBox: {
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    maxHeight: '90%'
  },
  inputLabel: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 4
  },
  input: {
    backgroundColor: '#090f1d',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    color: '#f8fafc',
    fontSize: 13
  },
  choiceChip: {
    backgroundColor: '#172338',
    borderColor: '#233550',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  emojiChip: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#090f1d',
    borderColor: '#1e293b',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14
  },
  // Timer: active task link banner
  activeTaskBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    marginBottom: 2
  },
  // Task row: ▶ Focus / ✎ Edit button
  taskFocusBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#233550'
  },
  // Timer modes modal: each editable row
  modeEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#090f1d',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    gap: 8
  },
  // Editable mode name text field
  modeNameInput: {
    flex: 1,
    color: '#f1f5f9',
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: 2
  },
  // Container for − [num] +
  modeMinControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  // − and + tap targets
  modeMinBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#172338',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#233550'
  },
  // ▶ apply/select button
  modeSelectBtn: {
    width: 32,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  // ================= AI Features Styles =================
  aiHeroActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12
  },
  aiHeroActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12
  },
  aiHeroActionTitle: {
    fontSize: 13,
    fontWeight: '700'
  },
  aiHeroActionSub: {
    fontSize: 10,
    marginTop: 2
  },
  aiValidationBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 6
  },
  modelOptionCard: {
    backgroundColor: '#090f1d',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8
  },
  guideStepCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#090f1d',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10
  },
  stepNumBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
    justifyContent: 'center'
  },
  stepNumText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14
  },
  guideStepTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700'
  },
  guideStepDesc: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3
  },
  guideCallout: {
    backgroundColor: '#172338',
    borderColor: '#233550',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 6
  },
  lessonMetaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#090f1d',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10
  },
  lessonTextContainer: {
    backgroundColor: '#090f1d',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14
  },
  lessonBodyText: {
    color: '#e2e8f0',
    fontSize: 13,
    lineHeight: 22
  },
  quizSectionCard: {
    backgroundColor: '#090f1d',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12
  },
  quizQuestionBox: {
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10
  },
  quizQuestionText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
    lineHeight: 18
  },
  quizOptionBtn: {
    backgroundColor: '#172338',
    borderColor: '#233550',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6
  },
  quizOptCorrect: {
    borderColor: '#10b981',
    backgroundColor: '#10b98122'
  },
  quizOptWrong: {
    borderColor: '#ef4444',
    backgroundColor: '#ef444422'
  },
  quizExplanationBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginTop: 6,
    backgroundColor: '#090f1d'
  },
  practiceTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#131d33',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 6
  },
  providerTabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#090f1d'
  },
  notePreviewBox: {
    backgroundColor: '#090f1d',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 8
  },
  notePreviewText: {
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 18
  },
  fullNoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b'
  },
  fullNoteSubBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#131d33',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b'
  },
  fullPageTextInput: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 14,
    lineHeight: 24,
    padding: 16,
    backgroundColor: '#0a0f1d',
    textAlignVertical: 'top'
  }
});
