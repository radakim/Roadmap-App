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
  StatusBar as RNStatusBar
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
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
  requestNotificationPermission
} from './notifications';

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
  const [newTaskPriority, setNewTaskPriority] = useState('Medium'); // 'High' | 'Medium' | 'Low'

  // Routine Timer state
  const [activeTimerMode, setActiveTimerMode] = useState('learn');
  const [timerLeft, setTimerLeft] = useState(20 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  // Sync draft
  const [syncUrlDraft, setSyncUrlDraft] = useState('');

  // Sync debounce ref
  const syncTimerRef = useRef(null);

  // 1. Initial Load
  useEffect(() => {
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

  // Study Alarm Ticker (Checks if current time matches scheduled study time)
  useEffect(() => {
    if (!reminderEnabled || !reminderTimeDraft) return;

    const checkAlarmTime = () => {
      const now = new Date();
      const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (currentHHMM === reminderTimeDraft) {
        setStudyAlertVisible(true);
      }
    };

    checkAlarmTime();
    const interval = setInterval(checkAlarmTime, 30000);
    return () => clearInterval(interval);
  }, [reminderEnabled, reminderTimeDraft]);

  // Timer Tick
  useEffect(() => {
    if (!isTimerRunning) return;
    const interval = setInterval(() => {
      setTimerLeft((prev) => {
        if (prev <= 1) {
          setIsTimerRunning(false);
          Alert.alert('Session Complete 🎉', `Focus session finished for ${activeTimerMode.toUpperCase()}! Great work.`);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning, activeTimerMode]);

  // Switch timer mode
  const selectTimerMode = (modeObj) => {
    setIsTimerRunning(false);
    setActiveTimerMode(modeObj.label);
    setTimerLeft(modeObj.dur * 60);
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

    const hasPermission = await requestNotificationPermission();
    await scheduleDailyStudyReminder(reminderTimeDraft, activeRoadmap ? activeRoadmap.title : 'Life Roadmap', currentDay);

    setAppData((prev) => ({
      ...prev,
      reminder: { enabled: true, time: reminderTimeDraft }
    }));
    setReminderModal(false);

    Alert.alert(
      '⏰ Study Alert Scheduled!',
      `Daily study alarm set for ${reminderTimeDraft}.\n${hasPermission ? 'Native push notification active.' : 'In-app notification active.'}`
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
      setStudyAlertVisible(false); // Dismiss alarm card if finished
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
    setNewTaskTitle('');
    setTaskModal(false);
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
        {/* ================= ULTRA-MODERN TOP HEADER BAR ================= */}
        <View style={styles.topHeader}>
          <View style={{ flex: 1, marginRight: 8 }}>
            {/* Active Roadmap Pill Button */}
            <TouchableOpacity
              style={[styles.roadmapSelectorPill, { borderColor: `${accentColor}55` }]}
              onPress={() => setActiveTab('roadmaps')}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 16 }}>{activeRoadmap.icon || '🎯'}</Text>
              <Text style={styles.roadmapSelectorText} numberOfLines={1}>
                {activeRoadmap.title}
              </Text>
              <Text style={{ color: '#64748b', fontSize: 10, marginLeft: 4 }}>▼</Text>
            </TouchableOpacity>

            <View style={styles.statsRow}>
              <Text style={styles.statsSub}>
                Day {activeRoadmap.currentDay}/{activeRoadmap.totalDays} · {activeRoadmapDoneCount} done ({activeRoadmapPct}%)
              </Text>
            </View>
          </View>

          {/* Top Quick Actions: Reminder Alarm + Streak + Sync */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {/* Reminder Alert Pill */}
            <TouchableOpacity
              style={[
                styles.reminderPill,
                reminderEnabled && { borderColor: `${accentColor}77`, backgroundColor: `${accentColor}18` }
              ]}
              onPress={() => setReminderModal(true)}
            >
              <Text style={{ fontSize: 11 }}>⏰</Text>
              <Text style={[styles.reminderPillText, reminderEnabled && { color: accentColor }]}>
                {reminderEnabled ? reminderTimeDraft : 'Off'}
              </Text>
            </TouchableOpacity>

            {/* Streak Badge */}
            <View style={styles.streakBadge}>
              <Text style={styles.streakText}>🔥 {appData.streak ? appData.streak.count || 0 : 0}d</Text>
            </View>

            {/* Offline / Cloud Pill */}
            <TouchableOpacity
              style={styles.syncChip}
              onPress={() => {
                setSyncUrlDraft(appData.syncUrl || '');
                setSyncModal(true);
              }}
            >
              <Text style={{ color: appData.syncUrl ? '#60a5fa' : '#34d399', fontSize: 11, fontWeight: '700' }}>
                {appData.syncUrl ? '☁️ Sync' : '⚡ Offline'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Global Progress Bar */}
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${activeRoadmapPct}%`, backgroundColor: accentColor }]} />
        </View>

        {/* ================= TAB CONTENT ================= */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 14, paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* TAB 1: TODAY / FOCUS VIEW */}
          {activeTab === 'today' && (
            <View>
              {/* LIVE STUDY ALARM BANNER (Triggered when scheduled study time arrives) */}
              {studyAlertVisible && !isCurrentDayDone && (
                <View style={[styles.alertBannerCard, { borderColor: accentColor }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 28 }}>⏰</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.alertBannerTitle}>It's Study & Focus Time!</Text>
                      <Text style={styles.alertBannerSub}>
                        Your scheduled study alarm arrived ({reminderTimeDraft}). Time to invest in yourself!
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
                      <Text style={styles.btnPrimaryText}>▶ Start Session Now</Text>
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
              <View style={[styles.heroCard, { borderColor: `${accentColor}44` }]}>
                <View style={styles.rowBetween}>
                  <View style={[styles.phaseTag, { backgroundColor: `${accentColor}22` }]}>
                    <Text style={[styles.phaseTagText, { color: accentColor }]}>
                      {currentDayInfo.phaseTitle || `Phase · Day ${currentDay}`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.editIconBtn}
                    onPress={() => openEditDayModal(currentDay)}
                  >
                    <Text style={{ color: '#94a3b8', fontSize: 13 }}>✎ Edit Topic</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.heroTopic}>{currentDayInfo.topic}</Text>
                <Text style={styles.heroSub}>
                  Day {currentDay} of {activeRoadmap.totalDays} · {activeRoadmap.category}
                </Text>

                {/* Day Navigation & Complete Action */}
                <View style={[styles.rowBetween, { marginTop: 14 }]}>
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
                      {isCurrentDayDone ? '✓ Day Completed' : 'Mark Day Completed'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Routine / Pomodoro Focus Timer */}
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>⏱ Focus & Routine Timer</Text>
                  <TouchableOpacity onPress={() => setTimerSettingsModal(true)}>
                    <Text style={{ color: '#64748b', fontSize: 12 }}>⚙️ Custom</Text>
                  </TouchableOpacity>
                </View>

                {/* Mode Selectors */}
                <View style={styles.timerModesRow}>
                  {routineModes.map((m) => (
                    <TouchableOpacity
                      key={m.id || m.label}
                      onPress={() => selectTimerMode(m)}
                      style={[
                        styles.timerModeChip,
                        activeTimerMode === m.label && { backgroundColor: accentColor }
                      ]}
                    >
                      <Text
                        style={{
                          color: activeTimerMode === m.label ? '#fff' : '#94a3b8',
                          fontSize: 12,
                          fontWeight: '600'
                        }}
                      >
                        {m.label.toUpperCase()} ({m.dur}m)
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Timer Clock */}
                <Text style={styles.timerDisplay}>{timerFormatted}</Text>

                {/* Controls */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={[
                      styles.btnPrimary,
                      { flex: 1, backgroundColor: isTimerRunning ? '#f59e0b' : accentColor }
                    ]}
                    onPress={() => setIsTimerRunning(!isTimerRunning)}
                  >
                    <Text style={styles.btnPrimaryText}>
                      {isTimerRunning ? '⏸ Pause' : '▶ Start Session'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnPrimary, styles.btnGray]}
                    onPress={() => {
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
                    onPress={() => setTaskModal(true)}
                  >
                    <Text style={styles.btnSmallText}>+ Add Task</Text>
                  </TouchableOpacity>
                </View>

                {dayTasks.length === 0 ? (
                  <Text style={styles.emptyNote}>No tasks added for Day {currentDay} yet. Tap + Add Task above!</Text>
                ) : (
                  dayTasks.map((task) => (
                    <View key={task.id} style={styles.taskItem}>
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

                      <TouchableOpacity onPress={() => deleteTask(task.id)}>
                        <Text style={{ color: '#f87171', padding: 6, fontSize: 14 }}>🗑</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}

                {/* Daily Notes / Lab Journal */}
                <View style={{ marginTop: 16 }}>
                  <View style={styles.rowBetween}>
                    <Text style={[styles.cardTitle, { fontSize: 13 }]}>📝 Day Notes & Reflections</Text>
                    <Text style={{ color: '#64748b', fontSize: 11 }}>
                      {currentDayNote.length} chars
                    </Text>
                  </View>
                  <TextInput
                    style={styles.notesInput}
                    multiline
                    value={currentDayNote}
                    onChangeText={handleNoteChange}
                    placeholder="Log learnings, code commands, milestones, reflections..."
                    placeholderTextColor="#475569"
                  />
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
                <TouchableOpacity
                  style={[styles.btnPrimary, { backgroundColor: '#10b981', paddingHorizontal: 14, paddingVertical: 8 }]}
                  onPress={openCreateRoadmap}
                >
                  <Text style={styles.btnPrimaryText}>+ New Roadmap</Text>
                </TouchableOpacity>
              </View>

              {/* List of Active Roadmaps */}
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
                      isSelected && { borderColor: rColor, borderWidth: 2 }
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
                          isSelected ? { backgroundColor: `${rColor}33`, borderColor: rColor } : {}
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

              {/* Ready-to-Use Templates Section */}
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
                    {/* Phase Header */}
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

                    {/* Phase Days Grid & Topics */}
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
                                  isDone && { backgroundColor: `${accentColor}33`, borderColor: accentColor },
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
                        <View style={{ marginTop: 14, borderTopColor: '#334155', borderTopWidth: 1, paddingTop: 10 }}>
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
                                  isCurrent && { backgroundColor: `${accentColor}22` }
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
                Study alarms, zero-account offline use & cloud sync
              </Text>

              {/* Study Alarm Card */}
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 20 }}>⏰</Text>
                    <View>
                      <Text style={styles.cardTitle}>Daily Study Alarm & Notification</Text>
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
              <View style={[styles.card, { borderColor: '#10b98144' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 20 }}>⚡</Text>
                  <Text style={[styles.cardTitle, { color: '#34d399' }]}>100% Offline & Private (No Account Needed)</Text>
                </View>
                <Text style={[styles.sub, { marginTop: 6, lineHeight: 18 }]}>
                  All your data, checklists, lab notes, and streaks are saved directly on your phone storage. You do not need to create an account, register, or enter any passwords. It works without internet anywhere you go.
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

        {/* ================= FLOATING MODERN BOTTOM NAVIGATION BAR ================= */}
        <View style={styles.bottomNav}>
          <TouchableOpacity
            style={[styles.navTab, activeTab === 'today' && styles.navTabActive]}
            onPress={() => setActiveTab('today')}
          >
            <Text style={{ fontSize: 18 }}>⚡</Text>
            <Text style={[styles.navLabel, activeTab === 'today' && { color: accentColor }]}>Focus</Text>
            {activeTab === 'today' && <View style={[styles.activeDot, { backgroundColor: accentColor }]} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navTab, activeTab === 'roadmaps' && styles.navTabActive]}
            onPress={() => setActiveTab('roadmaps')}
          >
            <Text style={{ fontSize: 18 }}>🗺️</Text>
            <Text style={[styles.navLabel, activeTab === 'roadmaps' && { color: accentColor }]}>Roadmaps</Text>
            {activeTab === 'roadmaps' && <View style={[styles.activeDot, { backgroundColor: accentColor }]} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navTab, activeTab === 'timeline' && styles.navTabActive]}
            onPress={() => setActiveTab('timeline')}
          >
            <Text style={{ fontSize: 18 }}>📅</Text>
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
            <Text style={{ fontSize: 18 }}>⚙️</Text>
            <Text style={[styles.navLabel, activeTab === 'settings' && { color: accentColor }]}>Settings</Text>
            {activeTab === 'settings' && <View style={[styles.activeDot, { backgroundColor: accentColor }]} />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

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
              Set a dedicated daily time to study. The app will alert you with notifications so you stay on track!
            </Text>

            {/* Toggle Enable/Disable */}
            <View style={[styles.rowBetween, { backgroundColor: '#0b0f19', padding: 12, borderRadius: 10, marginVertical: 8 }]}>
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

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
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

      {/* ================= MODAL: ADD TASK ================= */}
      <Modal visible={taskModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.h1}>Add Action Task</Text>
            <Text style={[styles.sub, { marginBottom: 10 }]}>
              Add a concrete step for Day {currentDay}
            </Text>
            <TextInput
              style={styles.input}
              value={newTaskTitle}
              onChangeText={setNewTaskTitle}
              placeholder="e.g. Complete eNSP BGP Lab 1"
              placeholderTextColor="#64748b"
              autoFocus
            />
            <Text style={styles.inputLabel}>Estimated Duration</Text>
            <TextInput
              style={styles.input}
              value={newTaskDur}
              onChangeText={setNewTaskDur}
              placeholder="e.g. 30 mins, 45 mins, 1 hour"
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
                onPress={() => setTaskModal(false)}
              >
                <Text style={styles.btnPrimaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: accentColor }]}
                onPress={addTask}
              >
                <Text style={styles.btnPrimaryText}>Add Task</Text>
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

      {/* ================= MODAL: TIMER CUSTOM MODES ================= */}
      <Modal visible={timerSettingsModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.h1}>Routine Timer Modes</Text>
            <Text style={[styles.sub, { marginBottom: 12 }]}>
              Quickly switch intervals or adjust minutes
            </Text>
            <View style={{ gap: 8, marginBottom: 14 }}>
              {[
                { label: 'Pomodoro', dur: 25 },
                { label: 'Deep Focus', dur: 50 },
                { label: 'Quick Sprint', dur: 15 },
                { label: 'Learn', dur: 20 },
                { label: 'Practise', dur: 30 },
                { label: 'Review', dur: 10 }
              ].map((item) => (
                <TouchableOpacity
                  key={item.label}
                  style={[styles.choiceChip, { flexDirection: 'row', justifyContent: 'space-between', padding: 12 }]}
                  onPress={() => {
                    selectTimerMode(item);
                    setTimerSettingsModal(false);
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '600' }}>{item.label}</Text>
                  <Text style={{ color: accentColor, fontWeight: '700' }}>{item.dur} Minutes</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.btnPrimary, styles.btnGray, { alignSelf: 'flex-end' }]}
              onPress={() => setTimerSettingsModal(false)}
            >
              <Text style={styles.btnPrimaryText}>Close</Text>
            </TouchableOpacity>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#070b14',
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight || 28) : 44
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#0c1322',
    borderBottomWidth: 1,
    borderBottomColor: '#172338'
  },
  roadmapSelectorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131e33',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    maxWidth: '92%'
  },
  roadmapSelectorText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4
  },
  statsSub: {
    color: '#8295b3',
    fontSize: 11
  },
  reminderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#131e33',
    borderColor: '#23324e',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  reminderPillText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700'
  },
  streakBadge: {
    backgroundColor: '#f59e0b20',
    borderColor: '#f59e0b55',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  streakText: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '800'
  },
  syncChip: {
    backgroundColor: '#131e33',
    borderColor: '#23324e',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  progressBarBg: {
    height: 3,
    backgroundColor: '#131e33',
    width: '100%'
  },
  progressBarFill: {
    height: 3
  },
  alertBannerCard: {
    backgroundColor: '#17223b',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
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
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
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
    marginTop: 8,
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
    paddingVertical: 7
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
    borderRadius: 16,
    padding: 14,
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
    marginTop: 10
  },
  timerModeChip: {
    backgroundColor: '#172338',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8
  },
  timerDisplay: {
    color: '#f8fafc',
    fontSize: 48,
    fontWeight: '900',
    textAlign: 'center',
    marginVertical: 12,
    letterSpacing: 2,
    fontVariant: ['tabular-nums']
  },
  btnPrimary: {
    borderRadius: 12,
    paddingVertical: 10,
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
    borderColor: '#1b263b',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
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
    borderColor: '#1b263b',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 100,
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
    borderRadius: 16,
    padding: 14,
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
    borderRadius: 14,
    padding: 12,
    marginBottom: 10
  },
  phaseCard: {
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
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
    marginTop: 6
  },
  dayGridCell: {
    width: 38,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#090f1d',
    borderColor: '#1b263b',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  dayTopicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
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
    height: 64,
    backgroundColor: '#090e1a',
    borderTopWidth: 1,
    borderTopColor: '#172238',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: Platform.OS === 'ios' ? 12 : 0
  },
  navTab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
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
    borderRadius: 18,
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
    borderColor: '#1b263b',
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
    borderColor: '#1b263b',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14
  }
});
