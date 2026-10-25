import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import App from '../App';
import { getInitialAppState, STORAGE_KEY_V2, flushPendingSave, loadAppState } from '../storage';
import { createCustomRoadmap } from '../templates';

jest.setTimeout(30000);

// Alerts: record them, optionally auto-press a button by label
let alerts = [];
let autoPress = null;
beforeEach(async () => {
  alerts = [];
  autoPress = null;
  jest.spyOn(Alert, 'alert').mockImplementation((title, msg, buttons) => {
    alerts.push({ title, msg, buttons });
    if (autoPress && buttons) {
      const b = buttons.find((x) => autoPress(x.text));
      if (b && b.onPress) b.onPress();
    }
  });
  await AsyncStorage.clear();
  Object.keys(SecureStore.__store).forEach((k) => delete SecureStore.__store[k]);
  jest.clearAllMocks();
  delete global.fetch;
});

async function seed(mutator) {
  const s = getInitialAppState();
  s.settings = { language: 'en' };
  if (mutator) mutator(s);
  await AsyncStorage.setItem(STORAGE_KEY_V2, JSON.stringify(s));
  return s;
}

async function renderApp() {
  render(<App />);
  await screen.findByText('Focus');
}

const devopsRoadmap = () => {
  const r = createCustomRoadmap({ title: 'DevOps Engineer Path', description: 'Linux to Kubernetes', category: 'Coding & Career', totalDays: 30, phaseLength: 7 });
  r.id = 'devops_rm';
  r.phases[0].days[0].topic = 'Linux shell basics';
  r.phases[0].days[1].topic = 'Docker images & containers';
  r.phases[0].days[2].topic = 'Docker Compose';
  r.currentDay = 2;
  r.doneDays = [1];
  r.notes = { 1: 'Day one note' };
  return r;
};

test('language switch translates the interface and is saved', async () => {
  await seed();
  await renderApp();
  fireEvent.press(screen.getByText('Settings'));
  fireEvent.press(await screen.findByText('简体中文'));
  expect(await screen.findByText('专注')).toBeTruthy();
  expect(screen.getByText('路线图')).toBeTruthy();
  expect(screen.getByText('时间线')).toBeTruthy();
  expect(screen.getByText('设置与工具')).toBeTruthy();
  await act(async () => { await flushPendingSave(); });
  const saved = await loadAppState();
  expect(saved.settings.language).toBe('zh');
  // Switch back
  fireEvent.press(screen.getByText('English'));
  expect(await screen.findByText('Settings & Life Tools')).toBeTruthy();
});

test('lesson opens as a full page; demo lesson matches the selected day; Copy and DOCX export work', async () => {
  await seed((s) => { s.roadmaps = [devopsRoadmap(), ...s.roadmaps]; s.activeRoadmapId = 'devops_rm'; });
  await renderApp();
  fireEvent.press(screen.getByText('Course Lesson'));

  // Full page screen (no tab bar) with back button
  expect(await screen.findByText('DAY 2 • COURSE LESSON')).toBeTruthy();
  expect(screen.queryByText('Timeline')).toBeNull();

  fireEvent.press(screen.getByTestId('lesson-generate'));
  expect(await screen.findByText('Day 2 — Docker images & containers')).toBeTruthy();
  expect(screen.queryByText(/Huawei|VRP|eNSP/)).toBeNull();

  fireEvent.press(screen.getByTestId('lesson-copy'));
  await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalled());
  const copied = Clipboard.setStringAsync.mock.calls[0][0];
  expect(copied).toContain('Docker images & containers');
  expect(copied).toContain('PART 4');

  fireEvent.press(screen.getByTestId('lesson-export'));
  await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
  const [uri, opts] = Sharing.shareAsync.mock.calls[0];
  expect(uri).toMatch(/^file:\/\/\/cache\/Day-2-Docker-images-containers\.docx$/);
  expect(opts.mimeType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const written = FileSystem.writeAsStringAsync.mock.calls[0];
  expect(written[2].encoding).toBe('base64');
  expect(Buffer.from(written[1], 'base64').slice(0, 2).toString()).toBe('PK'); // ZIP/DOCX signature

  // Upload is no longer in the viewer toolbar; it lives under Generation options
  expect(screen.queryByText(/Upload \/ Doc/)).toBeNull();
  fireEvent.press(screen.getByText('⚙️ Generation options'));
  expect(await screen.findByText('📎 Attach / edit document')).toBeTruthy();

  fireEvent.press(screen.getByText('‹ Back'));
  expect(await screen.findByText('Timeline')).toBeTruthy();
});

test('custom instructions, language override and reference doc reach the AI request', async () => {
  await seed((s) => {
    const r = devopsRoadmap();
    r.referenceDocs = { 2: { content: 'Company Docker style guide: always pin image tags.', name: 'guide.md' } };
    s.roadmaps = [r, ...s.roadmaps];
    s.activeRoadmapId = 'devops_rm';
    s.aiConfig = { provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o-mini' };
  });
  const calls = [];
  global.fetch = jest.fn(async (url, opts) => {
    calls.push(JSON.parse(opts.body));
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '# 第 2 天 — Docker 镜像与容器\n内容' }, finish_reason: 'stop' }] }) };
  });
  await renderApp();
  fireEvent.press(screen.getByText('Course Lesson'));
  await screen.findByText('DAY 2 • COURSE LESSON');
  // Options panel is open when there is no lesson yet
  fireEvent.changeText(screen.getByTestId('lesson-instructions'), 'Only a cheat sheet with 10 docker commands');
  fireEvent.press(screen.getByText('简体中文'));
  fireEvent.press(screen.getByTestId('lesson-generate'));
  expect(await screen.findByText('第 2 天 — Docker 镜像与容器')).toBeTruthy();

  const user = calls[0].messages[1].content;
  const system = calls[0].messages[0].content;
  expect(user).toContain('Roadmap: DevOps Engineer Path');
  expect(user).toContain("TODAY'S TOPIC: Docker images & containers");
  expect(user).toContain('Previous day topic (already learned): Linux shell basics');
  expect(user).toContain('Next day topic (prepare for it, do not teach it): Docker Compose');
  expect(user).toContain('Only a cheat sheet with 10 docker commands');
  expect(user).toContain('Company Docker style guide');
  expect(system).toMatch(/简体中文/);
  expect(system + user).not.toMatch(/Huawei|VRP|eNSP/);
});

test('practice & quiz opens as a full page, generates, and answers are interactive', async () => {
  await seed((s) => { s.roadmaps = [devopsRoadmap(), ...s.roadmaps]; s.activeRoadmapId = 'devops_rm'; });
  await renderApp();
  fireEvent.press(screen.getByText('Practice & Quiz'));
  expect(await screen.findByText('DAY 2 • PRACTICE & ASSESSMENT')).toBeTruthy();
  fireEvent.press(screen.getByTestId('practice-generate'));
  expect(await screen.findByText('Hands-on Practice: Docker images & containers')).toBeTruthy();
  fireEvent.press(screen.getByText(/^A\. Understand the core concept/));
  expect(await screen.findByText('✅ Correct!')).toBeTruthy();
});

test('journey notes: no length limit, auto-save, Copy All, safe clear with undo', async () => {
  await seed((s) => { s.roadmaps = [devopsRoadmap(), ...s.roadmaps]; s.activeRoadmapId = 'devops_rm'; });
  await renderApp();
  fireEvent.press(screen.getByText('📖 Full Page'));
  const editor = await screen.findByTestId('notes-editor');

  const longText = 'kubectl get pods -A  # check everything\n'.repeat(6000); // ~240k chars
  fireEvent.changeText(editor, longText);
  expect(screen.getByTestId('notes-counter').props.children).toBe(`${longText.length.toLocaleString()} characters · no limit · auto-saved locally`);

  // Auto-save: committed after the debounce, then persisted
  await waitFor(async () => {
    await flushPendingSave();
    const saved = await loadAppState();
    expect(saved.roadmaps[0].notes[2]).toBe(longText);
  }, { timeout: 5000 });

  // Copy All -> all days
  autoPress = (label) => /All journey notes/.test(label);
  fireEvent.press(screen.getByTestId('notes-copy-all'));
  await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalled());
  const all = Clipboard.setStringAsync.mock.calls[0][0];
  expect(all).toContain('DevOps Engineer Path');
  expect(all).toContain('=== Day 1 — Linux shell basics ===');
  expect(all).toContain('Day one note');
  expect(all).toContain('=== Day 2 — Docker images & containers ===');
  expect(all.length).toBeGreaterThan(longText.length);

  // Clear requires confirmation and can be undone
  autoPress = (label) => label === 'Clear Note';
  fireEvent.press(screen.getByText('🗑 Clear'));
  expect(alerts.some((a) => a.title === 'Clear this note?')).toBe(true);
  fireEvent.press(await screen.findByText('↩ Undo Clear'));
  await waitFor(async () => {
    await flushPendingSave();
    const saved = await loadAppState();
    expect(saved.roadmaps[0].notes[2]).toBe(longText);
  });
});

test('changing an existing roadmap duration shows a preview and preserves progress', async () => {
  await seed((s) => {
    const r = devopsRoadmap();
    r.currentDay = 4;
    r.doneDays = [1, 2, 3];
    r.lessons = { 2: { day: 2, topic: 'Docker images & containers', content: '# kept lesson', type: 'ai' } };
    s.roadmaps = [r, ...s.roadmaps];
    s.activeRoadmapId = 'devops_rm';
  });
  await renderApp();
  fireEvent.press(screen.getByText('Roadmaps'));
  fireEvent.press((await screen.findAllByText('✎ Edit / Duration'))[0]);
  expect(await screen.findByText(/Currently 30 days · 3 completed · days 1–3 are locked/)).toBeTruthy();

  // Switch to weeks: 30 days -> 4 weeks, then choose 8 weeks = 56 days
  fireEvent.press(screen.getByText('Weeks'));
  fireEvent.press(screen.getByText('8 Weeks'));
  expect(screen.getByText('= 56 days total')).toBeTruthy();
  fireEvent.press(screen.getByTestId('edit-roadmap-save'));

  // Preview, not applied yet
  expect((await screen.findByTestId('schedule-preview-summary')).props.children).toBe('30 days → 56 days (+26)');
  expect(screen.getByText(/Days 1–3 stay exactly as they are/)).toBeTruthy();
  let saved;
  await act(async () => { await flushPendingSave(); });
  saved = await loadAppState();
  expect(saved.roadmaps[0].totalDays).toBe(30);

  fireEvent.press(screen.getByTestId('schedule-confirm'));
  await waitFor(() => expect(alerts.some((a) => a.title === 'Schedule Updated ✅')).toBe(true));
  await act(async () => { await flushPendingSave(); });
  saved = await loadAppState();
  const r = saved.roadmaps[0];
  expect(r.totalDays).toBe(56);
  expect(r.doneDays).toEqual([1, 2, 3]);
  expect(r.currentDay).toBe(4);
  expect(r.notes[1]).toBe('Day one note');
  expect(r.lessons[2].content).toBe('# kept lesson');
  expect(r.phases.flatMap((p) => p.days)).toHaveLength(56);
});

test('cannot shorten below completed progress', async () => {
  await seed((s) => {
    const r = devopsRoadmap();
    r.currentDay = 11;
    r.doneDays = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    s.roadmaps = [r, ...s.roadmaps];
    s.activeRoadmapId = 'devops_rm';
  });
  await renderApp();
  fireEvent.press(screen.getByText('Roadmaps'));
  fireEvent.press((await screen.findAllByText('✎ Edit / Duration'))[0]);
  fireEvent.press(screen.getByText('7 Days'));
  fireEvent.press(screen.getByTestId('edit-roadmap-save'));
  await waitFor(() => expect(alerts.some((a) => a.title === 'Cannot change duration')).toBe(true));
  expect(screen.queryByTestId('schedule-preview-summary')).toBeNull();
});

test('AI roadmap generator accepts a custom duration in weeks', async () => {
  await seed();
  await renderApp();
  fireEvent.press(screen.getByText('Roadmaps'));
  fireEvent.press(await screen.findByText('✨ AI Generator'));
  fireEvent.changeText(await screen.findByTestId('ai-roadmap-goal'), 'Learn Rust');
  fireEvent.press(screen.getAllByText('Weeks')[0]);
  fireEvent.changeText(screen.getByPlaceholderText('Or type any number of weeks'), '10');
  expect(screen.getByText('= 70 days total')).toBeTruthy();
  expect(screen.getByText('🚀 Generate 70-Day Roadmap')).toBeTruthy();
  fireEvent.press(screen.getByTestId('ai-roadmap-generate'));
  await waitFor(() => expect(alerts.some((a) => a.title === '🎉 Roadmap Created!')).toBe(true));
  await act(async () => { await flushPendingSave(); });
  const saved = await loadAppState();
  const created = saved.roadmaps.find((r) => r.id === saved.activeRoadmapId);
  expect(created.totalDays).toBe(70);
  expect(created.phases.flatMap((p) => p.days)).toHaveLength(70);
});
