(function (global) {
  'use strict';
  const S = global.StudyStorage;
  function parsePlan(content, today = S.dateKey()) {
    let value;
    try { value = JSON.parse(content); } catch { throw new Error('JSON 格式有误，请检查逗号、引号和括号。'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('计划必须是包含 categories 的 JSON 对象。');
    const date = value.date === undefined ? today : value.date;
    if (!S.validDate(date)) throw new Error('date 必须是有效日期，例如 2026-10-15。');
    if (!Array.isArray(value.categories)) throw new Error('categories 必须是分类数组。');
    const categories = value.categories.map((group, index) => {
      if (!group || typeof group.name !== 'string' || !group.name.trim() || group.name.trim().length > 40) throw new Error(`第 ${index + 1} 个分类需要 1–40 字的名称。`);
      if (!Array.isArray(group.tasks)) throw new Error(`分类“${group.name}”的 tasks 必须是数组。`);
      const tasks = group.tasks.map((task, number) => {
        if (typeof task !== 'string' || !task.trim() || task.trim().length > 160) throw new Error(`分类“${group.name}”第 ${number + 1} 项任务需要 1–160 字的文本。`);
        return task.trim();
      });
      return { name: group.name.trim(), tasks };
    });
    return { date, categories };
  }
  function mergePlan(data, plan) {
    const result = { categories: 0, tasks: 0, skipped: 0 };
    if (!plan.categories.length) return result;
    const day = data.days[plan.date] ||= { categories: [] };
    for (const source of plan.categories) {
      let group = day.categories.find(item => item.name.trim() === source.name);
      if (!group) { group = { id: S.uid(), name: source.name, tasks: [] }; day.categories.push(group); result.categories++; }
      for (const title of source.tasks) {
        if (group.tasks.some(task => task.title.trim() === title)) { result.skipped++; continue; }
        group.tasks.push({ id: S.uid(), title, done: false }); result.tasks++;
      }
    }
    return result;
  }
  function pendingCarryOver(data, today = S.dateKey()) {
    const yesterday = S.shiftDate(today, -1);
    const handled = data.carryOverHandled?.[today] || {};
    return (data.days[yesterday]?.categories || []).flatMap(group => group.tasks.filter(task => !task.done && !Object.hasOwn(handled, task.id)).map(task => ({ task, category: group.name, sourceDate: yesterday })));
  }
  function handleCarryOver(data, today, ids, action) {
    if (!['added', 'ignored'].includes(action)) throw new Error('无效处理操作。');
    const candidates = pendingCarryOver(data, today).filter(item => ids.includes(item.task.id));
    const handled = data.carryOverHandled[today] ||= {};
    let added = 0, skipped = 0;
    for (const item of candidates) {
      if (action === 'added') {
        const day = data.days[today] ||= { categories: [] };
        if (day.categories.some(group => group.tasks.some(task => (item.task.sourceTaskId && task.sourceTaskId === item.task.sourceTaskId) || task.title.trim() === item.task.title.trim()))) skipped++;
        else {
          let group = day.categories.find(category => category.name.trim() === item.category.trim());
          if (!group) { group = { id: S.uid(), name: item.category, tasks: [] }; day.categories.push(group); }
          group.tasks.push({ ...item.task, id: S.uid(), done: false, actualMinutes: null }); added++;
        }
      }
      Object.defineProperty(handled, item.task.id, { value: action, enumerable: true, configurable: true, writable: true });
    }
    return { handled: candidates.length, added, skipped };
  }
  function problemStats(problems) {
    const categories = new Map();
    let totalMastery = 0;
    for (const problem of problems) {
      totalMastery += problem.mastery;
      const group = categories.get(problem.category) || { name: problem.category, total: 0, mastery: 0 };
      group.total++; group.mastery += problem.mastery; categories.set(problem.category, group);
    }
    return { total: problems.length, done: problems.filter(p => p.status === '已完成').length, review: problems.filter(p => p.status === '需要复习' || p.mastery === 1).length, independent: problems.filter(p => p.independent).length, average: problems.length ? totalMastery / problems.length : 0, categories: [...categories.values()].map(group => ({ ...group, average: group.mastery / group.total })) };
  }
  function filterProblems(problems, filters = {}) {
    const query = (filters.search || '').trim().toLocaleLowerCase();
    return problems.filter(problem => (!query || `${problem.problemNumber} ${problem.title}`.toLocaleLowerCase().includes(query)) && ['category', 'difficulty', 'status', 'mastery'].every(key => !filters[key] || String(problem[key]) === filters[key]) && (!filters.independent || String(problem.independent) === filters.independent));
  }
  function validateProblem(value) {
    if (!/^\d+$/.test(value.problemNumber) || Number(value.problemNumber) <= 0) throw new Error('请输入有效的正整数题号。');
    if (!value.title.trim()) throw new Error('请填写题名。');
    if (value.date && !S.validDate(value.date)) throw new Error('首次完成日期无效。');
    if (value.lastReviewDate && !S.validDate(value.lastReviewDate)) throw new Error('最近复习日期无效。');
    if (value.url) {
      let url;
      try { url = new URL(value.url); } catch { throw new Error('题目链接需要完整的 http 或 https 网址。'); }
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('题目链接仅支持 http 或 https。');
    }
    return value;
  }
  function saveProblem(data, value, id = '') {
    validateProblem(value);
    if (data.leetcode.some(p => p.id !== id && Number(p.problemNumber) === Number(value.problemNumber))) throw new Error('此题号已存在，请搜索后编辑已有记录。');
    const previous = id ? data.leetcode.find(p => p.id === id) : null;
    if (id && !previous) throw new Error('此题目已被其他页面删除。');
    const record = { ...previous, ...value, id: previous?.id || S.uid(), problemNumber: String(Number(value.problemNumber)), category: value.category.trim() || '未分类', title: value.title.trim(), lastReviewDate: previous?.lastReviewDate || '', reviewCount: previous?.reviewCount || 0 };
    if (previous) Object.assign(previous, record); else data.leetcode.unshift(record);
    return record;
  }
  function reviewProblem(data, id, today = S.dateKey()) {
    const problem = data.leetcode.find(item => item.id === id);
    if (!problem) throw new Error('题目已不存在，请刷新后重试。');
    problem.reviewCount++; problem.lastReviewDate = today;
    // Reviewing is recorded explicitly; mastery/status remain the user's assessment.
  }
  function taskProblem(task, date) {
    const match = task.title.match(/(\d+)\s*[.、:：-]?\s*(.*)/);
    return { problemNumber: match?.[1] || '', title: match?.[2]?.replace(/(?:重新独立完成|重新完成|独立完成)$/, '').trim() || '', date, status: '已完成' };
  }
  function routeProgress(stages) {
    const items = stages.flatMap(stage => stage.groups.flatMap(group => group.items));
    const done = items.filter(item => item.status === '已完成').length;
    return { total: items.length, done, percent: items.length ? Math.round(done / items.length * 100) : 0 };
  }
  function routeOutline(route) {
    return route.stages.map(stage => `# ${stage.name}\n${stage.groups.map(group => `## ${group.name}\n${group.items.map(item => item.title).join('\n')}`).join('\n\n')}`).join('\n\n');
  }
  function parseRoute(name, outline, previous = null) {
    if (!name.trim()) throw new Error('请填写路线名称。');
    const route = { ...previous, id: previous?.id || S.uid(), name: name.trim(), stages: [] };
    let stage, group;
    for (const raw of outline.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (/^#\s+/.test(line)) {
        const title = line.replace(/^#\s+/, '').trim();
        if (route.stages.some(item => item.name === title)) throw new Error('同一路线的阶段名称不能重复。');
        const old = previous?.stages.find(item => item.name === title);
        stage = { ...old, id: old?.id || S.uid(), name: title, groups: [] };
        route.stages.push(stage); group = null;
      } else if (/^##\s+/.test(line)) {
        if (!stage) throw new Error('请先用 # 写出阶段名称，再填写分组。');
        const title = line.replace(/^##\s+/, '').trim();
        if (stage.groups.some(item => item.name === title)) throw new Error('同一阶段内的分组名称不能重复。');
        const old = previous?.stages.find(item => item.id === stage.id)?.groups.find(item => item.name === title);
        group = { ...old, id: old?.id || S.uid(), name: title, items: [] }; stage.groups.push(group);
      } else {
        if (!stage) throw new Error('请先用 # 写出阶段名称，每个知识点另起一行。');
        if (!group) {
          const old = previous?.stages.find(item => item.id === stage.id)?.groups.find(item => item.name === '知识点');
          group = { id: old?.id || S.uid(), name: '知识点', items: [] }; stage.groups.push(group);
        }
        const title = line.replace(/^[-*]\s+/, '').trim();
        if (!title) throw new Error('知识点不能为空。');
        if (group.items.some(item => item.title === title)) throw new Error('同一分组的知识点名称不能重复。');
        const old = previous?.stages.flatMap(item => item.groups).find(item => item.id === group.id)?.items.find(item => item.title === title);
        group.items.push({ ...old, id: old?.id || S.uid(), title, status: old?.status || '未开始' });
      }
    }
    return route;
  }
  function updateRoute(data, routeId, itemId, status) {
    if (!['未开始', '学习中', '已完成'].includes(status)) throw new Error('无效知识点状态。');
    const route = data.routes.find(item => item.id === routeId);
    const point = route?.stages.flatMap(stage => stage.groups.flatMap(group => group.items)).find(item => item.id === itemId);
    if (!point) throw new Error('知识点已不存在，请刷新后重试。');
    point.status = status;
  }
  const priorityRank = { 高: 0, 中: 1, 低: 2, '': 3 };
  function postponeTask(data, date, taskId, targetDate) {
    if (!S.validDate(date) || !S.validDate(targetDate) || targetDate <= date) throw new Error('请选择晚于原安排的有效日期。');
    const next = JSON.parse(JSON.stringify(data));
    const category = next.days[date]?.categories.find(group => group.tasks.some(task => task.id === taskId));
    const task = category?.tasks.find(item => item.id === taskId);
    if (!task) throw new Error('任务已变化，请重新打开。');
    if (task.done) throw new Error('已完成记录保留在原日期，不能推迟。');
    const day = next.days[targetDate] ||= { categories: [] };
    if (day.categories.some(group => group.tasks.some(item => item.id === taskId))) throw new Error('目标日期已有同一任务，未重复生成。');
    let target = day.categories.find(group => group.name.trim() === category.name.trim());
    if (!target) { target = { id: S.uid(), name: category.name, tasks: [], manualOrder: true }; day.categories.push(target); }
    category.tasks = category.tasks.filter(item => item.id !== taskId); target.tasks.push(task);
    S.validate(next); Object.assign(data, next); return task;
  }
  function sortedTasks(category) {
    // Existing manual order takes precedence; sorting otherwise stays stable within a priority.
    if (category.manualOrder === true) return [...category.tasks];
    return category.tasks.map((task, index) => ({ task, index })).sort((a, b) => (priorityRank[a.task.priority || ''] ?? 3) - (priorityRank[b.task.priority || ''] ?? 3) || a.index - b.index).map(item => item.task);
  }
  global.TodayWorkModels = { parsePlan, mergePlan, pendingCarryOver, handleCarryOver, postponeTask, problemStats, filterProblems, saveProblem, reviewProblem, taskProblem, routeProgress, updateRoute, sortedTasks, validateProblem, routeOutline, parseRoute };
})(globalThis);
