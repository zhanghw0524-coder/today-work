(function () {
  'use strict';
  const A = window.TodayWorkApp, P = window.TodayWorkPlans, S = window.StudyStorage;
  const $ = id => document.getElementById(id), esc = A.escape;
  const weeks = name => ['日','一','二','三','四','五','六'].map((label, value) => `<label><input type="checkbox" name="${name}" value="${value}" checked>周${label}</label>`).join('');
  const input = (id, label, type = 'text', attrs = '') => `<label>${label}<input id="${id}" type="${type}" ${attrs}></label>`;
  document.querySelector('.task-tools').insertAdjacentHTML('afterbegin', '<button id="open-ai-prompt" class="text-button">让 AI 帮我制定计划</button><button id="open-plan-convert" class="text-button">已经和 AI 聊好了计划</button><button id="open-full-plan" class="text-button">从 AI 导入计划</button>');
  document.body.insertAdjacentHTML('beforeend', `
  <dialog id="prompt-dialog" class="edit-dialog wide-dialog" aria-labelledby="prompt-title">
    <div class="dialog-header"><h2 id="prompt-title">还没有计划</h2><button class="icon-button" data-plan-close="prompt-dialog" aria-label="关闭提示词">×</button></div>
    <p class="notice">复制提示词 → 发给你常用的外部 AI → 把结果粘贴回 TW。Today Work 不连接 AI，不发送数据。</p>
    <div class="button-row"><button id="prompt-new" class="secondary-button">还没有计划</button><button id="prompt-convert" class="secondary-button">已经和 AI 聊好了计划</button></div>
    <form id="prompt-form"><label>你想完成什么？<textarea id="prompt-goal" rows="2" maxlength="2000" required placeholder="例如：学习编程、准备考试、完成论文初稿"></textarea></label>
      <details><summary>更多安排（默认 14 个执行日，每天 30 分钟）</summary><label>当前基础<textarea id="prompt-basis" rows="2" maxlength="2000"></textarea></label><div class="form-grid">${input('prompt-start','开始日期','date','min="1900-01-01" max="9999-12-31"')}${input('prompt-days','期望执行天数','number','value="14" min="1" max="366" required')}${input('prompt-minutes','每日可用时间（分钟）','number','value="30" min="1" max="1440" required')}</div><p class="subtle">执行天数不是自然日跨度，导入时按预算预览实际日期后确认。</p><fieldset class="weekday-choices"><legend>每周执行日期</legend>${weeks('prompt-weekday')}</fieldset><label>其他要求<textarea id="prompt-requirements" rows="2" maxlength="4000"></textarea></label></details>
      <button class="primary-button" type="submit">生成并复制给 AI</button></form>
    <section id="conversion-panel" hidden><p>把转换提示词发到<strong>原来的 AI 对话</strong>。保留已讨论的目标、阶段、顺序、资源和时间约束；信息不足先询问，不编造内容。</p><button id="conversion-copy" class="primary-button">复制转换格式提示词</button></section>
    <p id="prompt-error" class="form-error" role="status"></p><details id="prompt-output-details"><summary>查看提示词 / 手动复制</summary><textarea id="prompt-output" rows="7" readonly aria-label="复制给 AI 的提示词"></textarea></details>
    <div class="dialog-actions"><button class="secondary-button" data-plan-close="prompt-dialog">关闭</button><button id="prompt-to-import" class="primary-button">已有 AI 结果，去粘贴</button></div></dialog>
  <dialog id="full-plan-dialog" class="edit-dialog plan-wizard" aria-labelledby="full-plan-title">
    <div class="dialog-header"><h2 id="full-plan-title">从 AI 导入计划</h2><button class="icon-button" data-plan-close="full-plan-dialog" aria-label="关闭计划导入">×</button></div>
    <p class="subtle">粘贴 AI 结果 → 检查与修改 → 查看日期安排 → 确认追加</p>
    <section id="plan-input-section"><label for="full-plan-input">粘贴 AI 返回的计划</label><textarea id="full-plan-input" rows="5" spellcheck="false" placeholder="可含代码块和前后说明文字"></textarea><div class="button-row"><button id="full-plan-parse" class="secondary-button">检查并预览</button><button id="full-plan-repair" class="text-button" hidden>复制修复提示词</button></div><details><summary>高级：格式说明</summary><p>沿用 TW_PLAN_V1，支持一个 JSON 对象、代码块、前后说明。最多 1 MiB、2000 项任务。自然语言或表格请先在原 AI 对话中转换格式；TW 不猜测内容。</p></details></section>
    <p id="full-plan-error" class="form-error" role="status"></p><details id="repair-output-details" hidden><summary>修复提示词 / 手动复制</summary><textarea id="repair-output" rows="6" readonly aria-label="修复提示词"></textarea></details>
    <div id="full-plan-details" hidden><section class="plan-summary">${input('draft-name','计划名称','text','maxlength="100" required')}<div id="full-plan-summary"></div></section>
      <section class="schedule-settings"><h3>日期与每日预算</h3><div class="form-grid">${input('schedule-start','开始日期','date','min="1900-01-01" max="9999-12-31" required')}<label>排期方式<select id="schedule-mode"><option value="day">保留 AI 的执行日分组</option><option value="sequence">按任务顺序和预算安排</option><option value="fixed">保留固定日期</option></select></label><label>执行星期快捷选择<select id="schedule-preset"><option value="all">每天</option><option value="workdays">周一至周五</option><option value="custom">自定义</option></select></label>${input('schedule-deadline','截止日期（可选）','date','min="1900-01-01" max="9999-12-31"')}</div>
      <fieldset class="weekday-choices"><legend>实际执行星期</legend>${weeks('schedule-weekday')}</fieldset><div class="form-grid">${input('schedule-tasks','每日任务数上限','number','min="1" max="10000" placeholder="留空不限"')}${input('schedule-minutes','每日时间预算（分钟）','number','min="1" max="100800" placeholder="留空不限"')}${input('schedule-default','未知时长的每项估算（分钟）','number','min="1" max="10080" value="30"')}</div>
      <p class="subtle">计算当天已有未完成任务的负担，保留任务顺序与依赖。固定日期不自动移动。超期请明确延长期限、提高预算或减少任务；单项超额请修改时长、手动拆分或明确允许超额。</p></section>
      <div class="button-row"><button id="preview-dates" class="secondary-button" aria-pressed="true">按日期查看</button><button id="preview-stages" class="secondary-button" aria-pressed="false">按阶段查看 / 选择任务</button></div>
      <p id="schedule-error" class="form-error" role="status"></p><div id="schedule-overview"></div><div id="schedule-preview"></div><div id="draft-stage-view" hidden></div>
      <label id="schedule-ack-row" class="checkbox-field plan-ack" hidden><input id="schedule-ack" type="checkbox">我已检查估算、固定日期或超额提示，明确允许保持当前安排</label>
      <label id="duplicate-ack-row" class="checkbox-field plan-ack" hidden><input id="duplicate-ack" type="checkbox">检测到相同内容，我确认作为新计划再次追加</label></div>
    <section id="plan-success" class="plan-summary" hidden></section><button id="success-undo" class="text-button" hidden>撤销本次导入…</button>
    <p class="notice">预览、编辑和取消不改变现有任务。确认后追加保存，保留已有任务与完成状态。</p><div class="dialog-actions"><button class="secondary-button" data-plan-close="full-plan-dialog">取消</button><button id="full-plan-confirm" class="primary-button" disabled>确认导入整个计划</button></div></dialog>
  <dialog id="draft-task-dialog" class="edit-dialog wide-dialog" aria-labelledby="draft-task-title"><form id="draft-task-form"><div class="dialog-header"><h2 id="draft-task-title">修改待导入任务</h2><button type="button" class="icon-button" data-plan-close="draft-task-dialog" aria-label="关闭任务预览编辑">×</button></div>${input('draft-task-name','任务标题','text','required maxlength="160"')}<label>任务说明<textarea id="draft-task-description" rows="3" maxlength="4000"></textarea></label><label>备注<textarea id="draft-task-note" rows="2" maxlength="4000"></textarea></label>${input('draft-task-minutes','预计时长（分钟，留空使用默认估算）','number','min="1" max="10080"')}<p class="subtle">阶段、分类、依赖和资源链接保留。</p><div class="dialog-actions"><button type="button" class="secondary-button" data-plan-close="draft-task-dialog">取消</button><button type="submit" class="primary-button">保存到预览</button></div></form></dialog>
  <dialog id="undo-import-dialog" class="edit-dialog" aria-labelledby="undo-import-title"><h2 id="undo-import-title">撤销这次计划导入？</h2><p id="undo-import-summary"></p><label id="undo-import-completed-row" class="checkbox-field" hidden><input id="undo-import-completed" type="checkbox">我确认移除本次关联的已完成记录</label><p class="notice">只移除本次关联任务和计划，不回退其他修改；此操作不进入最近删除。要保留历史，可取消后使用删除计划。</p><p id="undo-import-error" class="form-error" role="status"></p><div class="dialog-actions"><button class="secondary-button" data-plan-close="undo-import-dialog">取消</button><button id="undo-import-confirm" class="primary-button danger-button">确认撤销导入</button></div></dialog>`);
  let original = null, draft = null, preview = null, excluded = new Set(), editing = null, busy = false, successfulId = '', preferred = null, undoCandidate = null, parseError = '';
  const checked = name => [...document.querySelectorAll(`[name="${name}"]:checked`)].map(node => Number(node.value));
  const setWeeks = values => document.querySelectorAll('[name="schedule-weekday"]').forEach(node => { node.checked = values.includes(Number(node.value)); });
  document.querySelectorAll('[data-plan-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.planClose).close()));
  $('prompt-start').value = A.getToday();
  for(const [dialog,id] of [['prompt-dialog','prompt-next-step'],['full-plan-dialog','repair-next-step']]){const notice=document.createElement('p');notice.id=id;notice.className='notice';notice.hidden=true;notice.setAttribute('role','status');$(dialog).querySelector('.dialog-actions').before(notice);}
  async function copy(value, output, error, details) {
    $(output).value = value;
    try { await navigator.clipboard.writeText(value); const notice=$(output==='prompt-output'?'prompt-next-step':'repair-next-step');notice.textContent=output==='prompt-output'?'✓ 已复制。下一步：发送到外部 AI 对话，复制返回结果，再点“已有 AI 结果，去粘贴”。':'✓ 修复提示词已复制。发给原 AI 对话，再把修复后的结果粘贴回来重新检查。';notice.hidden=false;A.toast('提示词已复制，请发送到外部 AI 对话。'); }
    catch { $(details).open = true; $(output).focus(); $(output).select(); $(error).textContent = '浏览器未允许复制，已选中文本，请 Ctrl+C 或长按复制。'; }
  }
  function entry(convert) {
    $('prompt-next-step').hidden=true;
    $('prompt-title').textContent = convert ? '已经和 AI 聊好了计划' : '还没有计划'; $('prompt-form').hidden = convert; $('conversion-panel').hidden = !convert;
    $('prompt-error').textContent = ''; $('prompt-output').value = ''; $('prompt-output-details').open = false; if (convert) preferred = null;
    if (!$('prompt-dialog').open) $('prompt-dialog').showModal();
  }
  $('open-ai-prompt').addEventListener('click', () => entry(false)); $('prompt-new').addEventListener('click', () => entry(false));
  $('open-plan-convert').addEventListener('click', () => entry(true)); $('prompt-convert').addEventListener('click', () => entry(true));
  $('conversion-copy').addEventListener('click', () => copy(P.conversionPrompt(), 'prompt-output', 'prompt-error', 'prompt-output-details'));
  $('prompt-form').addEventListener('submit', async event => {
    event.preventDefault(); $('prompt-error').textContent = '';
    try {
      const values = { goal: $('prompt-goal').value, basis: $('prompt-basis').value, days: Number($('prompt-days').value), minutes: Number($('prompt-minutes').value), startDate: $('prompt-start').value, weekdays: checked('prompt-weekday'), requirements: $('prompt-requirements').value };
      const result = P.prompt(values); preferred = { startDate: values.startDate, weekdays: values.weekdays, maxMinutes: values.minutes }; await copy(result, 'prompt-output', 'prompt-error', 'prompt-output-details');
    } catch (error) { $('prompt-error').textContent = error.message; }
  });
  $('prompt-form').addEventListener('input', () => { preferred = null; $('prompt-output').value = ''; });
  function invalidate() { original = null; draft = null; preview = null; excluded = new Set(); $('full-plan-details').hidden = true; $('full-plan-confirm').disabled = true; }
  function openImport() {
    $('repair-next-step').hidden=true;
    invalidate(); successfulId = ''; busy = false; parseError = ''; $('full-plan-error').textContent = ''; $('plan-success').hidden = true; $('success-undo').hidden = true; $('plan-input-section').hidden = false; $('repair-output-details').hidden = true; $('full-plan-repair').hidden = true;
    $('full-plan-confirm').textContent = '确认导入整个计划'; $('full-plan-dialog').querySelector('.dialog-actions [data-plan-close]').textContent = '取消';
    $('schedule-start').value = preferred?.startDate || A.getToday(); $('schedule-preset').value = 'custom'; setWeeks(preferred?.weekdays || [0,1,2,3,4,5,6]);
    $('schedule-tasks').value = ''; $('schedule-minutes').value = preferred?.maxMinutes || ''; $('schedule-default').value = 30; $('schedule-deadline').value = ''; chooseView(false);
    if (!$('full-plan-dialog').open) $('full-plan-dialog').showModal();
  }
  $('open-full-plan').addEventListener('click', openImport); $('prompt-to-import').addEventListener('click', () => { $('prompt-dialog').close(); openImport(); });
  $('full-plan-input').addEventListener('input', () => { invalidate(); $('full-plan-error').textContent = ''; $('repair-next-step').textContent = ''; $('full-plan-repair').hidden = true; $('repair-output-details').hidden = true; $('repair-output').value = ''; }); $('full-plan-dialog').addEventListener('close', invalidate);
  function readRules() { return { startDate: $('schedule-start').value, weekdays: checked('schedule-weekday'), mode: $('schedule-mode').value, maxTasks: $('schedule-tasks').value === '' ? null : Number($('schedule-tasks').value), maxMinutes: $('schedule-minutes').value === '' ? null : Number($('schedule-minutes').value), defaultMinutes: Number($('schedule-default').value), deadline: $('schedule-deadline').value || null }; }
  const taskIndexes = entry => entry.taskIndexes || draft.days[entry.day - 1].tasks.map((_, index) => index);
  function taskInfo(task, stage) {
    return `<span>${esc(task.title)}</span><small>${esc(task.stage || stage || '未分阶段')} · ${esc(task.category)} · ${task.estimatedMinutes === null ? `按 ${esc($('schedule-default').value)} 分钟估算` : `${task.estimatedMinutes} 分钟`}${task.date ? ` · 固定 ${esc(task.date)}` : ''}</small>${task.description ? `<p>${esc(task.description)}</p>` : ''}${task.note ? `<p>${esc(task.note)}</p>` : ''}${(task.resources || []).map(resource => `<p><a href="${esc(resource.url)}" target="_blank" rel="noopener noreferrer">${esc(resource.title)}</a></p>`).join('')}`;
  }
  function renderStages() {
    $('draft-stage-view').innerHTML = original.days.map((day, d) => `<section class="scheduled-day"><h3>${esc(day.stage || `执行日 ${day.day}`)}</h3>${day.tasks.map((task, t) => `<div class="draft-task-row"><label class="checkbox-field"><input type="checkbox" data-select-task="${d}:${t}" ${excluded.has(`${d}:${t}`) ? '' : 'checked'}><span>${esc(task.title)}<small>${esc(task.stage || day.stage || '未分阶段')} · ${esc(task.category)} · ${task.estimatedMinutes === null ? '时长待确认' : task.estimatedMinutes + ' 分钟'}</small></span></label><button class="text-button" data-edit-draft="${d}:${t}">编辑任务</button></div>`).join('')}</section>`).join('');
  }
  function enableConfirm() { $('full-plan-confirm').disabled = busy || !draft || !preview || !!preview.errors.length || (preview.needsAcknowledgement && !$('schedule-ack').checked) || (!$('duplicate-ack-row').hidden && !$('duplicate-ack').checked); }
  function updatePreview(reset = true) {
    if (!original || busy) return;
    if (reset) { $('schedule-ack').checked = false; $('duplicate-ack').checked = false; }
    preview = null; draft = null; $('schedule-error').textContent = ''; $('schedule-preview').replaceChildren(); $('schedule-overview').replaceChildren();
    try {
      const days = original.days.map((day, d) => ({ ...day, tasks: day.tasks.filter((_, t) => !excluded.has(`${d}:${t}`)) })).filter(day => day.tasks.length).map((day, i) => ({ ...day, day: i + 1 }));
      draft = P.normalize({ ...original, planName: $('draft-name').value, days }); const summary = P.summarize(draft); preview = P.schedule(draft, readRules(), A.getData());
      const stages = new Set(draft.days.flatMap(day => day.tasks.map(task => task.stage || day.stage || '未分阶段')));
      $('full-plan-summary').innerHTML = `${draft.goal ? `<p>${esc(draft.goal)}</p>` : ''}<p>${summary.tasks} 项任务 · ${stages.size} 个阶段 · 已知 ${summary.minutes} 分钟 · ${summary.unknown} 项使用估算</p><p class="subtle">缺失的目标/说明/备注默认为空，优先级默认为中。取消选择的任务不导入；若被依赖，需一并调整。</p>`;
      const repeats = P.duplicates(A.getData(), draft); $('duplicate-ack-row').hidden = !repeats.length; $('schedule-ack-row').hidden = !preview.needsAcknowledgement;
      $('schedule-overview').innerHTML = `<p>${esc(preview.rules.startDate)} → <strong>${esc(preview.endDate)}</strong> · ${new Set(preview.mapping.map(item => item.date)).size} 个安排日期 · ${checked('schedule-weekday').map(day => '周' + '日一二三四五六'[day]).join('、')}<br>每日预算：${preview.rules.maxMinutes === null ? '不限时间' : preview.rules.maxMinutes + ' 分钟'} / ${preview.rules.maxTasks === null ? '不限项数' : preview.rules.maxTasks + ' 项'}${preview.deadline ? ` · 截止 ${esc(preview.deadline)}` : ' · 未设截止日'}${repeats.length ? ' · 检测到重复计划' : ''}</p>`;
      $('schedule-error').textContent = preview.errors.join('\n'); $('schedule-preview').innerHTML = preview.mapping.map(entry => `<article class="scheduled-day"><div class="scheduled-heading"><strong>Day ${entry.day} → ${esc(entry.date)}</strong><small>已有未完成 ${entry.existing} 项 · 当日预计合计 ${entry.estimatedMinutes} 分钟</small></div><ol>${taskIndexes(entry).map(index => `<li>${taskInfo(draft.days[entry.day - 1].tasks[index], draft.days[entry.day - 1].stage)}</li>`).join('')}</ol>${entry.warnings.map(warning => `<p class="schedule-warning">${esc(warning)}</p>`).join('')}</article>`).join('');
      if (preview.adjustments.length) $('schedule-overview').insertAdjacentHTML('beforeend', `<details><summary>查看 ${preview.adjustments.length} 项日期调整原因</summary>${preview.adjustments.map(item => `<p class="subtle">${esc(item.title)}：${esc(item.from)} → ${esc(item.to)}；${esc(item.reason)}</p>`).join('')}</details>`);
    } catch (error) { $('schedule-error').textContent = error.message; $('schedule-ack-row').hidden = true; }
    enableConfirm();
  }
  $('full-plan-parse').addEventListener('click', () => {
    invalidate(); $('full-plan-error').textContent = ''; $('full-plan-repair').hidden = true;
    try { original = P.parse($('full-plan-input').value); $('draft-name').value = original.planName; $('schedule-mode').value = original.scheduling || 'day'; $('schedule-deadline').value = original.deadline || ''; $('full-plan-details').hidden = false; renderStages(); updatePreview(); }
    catch (error) { parseError = error.message; $('full-plan-error').textContent = error.message; $('full-plan-repair').hidden = false; }
  });
  $('full-plan-repair').addEventListener('click', async () => { try { const value = P.repairPrompt($('full-plan-input').value, parseError); $('repair-output-details').hidden = false; await copy(value, 'repair-output', 'full-plan-error', 'repair-output-details'); } catch (error) { $('full-plan-error').textContent = error.message; } });
  $('schedule-preset').addEventListener('change', () => { if ($('schedule-preset').value !== 'custom') setWeeks($('schedule-preset').value === 'all' ? [0,1,2,3,4,5,6] : [1,2,3,4,5]); updatePreview(); });
  document.querySelector('[name="schedule-weekday"]').closest('fieldset').addEventListener('change', () => { $('schedule-preset').value = 'custom'; updatePreview(); });
  for (const id of ['draft-name','schedule-start','schedule-mode','schedule-deadline','schedule-tasks','schedule-minutes','schedule-default']) $(id).addEventListener('input', () => updatePreview());
  for (const id of ['schedule-ack','duplicate-ack']) $(id).addEventListener('change', enableConfirm);
  function chooseView(stages) { $('draft-stage-view').hidden = !stages; $('schedule-preview').hidden = stages; $('preview-stages').setAttribute('aria-pressed', String(stages)); $('preview-dates').setAttribute('aria-pressed', String(!stages)); }
  $('preview-dates').addEventListener('click', () => chooseView(false)); $('preview-stages').addEventListener('click', () => chooseView(true));
  $('draft-stage-view').addEventListener('change', event => { const node = event.target.closest('[data-select-task]'); if (node) { if (node.checked) excluded.delete(node.dataset.selectTask); else excluded.add(node.dataset.selectTask); updatePreview(); } });
  $('draft-stage-view').addEventListener('click', event => {
    const button = event.target.closest('[data-edit-draft]'); if (!button) return; editing = button.dataset.editDraft.split(':').map(Number); const task = original.days[editing[0]].tasks[editing[1]];
    $('draft-task-name').value = task.title; $('draft-task-description').value = task.description || ''; $('draft-task-note').value = task.note; $('draft-task-minutes').value = task.estimatedMinutes ?? ''; $('draft-task-dialog').showModal();
  });
  $('draft-task-form').addEventListener('submit', event => {
    event.preventDefault(); if (!editing || !original || !$('draft-task-name').value.trim()) return;
    const task = original.days[editing[0]].tasks[editing[1]]; task.title = $('draft-task-name').value.trim(); task.note = $('draft-task-note').value.trim(); task.estimatedMinutes = $('draft-task-minutes').value === '' ? null : Number($('draft-task-minutes').value);
    if ($('draft-task-description').value.trim()) task.description = $('draft-task-description').value.trim(); else delete task.description;
    $('draft-task-dialog').close(); editing = null; renderStages(); updatePreview();
  });
  $('full-plan-confirm').addEventListener('click', () => {
    if (busy || !draft || !preview || $('full-plan-confirm').disabled) return; busy = true; enableConfirm(); let record;
    const saved = A.mutate(next => { record = P.importPlan(next, draft, preview.rules, { preview, keepSchedule: $('schedule-ack').checked, allowDuplicate: $('duplicate-ack').checked }); }); busy = false;
    if (!saved) { $('full-plan-error').textContent = `本次计划未保存：${A.getLastError()}。请检查最新预览后重试。`; updatePreview(); return; }
    successfulId = record.id; const count = P.summarize(record.plan).tasks; invalidate(); $('plan-input-section').hidden = true; $('full-plan-input').value = ''; $('plan-success').hidden = false; $('success-undo').hidden = false;
    $('plan-success').innerHTML = `<h3>✓ 导入成功</h3><p>新增 1 个计划「${esc(record.plan.planName)}」、${count} 项任务。${esc(record.mapping[0].date)} → ${esc(record.mapping[record.mapping.length - 1].date)}</p><p>可继续编辑、删除或推迟任务。</p>`;
    $('full-plan-confirm').textContent = '已导入'; $('full-plan-dialog').querySelector('.dialog-actions [data-plan-close]').textContent = '完成'; A.selectDate(record.mapping[0].date);
  });
  function openUndo(id) {
    try { const info = P.importInfo(A.getData(), id); undoCandidate = { id, signature: JSON.stringify(info) }; $('undo-import-summary').textContent = `移除「${info.record.plan.planName}」及 ${info.tasks} 条关联任务（含手动转入/推迟），其中 ${info.completed} 项已完成。无关修改保留。`; $('undo-import-completed-row').hidden = !info.completed; $('undo-import-completed').checked = false; $('undo-import-confirm').disabled = !!info.completed; $('undo-import-error').textContent = ''; $('undo-import-dialog').showModal(); } catch (error) { A.toast(error.message); }
  }
  $('success-undo').addEventListener('click', () => openUndo(successfulId)); $('undo-import-completed').addEventListener('change', () => { $('undo-import-confirm').disabled = !$('undo-import-completed').checked; });
  $('undo-import-confirm').addEventListener('click', () => {
    if (busy || !undoCandidate || $('undo-import-confirm').disabled) return; busy = true;
    const saved = A.mutate(next => { if (JSON.stringify(P.importInfo(next, undoCandidate.id)) !== undoCandidate.signature) throw new Error('关联数据已变化，请取消后重新核对撤销数量。'); P.undoImport(next, undoCandidate.id, { includeCompleted: $('undo-import-completed').checked }); }); busy = false;
    if (saved) { undoCandidate = null; $('undo-import-dialog').close(); $('success-undo').hidden = true; $('plan-success').textContent = '本次导入已撤销，其他修改保留。'; A.toast('已撤销本次导入。'); } else $('undo-import-error').textContent = `未撤销：${A.getLastError()}`;
  });
  const records = document.createElement('section'); records.id = 'imported-plans'; records.className = 'settings-section'; $('settings-view').append(records);
  function renderRecords() { records.innerHTML = '<h2>已导入计划</h2><p class="subtle">撤销本次导入，或通过删除计划选择保留历史的方式。</p>' + (A.getData().plans?.length ? A.getData().plans.map(record => `<p data-plan-row="${esc(record.id)}"><button class="text-button" data-plan-date="${esc(record.mapping[0].date)}">${esc(record.plan.planName)}</button> <small class="subtle">${esc(record.mapping[0].date)} → ${esc(record.mapping[record.mapping.length - 1].date)} · ${P.summarize(record.plan).tasks} 项</small> <button class="text-button" data-undo-import="${esc(record.id)}">撤销导入…</button></p>`).join('') : '<p class="subtle">还没有导入多日计划。</p>'); }
  records.addEventListener('click', event => { const date = event.target.closest('[data-plan-date]'), undo = event.target.closest('[data-undo-import]'); if (date) A.selectDate(date.dataset.planDate); if (undo) openUndo(undo.dataset.undoImport); });
  document.addEventListener('todaywork:render', () => { renderRecords(); if (original && !busy) updatePreview(); }); renderRecords();
})();
