const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function env() {
  const map = new Map(); let reject = false, writes = 0;
  const localStorage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => { if (reject) throw Error('quota'); writes++; map.set(key, String(value)); } };
  const context = vm.createContext({ localStorage, TextEncoder, Date, Math, Set, console });
  for (const name of ['storage', 'defaults', 'models', 'plans']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', `${name}.js`), 'utf8'), context);
  return { S: context.StudyStorage, P: context.TodayWorkPlans, M: context.TodayWorkModels, map, reject: value => { reject = value; }, writes: () => writes };
}
function spec(count = 5) { return { format: 'TW_PLAN_V1', planName: '测试计划', categories: ['学习'], days: Array.from({ length: count }, (_, i) => ({ day: i + 1, tasks: [{ title: `任务 ${i + 1}`, category: '学习', estimatedMinutes: 30 }] })) }; }
const rules = (startDate = '2026-10-20') => ({ startDate, weekdays: [1, 2, 3, 4, 5], maxTasks: null, maxMinutes: null });
const clone = value => JSON.parse(JSON.stringify(value));
test('protocol accepts JSON and fenced JSON, defaults and plain text; rejects malformed/oversized/schema errors', () => {
  const { P } = env(); const input = spec(1); input.days[0].tasks[0].title = '<img src=x onerror=alert(1)>';
  const plan = P.parse('```json\n' + JSON.stringify(input) + '\n```');
  assert.equal(plan.days[0].tasks[0].priority, 'medium'); assert.match(plan.days[0].tasks[0].title, /onerror/);
  for (const value of ['{', '说明\n' + JSON.stringify(input), JSON.stringify({ ...input, format: 'x' }), JSON.stringify({ ...input, categories: ['学习', '学习'] }), JSON.stringify({ ...input, date: '2026-10-20' }), ' '.repeat(1048577)]) assert.throws(() => P.parse(value));
  for (const change of [p => { p.days[0].day = 2; }, p => { p.days[0].tasks = []; }, p => { p.days[0].tasks[0].estimatedMinutes = 1.5; }, p => { p.days[0].tasks[0].category = '不存在'; }, p => { p.days[0].tasks[0].priority = null; }]) { const p = spec(1); change(p); assert.throws(() => P.parse(JSON.stringify(p))); }
});
test('local calendar scheduling skips weekends and non-executable start; crosses month/year; no weekdays and range overflow rejected', () => {
  const { P } = env(); const plan = P.normalize(spec()); const data = { days: {} };
  assert.deepEqual(clone(P.schedule(plan, rules(), data).mapping.map(x => x.date)), ['2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-26']);
  assert.equal(P.schedule(plan, rules('2026-10-24'), data).mapping[0].date, '2026-10-26');
  assert.equal(P.schedule(plan, rules('2026-10-30'), data).mapping[1].date, '2026-11-02');
  assert.equal(P.schedule(plan, rules('2026-12-31'), data).mapping[1].date, '2027-01-01');
  assert.throws(() => P.schedule(plan, { ...rules(), weekdays: [] }, data));
  assert.throws(() => P.schedule(plan, rules('9999-12-31'), data));
});
test('limits combine existing + new tasks, use estimates instead of actual; unknown duration cannot pass as safe', () => {
  const { P } = env(); const data = { days: { '2026-10-20': { categories: [{ tasks: [{ estimatedMinutes: null, actualMinutes: 1 }, { estimatedMinutes: 50, actualMinutes: 0 }] }] } } };
  const preview = P.schedule(P.normalize(spec(1)), { ...rules(), maxTasks: 2, maxMinutes: 60 }, data);
  assert.equal(preview.mapping[0].total, 3); assert.equal(preview.mapping[0].knownMinutes, 80); assert.equal(preview.mapping[0].warnings.length, 3);
  assert.match(preview.mapping[0].warnings.join(), /无法完整判断/);
});
test('preview/cancel is read only; append keeps existing status/order; single save and duplicate import guard', () => {
  const { S, P, map, writes } = env(); const data = S.initialize('2026-10-20');
  data.days['2026-10-20'].categories = [{ id:'cat', name:'学习', tasks:[{ id:'old', title:'任务 1', done:true, actualMinutes:40 }] }]; S.save(data);
  const before = map.get(S.KEY), count = writes(), p = P.parse(JSON.stringify(spec(2)));
  P.schedule(p, rules(), S.load()); assert.equal(map.get(S.KEY), before); assert.equal(writes(), count);
  const next = S.load(); const record = P.importPlan(next, p, rules()); S.save(next);
  assert.equal(writes(), count + 1); assert.equal(S.load().days['2026-10-20'].categories[0].tasks[0].done, true);
  assert.equal(S.load().plans[0].id, record.id); assert.equal(S.load().days['2026-10-20'].categories[0].tasks[1].sourceDay, 1);
  const snapshot = JSON.stringify(next); assert.throws(() => P.importPlan(next, p, rules())); assert.equal(JSON.stringify(next), snapshot);
  P.importPlan(next, p, rules(), { allowDuplicate: true }); assert.equal(next.plans.length, 2);
});
test('failed whole-plan save preserves original; backups preserve plans/provenance and old backups remain valid', () => {
  const { S, P, map, reject } = env(); S.initialize('2026-10-20'); const original = map.get(S.KEY);
  const next = S.load(); P.importPlan(next, P.normalize(spec(1)), rules()); reject(true); assert.throws(() => S.save(next)); assert.equal(map.get(S.KEY), original);
  reject(false); S.save(next);
  const restored = S.parseBackup(JSON.stringify(S.backup(next))).data;
  assert.equal(restored.plans[0].id, next.plans[0].id); assert.equal(restored.days['2026-10-20'].categories[0].tasks[0].sourceTaskId, next.days['2026-10-20'].categories[0].tasks[0].sourceTaskId);
  const old = S.emptyData(); delete old.plans; assert.equal(S.parseBackup(JSON.stringify(old)).data.plans.length, 0);
});
test('manual carry retains source identity and does not duplicate logical plan task or change history', () => {
  const { S, P, M } = env(); const data = S.initialize('2026-10-20');
  P.importPlan(data, P.normalize(spec(1)), rules()); const original = clone(data.days['2026-10-20']); const task = original.categories[0].tasks[0];
  M.handleCarryOver(data, '2026-10-21', [task.id], 'added');
  const carried = data.days['2026-10-21'].categories[0].tasks[0]; assert.equal(carried.sourceTaskId, task.sourceTaskId);
  assert.equal(P.logicalTaskKey(carried), P.logicalTaskKey(task)); assert.deepEqual(clone(data.days['2026-10-20']), original);
  assert.equal(M.handleCarryOver(data, '2026-10-21', [task.id], 'added').added, 0);
});
test('prompt contains user constraints, schema example, execution days and no real dates', () => {
  const { P } = env(); const prompt = P.prompt({ goal:'提高阅读', days:7, minutes:40, requirements:'从基础开始' });
  for (const text of ['提高阅读','从基础开始','7 天','40 分钟','TW_PLAN_V1','不要输出实际日期','estimatedMinutes']) assert.ok(prompt.includes(text));
});
