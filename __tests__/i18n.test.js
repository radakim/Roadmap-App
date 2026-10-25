import fs from 'fs';
import path from 'path';
import { DICTIONARIES, translate, categoryLabel, modeLabel } from '../i18n';

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

// Every quoted 'section.key' literal in the UI sources must exist in BOTH languages
function keysUsedIn(source) {
  const keys = new Set();
  const re = /'((?:common|tab|header|today|timer|tasks|priority|notes|copy|export|lesson|gen|practice|roadmaps|templates|timeline|settings|stats|sync|backup|reset|storage|alarm|create|edit|editDay|duration|schedule|aiSettings|guide|aiRoadmap|level|focus|upload|notif|ai)\.[A-Za-z0-9.]+)'/g;
  let m;
  while ((m = re.exec(source)) !== null) keys.add(m[1]);
  return keys;
}

describe('i18n', () => {
  const sources = ['App.js', 'aiService.js', 'notifications.js'].map(read).join('\n');
  const used = keysUsedIn(sources);
  // Template-literal keys built at runtime
  ['guide.deepseek1Title', 'guide.deepseek1Body', 'guide.deepseek2Title', 'guide.deepseek2Body',
    'guide.openai1Title', 'guide.openai1Body', 'guide.openai2Title', 'guide.openai2Body',
    'level.Beginner', 'level.Intermediate', 'level.Advanced'].forEach((k) => used.add(k));

  test('UI uses a substantial number of keys', () => {
    expect(used.size).toBeGreaterThan(400);
  });

  test('every key used in the UI exists in English', () => {
    const missing = [...used].filter((k) => DICTIONARIES.en[k] === undefined);
    expect(missing).toEqual([]);
  });

  test('every key used in the UI exists in Simplified Chinese', () => {
    const missing = [...used].filter((k) => DICTIONARIES.zh[k] === undefined);
    expect(missing).toEqual([]);
  });

  test('English and Chinese dictionaries have identical key sets', () => {
    const en = Object.keys(DICTIONARIES.en).sort();
    const zh = Object.keys(DICTIONARIES.zh).sort();
    expect(zh.filter((k) => !en.includes(k))).toEqual([]);
    expect(en.filter((k) => !zh.includes(k))).toEqual([]);
  });

  test('placeholders match between languages', () => {
    const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
    const bad = Object.keys(DICTIONARIES.en).filter(
      (k) => DICTIONARIES.zh[k] !== undefined && ph(DICTIONARIES.en[k]) !== ph(DICTIONARIES.zh[k])
    );
    expect(bad).toEqual([]);
  });

  test('Chinese strings are actually translated (contain CJK) for UI labels', () => {
    const exempt = new Set(['settings.languageTitle', 'practice.col.vlan', 'header.streakDays', 'aiSettings.openai']);
    const untranslated = Object.keys(DICTIONARIES.zh).filter(
      (k) => !exempt.has(k) && !/[一-鿿]/.test(DICTIONARIES.zh[k])
    );
    expect(untranslated).toEqual([]);
  });

  test('UI source has no leftover hard-coded English in visible <Text> nodes', () => {
    const app = read('App.js');
    // Text children that are plain English words (not {expressions}) indicate missed strings
    const offenders = (app.match(/<Text[^>]*>\s*[A-Za-z][A-Za-z ,.'!?-]{3,}\s*<\/Text>/g) || []);
    expect(offenders).toEqual([]);
  });

  test('interpolation and fallbacks', () => {
    expect(translate('en', 'header.dayOf', { day: 3, total: 30 })).toBe('Day 3 of 30');
    expect(translate('zh', 'header.dayOf', { day: 3, total: 30 })).toBe('第 3 天 / 共 30 天');
    expect(translate('fr', 'tab.focus')).toBe('Focus');
    expect(translate('zh', 'no.such.key')).toBe('no.such.key');
    expect(categoryLabel('zh', 'Health & Fitness')).toBe('健康与健身');
    expect(categoryLabel('zh', 'My own category')).toBe('My own category');
    expect(modeLabel('zh', 'learn')).toBe('学习');
    expect(modeLabel('en', 'learn')).toBe('learn');
  });
});
