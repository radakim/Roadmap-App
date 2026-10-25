import { StyleSheet, Platform, StatusBar as RNStatusBar } from 'react-native';

// Shared stylesheet for App.js and the full-page screens
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0f1d',
    // Dynamic Island clearance: 58px on modern iOS, or status bar height on Android
    paddingTop: Platform.OS === 'ios' ? 58 : Platform.OS === 'web' ? 0 : (RNStatusBar.currentHeight ? RNStatusBar.currentHeight + 8 : 36)
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
    maxHeight: '90%',
    // Dialogs stay readable on wide (desktop web) screens
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center'
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
  },
  // ---------- Full-page screens (lesson, practice, notes) ----------
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    gap: 8
  },
  screenBackBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#172338',
    borderWidth: 1,
    borderColor: '#233550'
  },
  screenBackText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700'
  },
  screenToolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#0c1322',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b'
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155'
  },
  toolbarBtnText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700'
  },
  screenScroll: {
    flex: 1
  },
  screenScrollContent: {
    padding: 14,
    paddingBottom: 60
  },
  optionsPanel: {
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12
  },
  langChip: {
    backgroundColor: '#172338',
    borderColor: '#233550',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  infoBox: {
    backgroundColor: '#090f1d',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginTop: 8
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8
  },
  previewText: {
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 18,
    flex: 1
  },
  previewPhaseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    gap: 8
  },

  // ---------------- Desktop web layout (window >= 960px) ----------------
  webRoot: {
    flexDirection: 'row'
  },
  webMain: {
    flex: 1,
    minWidth: 0
  },
  webSidebar: {
    width: 264,
    backgroundColor: '#0c1322',
    borderRightWidth: 1,
    borderRightColor: '#1e293b'
  },
  webSidebarInner: {
    flexGrow: 1,
    paddingVertical: 20,
    paddingHorizontal: 14
  },
  webBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    marginBottom: 18
  },
  webBrandText: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '800'
  },
  webRoadmapCard: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 14,
    padding: 12
  },
  webSectionLabel: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 6,
    paddingHorizontal: 10
  },
  webNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 2
  },
  webNavItemActive: {
    backgroundColor: '#1e293b'
  },
  webNavIcon: {
    fontSize: 16,
    width: 22,
    textAlign: 'center'
  },
  webNavLabel: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
    flex: 1
  },
  webSidebarFooter: {
    marginTop: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    gap: 10
  },
  webContent: {
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
    paddingHorizontal: 32,
    paddingTop: 28,
    paddingBottom: 48
  },
  webScreenContent: {
    width: '100%',
    maxWidth: 980,
    alignSelf: 'center',
    paddingHorizontal: 32,
    paddingTop: 24
  },
  webColumns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 20
  },
  webCol: {
    flex: 1,
    minWidth: 0
  },
  webGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16
  },
  webGridItem: {
    width: 'calc(50% - 8px)',
    marginBottom: 0
  }
});

export default styles;
