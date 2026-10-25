import { toDays, planScheduleResize, normalizeGeneratedPhases, getLockedDayCount, flattenDays } from '../schedule';
import { buildHuaweiRoadmap, createCustomRoadmap } from '../templates';

const contiguous = (phases, total) => {
  const days = phases.flatMap((p) => p.days.map((d) => d.day));
  expect(days).toEqual(Array.from({ length: total }, (_, i) => i + 1));
  phases.forEach((p) => {
    expect(p.startDay).toBe(p.days[0].day);
    expect(p.endDay).toBe(p.days[p.days.length - 1].day);
  });
};

function roadmapWithProgress() {
  const r = buildHuaweiRoadmap(); // 180 days, 6 phases
  return {
    ...r,
    currentDay: 11,
    doneDays: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    notes: { 3: 'note day 3', 10: 'note day 10', 11: 'in-progress note', 40: 'future note' },
    lessons: { 5: { day: 5, topic: 'Windows tools: ping, tracert, ARP', content: '# lesson 5' }, 12: { day: 12, topic: 'x', content: '# lesson 12' } },
    quizzes: { 5: { day: 5, quiz: [] } },
    tasks: { 2: [{ id: 'a', title: 't', done: true }] }
  };
}

describe('toDays', () => {
  test('days and weeks', () => {
    expect(toDays('30', 'days')).toBe(30);
    expect(toDays('6', 'weeks')).toBe(42);
    expect(toDays('', 'days')).toBe(0);
    expect(toDays('-3', 'days')).toBe(0);
    expect(toDays('abc', 'weeks')).toBe(0);
  });
});

describe('planScheduleResize', () => {
  test('locked prefix = completed days / days before current', () => {
    expect(getLockedDayCount(roadmapWithProgress())).toBe(10);
  });

  test('extending keeps completed days, lessons and notes untouched', () => {
    const r = roadmapWithProgress();
    const plan = planScheduleResize(r, 240);
    expect(plan.ok).toBe(true);
    const out = plan.roadmap;
    expect(out.totalDays).toBe(240);
    contiguous(out.phases, 240);
    // Locked days 1-10 identical
    const before = flattenDays(r);
    const after = flattenDays(out);
    for (let d = 1; d <= 10; d++) expect(after[d - 1].topic).toBe(before[d - 1].topic);
    expect(out.doneDays).toEqual(r.doneDays);
    expect(out.notes[3]).toBe('note day 3');
    expect(out.notes[10]).toBe('note day 10');
    expect(out.lessons[5].content).toBe('# lesson 5');
    expect(out.quizzes[5]).toBeTruthy();
    expect(out.tasks[2]).toEqual(r.tasks[2]);
    // Current day keeps its note and topic
    expect(out.currentDay).toBe(11);
    expect(out.notes[11]).toBe('in-progress note');
    expect(after[10].topic).toBe(before[10].topic);
    // 60 filler days inserted, every original topic still present exactly once
    expect(plan.addedDays).toBe(60);
    const originalTopics = before.map((d) => d.topic);
    originalTopics.forEach((tp) => expect(after.some((d) => d.topic === tp)).toBe(true));
    // Future note moved with its topic
    const futureTopic = before[39].topic;
    const newDay = after.find((d) => d.topic === futureTopic).day;
    expect(out.notes[newDay]).toBe('future note');
    expect(plan.significant).toBe(true);
    expect(out.scheduleHistory[out.scheduleHistory.length - 1]).toMatchObject({ from: 180, to: 240, lockedDays: 10 });
  });

  test('shortening merges topics and never deletes notes', () => {
    const r = roadmapWithProgress();
    const plan = planScheduleResize(r, 90);
    expect(plan.ok).toBe(true);
    const out = plan.roadmap;
    contiguous(out.phases, 90);
    expect(plan.mergedDays).toBeGreaterThan(0);
    // All note text still exists somewhere
    const allNotes = Object.values(out.notes).join('\n');
    ['note day 3', 'note day 10', 'in-progress note', 'future note'].forEach((n) => expect(allNotes).toContain(n));
    expect(out.notes[11]).toContain('in-progress note');
    expect(out.lessons[5].content).toBe('# lesson 5');
    // Day 12 lesson still exists (moved/merged), nothing lost
    expect(Object.values(out.lessons).some((l) => l.content.includes('# lesson 12'))).toBe(true);
  });

  test('cannot shorten below completed progress', () => {
    const plan = planScheduleResize(roadmapWithProgress(), 8);
    expect(plan.ok).toBe(false);
    expect(plan.error).toBe('belowLocked');
    expect(plan.minDays).toBe(10);
  });

  test('shortening to exactly the locked prefix archives future data instead of deleting it', () => {
    const plan = planScheduleResize(roadmapWithProgress(), 10);
    expect(plan.ok).toBe(true);
    expect(plan.roadmap.totalDays).toBe(10);
    expect(plan.roadmap.currentDay).toBe(10);
    const archived = JSON.stringify(plan.roadmap.archivedDays);
    expect(archived).toContain('in-progress note');
    expect(archived).toContain('future note');
    expect(archived).toContain('# lesson 12');
  });

  test('rejects out-of-range values', () => {
    expect(planScheduleResize(roadmapWithProgress(), 0).ok).toBe(false);
    expect(planScheduleResize(roadmapWithProgress(), 5000).ok).toBe(false);
  });

  test('phase titles get updated day ranges', () => {
    const r = createCustomRoadmap({ title: 'Fitness', totalDays: 14, phaseLength: 7 });
    const plan = planScheduleResize(r, 28);
    expect(plan.roadmap.phases.map((p) => p.title)).toEqual(['Week 1 (Days 1–14)', 'Week 2 (Days 15–28)']);
  });

  test('no-op resize of a fresh roadmap', () => {
    const r = createCustomRoadmap({ title: 'X', totalDays: 30 });
    const plan = planScheduleResize(r, 30);
    expect(plan.ok).toBe(true);
    expect(plan.delta).toBe(0);
    expect(plan.significant).toBe(false);
  });
});

describe('normalizeGeneratedPhases (AI duration enforcement)', () => {
  const aiPhases = (counts) => counts.map((c, i) => ({
    id: `p_${i + 1}`,
    title: `Phase ${i + 1} (Days 1–${c})`,
    days: Array.from({ length: c }, (_, d) => ({ day: d + 1, topic: `P${i + 1} topic ${d + 1}` }))
  }));

  test('AI returned too few days -> exactly requested length', () => {
    const phases = normalizeGeneratedPhases(aiPhases([20, 20]), 100);
    contiguous(phases, 100);
  });

  test('AI returned too many days -> exactly requested length', () => {
    const phases = normalizeGeneratedPhases(aiPhases([30, 30, 30]), 45);
    contiguous(phases, 45);
  });

  test('AI returned the right length with bad numbering -> renumbered', () => {
    const phases = normalizeGeneratedPhases(aiPhases([7, 7]), 14);
    contiguous(phases, 14);
    expect(phases[1].title).toBe('Phase 2 (Days 8–14)');
  });

  test('AI returned nothing usable -> placeholder plan', () => {
    const phases = normalizeGeneratedPhases(null, 21);
    contiguous(phases, 21);
  });

  test('365-day plan from weeks input', () => {
    const phases = normalizeGeneratedPhases(aiPhases([90, 90, 90]), 52 * 7);
    contiguous(phases, 364);
  });
});
