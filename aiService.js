// ============================================================
// aiService.js - Multi-Provider AI Engine (Google Gemini + OpenAI)
// Supports:
//   1. Google Gemini (Gemini 1.5 Flash - FREE Tier available via Google AI Studio)
//   2. OpenAI (GPT-4o Mini, GPT-4o, GPT-3.5 Turbo)
// 3 Core Features:
//   - AI Roadmap Generator (Creates full customized roadmaps)
//   - AI Course & Lesson Content Generator
//   - AI Practice & Quiz Generator with Routine Timer import
// ============================================================

// Optional default embedded API Key for distribution:
// If you set a shared key here, all users who install your APK get working AI out-of-the-box!
export const EMBEDDED_DEFAULT_KEY = '';
export const EMBEDDED_DEFAULT_PROVIDER = 'gemini'; // 'gemini' | 'openai'

export const PROVIDERS = [
  { id: 'gemini', name: 'Google Gemini (Free Tier Available)', desc: 'Fast, powerful, and free on Google AI Studio' },
  { id: 'openai', name: 'OpenAI (ChatGPT)', desc: 'Industry standard pay-as-you-go API credits' }
];

export const GEMINI_MODELS = [
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Recommended: Fast & Free Tier)', cost: 'Free up to 15 RPM' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Next-Gen Ultra Fast)', cost: 'Free tier available' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Deep Reasoning & Analysis)', cost: 'Free tier available' }
];

export const OPENAI_MODELS = [
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast & Cheap, Recommended)', cost: '~$0.15 / 1M tokens' },
  { id: 'gpt-4o', name: 'GPT-4o (Most Intelligent & Deep)', cost: '~$2.50 / 1M tokens' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo (Legacy Fast)', cost: '~$0.50 / 1M tokens' }
];

export const DEFAULT_AI_PROVIDER = 'gemini';
export const DEFAULT_AI_MODEL = 'gemini-1.5-flash';

/**
 * Auto-detect provider from API key prefix
 */
export function detectProvider(key) {
  if (!key) return 'gemini';
  const clean = key.trim();
  if (clean.startsWith('sk-')) return 'openai';
  if (clean.startsWith('AIzaSy')) return 'gemini';
  return 'gemini';
}

/**
 * Validate an API key for Gemini or OpenAI
 */
export async function validateApiKey(apiKey, provider = 'gemini') {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    return { valid: false, error: 'Please enter an API Key.' };
  }

  const activeProvider = provider || detectProvider(cleanKey);

  // Validate Google Gemini Key
  if (activeProvider === 'gemini') {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`);
      if (res.ok) {
        return { valid: true, provider: 'gemini' };
      }
      const data = await res.json().catch(() => ({}));
      const msg = data.error?.message || `Google returned status ${res.status}`;
      return { valid: false, error: msg };
    } catch (e) {
      return { valid: false, error: 'Network request failed. Check internet connection.' };
    }
  }

  // Validate OpenAI Key
  if (activeProvider === 'openai') {
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${cleanKey}` }
      });
      if (res.ok) {
        return { valid: true, provider: 'openai' };
      }
      if (res.status === 401) {
        return { valid: false, error: 'Invalid OpenAI API Key. Check platform.openai.com/api-keys.' };
      }
      if (res.status === 429) {
        return { valid: false, error: 'Quota exceeded. Check billing on platform.openai.com/billing.' };
      }
      const data = await res.json().catch(() => ({}));
      return { valid: false, error: data.error?.message || `OpenAI returned status ${res.status}.` };
    } catch (e) {
      return { valid: false, error: 'Network request failed. Check internet connection.' };
    }
  }

  return { valid: false, error: 'Unknown provider.' };
}

/**
 * Robust JSON parser that strips markdown fences (```json ... ```)
 */
function cleanAndParseJSON(rawText) {
  if (!rawText) throw new Error('Empty response from AI');
  let clean = rawText.trim();

  // Strip ```json or ``` markdown wrapper
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '');
  }

  try {
    return JSON.parse(clean);
  } catch (e) {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const extracted = clean.substring(start, end + 1);
      return JSON.parse(extracted);
    }
    throw new Error('Failed to parse AI JSON response: ' + e.message);
  }
}

/**
 * Universal caller that routes to Gemini or OpenAI
 */
async function callAI({ systemPrompt, userPrompt, apiKey, provider = 'gemini', model, jsonMode = false }) {
  const activeKey = (apiKey && apiKey.trim()) || EMBEDDED_DEFAULT_KEY;
  const activeProvider = provider || detectProvider(activeKey);

  // 1. Google Gemini API
  if (activeProvider === 'gemini') {
    const activeModel = model && model.startsWith('gemini') ? model : 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${activeKey}`;

    const body = {
      system_instruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        ...(jsonMode ? { responseMimeType: 'application/json' } : {})
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gemini API returned status ${res.status}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No content returned from Gemini.');
    return text;
  }

  // 2. OpenAI API
  if (activeProvider === 'openai') {
    const activeModel = model && model.startsWith('gpt') ? model : 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${activeKey}`
      },
      body: JSON.stringify({
        model: activeModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {})
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenAI API returned status ${res.status}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('No content returned from OpenAI.');
    return text;
  }

  throw new Error('Unsupported AI provider: ' + activeProvider);
}

/**
 * 1. AI Roadmap Generator
 */
export async function generateRoadmapWithAI({
  prompt,
  totalDays = 30,
  experienceLevel = 'Beginner',
  focusArea = 'Practical Labs & Projects',
  apiKey,
  provider = 'gemini',
  model
}) {
  if (!prompt || !prompt.trim()) {
    throw new Error('Please enter a goal or topic for the roadmap.');
  }

  const effectiveKey = (apiKey && apiKey.trim()) || EMBEDDED_DEFAULT_KEY;
  if (!effectiveKey) {
    return generateDemoRoadmap(prompt, totalDays, experienceLevel);
  }

  const systemPrompt = `You are a world-class curriculum designer, senior tech lead, and mentor.
Design an organized, realistic, day-by-day learning roadmap for the student.
The output MUST be strictly valid JSON matching this schema with NO extra commentary:
{
  "title": "string (inspiring and clear roadmap title)",
  "description": "string (1-2 sentences summarizing the transformation and goals)",
  "category": "string (e.g. Coding & Career, Cloud & DevOps, Certification & Tech, AI & Data, Language & Life)",
  "icon": "string (single suitable emoji like 🌐, 💻, ⚡, 🚀, 🧠, 💼, 🎯)",
  "color": "string (hex color code: #10b981, #3b82f6, #6366f1, #8b5cf6, #ec4899, #f59e0b, or #14b8a6)",
  "phases": [
    {
      "id": "p_1",
      "title": "Phase 1 — ... (Days 1–X)",
      "startDay": 1,
      "endDay": number,
      "days": [
        { "day": 1, "topic": "Clear practical daily topic or milestone" }
      ]
    }
  ],
  "routineModes": [
    { "id": "m1", "label": "learn", "dur": 25 },
    { "id": "m2", "label": "practise", "dur": 35 },
    { "id": "m3", "label": "review", "dur": 15 }
  ]
}

Important Rules:
1. Divide the total days (${totalDays}) into 2 to 6 logical progressive phases.
2. The days array MUST have exactly ${totalDays} total items starting at day 1 and ending at day ${totalDays}.
3. Every day's topic must be specific, actionable, and progressive.
4. Output ONLY the raw JSON object.`;

  const userMessage = `Create a ${totalDays}-day roadmap for: "${prompt.trim()}".
Target Level: ${experienceLevel}.
Learning Focus: ${focusArea}.
Total Days needed: ${totalDays}.`;

  const rawText = await callAI({
    systemPrompt,
    userPrompt: userMessage,
    apiKey: effectiveKey,
    provider,
    model,
    jsonMode: true
  });

  const parsed = cleanAndParseJSON(rawText);

  const roadmapId = 'ai_roadmap_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  return {
    id: roadmapId,
    title: parsed.title || prompt.trim(),
    description: parsed.description || `${totalDays}-day AI customized roadmap for ${prompt.trim()}`,
    category: parsed.category || 'AI Generated',
    icon: parsed.icon || '🚀',
    color: parsed.color || '#3b82f6',
    totalDays: Number(totalDays),
    phases: parsed.phases || [],
    currentDay: 1,
    doneDays: [],
    notes: {},
    tasks: {},
    lessons: {},
    quizzes: {},
    routineModes: parsed.routineModes && parsed.routineModes.length > 0 ? parsed.routineModes : [
      { id: 'm1', label: 'learn', dur: 25 },
      { id: 'm2', label: 'practise', dur: 35 },
      { id: 'm3', label: 'review', dur: 15 }
    ],
    createdAt: new Date().toISOString(),
    isAIGenerated: true
  };
}

/**
 * 2. AI Course & Lesson Content Generator
 * Strictly implements the user's 4-Part Daily Learning System:
 * - Part 1 — Detailed lesson (Concepts, terminology, diagram, examples, why feature is needed)
 * - Part 2 — CLI practice (30 mins) (Huawei VRP commands, command modes, expected output, verification)
 * - Part 3 — Hands-on lab (40 mins) (Topology, IP table, equipment, 3 exercises, troubleshooting scenario, checklist)
 * - Part 4 — Assessment and notes (20 mins) (Quiz + answer key, objectives, notes reflection, next-day connection)
 */
export async function generateLessonContentWithAI({
  roadmapTitle,
  day,
  topic,
  apiKey,
  provider = 'gemini',
  model,
  customContext = ''
}) {
  if (!topic) throw new Error('No topic specified for lesson generation.');

  const effectiveKey = (apiKey && apiKey.trim()) || EMBEDDED_DEFAULT_KEY;
  if (!effectiveKey) {
    return generateDemoLesson(roadmapTitle, day, topic, customContext);
  }

  const systemPrompt = `You are a Principal Huawei Certified ICT Expert (HCIE), Senior Network Architect, and Master Technical Instructor.
You create deep, highly rigorous, practical daily lessons following this EXACT 4-Part Daily Learning System:

Roadmap: "${roadmapTitle || 'Huawei Network Engineering & HCIA Certification'}".
Day ${day}: "${topic}".

${customContext ? `
========================================================================
STUDENT'S UPLOADED REFERENCE DOCUMENT / HCIA MATERIAL:
"""
${customContext.slice(0, 15000)}
"""
========================================================================
CRITICAL MANDATORY INSTRUCTION:
The student uploaded the reference documentation / HCIA material above.
You MUST thoroughly analyze and cite this uploaded material. All theory, networking terms, Huawei VRP CLI commands, parameter explanations, command outputs, and lab exercises MUST align directly with this uploaded document!
` : ''}

You MUST format the lesson in clean GitHub-flavored Markdown following this EXACT 4-part structure:

# Day ${day} — ${topic}
## 🌟 Your Daily Learning System

---

### 📘 PART 1 — Detailed Lesson (Theory & Concepts)
- **Core Concept & Simple English Explanation**: Plain English, crystal-clear explanation of the concepts. Avoid superficial summaries; explain how the technology works under the hood.
- **Why This Feature is Needed**: Explain the exact architectural and business necessity (what happens in an enterprise network if this feature is missing or misconfigured, e.g. broadcast storms, routing loops, unsegmented traffic, security breaches).
- **Networking Terminology & Glossary**: 4-6 essential networking terms and acronyms clearly defined.
- **Real Office-Network Example**: Concrete corporate scenario (e.g. Enterprise HQ connecting to Branch offices, separating HR and Guest Wi-Fi via VLANs, redundant core switches).
- **Network Diagram**: Visual ASCII art diagram illustrating frame flow, packet header, or network device interconnection.

---

### 💻 PART 2 — CLI Practice (30 Minutes)
- **Huawei VRP Command Modes**:
  Explain the navigation between modes:
  * User View: \`<Huawei>\` (display, test, save)
  * System View: \`[Huawei]\` (system-wide settings)
  * Interface / Routing / VLAN View: \`[Huawei-GigabitEthernet0/0/1]\` or \`[Huawei-ospf-1]\`
- **Huawei VRP CLI Commands**:
  Complete, copy-pasteable configuration commands for Huawei devices (AR routers, S5700 switches). Provide comments explaining what each command does.
- **Expected Command Output**:
  Show the exact realistic Huawei VRP terminal output for verification commands (e.g., \`display ip interface brief\`, \`display vlan\`, \`display ospf peer brief\`, \`display current-configuration\`).
- **Command Parameter Explanations**:
  Break down each parameter, flag, and keyword used in the commands.
- **Verification Routine**:
  Step-by-step display commands and ping tests to verify operational state in eNSP simulator.

---

### 🧪 PART 3 — Hands-on Lab (40 Minutes)
- **Lab Topology**:
  Clean ASCII diagram showing devices (Routers, Switches, PCs), interface port numbers (GE0/0/0, GE0/0/1), and subnet links in eNSP simulator.
- **IP Addressing & VLAN Table**:
  Markdown table with columns: \`Device Name\`, \`Interface\`, \`IP Address / Mask\`, \`Default Gateway\`, \`VLAN ID\`, and \`Purpose / Notes\`.
- **Equipment Needed**:
  Specific equipment (e.g., 2x Huawei AR2220 Routers, 2x S5700 Switches, 2x Client PCs).
- **Objectives & Practical Exercises (Minimum 3 Hands-on Tasks)**:
  * **Task 1: Basic Initialization**: Device hostnames, disabling info-center console popups (\`undo info-center enable\`), assigning interface IP addresses.
  * **Task 2: Core Feature Implementation**: The primary configuration for ${topic}.
  * **Task 3: Advanced / Redundancy / Routing Verification**: Testing convergence, failover, or traffic isolation.
- **Troubleshooting Scenario**:
  * **The Broken Configuration**: A realistic intentional mistake introduced into the network (e.g., wrong subnet mask, omitted trunk allow-pass, mismatched hello interval, passive interface error).
  * **Diagnostic Commands**: The exact \`display\` and debugging commands an engineer runs to find the root cause.
  * **Step-by-Step Solution & Fix**: Detailed commands to resolve the issue and restore normal operation.
- **Lab Completion Checklist**:
  Checklist ([ ] checkboxes) of all criteria to declare the lab complete.

---

### 📝 PART 4 — Assessment and Notes (20 Minutes)
- **Measurable Learning Objectives**:
  Checklist: "After completing today's lesson, you can independently..."
- **Comprehension Quiz & Answer Key**:
  3-4 challenging certification-style multiple-choice questions with options (A, B, C, D), correct answers, and thorough technical explanations.
- **Daily Reflection & Notes Prompt**:
  2-3 targeted questions prompting the student to explain the core concepts in their own words in their Day Notes.
- **Next-Day Connection**:
  Detailed explanation of how today's topic directly connects to and builds the foundation for tomorrow's lesson (Day ${Number(day) + 1}).

Make the lesson deep, authoritative, and immediately usable in Huawei eNSP simulator!`;

  const userPrompt = `Please generate the full, in-depth 4-Part Daily Lesson for Day ${day}: "${topic}".`;

  const rawText = await callAI({
    systemPrompt,
    userPrompt,
    apiKey: effectiveKey,
    provider,
    model,
    jsonMode: false
  });

  return {
    day,
    topic,
    content: rawText || 'No content returned from AI.',
    generatedAt: new Date().toISOString(),
    type: 'ai'
  };
}

/**
 * 3. AI Practice & Quiz Generator
 * Generates structured Lab, Quiz, and Timer Tasks conforming to the 4-part system
 */
export async function generatePracticeAndQuizWithAI({
  roadmapTitle,
  day,
  topic,
  lessonContent = '',
  customContext = '',
  apiKey,
  provider = 'gemini',
  model
}) {
  if (!topic) throw new Error('No topic specified for practice generation.');

  const effectiveKey = (apiKey && apiKey.trim()) || EMBEDDED_DEFAULT_KEY;
  if (!effectiveKey) {
    return generateDemoPractice(roadmapTitle, day, topic);
  }

  const systemPrompt = `You are a Principal Huawei Network Lab Coordinator and Certification Examiner.
For Day ${day} ("${topic}") of "${roadmapTitle}", create an in-depth hands-on lab, certification quiz, and 3 structured focus timer tasks following the 4-Part Daily Learning System.

${customContext ? `Reference Document Context: """${customContext.slice(0, 8000)}"""` : ''}
${lessonContent ? `Lesson Context: """${lessonContent.slice(0, 3000)}"""` : ''}

The output MUST be strictly valid JSON matching this schema with NO outside commentary:
{
  "lab": {
    "title": "string (Lab Title)",
    "scenario": "string (Real-world enterprise scenario)",
    "topology": "string (Clean ASCII diagram showing devices, ports like GE0/0/0, and subnets)",
    "equipment": "string (e.g. 2x Huawei AR2220 Routers, 2x S5700 Switches, 2x PCs in eNSP)",
    "ipTable": [
      {
        "device": "string",
        "interface": "string",
        "ip": "string",
        "gateway": "string",
        "vlan": "string",
        "purpose": "string"
      }
    ],
    "exercises": [
      {
        "title": "Exercise 1: Basic Setup & Hostname Initialization",
        "commands": "string (Huawei VRP commands)",
        "verification": "string (How to verify)"
      },
      {
        "title": "Exercise 2: Core Configuration for ${topic}",
        "commands": "string (Huawei VRP commands)",
        "verification": "string (How to verify)"
      },
      {
        "title": "Exercise 3: Comprehensive Verification & Connectivity",
        "commands": "string (Huawei VRP commands)",
        "verification": "string (How to verify)"
      }
    ],
    "troubleshooting": {
      "brokenConfig": "string (Intentional broken configuration mistake)",
      "diagnosticCommands": "string (Commands to find the problem)",
      "solution": "string (Step-by-step fix)"
    },
    "checklist": [
      "string (Checklist item 1)",
      "string (Checklist item 2)",
      "string (Checklist item 3)",
      "string (Checklist item 4)"
    ],
    "verification": "string (Final verification criteria)"
  },
  "quiz": [
    {
      "question": "string (Deep Huawei certification question)",
      "options": ["A text", "B text", "C text", "D text"],
      "answerIndex": 0,
      "explanation": "string (Detailed technical explanation)"
    }
  ],
  "tasks": [
    {
      "title": "Part 2 — CLI practice: Huawei VRP commands & verification",
      "dur": "30 mins",
      "priority": "High"
    },
    {
      "title": "Part 3 — Hands-on lab: Build topology & troubleshoot mistakes",
      "dur": "40 mins",
      "priority": "High"
    },
    {
      "title": "Part 4 — Assessment: Quiz, explain learnings & Day notes",
      "dur": "20 mins",
      "priority": "Medium"
    }
  ],
  "nextDayConnection": "string (How today connects to Day ${Number(day) + 1})"
}

Output ONLY the raw JSON object.`;

  const userPrompt = `Create the complete hands-on lab, certification quiz, and 3 focus tasks for Day ${day}: "${topic}".`;

  const rawText = await callAI({
    systemPrompt,
    userPrompt,
    apiKey: effectiveKey,
    provider,
    model,
    jsonMode: true
  });

  const parsed = cleanAndParseJSON(rawText);

  return {
    day,
    topic,
    lab: parsed.lab || {
      title: `Hands-on Lab: ${topic}`,
      scenario: 'Apply the core concepts learned today in a real Huawei eNSP environment.',
      topology: '+-----------+          +-----------+\n| Router R1 |<-------->| Router R2 |\n+-----------+          +-----------+',
      equipment: '2x Huawei AR2220 Routers, 2x S5700 Switches',
      ipTable: [
        { device: 'R1', interface: 'GE0/0/0', ip: '192.168.1.1/24', gateway: 'N/A', vlan: 'N/A', purpose: 'R1-R2 Interconnect' },
        { device: 'R2', interface: 'GE0/0/0', ip: '192.168.1.2/24', gateway: 'N/A', vlan: 'N/A', purpose: 'R1-R2 Interconnect' }
      ],
      exercises: [
        { title: 'Exercise 1: Basic Interface Setup', commands: 'sysname R1\ninterface GigabitEthernet0/0/0\nip address 192.168.1.1 24', verification: 'display ip interface brief' },
        { title: `Exercise 2: Core ${topic} Configuration`, commands: `# Configure ${topic} parameters\ncommit`, verification: 'display current-configuration' },
        { title: 'Exercise 3: End-to-End Connectivity Verification', commands: 'ping -c 5 192.168.1.2', verification: 'Ensure 0% packet loss' }
      ],
      troubleshooting: {
        brokenConfig: 'Interface IP subnet mismatch between R1 and R2 prevents packet transmission.',
        diagnosticCommands: 'display ip interface brief\ndisplay current-configuration interface GE0/0/0',
        solution: 'Match subnet masks on both ends of the link and re-test with ping.'
      },
      checklist: [
        'Device hostnames and interfaces configured',
        'Ping connectivity verified',
        'Huawei VRP display commands validated',
        'Troubleshooting scenario resolved'
      ],
      verification: 'Run status checks and verify expected output.'
    },
    quiz: Array.isArray(parsed.quiz) ? parsed.quiz : [],
    tasks: Array.isArray(parsed.tasks) && parsed.tasks.length > 0 ? parsed.tasks : [
      { title: 'Part 2 — CLI practice: Huawei VRP commands & verification', dur: '30 mins', priority: 'High' },
      { title: 'Part 3 — Hands-on lab: Build topology & troubleshoot mistakes', dur: '40 mins', priority: 'High' },
      { title: 'Part 4 — Assessment: Quiz, explain learnings & Day notes', dur: '20 mins', priority: 'Medium' }
    ],
    nextDayConnection: parsed.nextDayConnection || `Builds the foundation for Day ${Number(day) + 1}.`,
    generatedAt: new Date().toISOString()
  };
}

// ============================================================
// Fallback / Demo Preview Generators (Used when no key is set)
// ============================================================

function generateDemoRoadmap(prompt, totalDays, level) {
  const days = Number(totalDays) || 30;
  const phaseCount = days <= 30 ? 3 : days <= 60 ? 4 : 6;
  const daysPerPhase = Math.ceil(days / phaseCount);

  const phases = [];
  for (let p = 0; p < phaseCount; p++) {
    const startDay = p * daysPerPhase + 1;
    const endDay = Math.min(days, (p + 1) * daysPerPhase);
    const phaseDays = [];

    for (let d = startDay; d <= endDay; d++) {
      let subtopic = '';
      if (d === startDay) subtopic = 'Core Foundations & Architecture';
      else if (d === endDay) subtopic = 'Milestone Lab & Practical Assessment';
      else if (d % 3 === 0) subtopic = 'Hands-on Implementation & Lab';
      else if (d % 2 === 0) subtopic = 'Configuration, Protocols & Tooling';
      else subtopic = 'Deep Dive & Edge Case Analysis';

      phaseDays.push({
        day: d,
        topic: `${prompt.trim()}: ${subtopic} (Day ${d})`
      });
    }

    phases.push({
      id: `p_demo_${p + 1}`,
      title: `Phase ${p + 1}: ${p === 0 ? 'Foundations & Setup' : p === phaseCount - 1 ? 'Mastery, Capstone & Polish' : 'Intermediate Practice'} (Days ${startDay}–${endDay})`,
      startDay,
      endDay,
      days: phaseDays
    });
  }

  return {
    id: 'ai_roadmap_' + Date.now(),
    title: `${prompt.trim()} Masterclass`,
    description: `A customized ${days}-day structured learning path tailored for ${level} level. (Demo Preview — Add your Gemini or OpenAI API key in Settings for full live generation)`,
    category: 'AI Generated',
    icon: '⚡',
    color: '#8b5cf6',
    totalDays: days,
    phases,
    currentDay: 1,
    doneDays: [],
    notes: {},
    tasks: {},
    lessons: {},
    quizzes: {},
    routineModes: [
      { id: 'm1', label: 'learn', dur: 25 },
      { id: 'm2', label: 'practise', dur: 35 },
      { id: 'm3', label: 'review', dur: 15 }
    ],
    createdAt: new Date().toISOString(),
    isDemo: true
  };
}

function generateDemoLesson(roadmapTitle, day, topic, customContext = '') {
  return {
    day,
    topic,
    content: `# Day ${day} — ${topic}
## 🌟 Your Daily Learning System

---

### 📘 PART 1 — Detailed Lesson (Theory & Concepts)
- **Core Concept & Simple English Explanation**:
  **${topic}** is an essential enterprise networking capability. In Huawei Datacom architectures, it governs how frames and packets traverse switches and routers with deterministic routing, loop prevention, and high-availability failover.
- **Why This Feature is Needed**:
  Without ${topic}, corporate local area networks suffer from broadcast storms, bridging loops, unpredictable routing blackholes, and unsegmented broadcast domains where any host can compromise departmental security.
- **Networking Terminology & Glossary**:
  * **VRP (Versatile Routing Platform)**: Huawei's unified network operating system powering AR routers and CloudEngine/S-series switches.
  * **PVID (Port Default VLAN ID)**: Untagged ingress frames receive this VLAN tag on Huawei access ports.
  * **Trunk Port**: Carries multiple VLAN tags across switches using IEEE 802.1Q encapsulation.
  * **Adjacency / Convergence**: The state when all participating devices reach synchronized topology databases.
- **Real Office-Network Example**:
  In a 4-floor corporate headquarters, Floor 1 (Reception/Guests) is isolated on VLAN 10, Floor 2 (Engineering) is on VLAN 20, and Floor 3 (Finance) is on VLAN 30. A Huawei S5700 Core Switch routes traffic between departments through ACL security policies, while twin AR2220 edge routers maintain redundant dual-ISP WAN links.
- **Architecture Diagram**:
\`\`\`
       +---------------------------------------------+
       |             Huawei AR2220 Gateway           |
       |             [GE0/0/0: 192.168.1.1/24]       |
       +----------------------+----------------------+
                              | (Trunk / VLAN 10, 20)
       +----------------------+----------------------+
       |             Huawei S5700 Core Switch        |
       +-----------+---------------------+-----------+
                   |                     |
     (Access: VLAN 10)         (Access: VLAN 20)
                   |                     |
          +--------+--------+   +--------+--------+
          |  PC-1 (Sales)   |   | PC-2 (Finance)  |
          | 192.168.10.10   |   | 192.168.20.10   |
          +-----------------+   +-----------------+
\`\`\`

---

### 💻 PART 2 — CLI Practice (30 Minutes)
- **Huawei VRP Command Modes**:
  * **User View** (\`<Huawei>\`): Initial login mode for viewing diagnostic info and saving files.
  * **System View** (\`[Huawei]\`): Enter by running \`system-view\`. Used for global configuration.
  * **Interface View** (\`[Huawei-GigabitEthernet0/0/1]\`): For interface IP, duplex, and port-link-type.
- **Huawei VRP CLI Commands**:
\`\`\`bash
# 1. Enter System View and set system hostname
<Huawei> system-view
[Huawei] sysname Core-SW1
[Core-SW1] undo info-center enable

# 2. Create VLANs and configure Access & Trunk interfaces
[Core-SW1] vlan batch 10 20
[Core-SW1] interface GigabitEthernet 0/0/1
[Core-SW1-GigabitEthernet0/0/1] port link-type access
[Core-SW1-GigabitEthernet0/0/1] port default vlan 10
[Core-SW1-GigabitEthernet0/0/1] quit

[Core-SW1] interface GigabitEthernet 0/0/24
[Core-SW1-GigabitEthernet0/0/24] port link-type trunk
[Core-SW1-GigabitEthernet0/0/24] port trunk allow-pass vlan 10 20
[Core-SW1-GigabitEthernet0/0/24] quit

# 3. Save running configuration to flash
[Core-SW1] return
<Core-SW1> save
\`\`\`
- **Expected Command Output**:
\`\`\`text
<Core-SW1> display vlan
The total number of vlans is : 3
--------------------------------------------------------------------------------
U: Up;         D: Down;         TG: Tagged;         UT: Untagged;
MP: Vlan-mapping;               ST: Vlan-stacking;
MAC-LRN: MAC-address learning;  STAT: Statistic;
--------------------------------------------------------------------------------
VID  Type    Ports
--------------------------------------------------------------------------------
1    common  UT:GE0/0/2 to GE0/0/23
10   common  UT:GE0/0/1(U)           TG:GE0/0/24(U)
20   common  UT:GE0/0/2(D)           TG:GE0/0/24(U)
\`\`\`
- **Command Parameter Breakdown**:
  * \`vlan batch 10 20\`: Creates multiple VLAN IDs simultaneously.
  * \`port link-type trunk\`: Changes port mode from default Hybrid/Access to 802.1Q Trunk.
  * \`port trunk allow-pass vlan 10 20\`: Specifically permits VLAN tags 10 and 20 across the inter-switch link.
- **Verification Routine**:
  Run \`display port vlan active\` and \`display ip interface brief\` to verify link states and tagging behavior.

---

### 🧪 PART 3 — Hands-on Lab (40 Minutes)
- **Lab Topology**:
\`\`\`
  [PC-1] (GE0/0/1) ---- [Core-SW1] (GE0/0/24) ==== (GE0/0/24) [Dist-SW2] ---- (GE0/0/1) [PC-2]
\`\`\`
- **IP Addressing & VLAN Table**:
| Device | Interface | IP Address / Mask | Default Gateway | VLAN ID | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Core-SW1 | Vlanif10 | 192.168.10.1/24 | N/A | 10 | Sales Gateway |
| Core-SW1 | Vlanif20 | 192.168.20.1/24 | N/A | 20 | Finance Gateway |
| PC-1 | Ethernet0/0/1 | 192.168.10.10/24 | 192.168.10.1 | 10 | Sales Client |
| PC-2 | Ethernet0/0/1 | 192.168.20.10/24 | 192.168.20.1 | 20 | Finance Client |
- **Equipment Needed**:
  2x Huawei S5700 Enterprise Switches, 2x Virtual PCs in eNSP simulator.
- **Objectives & Practical Exercises**:
  * **Exercise 1: Basic Initialization**: Configure \`sysname\`, disable console popup spam (\`undo info-center enable\`), configure access port for PC-1 on VLAN 10.
  * **Exercise 2: Trunk Link & Vlanif Routing**: Build the 802.1Q trunk between switches and configure Vlanif logical interfaces for inter-VLAN routing.
  * **Exercise 3: Verification & Traffic Isolation**: Verify ping between PC-1 and PC-2, and observe that broadcast traffic is contained within each VLAN.
- **Troubleshooting Scenario**:
  * **Broken Configuration**: An engineer forgot to allow VLAN 20 on the trunk link (\`port trunk allow-pass vlan 10\` was used instead of \`10 20\`). PC-2 cannot reach its gateway or PC-1.
  * **Diagnostic Commands**:
    \`\`\`bash
    <Core-SW1> display port vlan GigabitEthernet 0/0/24
    <Core-SW1> display current-configuration interface GigabitEthernet 0/0/24
    \`\`\`
  * **Step-by-Step Solution & Fix**:
    Enter interface view and add the missing VLAN:
    \`\`\`bash
    [Core-SW1-GigabitEthernet0/0/24] port trunk allow-pass vlan 20
    \`\`\`
- **Lab Completion Checklist**:
  * [ ] Core-SW1 and Dist-SW2 hostnames configured.
  * [ ] VLAN 10 and 20 operational on both switches.
  * [ ] Trunk port GE0/0/24 allows both VLANs.
  * [ ] PC-1 successfully pings 192.168.20.10 with 0% loss.

---

### 📝 PART 4 — Assessment and Notes (20 Minutes)
- **Measurable Learning Objectives**:
  * You can independently create and batch-assign VLANs on Huawei switches.
  * You can configure and troubleshoot Access and Trunk port link types.
  * You can read and interpret \`display vlan\` and \`display port vlan active\` outputs.
- **Comprehension Quiz & Answer Key**:
  1. *Which Huawei VRP command creates VLANs 10, 20, and 30 simultaneously?*
     **Answer**: \`vlan batch 10 20 30\` or \`vlan batch 10 to 30\`
  2. *What is the default port link type on many Huawei switch Ethernet interfaces?*
     **Answer**: \`hybrid\`
  3. *Which command saves the current active configuration to persistent flash memory?*
     **Answer**: \`save\` in user view (\`<Huawei>\`).
- **Daily Reflection & Notes Prompt**:
  * Explain in your own words why a Trunk port is needed between two switches rather than an Access port.
  * Write down the 3 verification commands you ran today that gave the most helpful diagnostic output.
- **Next-Day Connection**:
  Today's mastery of ${topic} directly enables tomorrow's lesson on **Day ${Number(day) + 1}**, where we will build on these foundation links to configure dynamic routing protocols (OSPF) across interconnected routers!

${customContext ? `\n> 📄 *Synthesized using your uploaded reference material (${customContext.length} characters).*` : ''}`,
    generatedAt: new Date().toISOString(),
    type: 'demo'
  };
}

function generateDemoPractice(roadmapTitle, day, topic) {
  return {
    day,
    topic,
    lab: {
      title: `Hands-on Lab: ${topic} Enterprise Deployment`,
      scenario: `You are tasked with deploying and validating ${topic} on Huawei AR routers and S5700 switches in an eNSP enterprise staging lab.`,
      topology: `[PC-1: 192.168.10.10]
        | (GE0/0/1 - Access VLAN 10)
   +----+-----+ (GE0/0/24 Trunk)        (GE0/0/24 Trunk) +----+-----+
   | Core-SW1 |==========================================| Dist-SW2 |
   +----+-----+                                          +----+-----+
        |                                                     | (GE0/0/1 - Access VLAN 20)
   [AR2220 GW: 192.168.1.1]                             [PC-2: 192.168.20.10]`,
      equipment: '1x Huawei AR2220 Router, 2x Huawei S5700 Switches, 2x eNSP Client PCs',
      ipTable: [
        { device: 'AR2220-GW', interface: 'GE0/0/0', ip: '192.168.1.1/24', gateway: 'N/A', vlan: 'N/A', purpose: 'Core Uplink Gateway' },
        { device: 'Core-SW1', interface: 'Vlanif10', ip: '192.168.10.1/24', gateway: '192.168.1.1', vlan: '10', purpose: 'Sales Dept Gateway' },
        { device: 'Core-SW1', interface: 'Vlanif20', ip: '192.168.20.1/24', gateway: '192.168.1.1', vlan: '20', purpose: 'Finance Dept Gateway' },
        { device: 'PC-1', interface: 'Ethernet0/0/1', ip: '192.168.10.10/24', gateway: '192.168.10.1', vlan: '10', purpose: 'Sales Workstation' },
        { device: 'PC-2', interface: 'Ethernet0/0/1', ip: '192.168.20.10/24', gateway: '192.168.20.1', vlan: '20', purpose: 'Finance Workstation' }
      ],
      exercises: [
        {
          title: 'Exercise 1: Basic Initialization & VLAN Provisioning',
          commands: 'sysname Core-SW1\nundo info-center enable\nvlan batch 10 20\ninterface GigabitEthernet 0/0/1\nport link-type access\nport default vlan 10',
          verification: 'display vlan | include 10'
        },
        {
          title: 'Exercise 2: 802.1Q Trunk Link & Vlanif Gateways',
          commands: 'interface GigabitEthernet 0/0/24\nport link-type trunk\nport trunk allow-pass vlan 10 20\nquit\ninterface Vlanif 10\nip address 192.168.10.1 24\ninterface Vlanif 20\nip address 192.168.20.1 24',
          verification: 'display ip interface brief'
        },
        {
          title: 'Exercise 3: End-to-End Connectivity & Isolation Test',
          commands: 'ping -c 5 192.168.20.10\ndisplay port vlan active',
          verification: 'Ensure 0% packet loss and verify active VLAN tags.'
        }
      ],
      troubleshooting: {
        brokenConfig: 'Mismatched Trunk allowed VLAN list: Core-SW1 allows VLAN 10 20, but Dist-SW2 only allows VLAN 10. PC-2 cannot reach PC-1 or default gateway.',
        diagnosticCommands: 'display port vlan GigabitEthernet 0/0/24\ndisplay current-configuration interface GigabitEthernet 0/0/24',
        solution: 'On Dist-SW2, enter interface GE0/0/24 and run:\n[Dist-SW2-GigabitEthernet0/0/24] port trunk allow-pass vlan 20\nConfirm ping from PC-2 to 192.168.20.1 succeeds.'
      },
      checklist: [
        'Device hostnames and initial console cleanup completed',
        'VLANs 10 and 20 created and assigned to access ports',
        '802.1Q trunk configured with allow-pass vlan 10 20',
        'Inter-VLAN routing tested via Vlanif logical interfaces',
        'Troubleshooting trunk mismatch resolved'
      ],
      verification: 'Run display vlan, display ip routing-table, and ping tests with 0% packet loss.'
    },
    quiz: [
      {
        question: 'Which Huawei VRP command is used to assign an untagged access port to VLAN 10?',
        options: [
          'port default vlan 10',
          'switchport access vlan 10',
          'vlan membership 10',
          'assign vlan 10 untagged'
        ],
        answerIndex: 0,
        explanation: 'In Huawei VRP, the standard command within an interface view is "port default vlan <vlan-id>".'
      },
      {
        question: 'What is the function of "port trunk allow-pass vlan 10 20" on a Huawei switch?',
        options: [
          'Deletes VLANs 10 and 20 from the switch',
          'Permits 802.1Q tagged frames for VLANs 10 and 20 across the trunk interface',
          'Converts the trunk port into an access port',
          'Disables MAC address learning on VLANs 10 and 20'
        ],
        answerIndex: 1,
        explanation: 'By default, a Huawei trunk port only permits VLAN 1. The allow-pass command explicitly authorizes specified VLAN tags to cross the link.'
      },
      {
        question: 'How do you configure an inter-VLAN routing gateway on a Huawei Layer 3 switch?',
        options: [
          'interface Vlanif <vlan-id> followed by ip address <ip> <mask>',
          'router vlan <vlan-id> enable',
          'ip default-gateway vlan <vlan-id>',
          'interface Loopback 0'
        ],
        answerIndex: 0,
        explanation: 'Huawei Layer 3 switches use logical Vlanif (VLAN Interface) entities (e.g. interface Vlanif 10) to host IP gateway addresses.'
      }
    ],
    tasks: [
      {
        title: 'Part 2 — CLI practice: Huawei VRP commands & verification',
        dur: '30 mins',
        priority: 'High'
      },
      {
        title: 'Part 3 — Hands-on lab: Build topology & troubleshoot mistakes',
        dur: '40 mins',
        priority: 'High'
      },
      {
        title: 'Part 4 — Assessment: Quiz, explain learnings & Day notes',
        dur: '20 mins',
        priority: 'Medium'
      }
    ],
    nextDayConnection: `Solidifies foundational switching & routing needed for Day ${Number(day) + 1}.`,
    generatedAt: new Date().toISOString()
  };
}
