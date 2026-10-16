const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function environment() {
  const entries = new Map();
  const messages = [];
  const localStorage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, String(value)), key: index => [...entries.keys()][index], get length() { return entries.size; } };
  const context = vm.createContext({ localStorage, console: { error: (...args) => messages.push(args) }, Date, Math, Set, URL });
  for (const file of ['storage.js', 'defaults.js', 'models.js', 'stats.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8'), context);
  return { S: context.StudyStorage, T: context.StudyStats, M: context.TodayWorkModels, localStorage, messages };
}
function filled(S, date = '2026-10-15') { const data = S.initialize(date); data.days[date] = S.exampleDay(); return data; }
function legacy() { return { version: 1, startDate: '2026-10-14', days: { '2026-10-14': { categories: [{ id: 'g-1', name: '我的 C++ 计划', tasks: [{ id: 't-1', title: '指针', done: true }, { id: 't-2', title: '引用', done: false }] }] } } }; }
function problem(overrides = {}) { return { problemNumber: '739', title: '每日温度', category: '单调栈', difficulty: '中等', status: '已完成', mastery: 1, independent: true, date: '2026-10-15', note: '', url: '', ...overrides }; }

test('new users and new days are blank, with no personal defaults', () => {
  const { S, T } = environment();
  const data = S.initialize('2026-10-15');
  assert.equal(T.summarize(data.days['2026-10-15']).total, 0);
  assert.equal(data.routes.length, 0);
  assert.equal(data.version, 2);
});
test('v1 migration preserves exact original, tasks, states, dates, IDs, and dark theme', () => {
  const { S, localStorage } = environment();
  const old = legacy(), raw = JSON.stringify(old);
  localStorage.setItem(S.KEY, raw); localStorage.setItem(S.THEME_KEY, 'dark');
  const next = S.initialize('2026-10-15');
  assert.equal(next.version, 2); assert.equal(next.settings.theme, 'dark');
  assert.equal(JSON.stringify(next.days['2026-10-14']), JSON.stringify(old.days['2026-10-14']));
  assert.equal(localStorage.getItem(S.MIGRATION_KEY), raw);
  assert.equal(next.startDate, old.startDate);
  assert.equal(S.load().days['2026-10-14'].categories[0].tasks[0].done, true);
});
test('task changes survive reload and the following day does not copy tasks', () => {
  const { S, T } = environment(); const data = filled(S);
  data.days['2026-10-15'].categories[0].tasks[0].done = true; S.save(data);
  assert.equal(T.summarize(S.initialize('2026-10-15').days['2026-10-15']).done, 1);
  const next = S.initialize('2026-10-16');
  assert.equal(T.summarize(next.days['2026-10-15']).done, 1);
  assert.equal(T.summarize(next.days['2026-10-16']).total, 0);
});
test('carry-over add/ignore are durable, deduplicated, and leave yesterday unchanged', () => {
  const { S, M } = environment(); const data = filled(S, '2026-10-14');
  data.days['2026-10-15'] = S.exampleDay();
  const yesterday = JSON.stringify(data.days['2026-10-14']);
  const candidates = M.pendingCarryOver(data, '2026-10-15');
  const first = M.handleCarryOver(data, '2026-10-15', [candidates[0].task.id], 'added');
  assert.equal(first.skipped, 1); assert.equal(first.added, 0);
  M.handleCarryOver(data, '2026-10-15', [candidates[1].task.id], 'ignored'); S.save(data);
  assert.equal(M.pendingCarryOver(S.load(), '2026-10-15').length, 1);
  assert.equal(JSON.stringify(data.days['2026-10-14']), yesterday);
  data.days['2026-10-15'] = { categories: [] };
  const last = M.pendingCarryOver(data, '2026-10-15');
  M.handleCarryOver(data, '2026-10-15', [last[0].task.id], 'added');
  const task = data.days['2026-10-15'].categories[0].tasks[0];
  assert.equal(task.done, false); assert.notEqual(task.id, last[0].task.id);
  assert.equal(data.days['2026-10-15'].categories[0].name, last[0].category);
});
test('plan import merges repeated groups/tasks and preserves completed tasks', () => {
  const { S, M, T } = environment(); const data = S.initialize('2026-10-15');
  const plan = M.parsePlan(JSON.stringify({ categories: [{ name: '学习', tasks: ['读书', '读书'] }, { name: '学习', tasks: ['练习'] }] }), '2026-10-15');
  const result = M.mergePlan(data, plan); assert.equal(result.categories, 1); assert.equal(result.tasks, 2); assert.equal(result.skipped, 1);
  data.days[plan.date].categories[0].tasks[0].done = true;
  const repeated = M.mergePlan(data, plan); assert.equal(repeated.tasks, 0); assert.equal(repeated.skipped, 3);
  assert.equal(T.summarize(data.days[plan.date]).done, 1);
});
test('bad JSON, invalid dates, missing fields and empty tasks fail without mutation', () => {
  const { M } = environment();
  for (const value of ['{broken', '{}', '[]', '{"date":"2026-02-30","categories":[]}', '{"categories":[{"name":"x","tasks":[""]}]}']) assert.throws(() => M.parsePlan(value));
  assert.equal(M.parsePlan('{"date":"2027-01-01","categories":[]}').date, '2027-01-01');
});
test('problems can be added, edited, filtered and reviewed with history retained', () => {
  const { S, M } = environment(); const data = S.initialize('2026-10-15');
  const p = M.saveProblem(data, problem()); M.reviewProblem(data, p.id, '2026-10-16');
  M.saveProblem(data, problem({ mastery: 3, note: '掌握了' }), p.id); S.save(data);
  const loaded = S.load().leetcode[0]; assert.equal(loaded.reviewCount, 1); assert.equal(loaded.lastReviewDate, '2026-10-16'); assert.equal(loaded.mastery, 3);
  assert.equal(M.filterProblems(data.leetcode, { search: '739', mastery: '3', independent: 'true' }).length, 1);
  assert.equal(M.filterProblems(data.leetcode, { category: '数组' }).length, 0);
  assert.throws(() => M.saveProblem(data, problem()), /已存在/);
  assert.throws(() => M.validateProblem(problem({ url: 'javascript:alert(1)' })), /http/);
  assert.equal(M.problemStats(data.leetcode).average, 3);
});
test('task-to-problem is an explicit prefill operation without modifying the database', () => {
  const { M } = environment(); const value = M.taskProblem({ title: '完成 496 下一个更大元素 I' }, '2026-10-15');
  assert.equal(value.problemNumber, '496'); assert.equal(value.title, '下一个更大元素 I');
});
test('custom route editing retains progress and status updates survive save/reload', () => {
  const { S, M } = environment(); const data = S.initialize('2026-10-15');
  const route = M.parseRoute('英语学习', '# 起步\n阅读\n听力\n\n# 实践\n## 口语\n对话'); data.routes.push(route);
  M.updateRoute(data, route.id, route.stages[0].groups[0].items[0].id, '已完成');
  assert.equal(M.routeProgress(route.stages).percent, 33);
  const edited = M.parseRoute('英语计划', M.routeOutline(route), route);
  assert.equal(edited.stages[0].groups[0].items[0].status, '已完成');
  data.routes[0] = edited; S.save(data);
  assert.equal(M.routeProgress(S.load().routes[0].stages).done, 1);
  assert.throws(() => M.parseRoute('x', '没有阶段标题'));
});
test('statistics use weighted task rates, Monday weeks, recorded time and no future plans', () => {
  const { S, T } = environment(); const data = filled(S);
  data.days['2026-10-15'].categories[0].tasks[0].done = true;
  data.days['2026-10-15'].categories[0].tasks[0].actualMinutes = 130;
  for (const date of ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-14', '2026-10-16']) { data.days[date] = S.exampleDay(); data.days[date].categories[0].tasks[0].done = true; }
  const stats = T.calculate(data, '2026-10-15');
  assert.equal(stats.totalDone, 5); assert.equal(stats.streak, 2); assert.equal(stats.best, 3);
  assert.equal(stats.week.done, 3); assert.equal(stats.week.percent, 33); assert.equal(stats.month.done, 5);
  assert.equal(stats.week.minutes, 130); assert.equal(T.formatMinutes(130), '2h 10min');
  assert.equal(T.calculate(data, '2026-10-18').streak, 0);
});
test('calendar arithmetic handles leap years and month/year transitions', () => {
  const { S } = environment(); assert.equal(S.shiftDate('2026-12-31', 1), '2027-01-01'); assert.equal(S.shiftDate('2028-03-01', -1), '2028-02-29'); assert.equal(S.validDate('2026-02-30'), false); assert.equal(S.dayDistance('2026-10-15', '2026-10-17'), 2);
});
test('full backups restore all domains and retain a pre-restore snapshot', () => {
  const { S, M, localStorage } = environment(); const data = filled(S); M.saveProblem(data, problem()); data.settings.theme = 'dark'; data.carryOverHandled['2026-10-15'] = { source: 'ignored' }; data.routes.push(M.parseRoute('任意目标', '# 第一阶段\n行动')); S.save(data);
  const exported = JSON.stringify(S.backup(data)); const before = localStorage.getItem(S.KEY);
  const parsed = S.parseBackup(exported); assert.equal(parsed.data.leetcode.length, 1); assert.equal(parsed.data.routes.length, 1);
  S.restore(parsed.data); assert.equal(JSON.parse(localStorage.getItem(S.RESTORE_KEY)).rawData, before);
  assert.equal(S.load().settings.theme, 'dark'); assert.equal(S.load().carryOverHandled['2026-10-15'].source, 'ignored');
  assert.equal(S.parseBackup(JSON.stringify(legacy())).data.version, 2);
  for (const invalid of ['{}', '{', '{"version":2,"days":null}']) assert.throws(() => S.parseBackup(invalid));
});
test('invalid individual records are isolated with a raw recovery snapshot', () => {
  const { S, localStorage } = environment(); const old = legacy(); old.days['2026-10-14'].categories[0].tasks.push(null); old.days.bad = null;
  localStorage.setItem(S.KEY, JSON.stringify(old)); const data = S.initialize('2026-10-15');
  assert.equal(data.days['2026-10-14'].categories[0].tasks.length, 2); assert.ok(S.diagnostics().warning);
  assert.ok(Object.keys(S.recoverySnapshots()).some(key => key.includes('.recovery.')));
});
test('unreadable roots enter read-only mode without wiping data and can recover from backup', () => {
  const { S, localStorage } = environment(); localStorage.setItem(S.KEY, '{broken');
  const data = S.initialize('2026-10-15'); assert.equal(S.diagnostics().writable, false); assert.equal(localStorage.getItem(S.KEY), '{broken'); assert.throws(() => S.save(data), /只读/);
  S.restore(S.emptyData('2026-10-15')); assert.equal(S.diagnostics().writable, true); assert.equal(JSON.parse(localStorage.getItem(S.RESTORE_KEY)).rawData, '{broken');
});
test('failed migration and failed restore preserve live data', () => {
  const { S, localStorage } = environment(); const raw = JSON.stringify(legacy()); localStorage.setItem(S.KEY, raw);
  const realSet = localStorage.setItem; localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  S.initialize('2026-10-15'); assert.equal(localStorage.getItem(S.KEY), raw); assert.equal(S.diagnostics().writable, false);
  localStorage.setItem = realSet; const next = S.emptyData('2026-10-15');
  localStorage.setItem = (key, value) => { if (key === S.KEY) throw new Error('QuotaExceededError'); realSet(key, value); };
  assert.throws(() => S.restore(next), /QuotaExceeded/); assert.equal(localStorage.getItem(S.KEY), raw); assert.ok(localStorage.getItem(S.RESTORE_KEY));
});
test('priority sorting is stable and respects a manual-order flag', () => {
  const { M } = environment(); const category = { tasks: [{ title: 'A' }, { title: 'B', priority: '高' }, { title: 'C', priority: '高' }] };
  assert.equal(M.sortedTasks(category).map(task => task.title).join(','), 'B,C,A');
  category.manualOrder = true; assert.equal(M.sortedTasks(category).map(task => task.title).join(','), 'A,B,C');
});
