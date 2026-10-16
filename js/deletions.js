(function (global) {
  'use strict';
  const S = global.StudyStorage;
  const LIMIT = 50;
  const clone = value => JSON.parse(JSON.stringify(value));
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const nonempty = value => typeof value === 'string' && value.trim().length > 0;
  const metadata = category => { const { tasks, ...rest } = category; return clone(rest); };
  const groups = (data, date) => data.days[date]?.categories || [];
  const tasks = data => Object.entries(data.days).flatMap(([date, day]) => day.categories.flatMap((category, categoryIndex) => category.tasks.map((task, index) => ({ date, category, categoryIndex, task, index }))));
  function categoryAt(data, date, id) {
    const category = groups(data, date).find(item => item.id === id);
    if (!category) throw new Error('分类已被其他操作修改或删除，请重新打开后再试。');
    return category;
  }
  function taskAt(data, date, id) {
    for (const category of groups(data, date)) {
      const task = category.tasks.find(item => item.id === id);
      if (task) return { category, task };
    }
    return null;
  }
  function describe(data, request, today = S.dateKey()) {
    let label, linked = [], plan = null, category = null;
    if (request.type === 'task') {
      category = categoryAt(data, request.date, request.categoryId);
      const index = category.tasks.findIndex(task => task.id === request.taskId);
      if (index < 0) throw new Error('任务已被其他操作删除，请刷新查看。');
      linked = [{ date: request.date, category, categoryIndex: groups(data, request.date).indexOf(category), task: category.tasks[index], index }];
      label = category.tasks[index].title;
    } else if (request.type === 'category') {
      category = categoryAt(data, request.date, request.categoryId); label = category.name;
      linked = category.tasks.map((task, index) => ({ date: request.date, category, categoryIndex: groups(data, request.date).indexOf(category), task, index }));
    } else if (request.type === 'plan') {
      plan = (data.plans || []).find(item => item.id === request.planId);
      if (!plan) throw new Error('计划已被其他操作删除，请刷新查看。');
      label = plan.plan.planName; linked = tasks(data).filter(item => item.task.sourcePlanId === plan.id);
    } else throw new Error('不支持的删除类型。');
    const pending = linked.filter(item => item.date >= today && !item.task.done);
    const done = linked.filter(item => item.task.done).length;
    const logical = new Set(linked.map(item => item.task.sourceTaskId || `${item.date}:${item.task.id}`)).size;
    // Includes only affected records. A dialog cannot silently delete newly changed tasks.
    const signature = JSON.stringify({ request, plan, category, linked: linked.map(item => [item.date, item.category.id, item.task]), today });
    return { label, linked, plan, category, pending, done, logical, signature };
  }
  function source(task) {
    return Object.fromEntries(['sourcePlanId', 'sourceDay', 'sourceTaskId'].filter(key => Object.hasOwn(task, key)).map(key => [key, task[key]]));
  }
  function execute(data, request, options = {}) {
    const today = options.today || S.dateKey();
    const info = describe(data, request, today);
    if (options.expected && options.expected !== info.signature) throw new Error('关联任务已变化，请取消并重新打开删除确认，检查最新数量。');
    if ((data.deletions || []).length >= LIMIT) throw new Error('已保留 50 条可撤销删除。请先在设置的“最近删除”中撤销或确认清理记录。');
    const next = clone(data);
    const entry = { id: S.uid(), type: request.type, label: info.label, deletedAt: new Date().toISOString(), removedTasks: [], removedCategories: [], removedPlans: [], movedTasks: [], detachedTasks: [], createdCategories: [] };
    function removeTask(item) {
      const category = categoryAt(next, item.date, item.category.id);
      entry.removedTasks.push({ date: item.date, categoryId: category.id, index: item.index, task: clone(item.task) });
      category.tasks = category.tasks.filter(task => task.id !== item.task.id);
    }
    if (request.type === 'task') removeTask(info.linked[0]);
    if (request.type === 'category') {
      if (!['keep', 'delete'].includes(options.mode)) throw new Error('请选择分类内任务的处理方式。');
      const day = next.days[request.date];
      const original = categoryAt(next, request.date, request.categoryId);
      entry.removedCategories.push({ date: request.date, index: day.categories.indexOf(original), category: metadata(original) });
      if (options.mode === 'delete') info.linked.forEach(removeTask);
      else if (original.tasks.length) {
        let target = day.categories.find(item => item.id !== original.id && item.name.trim() === '未分类');
        if (!target) {
          target = { id: S.uid(), name: '未分类', tasks: [], manualOrder: true };
          day.categories.push(target); entry.createdCategories.push({ date: request.date, id: target.id, name: target.name });
        }
        original.tasks.forEach((task, index) => {
          entry.movedTasks.push({ date: request.date, fromId: original.id, toId: target.id, taskId: task.id, index });
          target.tasks.push(task);
        });
      }
      day.categories = day.categories.filter(item => item.id !== original.id);
    }
    if (request.type === 'plan') {
      if (!['keep', 'pending', 'all'].includes(options.mode)) throw new Error('请选择关联任务的处理方式。');
      entry.removedPlans.push({ index: next.plans.findIndex(item => item.id === request.planId), plan: clone(info.plan) });
      next.plans = next.plans.filter(item => item.id !== request.planId);
      for (const item of info.linked) {
        const shouldDelete = options.mode === 'all' || (options.mode === 'pending' && item.date >= today && !item.task.done);
        if (shouldDelete) removeTask(item);
        else {
          entry.detachedTasks.push({ date: item.date, taskId: item.task.id, source: source(item.task) });
          const current = taskAt(next, item.date, item.task.id).task;
          for (const key of ['sourcePlanId', 'sourceDay', 'sourceTaskId']) delete current[key];
        }
      }
    }
    entry.removedCount = entry.removedTasks.length;
    entry.movedCount = entry.movedTasks.length;
    entry.detachedCount = entry.detachedTasks.length;
    (next.deletions ||= []).push(entry);
    S.validate(next); Object.assign(data, next);
    return entry;
  }
  function undo(data, id) {
    const next = clone(data), entry = next.deletions?.find(item => item.id === id);
    if (!entry) throw new Error('这条删除已撤销或已清理，请查看最新记录。');
    // Work on a private clone; any conflict aborts the whole undo without replacing newer edits.
    for (const item of entry.removedPlans) {
      if (next.plans.some(plan => plan.id === item.plan.id)) throw new Error('计划 ID 已存在，未覆盖现有计划。');
      next.plans.splice(Math.min(item.index, next.plans.length), 0, item.plan);
    }
    for (const item of entry.removedCategories) {
      const day = next.days[item.date];
      if (!day) throw new Error('原日期记录已被移除，无法安全撤销。');
      if (day.categories.some(category => category.id === item.category.id)) throw new Error('原分类 ID 已被使用，未覆盖现有分类。');
      day.categories.splice(Math.min(item.index, day.categories.length), 0, { ...item.category, tasks: [] });
    }
    for (const item of [...entry.removedTasks].sort((a, b) => a.index - b.index)) {
      const category = categoryAt(next, item.date, item.categoryId);
      if (taskAt(next, item.date, item.task.id)) throw new Error('任务 ID 已存在，未重复恢复或覆盖任务。');
      if (item.task.sourcePlanId && !next.plans.some(plan => plan.id === item.task.sourcePlanId) && next.deletions.some(other => other.id !== id && other.removedPlans.some(record => record.plan.id === item.task.sourcePlanId))) throw new Error('请先撤销较新的计划删除，再恢复这项任务。');
      category.tasks.splice(Math.min(item.index, category.tasks.length), 0, item.task);
    }
    for (const item of [...entry.movedTasks].sort((a, b) => a.index - b.index)) {
      const target = categoryAt(next, item.date, item.toId), original = categoryAt(next, item.date, item.fromId);
      const index = target.tasks.findIndex(task => task.id === item.taskId);
      if (index < 0) throw new Error('被移动的任务又发生了删除或移动，请先撤销较新的操作。');
      const [task] = target.tasks.splice(index, 1);
      original.tasks.splice(Math.min(item.index, original.tasks.length), 0, task);
    }
    for (const item of entry.detachedTasks) {
      const current = taskAt(next, item.date, item.taskId)?.task;
      if (!current || ['sourcePlanId', 'sourceDay', 'sourceTaskId'].some(key => Object.hasOwn(current, key))) throw new Error('保留任务的关联已发生变化，请先撤销较新的操作，未覆盖当前数据。');
      Object.assign(current, item.source);
    }
    for (const item of entry.createdCategories) {
      const day = next.days[item.date];
      if (day) day.categories = day.categories.filter(category => !(category.id === item.id && category.name === item.name && !category.tasks.length));
    }
    next.deletions = next.deletions.filter(item => item.id !== id);
    S.validate(next); Object.assign(data, next); return entry;
  }
  function validateEntry(entry) {
    if (!object(entry) || !nonempty(entry.id) || !['task', 'category', 'plan'].includes(entry.type) || !nonempty(entry.label) || typeof entry.deletedAt !== 'string' || !Number.isFinite(Date.parse(entry.deletedAt))) throw new Error('删除记录无效。');
    for (const key of ['removedTasks', 'removedCategories', 'removedPlans', 'movedTasks', 'detachedTasks', 'createdCategories']) if (!Array.isArray(entry[key]) || entry[key].length > 20000) throw new Error('删除快照结构无效。');
    const dateId = item => { if (!object(item) || !S.validDate(item.date)) throw new Error('删除快照日期无效。'); };
    const index = value => { if (!Number.isInteger(value) || value < 0) throw new Error('删除快照顺序无效。'); };
    for (const item of entry.removedTasks) {
      dateId(item); index(item.index);
      if (!nonempty(item.categoryId) || !object(item.task) || !nonempty(item.task.id) || !nonempty(item.task.title) || typeof item.task.done !== 'boolean') throw new Error('任务快照无效。');
      const normalized = S.normalize({ version: 2, startDate: item.date, days: { [item.date]: { categories: [{ id: item.categoryId, name: '快照', tasks: [item.task] }] } } });
      if (normalized.issues.length) throw new Error('任务快照字段无效。');
    }
    for (const item of entry.removedCategories) { dateId(item); index(item.index); if (!object(item.category) || !nonempty(item.category.id) || !nonempty(item.category.name) || Object.hasOwn(item.category, 'tasks')) throw new Error('分类快照无效。'); }
    for (const item of entry.removedPlans) { index(item.index); global.TodayWorkPlans.validateRecord(item.plan); }
    for (const item of entry.movedTasks) { dateId(item); index(item.index); if (![item.fromId, item.toId, item.taskId].every(nonempty)) throw new Error('任务移动快照无效。'); }
    for (const item of entry.detachedTasks) {
      dateId(item);
      if (!nonempty(item.taskId) || !object(item.source) || !nonempty(item.source.sourcePlanId) || Object.keys(item.source).some(key => !['sourcePlanId', 'sourceDay', 'sourceTaskId'].includes(key))) throw new Error('任务来源快照无效。');
    }
    for (const item of entry.createdCategories) { dateId(item); if (!nonempty(item.id) || !nonempty(item.name)) throw new Error('未分类快照无效。'); }
    return entry;
  }
  global.TodayWorkDeletions = { LIMIT, describe, execute, undo, validateEntry };
})(globalThis);
