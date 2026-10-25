// ============================================================
// contentExport.js - Display adapters + text builders for
// lessons, practice labs/quizzes and journey notes.
// Pure functions (no React) so they can be unit tested.
// ============================================================

// Practice data saved before schema 2 used network-specific fields
// (equipment, topology, ipTable, brokenConfig...). Map both shapes
// onto one view model so old saved labs keep rendering.
export function toPracticeView(practice, legacyColumns = ['Device', 'Interface', 'IP', 'Gateway', 'VLAN', 'Purpose']) {
  if (!practice) return null;
  const lab = practice.lab || null;
  let labView = null;
  if (lab) {
    let table = null;
    if (lab.table && Array.isArray(lab.table.columns) && Array.isArray(lab.table.rows) && lab.table.rows.length) {
      table = lab.table;
    } else if (Array.isArray(lab.ipTable) && lab.ipTable.length) {
      table = {
        columns: legacyColumns,
        rows: lab.ipTable.map((r) => [r.device, r.interface, r.ip, r.gateway, r.vlan, r.purpose].map((x) => (x ? String(x) : '')))
      };
    }
    const ts = lab.troubleshooting;
    labView = {
      title: lab.title || '',
      scenario: lab.scenario || '',
      objectives: Array.isArray(lab.objectives) ? lab.objectives : [],
      environment: lab.environment || lab.equipment || '',
      diagram: lab.diagram || lab.topology || '',
      table,
      exercises: Array.isArray(lab.exercises)
        ? lab.exercises.map((e) => ({
            title: e.title || '',
            instructions: e.instructions || '',
            commands: e.commands || '',
            verification: e.verification || ''
          }))
        : [],
      steps: Array.isArray(lab.steps) ? lab.steps : [],
      troubleshooting: ts
        ? {
            problem: ts.problem || ts.brokenConfig || '',
            diagnosis: ts.diagnosis || ts.diagnosticCommands || '',
            solution: ts.solution || ''
          }
        : null,
      checklist: Array.isArray(lab.checklist) ? lab.checklist : [],
      verification: lab.verification || ''
    };
  }
  const quiz = (Array.isArray(practice.quiz) ? practice.quiz : []).filter(
    (q) => q && q.question && Array.isArray(q.options) && q.options.length > 0
  );
  return {
    ...practice,
    lab: labView,
    quiz,
    tasks: Array.isArray(practice.tasks) ? practice.tasks : []
  };
}

export const optionLetter = (i) => String.fromCharCode(65 + i);

// Markdown version of a practice set (used for Copy + DOCX export)
export function practiceToMarkdown(view, L, { day, topic } = {}) {
  if (!view) return '';
  const out = [];
  out.push(`# ${L.dayTitle(day, topic)}`);
  const lab = view.lab;
  if (lab) {
    out.push(`## 🧪 ${lab.title || L.lab}`);
    if (lab.scenario) out.push(lab.scenario);
    if (lab.objectives.length) {
      out.push(`### ${L.objectives}`);
      lab.objectives.forEach((o) => out.push(`- ${o}`));
    }
    if (lab.environment) {
      out.push(`### ${L.environment}`);
      out.push(lab.environment);
    }
    if (lab.diagram) {
      out.push(`### ${L.diagram}`);
      out.push('```\n' + lab.diagram + '\n```');
    }
    if (lab.table) {
      out.push(`### ${L.table}`);
      out.push(`| ${lab.table.columns.join(' | ')} |`);
      out.push(`| ${lab.table.columns.map(() => '---').join(' | ')} |`);
      lab.table.rows.forEach((r) => out.push(`| ${lab.table.columns.map((_, i) => (r[i] || '').replace(/\|/g, '/')).join(' | ')} |`));
    }
    if (lab.exercises.length) {
      out.push(`### ${L.exercises}`);
      lab.exercises.forEach((ex, i) => {
        out.push(`#### ${ex.title || `${L.exercise} ${i + 1}`}`);
        if (ex.instructions) out.push(ex.instructions);
        if (ex.commands) out.push('```\n' + ex.commands + '\n```');
        if (ex.verification) out.push(`**${L.verification}:** ${ex.verification}`);
      });
    } else if (lab.steps.length) {
      out.push(`### ${L.steps}`);
      lab.steps.forEach((s) => out.push(`- ${s}`));
    }
    if (lab.troubleshooting) {
      out.push(`### ${L.troubleshooting}`);
      if (lab.troubleshooting.problem) out.push(`**${L.problem}:** ${lab.troubleshooting.problem}`);
      if (lab.troubleshooting.diagnosis) out.push(`**${L.diagnosis}:**\n` + '```\n' + lab.troubleshooting.diagnosis + '\n```');
      if (lab.troubleshooting.solution) out.push(`**${L.solution}:** ${lab.troubleshooting.solution}`);
    }
    if (lab.checklist.length) {
      out.push(`### ${L.checklist}`);
      lab.checklist.forEach((c) => out.push(`- [ ] ${c}`));
    }
    if (lab.verification) out.push(`**${L.finalVerification}:** ${lab.verification}`);
  }
  if (view.quiz.length) {
    out.push(`## 🧩 ${L.quiz}`);
    view.quiz.forEach((q, qi) => {
      out.push(`**Q${qi + 1}. ${q.question}**`);
      q.options.forEach((o, oi) => out.push(`- ${optionLetter(oi)}. ${o}`));
      out.push(`> ${L.answer}: ${optionLetter(q.answerIndex)} — ${q.explanation || ''}`);
    });
  }
  if (view.tasks.length) {
    out.push(`## ⏱ ${L.tasks}`);
    view.tasks.forEach((tk) => out.push(`- ${tk.title} (${tk.dur || ''})`));
  }
  if (view.nextDayConnection) {
    out.push(`## ${L.nextDay}`);
    out.push(view.nextDayConnection);
  }
  return out.join('\n\n');
}

// All journey notes of a roadmap, ordered by day
export function compileJourneyNotes(roadmap, topicForDay, L) {
  const notes = (roadmap && roadmap.notes) || {};
  const days = Object.keys(notes)
    .filter((k) => typeof notes[k] === 'string' && notes[k].trim())
    .sort((a, b) => Number(a) - Number(b));
  const parts = [`${roadmap.title}`, ''];
  days.forEach((d) => {
    parts.push(`=== ${L.dayHeader(d, topicForDay(Number(d)))} ===`);
    parts.push(notes[d]);
    parts.push('');
  });
  return { text: parts.join('\n').trim(), count: days.length };
}
