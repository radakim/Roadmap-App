// Built-in Roadmaps and Dynamic Roadmap Generator for Life & Study Planning

export const HUAWEI_CURRICULUM_RAW = [
  ['Month 1 — Networking Fundamentals & VRP', 'OSI & TCP/IP models|IPv4 & subnet masks|Subnetting practice|Windows tools: ping, tracert, ARP|VRP navigation & views|CLI help, save, reboot|Interface IP configuration|Ethernet, collision & broadcast domains|MAC table & forwarding|VLAN fundamentals|Access & trunk ports|Hybrid ports|Router-on-a-stick|Inter-VLAN via SVI|STP background|STP roles & root election|RSTP|MSTP|Eth-Trunk & LACP|Telnet & SSH|FTP/TFTP/SFTP upgrades|DHCP server & relay|IPv6 basics|L1/L2 troubleshooting|eNSP campus lab|ARP, ICMP, frame review|Interface errors (CRC)|HCIA domains 1-2 review|Switching troubleshooting lab|Capstone: campus LAN with VLAN & STP'],
  ['Month 2 — Routing & Enterprise Services', 'Direct, static & default routes|Floating static routes|IGP vs EGP, DV vs LS|OSPF concepts & neighbor states|Single-area OSPF & timers|DR/BDR election|Multi-area OSPF|LSA types 1-3|OSPF cost & path selection|Standard ACLs|Extended ACLs|Applying ACLs in/out|NAT principles|Static NAT & Easy IP|NAT Server|VRRP|PPP & PPPoE (PAP/CHAP)|GRE & VPN overview|IPv6 static & OSPFv3|AAA: TACACS+/RADIUS|TCP/UDP port analysis|OSPF auth & passive interfaces|OSPF 2-Way/ExStart troubleshooting|Tracert & debug|eNSP multi-router OSPF lab|Route summarization|ACL edge security|HCIA routing mock exam|Routing troubleshooting sim|Capstone: routing & NAT architecture'],
  ['Month 3 — Python for Network Engineers', 'Python setup (Win, pip, VS Code)|Variables & arithmetic|if/elif/else|for & while loops|Lists & tuples|Dicts & sets|Functions|File I/O|CSV inventory|JSON parsing|try/except/finally|Regex: IPs & masks|Regex: interface output|OOP classes|OOP device modeling|pip packages|Subnet calculator|IP validation & ping|Multi-file CLI scripts|Inventory tool design|Add/search/export functions|Logging module|argparse|Debug against mock CLI output|Docstrings & PEP 8|Refactor into modules|unittest|Package for Windows|Inventory test run|Capstone: Network Inventory Tool'],
  ['Month 4 — Automation (SSH & Netmiko)', 'NetOps intro|Paramiko SSH|SSH auth & timeouts|Netmiko basics|Netmiko with Huawei VRP|display version & interface brief|TextFSM & Genie parsing|Interface states to dicts|Health check script|Backup tool design|Timestamped config backups|send_config_set batch push|Error handling & rollback|Threading with concurrent.futures|Parallel collection|Markdown/HTML reports|Credentials: env vars & getpass|NAPALM overview|Compare running vs startup|VLAN provisioning script|Handle unreachable devices|Audit logging|Pre/post-check script|CSV inventory + backup engine|Reusable modules|Test backup workflows|Test config parsers|CI/CD concepts|Automation suite integration test|Capstone: Automated Backup & Report Suite'],
  ['Month 5 — Linux, Ansible & Git', 'Linux CLI & permissions|grep, sed, awk, find|SSH keys & ssh-agent|Git basics|Git branching & merging|YAML syntax|Ansible architecture|Ad-hoc commands|First playbook|Tasks, modules, handlers|Variables & facts|Conditionals & loops|Network modules (huawei.ce)|Managing Huawei devices|Jinja2 templating|Interface descriptions via Jinja2|Ansible Vault|Roles|Collections|Idempotency|Backup/restore playbooks|Troubleshoot playbooks|Git + Ansible workflow|Compliance auditing|Multi-tier deployment playbook|Dry-run (--check)|Document roles|Project planning|Build Linux+Ansible repo|Capstone: Infrastructure Provisioning Workflow'],
  ['Month 6 — Monitoring, APIs, AI & Certification', 'SNMP v1/v2c/v3|pysnmp polling|REST API basics|RESTCONF/NETCONF testing|REST telemetry fetch|Bandwidth monitor script|Syslog parsing|AIOps intro|LLMs for log interpretation|Prompt engineering for NetEng|AI root-cause assistant|AI config generation + safety checks|AI firewall log anomalies|AI troubleshooting assistant|Webhook alerts|HCIA exam blueprint|Practice test 1|Practice test 2|Portfolio 1: Inventory & Backup|Portfolio 2: Ansible repo|Portfolio 3: AI triage tool|GitHub portfolio & README|Docs & architecture diagrams|Resume & LinkedIn|Final review & commands|Mock exam simulation|Review 180 days of notes|Schedule HCIA exam|Graduation check & retrospective|Graduation Day!']
];

// Build Huawei Roadmap with original 180 days
export function buildHuaweiRoadmap() {
  const phases = HUAWEI_CURRICULUM_RAW.map(([title, daysStr], idx) => {
    const dayTopics = daysStr.split('|');
    const startDay = idx * 30 + 1;
    const endDay = (idx + 1) * 30;
    return {
      id: `p_${idx + 1}`,
      title: title,
      startDay,
      endDay,
      days: dayTopics.map((topic, dIdx) => ({
        day: startDay + dIdx,
        topic: topic.trim()
      }))
    };
  });

  return {
    id: 'huawei_networking_ai',
    title: 'Huawei Networking → AI',
    description: '180-Day journey from network routing/switching fundamentals to Python automation & AI Ops.',
    category: 'Certification & Tech',
    icon: '🌐',
    color: '#10b981',
    totalDays: 180,
    phases,
    currentDay: 1,
    doneDays: [],
    notes: {},
    tasks: {},
    routineModes: [
      { id: 'm1', label: 'learn', dur: 20 },
      { id: 'm2', label: 'practise', dur: 30 },
      { id: 'm3', label: 'review', dur: 10 }
    ],
    createdAt: new Date().toISOString()
  };
}

// Full-Stack Developer Template (90 Days)
export function buildFullStackRoadmap() {
  const phase1Topics = [
    'HTML5 Semantic Architecture', 'CSS Flexbox & Responsive Layouts', 'CSS Grid & Modern Animations',
    'JavaScript ES6+ Syntax & Scope', 'DOM Manipulation & Event Listeners', 'Async JS: Promises, Async/Await',
    'Fetch API & REST Integration', 'Frontend Mini-Project: Interactive Dashboard', 'Git Basics & GitHub Workflow',
    'TypeScript Basics & Type Systems', 'React Basics: JSX, Props & State', 'React Hooks: useState & useEffect',
    'Component Architecture & Props Drilling', 'Tailwind CSS / UI Frameworks', 'Form Handling & Validation',
    'Client-Side Routing with React Router', 'Context API & Global State', 'Custom Hooks & Reusable Logic',
    'Data Fetching with React Query / SWR', 'Frontend Performance Optimization', 'Frontend Unit Testing with Jest',
    'Accessible Web Design (WCAG)', 'Full Frontend App: E-Commerce Storefront', 'E-Commerce Cart & Checkout State',
    'Frontend Deployment (Vercel / Netlify)', 'Code Review & Refactoring Day', 'SEO & Web Vitals Optimization',
    'Progressive Web Apps (PWA) Intro', 'Frontend Milestone Assessment', 'Phase 1 Retrospective & Portfolio Update'
  ];

  const phase2Topics = [
    'Node.js Runtime & Event Loop', 'NPM & Package Architecture', 'Express.js Fundamentals & Routing',
    'Middleware & Error Handling', 'RESTful API Architecture Standards', 'Postman & API Documentation',
    'Relational Databases: PostgreSQL Basics', 'SQL Queries, Joins & Aggregations', 'Database Indexing & Normalization',
    'ORM: Prisma or TypeORM Setup', 'CRUD API with Express & PostgreSQL', 'Authentication: JWT & Password Hashing',
    'Role-Based Access Control (RBAC)', 'Input Sanitization & Security (OWASP)', 'File Uploads (AWS S3 / Cloudinary)',
    'NoSQL Intro: MongoDB & Mongoose', 'Redis Caching & Session Management', 'Background Workers & Message Queues',
    'WebSockets & Real-Time Communication', 'Backend API Testing with Supertest', 'Docker Basics: Dockerfiles & Images',
    'Docker Compose for Multi-Container Apps', 'Database Migrations & Seeding', 'Microservices vs Monoliths Overview',
    'API Rate Limiting & Throttling', 'Logging & Monitoring (Winston, Morgan)', 'Cloud Deployment (Railway / Render / AWS)',
    'Serverless Functions Intro', 'Backend Milestone Project: Task Management API', 'Phase 2 Retrospective & Backend Review'
  ];

  const phase3Topics = [
    'Full-Stack Architecture Planning', 'Monorepo Setup with Turborepo', 'Next.js App Router Fundamentals',
    'Server Components vs Client Components', 'Server Actions & Mutations', 'Full-Stack Auth (NextAuth / Supabase)',
    'Database Schema Design for Capstone', 'Building Core Feature 1: User Onboarding', 'Building Core Feature 2: Main Dashboard',
    'Building Core Feature 3: Analytics Engine', 'Building Core Feature 4: Billing & Stripe', 'Real-time Notifications Engine',
    'Optimistic UI Updates & Loading States', 'End-to-End Testing with Playwright', 'CI/CD Pipeline with GitHub Actions',
    'Security Audit & Secret Management', 'Production Database Tuning', 'Domain Setup, SSL & CDN Caching',
    'AI Integration: OpenAI / Gemini API', 'Building an AI Copilot into App', 'Load Testing & Stress Testing',
    'User Experience Polish & Dark Mode', 'Landing Page & Conversion Optimization', 'Final Capstone Project Polish',
    'Open Source Release & GitHub README', 'Technical Case Study Writing', 'Resume & LinkedIn Modernization',
    'Full-Stack Mock Technical Interview', 'Portfolio Finalization & Live Demo', 'Graduation & Job Application Sprint!'
  ];

  const phases = [
    {
      id: 'p_fs_1',
      title: 'Phase 1 — Frontend Engineering (Days 1–30)',
      startDay: 1,
      endDay: 30,
      days: phase1Topics.map((topic, i) => ({ day: i + 1, topic }))
    },
    {
      id: 'p_fs_2',
      title: 'Phase 2 — Backend, Databases & DevOps (Days 31–60)',
      startDay: 31,
      endDay: 60,
      days: phase2Topics.map((topic, i) => ({ day: i + 31, topic }))
    },
    {
      id: 'p_fs_3',
      title: 'Phase 3 — Full-Stack Capstone & Career (Days 61–90)',
      startDay: 61,
      endDay: 90,
      days: phase3Topics.map((topic, i) => ({ day: i + 61, topic }))
    }
  ];

  return {
    id: 'fullstack_engineer_90',
    title: 'Full-Stack Software Engineer',
    description: '90-Day structured roadmap from Frontend mastery to Node/PostgreSQL backends and production Next.js apps.',
    category: 'Coding & Career',
    icon: '💻',
    color: '#3b82f6',
    totalDays: 90,
    phases,
    currentDay: 1,
    doneDays: [],
    notes: {},
    tasks: {},
    routineModes: [
      { id: 'm1', label: 'code', dur: 45 },
      { id: 'm2', label: 'review', dur: 15 },
      { id: 'm3', label: 'build', dur: 30 }
    ],
    createdAt: new Date().toISOString()
  };
}

// 30-Day Habit & Daily Mastery Template
export function buildHabitsRoadmap() {
  const topics = [
    'Define Core Vision & 3 Non-Negotiables', 'Design the Golden Morning Routine', 'Evening Digital Sunset & Sleep Hygiene',
    'Daily Time-Blocking & Deep Work Schedule', 'Hydration & Nutrition Baseline', 'Physical Exercise Baseline (30 mins)',
    'Eliminating 1 Bad Habit & Distraction audit', 'Week 1 Review & Friction Removal', 'Mindfulness & 10-Min Meditation',
    'Daily Reading Habit (20 pages/day)', 'Financial Awareness & Daily Expense Tracking', 'Organizing Workspace & Mental Clarity',
    'Batching Communications & Inbox Zero', 'Energy Audit: Tracking High/Low Peak Hours', 'Week 2 Review & Momentum Check',
    'The 2-Minute Rule for Procrastination', 'Saying No & Protecting Focus Boundaries', 'Midpoint Milestone: Celebrate Consistency',
    'Daily Journaling & Gratitude Practice', 'Physical Movement: High-Intensity Challenge', 'Learning a New Micro-Skill',
    'Week 3 Review & Resilience check', 'Designing Habit Stacking Systems', 'Social Media Fast & Dopamine Reset',
    'Preparing Tomorrow Today (Nightly Reset)', 'Handling Setbacks without Quitting', 'Active Recovery & Stress Mastery',
    'Final Stretch: Testing All Routines', '30-Day Milestone Assessment', 'Mastery Celebration & Next 90-Day Plan'
  ];

  const phases = [
    {
      id: 'p_h_1',
      title: 'Week 1 — Foundation & Reset (Days 1–7)',
      startDay: 1,
      endDay: 7,
      days: topics.slice(0, 7).map((t, i) => ({ day: i + 1, topic: t }))
    },
    {
      id: 'p_h_2',
      title: 'Week 2 — Energy & Mindset (Days 8–15)',
      startDay: 8,
      endDay: 15,
      days: topics.slice(7, 15).map((t, i) => ({ day: i + 8, topic: t }))
    },
    {
      id: 'p_h_3',
      title: 'Week 3 — Focus & Productivity (Days 16–22)',
      startDay: 16,
      endDay: 22,
      days: topics.slice(15, 22).map((t, i) => ({ day: i + 16, topic: t }))
    },
    {
      id: 'p_h_4',
      title: 'Week 4 — Mastery & Identity (Days 23–30)',
      startDay: 23,
      endDay: 30,
      days: topics.slice(22, 30).map((t, i) => ({ day: i + 23, topic: t }))
    }
  ];

  return {
    id: 'habit_mastery_30',
    title: '30-Day Daily Habit & Life Mastery',
    description: 'Transform your daily habits, routines, physical energy, and focus systems in 30 days.',
    category: 'Life & Productivity',
    icon: '⚡',
    color: '#f59e0b',
    totalDays: 30,
    phases,
    currentDay: 1,
    doneDays: [],
    notes: {},
    tasks: {},
    routineModes: [
      { id: 'm1', label: 'focus', dur: 30 },
      { id: 'm2', label: 'action', dur: 20 },
      { id: 'm3', label: 'reflect', dur: 10 }
    ],
    createdAt: new Date().toISOString()
  };
}

// 60-Day Fitness & Body Transformation Template
export function buildFitnessRoadmap() {
  const topicsPhase1 = Array.from({ length: 30 }, (_, i) => {
    const cycle = (i % 7) + 1;
    switch (cycle) {
      case 1: return `Upper Body Strength & Posture (Day ${i + 1})`;
      case 2: return `Lower Body & Core Mobility (Day ${i + 1})`;
      case 3: return `Active Recovery, 10k Steps & Stretching (Day ${i + 1})`;
      case 4: return `Push & Chest Hypertrophy (Day ${i + 1})`;
      case 5: return `Pull & Back Strength (Day ${i + 1})`;
      case 6: return `Legs & Explosive Power (Day ${i + 1})`;
      default: return `Rest, Meal Prep & Weekly Weigh-in (Day ${i + 1})`;
    }
  });

  const topicsPhase2 = Array.from({ length: 30 }, (_, i) => {
    const day = i + 31;
    const cycle = (i % 7) + 1;
    switch (cycle) {
      case 1: return `Progressive Overload: Chest & Triceps (Day ${day})`;
      case 2: return `Progressive Overload: Back & Biceps (Day ${day})`;
      case 3: return `HIIT Cardio & Core Conditioning (Day ${day})`;
      case 4: return `Heavy Squats & Hamstrings Focus (Day ${day})`;
      case 5: return `Shoulders & Athletic Conditioning (Day ${day})`;
      case 6: return `Full Body Circuit & Endurance (Day ${day})`;
      default: return `Transformation Review & Recovery (Day ${day})`;
    }
  });

  const phases = [
    {
      id: 'p_fit_1',
      title: 'Month 1 — Base Conditioning & Consistency (Days 1–30)',
      startDay: 1,
      endDay: 30,
      days: topicsPhase1.map((t, i) => ({ day: i + 1, topic: t }))
    },
    {
      id: 'p_fit_2',
      title: 'Month 2 — Intensity & Body Composition (Days 31–60)',
      startDay: 31,
      endDay: 60,
      days: topicsPhase2.map((t, i) => ({ day: i + 31, topic: t }))
    }
  ];

  return {
    id: 'fitness_transformation_60',
    title: '60-Day Body & Fitness Transformation',
    description: 'Structured workout progression, nutrition discipline, and energy building over 60 days.',
    category: 'Health & Fitness',
    icon: '💪',
    color: '#ec4899',
    totalDays: 60,
    phases,
    currentDay: 1,
    doneDays: [],
    notes: {},
    tasks: {},
    routineModes: [
      { id: 'm1', label: 'warmup', dur: 10 },
      { id: 'm2', label: 'workout', dur: 45 },
      { id: 'm3', label: 'stretch', dur: 15 }
    ],
    createdAt: new Date().toISOString()
  };
}

// Custom Roadmap Generator for ANY duration (e.g. 7, 14, 21, 30, 45, 60, 90, 100, 180, 365 days)
export function createCustomRoadmap({
  title,
  description = '',
  category = 'Personal Goal',
  icon = '🎯',
  color = '#8b5cf6',
  totalDays = 30,
  phaseLength = 30, // or 7 for weekly
  customTopics = []
}) {
  const daysCount = Math.max(1, parseInt(totalDays, 10) || 30);
  const block = Math.max(1, parseInt(phaseLength, 10) || (daysCount <= 21 ? 7 : 30));
  const numPhases = Math.ceil(daysCount / block);

  const phases = [];
  for (let p = 0; p < numPhases; p++) {
    const startDay = p * block + 1;
    const endDay = Math.min(daysCount, (p + 1) * block);
    const phaseDays = [];

    for (let d = startDay; d <= endDay; d++) {
      const existingTopic = customTopics[d - 1];
      const topic = existingTopic && existingTopic.trim()
        ? existingTopic.trim()
        : `${title}: Focus Day ${d}`;
      phaseDays.push({ day: d, topic });
    }

    const phaseTitle = block === 7
      ? `Week ${p + 1} (Days ${startDay}–${endDay})`
      : block === 30
      ? `Month ${p + 1} (Days ${startDay}–${endDay})`
      : `Phase ${p + 1} (Days ${startDay}–${endDay})`;

    phases.push({
      id: `phase_${p + 1}`,
      title: phaseTitle,
      startDay,
      endDay,
      days: phaseDays
    });
  }

  return {
    id: 'roadmap_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    title: title.trim() || 'My Personal Roadmap',
    description: description.trim() || `${daysCount}-day personal roadmap`,
    category,
    icon,
    color,
    totalDays: daysCount,
    phases,
    currentDay: 1,
    doneDays: [],
    notes: {},
    tasks: {},
    routineModes: [
      { id: 'm1', label: 'learn', dur: 25 },
      { id: 'm2', label: 'practise', dur: 35 },
      { id: 'm3', label: 'review', dur: 15 }
    ],
    createdAt: new Date().toISOString()
  };
}

export const TEMPLATE_LIST = [
  {
    id: 'huawei_networking_ai',
    title: 'Huawei Networking → AI',
    days: 180,
    icon: '🌐',
    color: '#10b981',
    category: 'Certification & Tech',
    desc: 'The original 180-day Huawei HCIA to NetOps AI curriculum.',
    builder: buildHuaweiRoadmap
  },
  {
    id: 'fullstack_engineer_90',
    title: 'Full-Stack Software Engineer',
    days: 90,
    icon: '💻',
    color: '#3b82f6',
    category: 'Coding & Career',
    desc: 'Master Modern React, TypeScript, Node, DBs & Cloud Capstones in 90 days.',
    builder: buildFullStackRoadmap
  },
  {
    id: 'fitness_transformation_60',
    title: '60-Day Body & Fitness',
    days: 60,
    icon: '💪',
    color: '#ec4899',
    category: 'Health & Fitness',
    desc: 'Progressive workout routines, recovery, and discipline.',
    builder: buildFitnessRoadmap
  },
  {
    id: 'habit_mastery_30',
    title: '30-Day Daily Habit Mastery',
    days: 30,
    icon: '⚡',
    color: '#f59e0b',
    category: 'Life & Productivity',
    desc: 'Morning routines, deep work focus, and mindset mastery.',
    builder: buildHabitsRoadmap
  }
];

export const CATEGORIES = [
  'Certification & Tech',
  'Coding & Career',
  'Life & Productivity',
  'Health & Fitness',
  'Language Learning',
  'Reading & Knowledge',
  'Business & Finance',
  'Personal Project'
];

export const COLOR_PALETTE = [
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#f59e0b', // Amber
  '#14b8a6', // Teal
];

export const ICON_OPTIONS = ['🌐', '💻', '⚡', '💪', '🎯', '🚀', '📚', '🧠', '💼', '🎨', '🔥', '🧘‍♂️', '🏆', '⭐', '🌱'];
