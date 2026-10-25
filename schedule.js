// ============================================================
// schedule.js - Roadmap duration & schedule recalculation
// Pure helpers (no React / storage) so they can be unit tested.
//   - toDays(): convert "N days" / "N weeks" into a day count
//   - planScheduleResize(): preview what a duration change will do
//   - applyScheduleResize(): rebuild phases + move per-day data
//   - normalizeGeneratedPhases(): force AI output to exactly N days
// ============================================================

export const MIN_ROADMAP_DAYS = 1;
export const MAX_ROADMAP_DAYS = 1000;

// Per-day data stores on a roadmap object (keyed by day number)
export const DAY_DATA_FIELDS = ['notes', 'lessons', 'quizzes', 'tasks', 'referenceDocs'];

const DEFAULT_LABELS = {
  fillerTopic: (prevTopic) => (prevTopic ? `Review & practice: ${prevTopic}` : 'Review & practice'),
  mergeTopics: (topics) => topics.join(' + '),
  mergedNoteHeader: (day, topic) => `--- Day ${day}: ${topic} ---`,
  placeholderTopic: (day) => `Focus Day ${day}`
};

export function toDays(value, unit = 'days') {
  const n = parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return unit === 'weeks' ? n * 7 : n;
}

// Flatten phases into an ordered list for days 1..totalDays
export function flattenDays(roadmap, labels = DEFAULT_LABELS) {
  const total = Math.max(0, parseInt(roadmap.totalDays, 10) || 0);
  const byDay = {};
  (roadmap.phases || []).forEach((phase) => {
    (phase.days || []).forEach((d) => {
      if (d && d.day >= 1 && d.day <= total && !byDay[d.day]) {
        byDay[d.day] = { ...d, phaseId: phase.id };
      }
    });
  });
  const phases = roadmap.phases || [];
  const list = [];
  for (let day = 1; day <= total; day++) {
    if (byDay[day]) {
      list.push(byDay[day]);
    } else {
      const owner = phases.find((p) => day >= p.startDay && day <= p.endDay) || phases[phases.length - 1];
      list.push({ day, topic: labels.placeholderTopic(day), phaseId: owner ? owner.id : 'p_auto' });
    }
  }
  return list;
}

// Days that must never move: everything up to the last completed day
// and everything before the day the learner is currently on.
export function getLockedDayCount(roadmap) {
  const total = parseInt(roadmap.totalDays, 10) || 0;
  const done = Array.isArray(roadmap.doneDays) ? roadmap.doneDays : [];
  const maxDone = done.length ? Math.max(...done) : 0;
  const beforeCurrent = (roadmap.currentDay || 1) - 1;
  return Math.min(total, Math.max(0, maxDone, beforeCurrent));
}

function hasDayData(roadmap, field, day) {
  const store = roadmap[field];
  if (!store) return false;
  const v = store[day];
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function updateRangeInTitle(title, startDay, endDay) {
  if (!title) return title;
  const range = /(Days?\s*)\d+\s*[–—-]\s*\d+/;
  if (range.test(title)) return title.replace(range, `$1${startDay}–${endDay}`);
  const cn = /第\s*\d+\s*[–—-]\s*\d+\s*天/;
  if (cn.test(title)) return title.replace(cn, `第${startDay}–${endDay}天`);
  return title;
}

// Core mapping: returns, for each new day (1..newTotal), the list of old days it is built from.
// Locked days map 1:1. Remaining days are stretched (fillers inserted) or compressed (merged).
function buildDayMapping(oldTotal, newTotal, locked) {
  const R = oldTotal - locked; // old remaining days
  const S = newTotal - locked; // new remaining slots
  const slots = []; // index = new day - 1 -> { sources: [oldDay], fillerOf: oldDay|null }
  for (let d = 1; d <= locked; d++) slots.push({ sources: [d], fillerOf: null });
  if (S <= 0) return { slots, dropped: R > 0 ? range(locked + 1, oldTotal) : [] };

  const remainingSlots = Array.from({ length: S }, () => ({ sources: [], fillerOf: null }));
  for (let i = 0; i < R; i++) {
    const slot = Math.floor((i * S) / R);
    remainingSlots[slot].sources.push(locked + 1 + i);
  }
  // Fillers inherit the most recent real day before them
  let lastReal = locked > 0 ? locked : null;
  remainingSlots.forEach((s) => {
    if (s.sources.length > 0) lastReal = s.sources[s.sources.length - 1];
    else s.fillerOf = lastReal;
  });
  return { slots: slots.concat(remainingSlots), dropped: [] };
}

function range(a, b) {
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

/**
 * Compute a full preview + the resulting roadmap for a duration change.
 * Returns { ok, error, minDays, ...stats, roadmap }.
 */
export function planScheduleResize(roadmap, newTotalRaw, labels = {}) {
  const L = { ...DEFAULT_LABELS, ...labels };
  const oldTotal = parseInt(roadmap.totalDays, 10) || 0;
  const newTotal = parseInt(newTotalRaw, 10) || 0;
  const locked = getLockedDayCount(roadmap);
  const minDays = Math.max(MIN_ROADMAP_DAYS, locked);

  if (newTotal < MIN_ROADMAP_DAYS || newTotal > MAX_ROADMAP_DAYS) {
    return { ok: false, error: 'outOfRange', minDays, maxDays: MAX_ROADMAP_DAYS };
  }
  if (newTotal < locked) {
    return { ok: false, error: 'belowLocked', minDays, lockedDays: locked };
  }

  const oldDays = flattenDays(roadmap, L);
  const oldByDay = {};
  oldDays.forEach((d) => { oldByDay[d.day] = d; });
  const { slots, dropped } = buildDayMapping(oldTotal, newTotal, locked);

  // Build new day list
  const newDays = slots.map((slot, idx) => {
    const day = idx + 1;
    if (slot.sources.length === 1) {
      const src = oldByDay[slot.sources[0]];
      return { ...src, day, sources: slot.sources };
    }
    if (slot.sources.length > 1) {
      const srcs = slot.sources.map((s) => oldByDay[s]);
      const objectives = srcs.map((s) => s.objectives).filter(Boolean).join('\n');
      return {
        day,
        topic: L.mergeTopics(srcs.map((s) => s.topic)),
        ...(objectives ? { objectives } : {}),
        phaseId: srcs[0].phaseId,
        sources: slot.sources
      };
    }
    const prev = slot.fillerOf ? oldByDay[slot.fillerOf] : null;
    const lastPhase = (roadmap.phases || [])[(roadmap.phases || []).length - 1];
    return {
      day,
      topic: L.fillerTopic(prev ? prev.topic : '', day),
      phaseId: prev ? prev.phaseId : lastPhase ? lastPhase.id : 'p_auto',
      sources: [],
      isFiller: true
    };
  });

  // Rebuild phases, preserving original phase order/metadata
  const phaseOrder = (roadmap.phases || []).map((p) => p.id);
  const phaseMeta = {};
  (roadmap.phases || []).forEach((p) => { phaseMeta[p.id] = p; });
  const grouped = {};
  newDays.forEach((d) => {
    if (!grouped[d.phaseId]) grouped[d.phaseId] = [];
    grouped[d.phaseId].push(d);
  });
  const allPhaseIds = phaseOrder.concat(Object.keys(grouped).filter((id) => !phaseOrder.includes(id)));
  const newPhases = allPhaseIds
    .filter((id) => grouped[id] && grouped[id].length > 0)
    .map((id) => {
      const days = grouped[id];
      const startDay = days[0].day;
      const endDay = days[days.length - 1].day;
      const meta = phaseMeta[id] || { id, title: `Phase (Days ${startDay}–${endDay})` };
      return {
        ...meta,
        startDay,
        endDay,
        title: updateRangeInTitle(meta.title, startDay, endDay),
        days: days.map(({ sources, isFiller, phaseId, ...rest }) => rest)
      };
    });

  // Move per-day data along with the topics
  const out = {};
  DAY_DATA_FIELDS.forEach((f) => { out[f] = {}; });
  const archived = [];
  let movedItems = 0;
  let mergedDataDays = 0;

  newDays.forEach((nd) => {
    const srcWithData = nd.sources.filter((s) => DAY_DATA_FIELDS.some((f) => hasDayData(roadmap, f, s)));
    if (srcWithData.length > 1) mergedDataDays++;
    nd.sources.forEach((s) => {
      if (s !== nd.day && DAY_DATA_FIELDS.some((f) => hasDayData(roadmap, f, s))) movedItems++;
    });

    // Notes: concatenate with headers when merging
    const noteSrcs = nd.sources.filter((s) => hasDayData(roadmap, 'notes', s));
    if (noteSrcs.length === 1) {
      out.notes[nd.day] = roadmap.notes[noteSrcs[0]];
    } else if (noteSrcs.length > 1) {
      out.notes[nd.day] = noteSrcs
        .map((s) => `${L.mergedNoteHeader(s, oldByDay[s].topic)}\n${roadmap.notes[s]}`)
        .join('\n\n');
    }

    // Tasks: concatenate lists
    const taskSrcs = nd.sources.filter((s) => hasDayData(roadmap, 'tasks', s));
    if (taskSrcs.length > 0) {
      out.tasks[nd.day] = taskSrcs.flatMap((s) => roadmap.tasks[s]);
    }

    // Lessons: concatenate markdown content of merged days
    const lessonSrcs = nd.sources.filter((s) => hasDayData(roadmap, 'lessons', s));
    if (lessonSrcs.length === 1) {
      out.lessons[nd.day] = { ...roadmap.lessons[lessonSrcs[0]], day: nd.day };
    } else if (lessonSrcs.length > 1) {
      const first = roadmap.lessons[lessonSrcs[0]];
      out.lessons[nd.day] = {
        ...first,
        day: nd.day,
        topic: nd.topic,
        content: lessonSrcs.map((s) => roadmap.lessons[s].content || '').join('\n\n---\n\n'),
        mergedFromDays: lessonSrcs
      };
    }

    // Reference docs: concatenate text
    const refSrcs = nd.sources.filter((s) => hasDayData(roadmap, 'referenceDocs', s));
    if (refSrcs.length === 1) {
      out.referenceDocs[nd.day] = roadmap.referenceDocs[refSrcs[0]];
    } else if (refSrcs.length > 1) {
      const docs = refSrcs.map((s) => roadmap.referenceDocs[s]);
      out.referenceDocs[nd.day] = {
        name: docs.map((d) => (typeof d === 'string' ? `Day ${nd.day}` : d.name)).join(' + '),
        content: docs.map((d) => (typeof d === 'string' ? d : d.content || '')).join('\n\n'),
        updatedAt: new Date().toISOString()
      };
    }

    // Quizzes: one interactive quiz per day; keep the first, archive the rest
    const quizSrcs = nd.sources.filter((s) => hasDayData(roadmap, 'quizzes', s));
    if (quizSrcs.length > 0) {
      out.quizzes[nd.day] = { ...roadmap.quizzes[quizSrcs[0]], day: nd.day };
      quizSrcs.slice(1).forEach((s) => {
        archived.push({ originalDay: s, topic: oldByDay[s].topic, quiz: roadmap.quizzes[s] });
      });
    }
  });

  // Orphaned data stored under day keys outside the old schedule is archived, never discarded
  DAY_DATA_FIELDS.forEach((f) => {
    Object.keys(roadmap[f] || {}).forEach((k) => {
      const dayNum = Number(k);
      if (!(Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= oldTotal) && hasDayData(roadmap, f, k)) {
        archived.push({ originalDay: k, field: f, value: roadmap[f][k] });
      }
    });
  });

  // Days dropped entirely (only possible when shortening down to the locked prefix)
  dropped.forEach((s) => {
    const item = { originalDay: s, topic: oldByDay[s] ? oldByDay[s].topic : '' };
    let any = false;
    DAY_DATA_FIELDS.forEach((f) => {
      if (hasDayData(roadmap, f, s)) {
        item[f === 'notes' ? 'note' : f === 'lessons' ? 'lesson' : f === 'quizzes' ? 'quiz' : f === 'referenceDocs' ? 'referenceDoc' : 'tasks'] = roadmap[f][s];
        any = true;
      }
    });
    if (any) archived.push(item);
  });

  const archivedAt = new Date().toISOString();
  const newRoadmap = {
    ...roadmap,
    totalDays: newTotal,
    phases: newPhases,
    currentDay: Math.min(Math.max(1, roadmap.currentDay || 1), newTotal),
    doneDays: (roadmap.doneDays || []).filter((d) => d <= newTotal),
    ...out,
    ...(archived.length > 0
      ? { archivedDays: [...(roadmap.archivedDays || []), ...archived.map((a) => ({ ...a, archivedAt }))] }
      : {}),
    scheduleHistory: [
      ...(roadmap.scheduleHistory || []),
      { from: oldTotal, to: newTotal, lockedDays: locked, changedAt: archivedAt }
    ]
  };

  const delta = newTotal - oldTotal;
  const fillers = newDays.filter((d) => d.isFiller).length;
  const mergedDays = slots.filter((s) => s.sources.length > 1).length;

  return {
    ok: true,
    oldTotal,
    newTotal,
    delta,
    lockedDays: locked,
    minDays,
    remainingOld: oldTotal - locked,
    remainingNew: newTotal - locked,
    addedDays: fillers,
    mergedDays,
    droppedDays: dropped.length,
    movedItems,
    mergedDataDays,
    archivedItems: archived.length,
    phasesBefore: (roadmap.phases || []).map(({ id, title, startDay, endDay }) => ({ id, title, startDay, endDay })),
    phasesAfter: newPhases.map(({ id, title, startDay, endDay }) => ({ id, title, startDay, endDay })),
    significant:
      delta !== 0 &&
      (Math.abs(delta) >= 7 || Math.abs(delta) / Math.max(1, oldTotal) >= 0.2 || mergedDays > 0 || archived.length > 0 || dropped.length > 0),
    roadmap: newRoadmap
  };
}

export function applyScheduleResize(roadmap, newTotal, labels) {
  const plan = planScheduleResize(roadmap, newTotal, labels);
  if (!plan.ok) throw new Error(plan.error);
  return plan.roadmap;
}

/**
 * Make AI-generated phases cover exactly `totalDays` contiguous days.
 * LLMs often return too few/too many days for long durations.
 */
export function normalizeGeneratedPhases(phases, totalDays, labels = {}) {
  const target = Math.max(1, parseInt(totalDays, 10) || 1);
  const cleanPhases = (Array.isArray(phases) ? phases : [])
    .filter((p) => p && Array.isArray(p.days))
    .map((p, idx) => ({
      ...p,
      id: p.id || `p_${idx + 1}`,
      days: p.days
        .filter((d) => d && (d.topic || d.title))
        .map((d) => ({ ...d, topic: String(d.topic || d.title).trim() }))
    }))
    .filter((p) => p.days.length > 0);

  // Ensure unique phase ids
  const seen = {};
  cleanPhases.forEach((p, idx) => {
    if (seen[p.id]) p.id = `${p.id}_${idx + 1}`;
    seen[p.id] = true;
  });

  // Renumber sequentially in the order the AI gave them
  let n = 0;
  const sequential = cleanPhases.map((p) => {
    const days = p.days.map((d) => ({ ...d, day: ++n }));
    return { ...p, startDay: days[0].day, endDay: days[days.length - 1].day, days };
  });

  if (n === 0) {
    const L = { ...DEFAULT_LABELS, ...labels };
    const days = range(1, target).map((day) => ({ day, topic: L.placeholderTopic(day) }));
    return [{ id: 'p_1', title: `Phase 1 (Days 1–${target})`, startDay: 1, endDay: target, days }];
  }

  const shaped = sequential.map((p) => ({ ...p, title: updateRangeInTitle(p.title || 'Phase', p.startDay, p.endDay) }));
  if (n === target) return shaped;

  // Stretch or compress the whole plan (nothing is locked for a brand new roadmap)
  const plan = planScheduleResize({ totalDays: n, phases: shaped, currentDay: 1, doneDays: [] }, target, labels);
  return plan.roadmap.phases;
}
