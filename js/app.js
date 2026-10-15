(function () {
  'use strict';
  const S = window.StudyStorage;
  const Stats = window.StudyStats;
  const Models = window.TodayWorkModels;
  const $ = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  let today = S.dateKey();
  let selected = today;
  let calendarMonth = today.slice(0, 7);
  let view = 'today';
  let data;
  let editing = null;
  let deleting = null;
  let toastTimer;
  let featureUI = null;
  let downloadUrl = null;
  const formatDate = (key, options = {}) => S.parseDate(key).toLocaleDateString('zh-CN', options);

  function toast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
  }

  function download(content, filename) {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
    downloadUrl = url;
    const link = document.createElement('a');
    link.href = url; link.download = filename;
    const fallback = $('download-ready');
    if (fallback) {
      const retry = document.createElement('a');
      retry.href = url; retry.download = filename; retry.className = 'text-button';
      retry.textContent = `下载文件：${filename}`;
      const details = document.createElement('details');
      const summary = document.createElement('summary'); summary.textContent = '查看备份内容（也可全选复制保存为 JSON）';
      const output = document.createElement('textarea'); output.readOnly = true; output.value = content;
      output.rows = 6; output.setAttribute('aria-label', '已生成的备份 JSON');
      details.append(summary, output);
      fallback.replaceChildren(retry, details); fallback.hidden = false;
    }
    document.body.append(link); link.click(); link.remove();
  }
  window.addEventListener('pagehide', () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); });

  const themeQuery = matchMedia('(prefers-color-scheme: dark)');
  function applyTheme(preference) {
    const theme = preference === 'system' ? themeQuery.matches ? 'dark' : 'light' : preference;
    document.documentElement.dataset.theme = theme;
    $('theme-toggle').querySelector('span').textContent = theme === 'dark' ? '浅色模式' : '深色模式';
    $('theme-toggle').setAttribute('aria-label', theme === 'dark' ? '切换浅色模式' : '切换深色模式');
    $('theme-toggle').setAttribute('aria-pressed', String(theme === 'dark'));
    document.querySelectorAll('[data-theme-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.themeChoice === preference)));
  }
  let theme;
  try { theme = localStorage.getItem('forward-study.theme'); } catch { /* Study storage reports access failures below. */ }
  applyTheme(['dark', 'light'].includes(theme) ? theme : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  $('theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  });

  try { data = S.initialize(today); }
  catch (error) {
    // Never replace unreadable records with an empty data set.
    document.querySelector('.main').innerHTML = `<section class="fatal-error"><h1>暂时无法读取本地记录</h1><p>${escape(error.message)}</p><p>请确认浏览器允许本地存储。若已有记录，可先导出原始数据备份，再检查数据；应用不会自动清空记录。</p><button id="recover-export" class="primary-button">导出原始数据</button></section>`;
    $('recover-export').addEventListener('click', () => {
      try { download(localStorage.getItem(S.KEY) || '{}', 'forward-study-recovery.json'); }
      catch { toast('浏览器阻止了本地存储访问，请在普通浏览窗口重试。'); }
    });
    return;
  }
  applyTheme(data.settings.theme);
  themeQuery.addEventListener('change', () => { if (data.settings.theme === 'system') applyTheme('system'); });
  function setTheme(preference) {
    if (mutate(next => { next.settings.theme = preference; }, { tasks: false })) applyTheme(preference);
  }

  function mutate(change, options = {}) {
    try {
      // Reload first so another tab's saved changes are preserved.
      const next = S.load();
      if (!next) throw new Error('本地数据已被清除，请刷新页面后再试。');
      change(next);
      S.save(next);
      data = next;
      $('save-status').textContent = '✓ 已保存到本地';
      $('save-status').classList.remove('error');
      render(options);
      return true;
    } catch (error) {
      $('save-status').textContent = '保存失败，请重试';
      $('save-status').classList.add('error');
      console.error('Today Work 保存失败：', error);
      toast(`没有保存成功：${error.message}`);
      render(options);
      return false;
    }
  }

  function findCategory(next, date, categoryId) {
    const category = next.days[date]?.categories.find(item => item.id === categoryId);
    if (!category) throw new Error('这项分类已在其他页面修改，请刷新后再试。');
    return category;
  }

  function selectDate(date) {
    if (!S.validDate(date)) { toast('请选择 1900 至 9999 年之间的有效日期。'); return; }
    selected = date;
    calendarMonth = date.slice(0, 7);
    switchView('today');
  }

  function switchView(nextView) {
    view = nextView;
    render();
  }

  function render(options = {}) {
    const active = document.activeElement;
    const focusTask = active?.matches('.task-label input') ? active.dataset.task : null;
    const summary = Stats.calculate(data, today);
    const titles = { today: '每天前进一点点', history: '把努力，留在日历里', stats: '让成长，看得见', leetcode: 'LeetCode', routes: '学习路线', settings: '设置' };
    const subtitles = { today: '安排今天的任务，为长期目标积累每一小步。', history: '回头看看，原来你已经走了这么远。', stats: '今天的一点进步，会成为未来的底气。', leetcode: '从做过一道题，到真正掌握一种方法。', routes: '大目标有方向，每一步有记录。', settings: '管理外观与本地数据。' };
    const labels = { today: '每日任务', history: '学习记录', stats: '打卡统计', leetcode: 'LeetCode', routes: '学习路线', settings: '设置' };
    const eyebrows = { today: 'YOUR DAILY PROGRESS', history: 'EVERY STEP COUNTS', stats: 'SMALL STEPS, REAL GROWTH', leetcode: 'PRACTICE & UNDERSTAND', routes: 'YOUR LONG-TERM JOURNEY', settings: 'MAKE IT YOURS' };
    if ($('page-title').dataset.view !== view) { $('page-title').innerHTML = `${titles[view]}<span class="heading-dot">.</span>`; $('page-title').dataset.view = view; }
    $('page-subtitle').textContent = subtitles[view];
    $('page-eyebrow').textContent = eyebrows[view];
    $('breadcrumb').textContent = labels[view];
    $('journey-day').textContent = `第 ${Math.max(1, S.dayDistance(data.startDate, today) + 1)} 天`;
    for (const item of document.querySelectorAll('[data-view]')) item.classList.toggle('active', item.dataset.view === view);
    for (const section of document.querySelectorAll('.view')) section.hidden = section.id !== `${view}-view`;
    document.querySelector('.metrics').hidden = ['leetcode', 'routes', 'settings'].includes(view);
    const diagnostic = S.diagnostics();
    $('storage-warning').hidden = !diagnostic.warning;
    $('storage-warning').textContent = diagnostic.warning;
    if (!diagnostic.writable) { $('save-status').textContent = '只读保护 · 请先备份'; $('save-status').classList.add('error'); }
    $('stat-today').innerHTML = `${summary.today.percent}<span>%</span>`;
    $('stat-today-detail').textContent = `${summary.today.done} / ${summary.today.total} 项任务`;
    $('stat-total').innerHTML = `${summary.totalDone}<span>项</span>`;
    $('stat-days').innerHTML = `${summary.learnedDays}<span>天</span>`;
    $('stat-streak').innerHTML = `${summary.streak}<span>天</span>`;
    $('stat-best').textContent = `历史最佳 ${summary.best} 天`;
    if (view === 'today') {
      if (options.tasks !== false) renderTasks(); else renderTaskProgress();
      renderCalendar(); renderHistory(true);
      const quotes = window.TodayWorkDefaults.quotes;
      document.querySelector('.focus-card h2').textContent = quotes[Math.abs(S.dayDistance('2020-01-01', today)) % quotes.length];
    }
    if (view === 'history') renderHistory();
    if (view === 'stats') renderStats(summary);
    featureUI?.render(view, options);
    document.dispatchEvent(new CustomEvent('todaywork:render', { detail: { view } }));
    if (focusTask) document.querySelector(`input[data-task="${CSS.escape(focusTask)}"]`)?.focus({ preventScroll: true });
  }

  function renderStats(summary) {
    const values = [['本周完成率', `${summary.week.percent}%`], ['本月完成率', `${summary.month.percent}%`], ['本周完成任务', `${summary.week.done} 项`], ['本月完成任务', `${summary.month.done} 项`], ['累计完成任务', `${summary.totalDone} 项`], ['累计学习天数', `${summary.learnedDays} 天`], ['连续学习天数', `${summary.streak} 天`], ['历史最高连续打卡', `${summary.best} 天`], ['全部任务完成的天数', `${summary.fullDays} 天`]];
    for (const [period, label] of [['week', '本周'], ['month', '本月'], ['all', '累计']]) if (summary[period].hasTime) values.push([`${label}学习时长`, Stats.formatMinutes(summary[period].minutes)]);
    $('stats-detail').innerHTML = values.map(([label, value]) => `<article class="stat-summary"><span>${label}</span><strong>${value}</strong></article>`).join('');
  }

  function renderTaskProgress() {
    const day = data.days[selected];
    const progress = Stats.summarize(day);
    $('daily-ratio').innerHTML = `${progress.done} / ${progress.total} 已完成 <b>${progress.percent}%</b>`;
    $('progress-fill').style.width = `${progress.percent}%`;
    $('progress-track').setAttribute('aria-valuenow', String(progress.percent));
    $('task-footer-note').textContent = progress.total > 0 && progress.done === progress.total ? '今天的努力，已全部收下。' : '按自己的节奏，一项一项完成。';
    for (const category of day?.categories || []) {
      const section = document.querySelector(`[data-group="${CSS.escape(category.id)}"]`);
      if (!section) continue;
      section.querySelector('.group-count').textContent = `${category.tasks.filter(task => task.done).length} / ${category.tasks.length}`;
      for (const task of category.tasks) {
        const checkbox = section.querySelector(`input[data-task="${CSS.escape(task.id)}"]`);
        if (!checkbox) continue;
        checkbox.checked = task.done;
        checkbox.closest('.task-row').classList.toggle('completed', task.done);
        const recordButton = checkbox.closest('.task-row').querySelector('[data-action="record-problem"]');
        if (recordButton) recordButton.hidden = !task.done;
      }
    }
  }

  function renderTasks() {
    const day = data.days[selected];
    const progress = Stats.summarize(day);
    $('task-heading').innerHTML = `${selected === today ? '今日任务' : selected > today ? '计划任务' : '当日任务'} <span>${progress.total}</span>`;
    $('date-picker').value = selected;
    $('date-picker').min = '1900-01-01';
    $('date-picker').max = '9999-12-31';
    $('prev-day').disabled = selected === '1900-01-01';
    $('next-day').disabled = selected === '9999-12-31';
    $('selected-date-label').textContent = formatDate(selected, { month: 'long', day: 'numeric', weekday: 'long' }) + (selected === today ? ' · 今天' : selected > today ? ' · 未来计划' : '');
    $('daily-ratio').innerHTML = `${progress.done} / ${progress.total} 已完成 <b>${progress.percent}%</b>`;
    $('progress-fill').style.width = `${progress.percent}%`;
    $('progress-track').setAttribute('aria-valuenow', String(progress.percent));
    $('task-footer-note').textContent = progress.total > 0 && progress.done === progress.total ? '今天的努力，已全部收下。' : '按自己的节奏，一项一项完成。';
    if (!day?.categories.length) {
      $('task-groups').innerHTML = `<div class="empty-tasks"><span class="empty-icon">☷</span><h3>这一天，还没有学习计划</h3><p>用示例任务开始，或新增分类安排自己的计划。</p><button class="primary-button" data-action="create-day">使用每日示例任务</button></div>`;
      return;
    }
    $('task-groups').innerHTML = day.categories.map((category, index) => {
      const done = category.tasks.filter(task => task.done).length;
      const icons = ['◇', '⌘', '✎', '▦'];
      return `<section class="task-group" data-group="${escape(category.id)}"><div class="group-heading"><span class="category-icon" aria-hidden="true">${icons[index % icons.length]}</span><h3 class="group-name">${escape(category.name)}</h3><span class="group-count">${done} / ${category.tasks.length}</span><button class="icon-button" data-action="rename-category" data-category="${escape(category.id)}" title="修改分类名称" aria-label="修改分类 ${escape(category.name)} 的名称">✎</button></div><div class="task-list">${Models.sortedTasks(category).map(task => `<div class="task-row ${task.done ? 'completed' : ''}"><label class="task-label"><input type="checkbox" data-category="${escape(category.id)}" data-task="${escape(task.id)}" ${task.done ? 'checked' : ''}><span>${task.priority ? `<i class="priority-dot priority-${{高:'high',中:'medium',低:'low'}[task.priority]}" title="${escape(task.priority)}优先级" aria-label="${escape(task.priority)}优先级"></i>` : ''}${escape(task.title)}</span></label><div class="task-actions">${/leetcode|刷题|算法/i.test(category.name) ? `<button class="text-button record-problem" data-action="record-problem" data-category="${escape(category.id)}" data-task="${escape(task.id)}" ${task.done ? '' : 'hidden'}>加入刷题记录</button>` : ''}<button class="icon-button" data-action="edit-task" data-category="${escape(category.id)}" data-task="${escape(task.id)}" title="编辑任务" aria-label="编辑 ${escape(task.title)}">✎</button><button class="icon-button delete" data-action="delete-task" data-category="${escape(category.id)}" data-task="${escape(task.id)}" title="删除任务" aria-label="删除 ${escape(task.title)}">×</button></div></div>`).join('')}</div><button class="add-task" data-action="add-task" data-category="${escape(category.id)}"><span>＋</span> 添加任务</button></section>`;
    }).join('');
  }

  function renderCalendar() {
    const first = `${calendarMonth}-01`;
    const start = S.parseDate(first);
    $('calendar-month').textContent = `${start.getFullYear()}年${start.getMonth() + 1}月`;
    $('prev-month').disabled = calendarMonth === '1900-01';
    $('next-month').disabled = calendarMonth === '9999-12';
    const offset = (start.getDay() + 6) % 7;
    const last = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    let html = '<span></span>'.repeat(offset);
    for (let number = 1; number <= last; number++) {
      const key = `${calendarMonth}-${String(number).padStart(2, '0')}`;
      const record = Stats.summarize(data.days[key]);
      const status = record.done ? record.done === record.total ? 'full' : 'partial' : '';
      const label = `${key}${key === today ? ' 今天' : ''}，${record.done}/${record.total} 项完成，${record.percent}%${key > today ? '，未来计划' : ''}`;
      html += `<button class="calendar-day ${status} ${key === today ? 'today' : ''} ${key === selected ? 'selected' : ''} ${data.days[key] ? 'has-record' : ''}" data-date="${key}" aria-label="${label}" ${key === today ? 'aria-current="date"' : ''}>${number}</button>`;
    }
    $('calendar-days').innerHTML = html;
  }

  function renderHistory(recentOnly = false) {
    const records = Object.entries(data.days).map(([date, day]) => ({ date, ...Stats.summarize(day) })).sort((a, b) => b.date.localeCompare(a.date));
    const row = (record, full = false) => `<button class="history-row" data-date="${record.date}"><span class="history-date">${formatDate(record.date, { month: 'long', day: 'numeric', ...(full ? { year: 'numeric' } : {}) })}${record.date === today ? ' · 今天' : ''}${full ? `<small>${formatDate(record.date, { weekday: 'long' })}${record.date > today ? ' · 未来计划，不计入统计' : record.full ? ' · 全部完成' : record.done ? ' · 已打卡' : ' · 尚未打卡'}</small><small class="history-summary">${escape(record.categories.join(' / ') || '暂无学习任务')}${record.hasTime ? ` · ${Stats.formatMinutes(record.minutes)}` : ''}</small>` : ''}</span><span class="history-count">${record.done} / ${record.total}</span><span class="percent-pill">${record.percent}%</span><span class="history-arrow">›</span></button>`;
    const past = records.filter(record => record.date <= today).slice(0, 3);
    $('recent-history').innerHTML = past.length ? past.map(record => row(record)).join('') : '<p class="empty-history">完成第一项任务，开始记录你的成长。</p>';
    if (!recentOnly) $('full-history').innerHTML = records.length ? records.map(record => row(record, true)).join('') : '<p class="empty-history">还没有记录，从今天开始吧。</p>';
  }

  function openEditor(type, categoryId, taskId) {
    const category = data.days[selected]?.categories.find(group => group.id === categoryId);
    const task = category?.tasks.find(item => item.id === taskId);
    editing = { type, date: selected, categoryId, taskId };
    const categoryEdit = type === 'add-category' || type === 'rename-category';
    $('dialog-title').textContent = ({ 'add-task': '新增任务', 'edit-task': '编辑任务', 'add-category': '新增分类', 'rename-category': '修改分类名称' })[type];
    $('edit-label').textContent = categoryEdit ? '分类名称' : '任务名称';
    $('edit-input').maxLength = categoryEdit ? 40 : 160;
    $('edit-input').value = type === 'rename-category' ? category.name : type === 'edit-task' ? task.title : '';
    $('edit-input').setCustomValidity('');
    $('task-details').hidden = categoryEdit;
    $('task-details').open = false;
    $('task-priority').value = task?.priority || '';
    $('task-estimated').value = task?.estimatedMinutes ?? '';
    $('task-actual').value = task?.actualMinutes ?? '';
    $('task-note').value = task?.note || '';
    $('edit-hint').textContent = `仅修改 ${formatDate(selected, { year: 'numeric', month: 'long', day: 'numeric' })} 的内容。`;
    $('edit-dialog').showModal();
    $('edit-input').focus();
  }

  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.view === 'today') { selected = today; calendarMonth = today.slice(0, 7); }
    switchView(button.dataset.view);
  }));
  document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); selectDate(today); });
  $('show-history').addEventListener('click', () => switchView('history'));
  $('prev-day').addEventListener('click', () => selectDate(S.shiftDate(selected, -1)));
  $('next-day').addEventListener('click', () => selectDate(S.shiftDate(selected, 1)));
  $('go-today').addEventListener('click', () => selectDate(today));
  $('date-picker').addEventListener('change', event => { if (event.target.value) selectDate(event.target.value); });
  $('prev-month').addEventListener('click', () => { calendarMonth = S.shiftDate(`${calendarMonth}-01`, -1).slice(0, 7); renderCalendar(); });
  $('next-month').addEventListener('click', () => { const next = S.parseDate(`${calendarMonth}-01`); next.setMonth(next.getMonth() + 1); calendarMonth = S.dateKey(next).slice(0, 7); renderCalendar(); });
  for (const id of ['calendar-days', 'recent-history', 'full-history']) {
    $(id).addEventListener('click', event => {
      const button = event.target.closest('button[data-date]');
      if (button) selectDate(button.dataset.date);
    });
  }
  $('add-category').addEventListener('click', () => openEditor('add-category'));
  $('task-groups').addEventListener('change', event => {
    const input = event.target;
    if (!input.matches('input[type="checkbox"]')) return;
    const checked = input.checked;
    mutate(next => {
      const group = findCategory(next, selected, input.dataset.category);
      const task = group.tasks.find(item => item.id === input.dataset.task);
      if (!task) throw new Error('此任务已被删除，请刷新后再试。');
      task.done = checked;
    }, { tasks: false });
  });
  $('task-groups').addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, category, task } = button.dataset;
    if (action === 'create-day') {
      mutate(next => {
        if (next.days[selected]?.categories.length) throw new Error('该日期已在其他页面建立计划，请刷新后查看。');
        next.days[selected] = S.exampleDay();
      });
    } else if (action === 'delete-task') {
      const current = data.days[selected].categories.find(group => group.id === category).tasks.find(item => item.id === task);
      deleting = { date: selected, categoryId: category, taskId: task };
      $('delete-task-name').textContent = current.title;
      $('delete-dialog').showModal();
    } else if (action === 'record-problem') {
      const current = data.days[selected]?.categories.find(group => group.id === category)?.tasks.find(item => item.id === task);
      if (current?.done) featureUI?.openProblem(Models.taskProblem(current, selected));
    } else openEditor(action, category, task);
  });
  $('cancel-delete').addEventListener('click', () => $('delete-dialog').close());
  $('delete-dialog').addEventListener('close', () => { deleting = null; });
  $('confirm-delete').addEventListener('click', () => {
    if (!deleting) return;
    const { date, categoryId, taskId } = deleting;
    if (mutate(next => {
      const group = findCategory(next, date, categoryId);
      group.tasks = group.tasks.filter(item => item.id !== taskId);
    })) $('delete-dialog').close();
  });
  const closeEditor = () => { $('edit-dialog').close(); editing = null; };
  $('close-dialog').addEventListener('click', closeEditor);
  $('cancel-dialog').addEventListener('click', closeEditor);
  $('edit-dialog').addEventListener('close', () => { editing = null; });
  $('edit-input').addEventListener('input', () => $('edit-input').setCustomValidity(''));
  $('edit-form').addEventListener('submit', event => {
    event.preventDefault();
    const value = $('edit-input').value.trim();
    if (!value) { $('edit-input').setCustomValidity('请输入内容，不能只填写空格。'); $('edit-input').reportValidity(); return; }
    if (!editing) return;
    const context = { ...editing };
    const detail = { priority: $('task-priority').value, estimatedMinutes: $('task-estimated').value === '' ? null : Number($('task-estimated').value), actualMinutes: $('task-actual').value === '' ? null : Number($('task-actual').value), note: $('task-note').value.trim() };
    const saved = mutate(next => {
      const { type, date, categoryId, taskId } = context;
      if (type === 'add-category') {
        if (!next.days[date]) next.days[date] = { categories: [] };
        next.days[date].categories.push({ id: S.uid(), name: value, tasks: [] });
      } else {
        const category = findCategory(next, date, categoryId);
        if (type === 'rename-category') category.name = value;
        if (type === 'add-task') category.tasks.push({ id: S.uid(), title: value, done: false, ...detail });
        if (type === 'edit-task') {
          const task = category.tasks.find(item => item.id === taskId);
          if (!task) throw new Error('此任务已被删除，请刷新后再试。');
          task.title = value;
          Object.assign(task, detail);
        }
      }
    });
    if (saved) closeEditor();
  });
  $('export-button').addEventListener('click', () => {
    try { featureUI?.exportBackup(); }
    catch (error) { toast(`无法导出：${error.message}`); }
  });
  window.addEventListener('storage', event => {
    if (event.key === S.KEY || event.key === null) {
      try {
        const latest = S.load();
        if (!latest) { toast('本地数据已在其他页面清除，请刷新。'); return; }
        data = latest; applyTheme(data.settings.theme); render();
      } catch { toast('其他页面的记录无法读取。请先导出备份并刷新。'); }
    }
    if (event.key === S.THEME_KEY && data.settings.theme === 'system') applyTheme('system');
  });
  function checkNewDay() {
    const nextToday = S.dateKey();
    if (nextToday === today) return;
    try {
      const nextData = S.initialize(nextToday);
      if (selected === today) { selected = nextToday; calendarMonth = nextToday.slice(0, 7); }
      today = nextToday; data = nextData; render();
    } catch (error) { toast(`新一天初始化失败：${error.message}`); }
  }
  setInterval(checkNewDay, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkNewDay(); });
  window.TodayWorkApp = {
    getData: () => data, getToday: () => today, getSelected: () => selected, getView: () => view,
    mutate, selectDate, switchView, toast, escape, formatDate, download, setTheme,
    replaceData(next) { data = next; applyTheme(data.settings.theme); $('save-status').textContent = '✓ 已保存到本地'; $('save-status').classList.remove('error'); render(); },
    registerFeatures(features) { featureUI = features; render(); }
  };
  render();
})();
