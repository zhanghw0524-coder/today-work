(function (global) {
  'use strict';
  const KEY = 'forward-study.v1';
  const VERSION = 2;
  const THEME_KEY = 'forward-study.theme';
  const MIGRATION_KEY = 'forward-study.backup.v1';
  const RESTORE_KEY = 'forward-study.before-restore';
  let writable = true;
  let warning = '';
  const DAY_MS = 86400000;
  function dateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function parseDate(key) {
    const [year, month, day] = key.split('-').map(Number);
    const result = new Date(0);
    result.setFullYear(year, month - 1, day);
    result.setHours(12, 0, 0, 0);
    return result;
  }
  function validDate(key) {
    return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && key >= '1900-01-01' && key <= '9999-12-31' && dateKey(parseDate(key)) === key;
  }
  function shiftDate(key, amount) {
    const date = parseDate(key);
    date.setDate(date.getDate() + amount);
    return dateKey(date);
  }
  function dayDistance(a, b) {
    // UTC calendar arithmetic avoids daylight-saving transitions.
    const serial = key => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((serial(b) - serial(a)) / DAY_MS);
  }
  function uid() {
    return global.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
  function exampleDay() {
    return { categories: [
      { name: '今日计划', tasks: ['确定今天最重要的一件事', '为当前目标安排一项行动'] },
      { name: '每日复盘', tasks: ['记录今天的收获与下一步'] }
    ].map(group => ({ id: uid(), name: group.name, tasks: group.tasks.map(title => ({ id: uid(), title, done: false })) })) };
  }
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const text = value => typeof value === 'string' ? value : '';
  const minutes = value => Number.isFinite(value) && value >= 0 ? value : null;
  function emptyData(today = dateKey(), theme = 'system') {
    return { version: VERSION, startDate: today, days: {}, carryOverHandled: {}, leetcode: [], routes: global.TodayWorkDefaults?.routes() || [], plans: [], settings: { theme } };
  }

  function normalize(source, legacyTheme = 'system') {
    if (!object(source) || ![1, VERSION].includes(source.version)) throw new Error('无法识别数据版本，原始数据已保留。');
    const issues = [];
    const data = { ...source, version: VERSION, days: {}, carryOverHandled: {}, leetcode: [], routes: [] };
    if (!object(source.days)) issues.push('补全日期记录');
    const sourceDays = object(source.days) ? source.days : {};
    const dates = Object.keys(sourceDays).filter(validDate).sort();
    data.startDate = validDate(source.startDate) ? source.startDate : dates[0] || dateKey();
    if (!validDate(source.startDate)) issues.push('补全开始日期');
    const identity = (value, used) => {
      let id = text(value);
      if (!id || used.has(id)) { id = uid(); issues.push('补全重复或缺失的 ID'); }
      used.add(id); return id;
    };
    for (const [date, day] of Object.entries(sourceDays)) {
      if (!validDate(date) || !object(day)) { issues.push('隔离异常日期记录'); continue; }
      const used = new Set();
      const categories = [];
      if (!Array.isArray(day.categories)) issues.push('补全日期分类列表');
      for (const category of Array.isArray(day.categories) ? day.categories : []) {
        if (!object(category)) { issues.push('隔离异常分类'); continue; }
        const group = { ...category, id: identity(category.id, used), name: text(category.name).trim() || '未命名分类', tasks: [] };
        if (!text(category.name).trim()) issues.push('补全分类名称');
        if (!Array.isArray(category.tasks)) issues.push('补全任务列表');
        for (const task of Array.isArray(category.tasks) ? category.tasks : []) {
          if (!object(task) || !text(task.title).trim()) { issues.push('隔离异常空任务'); continue; }
          const record = { ...task, id: identity(task.id, used), title: task.title, done: task.done === true };
          if (typeof task.done !== 'boolean') issues.push('补全任务完成状态');
          if (record.priority !== undefined && !['高', '中', '低', ''].includes(record.priority)) { delete record.priority; issues.push('修复任务优先级'); }
          for (const field of ['estimatedMinutes', 'actualMinutes']) {
            if (record[field] !== undefined && record[field] !== null && minutes(record[field]) === null) { delete record[field]; issues.push('修复任务用时'); }
          }
          if (record.note !== undefined && typeof record.note !== 'string') { record.note = ''; issues.push('修复任务备注'); }
          group.tasks.push(record);
        }
        categories.push(group);
      }
      data.days[date] = { ...day, categories };
    }
    if (source.carryOverHandled !== undefined && !object(source.carryOverHandled)) issues.push('修复转入处理记录');
    for (const [date, handled] of Object.entries(object(source.carryOverHandled) ? source.carryOverHandled : {})) {
      if (!validDate(date) || !object(handled)) { issues.push('隔离异常转入记录'); continue; }
      data.carryOverHandled[date] = Object.fromEntries(Object.entries(handled).filter(([, status]) => ['added', 'ignored'].includes(status)));
    }
    const problemIds = new Set();
    if (source.leetcode !== undefined && !Array.isArray(source.leetcode)) issues.push('修复刷题列表');
    for (const problem of Array.isArray(source.leetcode) ? source.leetcode : []) {
      if (!object(problem) || !text(problem.title).trim() || !/^\d+$/.test(String(problem.problemNumber)) || Number(problem.problemNumber) <= 0) { issues.push('隔离异常题目'); continue; }
      if (problem.mastery !== undefined && ![1, 2, 3].includes(problem.mastery)) issues.push('修复题目熟练度');
      if (problem.status !== undefined && !['未完成', '已完成', '需要复习'].includes(problem.status)) issues.push('修复题目状态');
      if (problem.difficulty !== undefined && !['简单', '中等', '困难'].includes(problem.difficulty)) issues.push('修复题目难度');
      const record = { ...problem, id: identity(problem.id, problemIds), problemNumber: String(problem.problemNumber), title: problem.title, category: text(problem.category) || '未分类', difficulty: ['简单', '中等', '困难'].includes(problem.difficulty) ? problem.difficulty : '中等', status: ['未完成', '已完成', '需要复习'].includes(problem.status) ? problem.status : '未完成', mastery: [1, 2, 3].includes(problem.mastery) ? problem.mastery : 1, independent: problem.independent === true, date: validDate(problem.date) ? problem.date : '', lastReviewDate: validDate(problem.lastReviewDate) ? problem.lastReviewDate : '', reviewCount: Number.isInteger(problem.reviewCount) && problem.reviewCount >= 0 ? problem.reviewCount : 0, note: text(problem.note), url: text(problem.url) };
      data.leetcode.push(record);
    }
    if (source.routes !== undefined && !Array.isArray(source.routes)) issues.push('修复路线列表');
    const routeIds = new Set();
    for (const route of source.routes === undefined ? global.TodayWorkDefaults?.routes() || [] : Array.isArray(source.routes) ? source.routes : []) {
      if (!object(route) || !text(route.name).trim() || !Array.isArray(route.stages)) { issues.push('隔离异常路线'); continue; }
      const result = { ...route, id: identity(route.id, routeIds), stages: [] };
      const used = new Set();
      for (const stage of route.stages) {
        if (!object(stage) || !text(stage.name).trim() || !Array.isArray(stage.groups)) { issues.push('隔离异常阶段'); continue; }
        const step = { ...stage, id: identity(stage.id, used), groups: [] };
        for (const group of stage.groups) {
          if (!object(group) || !text(group.name).trim() || !Array.isArray(group.items)) { issues.push('隔离异常知识点分组'); continue; }
          const section = { ...group, id: identity(group.id, used), items: [] };
          for (const item of group.items) {
            if (!object(item) || !text(item.title).trim()) { issues.push('隔离异常知识点'); continue; }
            if (!['未开始', '学习中', '已完成'].includes(item.status)) issues.push('修复知识点状态');
            section.items.push({ ...item, id: identity(item.id, used), status: ['未开始', '学习中', '已完成'].includes(item.status) ? item.status : '未开始' });
          }
          step.groups.push(section);
        }
        result.stages.push(step);
      }
      data.routes.push(result);
    }
    data.plans = [];
    if (source.plans !== undefined && !Array.isArray(source.plans)) issues.push('修复计划列表');
    const planIds = new Set();
    for (const record of Array.isArray(source.plans) ? source.plans : []) {
      try {
        if (!global.TodayWorkPlans) throw new Error('计划模块未加载');
        global.TodayWorkPlans.validateRecord(record);
        if (planIds.has(record.id)) throw new Error('重复的计划 ID');
        planIds.add(record.id); data.plans.push(record);
      } catch { issues.push('隔离异常计划记录'); }
    }
    const theme = source.settings?.theme || legacyTheme;
    data.settings = { ...(object(source.settings) ? source.settings : {}), theme: ['light', 'dark', 'system'].includes(theme) ? theme : 'system' };
    if (source.settings?.personalization !== undefined && global.TodayWorkAssets) {
      try { data.settings.personalization = global.TodayWorkAssets.appearance(source.settings.personalization); }
      catch { delete data.settings.personalization; issues.push('修复个性化设置'); }
    }
    return { data, issues };
  }

  function validate(data) {
    const result = normalize(data);
    if (result.issues.length) throw new Error(`数据字段不完整：${result.issues[0]}`);
    return data;
  }
  function legacyTheme() { return global.localStorage.getItem(THEME_KEY) || 'system'; }
  function load() {
    const raw = global.localStorage.getItem(KEY);
    if (raw === null) return null;
    const source = JSON.parse(raw);
    const result = normalize(source, legacyTheme());
    if (source.version !== VERSION || result.issues.length) {
      try {
        // Preserve the exact original before any migration or repair overwrites it.
        if (source.version === 1 && !global.localStorage.getItem(MIGRATION_KEY)) global.localStorage.setItem(MIGRATION_KEY, raw);
        if (result.issues.length) {
          global.localStorage.setItem(`${KEY}.recovery.${Date.now()}`, raw);
          warning = '检测到部分异常记录，已保留原始快照并恢复可用内容。可在设置中导出原始快照。';
          console.error('Today Work 数据修复：', result.issues);
        }
        global.localStorage.setItem(KEY, JSON.stringify(result.data));
      } catch (error) {
        writable = false;
        warning = '数据升级未能保存。正在显示可用的原记录，原始数据未被清空；请导出备份并检查存储空间。';
        console.error('Today Work 迁移保存失败：', error);
      }
    }
    return result.data;
  }
  function save(data) {
    if (!writable) throw new Error('当前处于只读保护状态，请先在设置中恢复有效备份或刷新重试。');
    validate(data);
    global.localStorage.setItem(KEY, JSON.stringify(data));
  }
  function initialize(today = dateKey()) {
    let data;
    try {
      data = load() || emptyData(today, legacyTheme());
    } catch (error) {
      writable = false;
      warning = '本地记录暂时无法读取，已进入只读保护。原数据未覆盖；可在设置中导出原始数据或恢复有效备份。';
      console.error('Today Work 读取失败：', error);
      data = emptyData(today);
    }
    if (!data.days[today]) {
      data.days[today] = { categories: [] };
      try { save(data); } catch (error) {
        warning = warning || '本地存储暂时不可写，当前内容未保存。请检查浏览器权限或存储空间。';
        console.error('Today Work 初始化保存失败：', error);
      }
    }
    return data;
  }
  function backup(data, exportedAt = new Date().toISOString()) {
    return { app: 'Today Work', backupVersion: 1, exportedAt, data: JSON.parse(JSON.stringify(data)) };
  }
  function parseBackup(content, options = {}) {
    let value;
    try { value = JSON.parse(content); } catch { throw new Error('备份不是有效的 JSON 文件。'); }
    const envelope = value?.app === 'Today Work';
    if (envelope && value.backupVersion !== 1) throw new Error('不支持此备份格式版本。');
    const source = envelope ? value.data : value;
    if (!object(source) || !object(source.days)) throw new Error('备份缺少有效的日期记录结构。');
    const result = normalize(source, envelope ? 'system' : legacyTheme());
    if (result.issues.length) throw new Error(`备份包含异常记录：${result.issues[0]}。请先检查文件，不会覆盖当前数据。`);
    const imageAssets = envelope ? value.imageAssets ?? {} : {};
    if (!options.allowExternalImages && global.TodayWorkAssets) global.TodayWorkAssets.validateBackup(result.data, imageAssets);
    return { data: result.data, imageAssets, exportedAt: envelope ? text(value.exportedAt) : '旧版备份（未记录导出时间）' };
  }
  function restore(next) {
    validate(next);
    // Two-phase local restore: snapshot must succeed first; the live data is a single atomic setItem.
    const previous = { app: 'Today Work', backupVersion: 1, exportedAt: new Date().toISOString(), rawData: global.localStorage.getItem(KEY), legacyTheme: global.localStorage.getItem(THEME_KEY) };
    global.localStorage.setItem(RESTORE_KEY, JSON.stringify(previous));
    global.localStorage.setItem(KEY, JSON.stringify(next));
    writable = true; warning = '';
    return previous;
  }
  function recoverySnapshots() {
    const result = {};
    for (let index = 0; index < global.localStorage.length; index++) {
      const key = global.localStorage.key(index);
      if (key === MIGRATION_KEY || key?.startsWith(`${KEY}.recovery.`) || key === RESTORE_KEY) result[key] = global.localStorage.getItem(key);
    }
    result[KEY] = global.localStorage.getItem(KEY);
    result[THEME_KEY] = global.localStorage.getItem(THEME_KEY);
    return result;
  }
  global.StudyStorage = { KEY, VERSION, THEME_KEY, MIGRATION_KEY, RESTORE_KEY, dateKey, parseDate, validDate, shiftDate, dayDistance, uid, exampleDay, normalize, validate, load, save, initialize, emptyData, backup, parseBackup, restore, recoverySnapshots, diagnostics: () => ({ writable, warning }) };
})(globalThis);
