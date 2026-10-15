(function (global) {
  'use strict';
  const S = global.StudyStorage;
  const LIMITS = Object.freeze({ bytes: 1048576, days: 366, tasks: 2000 });
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function fail(message) { throw new Error(message); }
  function fields(value, allowed, where) {
    if (!object(value)) fail(`${where} 必须是对象。`);
    const extra = Object.keys(value).find(key => !allowed.includes(key));
    if (extra) fail(`${where} 包含不支持的字段：${extra}。`);
  }
  function text(value, name, max, optional = false) {
    if (optional && value === undefined) return '';
    if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) fail(`${name} 必须为${optional ? '' : '非空'}文本，最多 ${max} 字符。`);
    return value.trim();
  }
  function normalize(value) {
    fields(value, ['format', 'planName', 'goal', 'categories', 'days'], '计划');
    if (value.format !== 'TW_PLAN_V1') fail('format 必须为 TW_PLAN_V1。');
    const planName = text(value.planName, 'planName', 100);
    const goal = text(value.goal, 'goal', 2000, true);
    if (!Array.isArray(value.categories) || !value.categories.length || value.categories.length > 40) fail('categories 需要 1–40 个分类。');
    const categories = value.categories.map(name => text(name, '分类', 40));
    if (new Set(categories).size !== categories.length) fail('分类名称不能重复。');
    if (!Array.isArray(value.days) || !value.days.length || value.days.length > LIMITS.days) fail('days 需要 1–366 个执行日。');
    let count = 0;
    const days = value.days.map((day, index) => {
      fields(day, ['day', 'tasks'], `Day ${index + 1}`);
      if (day.day !== index + 1) fail('day 必须从 1 开始连续递增。');
      if (!Array.isArray(day.tasks) || !day.tasks.length || day.tasks.length > 100) fail(`Day ${day.day} 需要 1–100 项任务。`);
      const tasks = day.tasks.map((task, taskIndex) => {
        const where = `Day ${day.day} 第 ${taskIndex + 1} 项`;
        fields(task, ['title', 'category', 'estimatedMinutes', 'priority', 'note'], where);
        const title = text(task.title, `${where} title`, 160);
        const category = text(task.category, `${where} category`, 40);
        if (!categories.includes(category)) fail(`${where} 的分类未在 categories 中声明。`);
        const estimatedMinutes = task.estimatedMinutes ?? null;
        if (estimatedMinutes !== null && (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 10080)) fail(`${where} estimatedMinutes 应为 1–10080 的整数或 null。`);
        const priority = task.priority === undefined ? 'medium' : task.priority;
        if (!['low', 'medium', 'high'].includes(priority)) fail(`${where} priority 仅支持 low、medium、high。`);
        return { title, category, estimatedMinutes, priority, note: text(task.note, `${where} note`, 4000, true) };
      });
      count += tasks.length;
      if (count > LIMITS.tasks) fail('计划总任务数不能超过 2000 项。');
      return { day: day.day, tasks };
    });
    return { format: 'TW_PLAN_V1', planName, goal, categories, days };
  }
  function parse(content) {
    if (typeof content !== 'string' || new TextEncoder().encode(content).length > LIMITS.bytes) fail('计划输入不能超过 1 MiB。');
    let input = content.trim();
    const fence = input.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
    if (fence) input = fence[1].trim();
    let value;
    try { value = JSON.parse(input); } catch { fail('不是有效 JSON。请仅粘贴 JSON 或单个 json 代码块，不要附带说明文字。'); }
    return normalize(value);
  }
  function rules(value) {
    if (!S.validDate(value.startDate)) fail('请选择有效的开始日期（1900–9999 年）。');
    if (!Array.isArray(value.weekdays) || !value.weekdays.length || value.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) fail('请至少选择一个执行星期。');
    const result = { startDate: value.startDate, weekdays: [...new Set(value.weekdays)].sort(), maxTasks: null, maxMinutes: null };
    for (const [key, limit] of [['maxTasks', 10000], ['maxMinutes', 100800]]) {
      if (value[key] === null || value[key] === undefined || value[key] === '') continue;
      if (!Number.isInteger(value[key]) || value[key] < 1 || value[key] > limit) fail(`${key === 'maxTasks' ? '每日任务数' : '每日预计分钟'}上限必须为 1–${limit} 的整数，或留空。`);
      result[key] = value[key];
    }
    return result;
  }
  const dayTasks = (data, date) => (data.days[date]?.categories || []).flatMap(category => category.tasks);
  function summarize(plan) {
    const tasks = plan.days.flatMap(day => day.tasks);
    return { days: plan.days.length, tasks: tasks.length, minutes: tasks.reduce((sum, task) => sum + (task.estimatedMinutes || 0), 0), unknown: tasks.filter(task => task.estimatedMinutes === null).length };
  }
  function schedule(plan, inputRules, data) {
    const settings = rules(inputRules);
    let date = settings.startDate;
    const mapping = plan.days.map((day, index) => {
      if (index) date = S.shiftDate(date, 1);
      while (S.validDate(date) && !settings.weekdays.includes(S.parseDate(date).getDay())) date = S.shiftDate(date, 1);
      if (!S.validDate(date)) fail('排期超出支持的日期范围，请调整开始日期。');
      const existing = dayTasks(data, date);
      const combined = existing.concat(day.tasks);
      const knownMinutes = combined.reduce((sum, task) => sum + (Number.isFinite(task.estimatedMinutes) ? task.estimatedMinutes : 0), 0);
      const unknown = combined.filter(task => !Number.isFinite(task.estimatedMinutes)).length;
      const warnings = [];
      if (settings.maxTasks !== null && combined.length > settings.maxTasks) warnings.push(`合计 ${combined.length} 项（已有 ${existing.length} + 新增 ${day.tasks.length}），超过 ${settings.maxTasks} 项上限`);
      if (settings.maxMinutes !== null && knownMinutes > settings.maxMinutes) warnings.push(`已知预计 ${knownMinutes} 分钟，超过 ${settings.maxMinutes} 分钟上限`);
      if (settings.maxMinutes !== null && unknown) warnings.push(`${unknown} 项缺少预计时长，无法完整判断时长上限`);
      return { day: day.day, date, existing: existing.length, total: combined.length, knownMinutes, unknown, warnings };
    });
    return { rules: settings, mapping, endDate: mapping[mapping.length - 1].date, needsAcknowledgement: mapping.some(day => day.warnings.length) };
  }
  function duplicates(data, plan) {
    const canonical = JSON.stringify(plan);
    return (data.plans || []).filter(record => JSON.stringify(record.plan) === canonical);
  }
  function importPlan(data, plan, inputRules, options = {}) {
    plan = normalize(plan);
    const preview = schedule(plan, inputRules, data);
    if (duplicates(data, plan).length && !options.allowDuplicate) fail('同一计划已经导入，请先明确确认再次导入。');
    if (preview.needsAcknowledgement && !options.keepSchedule) fail('排期超限或无法完整判断，请调整规则或明确选择保持安排。');
    const id = S.uid();
    const record = { id, createdAt: new Date().toISOString(), plan, rules: preview.rules, mapping: preview.mapping.map(({ day, date }) => ({ day, date })) };
    for (const entry of preview.mapping) {
      const day = data.days[entry.date] ||= { categories: [] };
      plan.days[entry.day - 1].tasks.forEach((task, index) => {
        let category = day.categories.find(item => item.name.trim() === task.category);
        if (!category) { category = { id: S.uid(), name: task.category, tasks: [], manualOrder: true }; day.categories.push(category); }
        category.manualOrder = true;
        category.tasks.push({ ...task, priority: { low: '低', medium: '中', high: '高' }[task.priority], id: S.uid(), done: false, sourcePlanId: id, sourceDay: entry.day, sourceTaskId: `${id}:${entry.day}:${index + 1}` });
      });
    }
    (data.plans ||= []).push(record);
    return record;
  }
  function validateRecord(record) {
    if (!object(record) || typeof record.id !== 'string' || !record.id || typeof record.createdAt !== 'string') fail('计划记录缺少 ID 或创建时间。');
    const plan = normalize(record.plan);
    const settings = rules(record.rules);
    const expected = schedule(plan, settings, { days: {} }).mapping;
    if (!Array.isArray(record.mapping) || JSON.stringify(record.mapping) !== JSON.stringify(expected.map(({ day, date }) => ({ day, date })))) fail('计划日期映射无效。');
    return record;
  }
  const example = { format: 'TW_PLAN_V1', planName: '英语学习计划', goal: '提高听力与阅读能力', categories: ['听力', '阅读'], days: [{ day: 1, tasks: [{ title: '完成一次听力练习并整理错题', category: '听力', estimatedMinutes: 30, priority: 'high', note: '先完整听一遍，再核对答案' }] }, { day: 2, tasks: [{ title: '阅读一篇文章并整理表达', category: '阅读', estimatedMinutes: 40, priority: 'medium', note: '' }] }] };
  function prompt(values) {
    const goal = text(values.goal, '目标', 2000);
    const requirements = text(values.requirements, '其他要求', 4000, true);
    if (!Number.isInteger(values.days) || values.days < 1 || values.days > 366) fail('执行天数需为 1–366 的整数。');
    if (!Number.isInteger(values.minutes) || values.minutes < 1 || values.minutes > 1440) fail('每个执行日时间需为 1–1440 分钟的整数。');
    return `请为我制定可执行的学习、成长或任务计划。\n目标：${goal}\n执行天数：${values.days} 天（指实际安排任务的天数，不是自然日跨度）。\n每个执行日可投入：${values.minutes} 分钟。请尽量让当天预计总时长不超过此时间。\n其他要求：${requirements || '无'}\n\n仅返回符合 TW_PLAN_V1 的 JSON，不要解释、Markdown 表格或代码块，不要输出实际日期或决定周末映射。按 Day 1、Day 2 到 Day ${values.days} 连续安排；每个执行日至少一项任务。\n字段规则：format 必须为 "TW_PLAN_V1"；planName 为非空名称（最多100字符）；goal 可选文本（最多2000字符）；categories 为1–40个不重复非空分类名（每个最多40字符）。days 为1–366个对象，day 从1连续递增，tasks 为1–100项，总任务最多2000项。每项 title 非空最多160字符，category 必须来自 categories；estimatedMinutes 为1–10080正整数，未知可省略或 null；priority 仅 low/medium/high，省略为 medium；note 可选普通文本最多4000字符。不要添加其他字段或重复统计字段，JSON总量不超过1 MiB。所有文字为普通文本。\n\n结构示例（仅示范结构，请按我的目标和执行天数重新生成）：\n${JSON.stringify(example, null, 2)}`;
  }
  global.TodayWorkPlans = { LIMITS, normalize, parse, rules, summarize, schedule, duplicates, importPlan, validateRecord, prompt, example, logicalTaskKey: task => task.sourceTaskId || task.id };
})(globalThis);
