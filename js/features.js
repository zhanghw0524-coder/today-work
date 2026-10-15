(function () {
  'use strict';
  const A = window.TodayWorkApp;
  if (!A) return;
  const S = window.StudyStorage;
  const M = window.TodayWorkModels;
  const $ = id => document.getElementById(id);
  const esc = A.escape;
  let plan = null;
  let problemEditing = '';
  let routeEditing = '';
  let selectedRoute = '';
  let candidateBackup = null;
  let fileReadToken = 0;
  let confirmation = null;
  let carrySignature = '';
  const optionList = (values, selected) => values.map(value => `<option ${value === selected ? 'selected' : ''}>${esc(value)}</option>`).join('');

  function report(id, error) {
    $(id).textContent = error.message;
    console.error('Today Work 操作未完成：', error);
  }
  function confirmAction(title, description, callback, label = '确认') {
    confirmation = callback;
    $('action-title').textContent = title;
    $('action-description').textContent = description;
    $('action-confirm').textContent = label;
    $('action-dialog').showModal();
  }
  $('action-cancel').addEventListener('click', () => $('action-dialog').close());
  $('action-dialog').addEventListener('close', () => { confirmation = null; });
  $('action-confirm').addEventListener('click', () => {
    const callback = confirmation;
    if (!callback) return;
    $('action-dialog').close();
    confirmation = null;
    callback();
  });
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));

  function renderCarry() {
    const items = M.pendingCarryOver(A.getData(), A.getToday());
    $('carry-card').hidden = A.getSelected() !== A.getToday() || !items.length;
    const signature = JSON.stringify(items.map(item => [item.task.id, item.task.title, item.category]));
    $('carry-count').textContent = `${items.length} 项`;
    if (signature === carrySignature) return;
    carrySignature = signature;
    $('carry-items').innerHTML = items.map(item => `<div class="carry-row"><div><strong>${esc(item.task.title)}</strong><small>${esc(item.category)}</small></div><div class="button-row"><button class="text-button" data-carry="added" data-task="${esc(item.task.id)}">加入今日</button><button class="text-button" data-carry="ignored" data-task="${esc(item.task.id)}">忽略</button></div></div>`).join('');
  }
  function carry(ids, action) {
    let result;
    if (A.mutate(next => { result = M.handleCarryOver(next, A.getToday(), ids, action); })) A.toast(action === 'added' ? `已加入 ${result.added} 项，跳过已有任务 ${result.skipped} 项。` : `已忽略 ${result.handled} 项，昨日记录未修改。`);
  }
  $('carry-items').addEventListener('click', event => {
    const button = event.target.closest('[data-carry]');
    if (button) carry([button.dataset.task], button.dataset.carry);
  });
  $('carry-all-add').addEventListener('click', () => carry(M.pendingCarryOver(A.getData(), A.getToday()).map(item => item.task.id), 'added'));
  $('carry-all-ignore').addEventListener('click', () => carry(M.pendingCarryOver(A.getData(), A.getToday()).map(item => item.task.id), 'ignored'));

  function invalidatePlan() {
    plan = null; $('plan-confirm').disabled = true;
    $('plan-preview').hidden = true; $('plan-result').hidden = true; $('plan-error').textContent = '';
  }
  $('open-plan-import').addEventListener('click', () => {
    invalidatePlan(); $('plan-dialog').showModal(); $('plan-input').focus();
  });
  $('plan-input').addEventListener('input', invalidatePlan);
  $('plan-clear').addEventListener('click', () => { $('plan-input').value = ''; invalidatePlan(); $('plan-input').focus(); });
  $('plan-paste').addEventListener('click', async () => {
    try { $('plan-input').value = await navigator.clipboard.readText(); invalidatePlan(); }
    catch { $('plan-error').textContent = '当前浏览器不允许直接读取剪贴板，请在输入框中使用 Ctrl+V 或长按粘贴。'; }
  });
  $('plan-parse').addEventListener('click', () => {
    invalidatePlan();
    try {
      if ($('plan-input').value.length > 2000000) throw new Error('计划内容过大，请分批导入。');
      plan = M.parsePlan($('plan-input').value, A.getToday());
      const previewCounts = M.mergePlan(JSON.parse(JSON.stringify(A.getData())), plan);
      $('plan-preview').innerHTML = `<h3>日期：${esc(plan.date)}</h3>${plan.categories.length ? plan.categories.map(group => `<h4>${esc(group.name)}</h4>${group.tasks.length ? `<ul>${group.tasks.map(title => `<li>${esc(title)}</li>`).join('')}</ul>` : '<p class="subtle">空分类</p>'}`).join('') : '<p class="subtle">空计划，没有待导入任务。</p>'}<p class="subtle">预计新增 ${previewCounts.categories} 个分类、${previewCounts.tasks} 项任务；跳过 ${previewCounts.skipped} 项重复任务。</p>`;
      $('plan-preview').hidden = false; $('plan-confirm').disabled = false;
    } catch (error) { report('plan-error', error); }
  });
  $('plan-confirm').addEventListener('click', () => {
    if (!plan) return;
    const current = plan;
    let result;
    if (A.mutate(next => { result = M.mergePlan(next, current); })) {
      A.selectDate(current.date);
      $('plan-result').textContent = `导入成功 · 新增分类：${result.categories} · 新增任务：${result.tasks} · 跳过重复任务：${result.skipped}`;
      $('plan-result').hidden = false; $('plan-confirm').disabled = true; plan = null;
    }
  });

  function filters() {
    return Object.fromEntries(['category', 'difficulty', 'status', 'mastery', 'independent'].map(key => [key, $(`filter-${key}`).value]).concat([['search', $('problem-search').value]]));
  }
  function safeLink(value) {
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
  }
  function problemCard(problem) {
    const link = safeLink(problem.url);
    return `<article class="problem-card" data-problem="${esc(problem.id)}"><div class="problem-main"><div class="problem-title"><span class="problem-number">${esc(problem.problemNumber)}</span><h3>${esc(problem.title)}</h3>${link ? `<a class="text-button" href="${esc(link)}" target="_blank" rel="noopener noreferrer" aria-label="打开题目 ${esc(problem.title)}">↗</a>` : ''}</div><div class="problem-tags"><span>${esc(problem.category)}</span><span>${esc(problem.difficulty)}</span><span class="status-tag">${esc(problem.status)}</span><span class="stars" aria-label="${problem.mastery} 星">${'★'.repeat(problem.mastery)}${'☆'.repeat(3 - problem.mastery)}</span>${problem.independent ? '<span>独立完成</span>' : ''}</div><div class="problem-dates">${problem.date ? `首次完成 ${esc(problem.date)} · ` : ''}复习 ${problem.reviewCount} 次${problem.lastReviewDate ? ` · 最近 ${esc(problem.lastReviewDate)}` : ''}</div>${problem.note ? `<p class="problem-note">${esc(problem.note)}</p>` : ''}</div><div class="problem-actions"><button class="text-button" data-problem-action="review" data-id="${esc(problem.id)}">标记已复习</button><button class="text-button" data-problem-action="edit" data-id="${esc(problem.id)}">编辑</button><button class="text-button" data-problem-action="delete" data-id="${esc(problem.id)}">删除</button></div></article>`;
  }
  function renderProblemList() {
    const problems = A.getData().leetcode;
    const matches = M.filterProblems(problems, filters());
    $('problem-result-count').textContent = `显示 ${matches.length} / ${problems.length} 道题`;
    $('problem-list').innerHTML = matches.length ? matches.map(problemCard).join('') : `<div class="empty-tasks"><span class="empty-icon">⌘</span><h3>${problems.length ? '没有找到符合条件的题目' : '还没有刷题记录，添加你的第一道题吧。'}</h3><p>${problems.length ? '试试其他关键词或重置筛选。' : '每天的任务与长期刷题记录分别保存。'}</p></div>`;
  }
  function renderProblems() {
    const problems = A.getData().leetcode;
    const stats = M.problemStats(problems);
    $('problem-metrics').innerHTML = [['累计题目', stats.total], ['已完成', stats.done], ['需要复习', stats.review], ['独立完成', stats.independent], ['平均熟练度', problems.length ? `${stats.average.toFixed(1)} 星` : '—']].map(([name, value]) => `<article><span>${name}</span><strong>${value}</strong></article>`).join('');
    const category = $('filter-category').value;
    $('filter-category').innerHTML = '<option value="">全部题型</option>' + [...new Set(problems.map(item => item.category))].sort().map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
    if ([...$('filter-category').options].some(item => item.value === category)) $('filter-category').value = category;
    renderProblemList();
    const review = problems.filter(problem => problem.mastery === 1 || problem.status === '需要复习');
    $('problem-review').innerHTML = review.length ? review.map(problem => `<div class="review-row"><div><strong>${esc(problem.problemNumber)} ${esc(problem.title)}</strong><small>复习 ${problem.reviewCount} 次${problem.lastReviewDate ? ` · ${esc(problem.lastReviewDate)}` : ''}</small></div><button class="text-button" data-problem-action="review" data-id="${esc(problem.id)}">标记已复习</button></div>`).join('') : '<p class="empty-history">目前没有待复习题目。</p>';
    $('problem-categories').innerHTML = stats.categories.length ? stats.categories.map(group => `<div class="mastery-group"><div><strong>${esc(group.name)}</strong><span>${group.total} 题 · ${group.average.toFixed(1)} 星</span></div><div class="progress-track"><div style="width:${group.average / 3 * 100}%"></div></div></div>`).join('') : '<p class="empty-history">添加题目后查看题型掌握情况。</p>';
  }
  function openProblem(prefill = {}, id = '') {
    problemEditing = id;
    $('problem-form').reset();
    $('problem-dialog-title').textContent = id ? '编辑题目' : '新增题目';
    const values = { number: prefill.problemNumber || '', title: prefill.title || '', category: prefill.category || '', difficulty: prefill.difficulty || '中等', status: prefill.status || '未完成', mastery: prefill.mastery || 1, date: prefill.date || '', url: prefill.url || '', note: prefill.note || '' };
    for (const [name, value] of Object.entries(values)) $(`problem-${name}`).value = value;
    $('problem-independent').checked = prefill.independent === true;
    $('problem-error').textContent = '';
    $('problem-dialog').showModal(); $('problem-number').focus();
  }
  $('add-problem').addEventListener('click', () => openProblem());
  $('problem-form').addEventListener('submit', event => {
    event.preventDefault();
    const value = { problemNumber: $('problem-number').value.trim(), title: $('problem-title').value.trim(), category: $('problem-category').value.trim(), difficulty: $('problem-difficulty').value, status: $('problem-status').value, mastery: Number($('problem-mastery').value), independent: $('problem-independent').checked, date: $('problem-date').value, url: $('problem-url').value.trim(), note: $('problem-note').value.trim() };
    try { M.validateProblem(value); }
    catch (error) { report('problem-error', error); return; }
    if (A.getData().leetcode.some(item => item.id !== problemEditing && Number(item.problemNumber) === Number(value.problemNumber))) { $('problem-error').textContent = '此题号已存在，请搜索后编辑已有记录。'; return; }
    if (A.mutate(next => M.saveProblem(next, value, problemEditing), { tasks: false })) { $('problem-dialog').close(); A.toast('刷题记录已保存。'); }
  });
  $('problem-search').addEventListener('input', renderProblemList);
  for (const key of ['category', 'difficulty', 'status', 'mastery', 'independent']) $(`filter-${key}`).addEventListener('change', renderProblemList);
  $('reset-filters').addEventListener('click', () => { for (const key of ['category', 'difficulty', 'status', 'mastery', 'independent']) $(`filter-${key}`).value = ''; $('problem-search').value = ''; renderProblemList(); });
  $('leetcode-view').addEventListener('click', event => {
    const button = event.target.closest('[data-problem-action]');
    if (!button) return;
    const problem = A.getData().leetcode.find(item => item.id === button.dataset.id);
    if (!problem) { A.toast('题目已不存在，请刷新后再试。'); return; }
    if (button.dataset.problemAction === 'edit') openProblem(problem, problem.id);
    if (button.dataset.problemAction === 'review' && A.mutate(next => M.reviewProblem(next, problem.id, A.getToday()), { tasks: false })) A.toast('已记录本次复习；可在编辑中调整熟练度与状态。');
    if (button.dataset.problemAction === 'delete') confirmAction('删除这道题？', `将删除 ${problem.problemNumber} ${problem.title} 的刷题记录，每日任务保持原样。`, () => A.mutate(next => { next.leetcode = next.leetcode.filter(item => item.id !== problem.id); }, { tasks: false }), '确认删除');
  });

  function activeRoute() { return A.getData().routes.find(route => route.id === selectedRoute) || A.getData().routes[0]; }
  function progressMarkup(progress) { return `<span>${progress.done} / ${progress.total} 已完成 · <b>${progress.percent}%</b></span><div class="progress-track"><div style="width:${progress.percent}%"></div></div>`; }
  function renderRouteProgress() {
    const route = activeRoute();
    if (!route) return;
    const summary = $('route-total-progress');
    if (summary) summary.innerHTML = progressMarkup(M.routeProgress(route.stages));
    for (const stage of route.stages) {
      const box = document.querySelector(`[data-stage-progress="${CSS.escape(stage.id)}"]`);
      if (box) box.textContent = `${M.routeProgress([stage]).percent}%`;
    }
  }
  function renderRoutes() {
    const routes = A.getData().routes;
    const route = activeRoute();
    selectedRoute = route?.id || '';
    $('route-select').innerHTML = routes.map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
    $('route-select').value = selectedRoute; $('route-select').disabled = !routes.length;
    if (!route) { $('route-content').innerHTML = '<div class="record-panel empty-tasks"><span class="empty-icon">◇</span><h3>还没有学习路线。</h3><p>从一个目标开始，添加属于自己的阶段与知识点。</p></div>'; return; }
    $('route-content').innerHTML = `<section class="record-panel route-overview"><div class="section-heading"><div><h2>${esc(route.name)}</h2><p>仅将“已完成”的知识点计入完成率，空分组不计入总量。</p></div><div class="button-row"><button class="text-button" data-route-action="edit">编辑路线</button><button class="text-button" data-route-action="delete">删除路线</button></div></div><div id="route-total-progress" class="route-total">${progressMarkup(M.routeProgress(route.stages))}</div></section>${route.stages.length ? route.stages.map((stage, index) => `<details class="route-stage" ${index === 0 ? 'open' : ''}><summary><span class="stage-number">${String(index + 1).padStart(2, '0')}</span><strong>${esc(stage.name)}</strong><span class="stage-percent" data-stage-progress="${esc(stage.id)}">${M.routeProgress([stage]).percent}%</span></summary>${stage.note ? `<p class="subtle stage-note">${esc(stage.note)}</p>` : ''}${stage.groups.map(group => `<div class="route-group"><h3>${esc(group.name)}</h3>${group.items.length ? group.items.map(item => `<label class="route-item"><span>${esc(item.title)}</span><select data-route-item="${esc(item.id)}" aria-label="${esc(item.title)}的状态">${optionList(['未开始', '学习中', '已完成'], item.status)}</select></label>`).join('') : '<p class="empty-history">尚未规划，可编辑路线添加内容。</p>'}</div>`).join('')}</details>`).join('') : '<p class="record-panel empty-history">路线已创建，可以编辑并添加阶段与知识点。</p>'}`;
  }
  function openRouteEditor(route = null) {
    routeEditing = route?.id || '';
    $('route-dialog-title').textContent = route ? '编辑路线' : '新增路线';
    $('route-name').value = route?.name || '';
    $('route-outline').value = route ? M.routeOutline(route) : '';
    $('route-error').textContent = '';
    $('route-dialog').showModal(); $('route-name').focus();
  }
  $('add-route').addEventListener('click', () => openRouteEditor());
  $('route-select').addEventListener('change', () => { selectedRoute = $('route-select').value; renderRoutes(); });
  $('route-content').addEventListener('change', event => {
    const select = event.target.closest('[data-route-item]');
    const route = activeRoute();
    if (!select || !route) return;
    const saved = A.mutate(next => M.updateRoute(next, route.id, select.dataset.routeItem, select.value), { tasks: false, routes: false });
    if (!saved) renderRoutes();
  });
  $('route-content').addEventListener('click', event => {
    const button = event.target.closest('[data-route-action]');
    const route = activeRoute();
    if (!button || !route) return;
    if (button.dataset.routeAction === 'edit') openRouteEditor(route);
    if (button.dataset.routeAction === 'delete') confirmAction('删除整个路线？', `“${route.name}”的所有阶段与进度将被删除，无法撤销。建议先导出备份。`, () => A.mutate(next => { next.routes = next.routes.filter(item => item.id !== route.id); }, { tasks: false }), '确认删除路线');
  });
  $('route-form').addEventListener('submit', event => {
    event.preventDefault();
    const previous = A.getData().routes.find(route => route.id === routeEditing);
    let nextRoute;
    try { nextRoute = M.parseRoute($('route-name').value, $('route-outline').value, previous); }
    catch (error) { report('route-error', error); return; }
    const save = () => {
      const saved = A.mutate(next => {
        const current = next.routes.findIndex(route => route.id === routeEditing);
        if (routeEditing && current === -1) throw new Error('路线已被其他页面删除。');
        if (current === -1) next.routes.push(nextRoute); else next.routes[current] = nextRoute;
      }, { tasks: false });
      if (saved) { selectedRoute = nextRoute.id; renderRoutes(); $('route-dialog').close(); }
    };
    const keep = new Set(nextRoute.stages.flatMap(stage => stage.groups.flatMap(group => group.items.map(item => item.id))));
    const removed = previous?.stages.flatMap(stage => stage.groups.flatMap(group => group.items)).filter(item => !keep.has(item.id)).length || 0;
    if (removed) confirmAction('确认修改路线？', `此次修改将移除 ${removed} 个知识点及其进度，其余同名知识点的状态保留。`, save, '确认修改'); else save();
  });

  async function exportBackup() {
    try {
      const value = S.load();
      if (!value) throw new Error('没有可导出的本地记录，请使用“导出原始数据”检查。');
      const backup = await window.TodayWorkAssets.backup(value);
      A.download(JSON.stringify(backup, null, 2), `today-work-backup-${A.getToday()}.json`);
      A.toast('完整数据备份已导出，包含计划、图片与设置。');
    } catch (error) { A.toast(`无法导出完整备份：${error.message}`); }
  }
  $('settings-export').addEventListener('click', () => { try { exportBackup(); } catch (error) { A.toast(error.message); } });
  document.querySelectorAll('[data-theme-choice]').forEach(button => button.addEventListener('click', () => A.setTheme(button.dataset.themeChoice)));
  $('raw-export').addEventListener('click', () => {
    try { A.download(JSON.stringify(S.recoverySnapshots(), null, 2), `today-work-raw-snapshots-${A.getToday()}.json`); }
    catch (error) { A.toast(`无法访问原始数据：${error.message}`); }
  });
  async function exportPrevious(snapshot) {
    const parsed = S.parseBackup(snapshot.rawData, { allowExternalImages: true });
    if (snapshot.legacyTheme && !JSON.parse(snapshot.rawData).settings) parsed.data.settings.theme = snapshot.legacyTheme;
    A.download(JSON.stringify(await window.TodayWorkAssets.backup(parsed.data, snapshot.exportedAt), null, 2), 'today-work-auto-backup-before-import.json');
  }
  $('previous-backup').addEventListener('click', async () => {
    try {
      const snapshot = localStorage.getItem(S.RESTORE_KEY);
      if (!snapshot) { A.toast('还没有进行过备份恢复。'); return; }
      await exportPrevious(JSON.parse(snapshot));
    } catch (error) { A.toast(`恢复前的原始记录需要通过“原始数据 / 迁移快照”导出：${error.message}`); }
  });
  $('open-backup').addEventListener('click', () => {
    candidateBackup = null; fileReadToken++;
    $('backup-file').value = ''; $('backup-json').value = ''; $('backup-error').textContent = ''; $('backup-preview').hidden = true; $('backup-continue').disabled = true;
    $('backup-dialog').showModal();
  });
  function showBackupPreview(content) {
    candidateBackup = S.parseBackup(content);
    const value = candidateBackup.data;
    const tasks = Object.values(value.days).reduce((sum, day) => sum + window.StudyStats.summarize(day).total, 0);
    $('backup-preview').innerHTML = `<h3>备份概要</h3><p>导出时间：${esc(candidateBackup.exportedAt)}</p><p>${Object.keys(value.days).length} 个日期 · ${tasks} 项任务 · ${value.leetcode.length} 道题 · ${value.routes.length} 条路线 · ${value.plans.length} 个计划 · ${Object.keys(candidateBackup.imageAssets).length} 张图片</p><p class="subtle">数据版本 ${value.version} · 开始日期 ${esc(value.startDate)}</p>`;
    $('backup-preview').hidden = false; $('backup-continue').disabled = false;
  }
  function invalidateBackup() {
    fileReadToken++; candidateBackup = null;
    $('backup-continue').disabled = true; $('backup-preview').hidden = true; $('backup-error').textContent = '';
  }
  $('backup-json').addEventListener('input', invalidateBackup);
  $('backup-parse-text').addEventListener('click', () => {
    invalidateBackup();
    try {
      if ($('backup-json').value.length > 20000000) throw new Error('备份过大，请检查文件内容。');
      showBackupPreview($('backup-json').value);
    } catch (error) { report('backup-error', error); }
  });
  $('backup-file').addEventListener('change', async () => {
    const token = ++fileReadToken;
    candidateBackup = null; $('backup-continue').disabled = true; $('backup-preview').hidden = true; $('backup-error').textContent = '';
    const file = $('backup-file').files[0];
    if (!file) return;
    try {
      if (file.size > 20000000) throw new Error('备份超过 20MB，请检查是否为 Today Work 数据文件。');
      const content = await file.text();
      if (token !== fileReadToken) return;
      showBackupPreview(content);
    } catch (error) { if (token === fileReadToken) report('backup-error', error); }
  });
  let restoring = false;
  $('backup-continue').addEventListener('click', () => {
    if (restoring) return;
    if (!candidateBackup) return;
    const incoming = candidateBackup;
    confirmAction('覆盖当前 Today Work 数据？', '导入备份将覆盖当前 Today Work 数据，包括任务、题目、路线、计划、图片和设置。系统会先保留恢复前快照；不会清除其他网站或应用的数据。', async () => {
      if (restoring) return;
      restoring = true; $('backup-continue').disabled = true;
      try {
        const { data: restored, previous } = await window.TodayWorkAssets.restore(incoming);
        A.replaceData(restored);
        $('backup-dialog').close(); candidateBackup = null;
        try { await exportPrevious(previous); } catch { /* Raw snapshot remains available even when previous data was unreadable. */ }
        A.toast('已恢复备份，恢复前的数据快照已保留。');
      } catch (error) { report('backup-error', error); A.toast('恢复没有完成，当前数据未被清空。'); }
      finally { restoring = false; $('backup-continue').disabled = !candidateBackup; }
    }, '确认覆盖恢复');
  });

  A.registerFeatures({
    render(view, options) {
      if (view === 'today') renderCarry();
      if (view === 'leetcode') renderProblems();
      if (view === 'routes') { if (options.routes === false) renderRouteProgress(); else renderRoutes(); }
    },
    openProblem, exportBackup
  });
})();
