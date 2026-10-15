(function () {
  'use strict';
  const A = window.TodayWorkApp, P = window.TodayWorkPlans, S = window.StudyStorage;
  const $ = id => document.getElementById(id), esc = A.escape;
  document.querySelector('.task-tools').insertAdjacentHTML('afterbegin', '<button id="open-ai-prompt" class="text-button">让 AI 帮我制定计划</button><button id="open-full-plan" class="text-button">从 AI 导入计划</button>');
  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="prompt-dialog" class="edit-dialog wide-dialog" aria-labelledby="prompt-title">
      <div class="dialog-header"><h2 id="prompt-title">让 AI 帮我制定计划</h2><button class="icon-button" data-plan-close="prompt-dialog" aria-label="关闭提示词">×</button></div>
      <p class="notice">Today Work 不连接 AI。生成提示词后，请自行发送给喜欢的 AI，再将返回的 JSON 粘贴到“从 AI 导入计划”。</p>
      <form id="prompt-form"><label>目标<textarea id="prompt-goal" rows="2" maxlength="2000" required placeholder="例如：建立每天阅读英语的习惯"></textarea></label><div class="form-grid"><label>执行天数<input id="prompt-days" type="number" min="1" max="366" value="14" required></label><label>每个执行日可投入（分钟）<input id="prompt-minutes" type="number" min="1" max="1440" value="30" required></label></div><p class="subtle">执行天数是实际安排任务的天数，不是自然日跨度。具体星期和日期将在导入时设置。</p><label>其他要求<textarea id="prompt-requirements" maxlength="4000" rows="2" placeholder="当前基础、学习材料、任务偏好等"></textarea></label><button class="secondary-button" type="submit">生成提示词</button></form>
      <p id="prompt-error" class="form-error" role="status"></p><label for="prompt-output">复制给 AI 的提示词</label><textarea id="prompt-output" readonly rows="7"></textarea><div class="dialog-actions"><button class="secondary-button" data-plan-close="prompt-dialog">关闭</button><button id="prompt-copy" class="primary-button" disabled>复制给 AI</button></div>
    </dialog>
    <dialog id="full-plan-dialog" class="edit-dialog plan-wizard" aria-labelledby="full-plan-title">
      <div class="dialog-header"><div><div class="eyebrow">PLAN → TODAY</div><h2 id="full-plan-title">从 AI 导入计划</h2></div><button class="icon-button" data-plan-close="full-plan-dialog" aria-label="关闭多日计划导入">×</button></div>
      <p class="subtle">① 粘贴 JSON → ② 校验与设置规则 → ③ 预览日期 → ④ 确认追加</p>
      <label for="full-plan-input">TW_PLAN_V1 JSON</label><textarea id="full-plan-input" rows="6" spellcheck="false" placeholder='{"format":"TW_PLAN_V1","planName":"…","categories":["学习"],"days":[{"day":1,"tasks":[{"title":"阅读一章","category":"学习"}]}]}'></textarea>
      <div class="button-row"><button id="full-plan-parse" class="secondary-button">解析与校验</button><span class="subtle">支持纯 JSON 或单个 json 代码块 · 最大 1 MiB</span></div>
      <p id="full-plan-error" class="form-error" role="status"></p>
      <div id="full-plan-details" hidden><section id="full-plan-summary" class="plan-summary"></section>
        <section class="schedule-settings"><h3>设置执行规则</h3><div class="form-grid"><label>开始日期<input id="schedule-start" type="date" min="1900-01-01" max="9999-12-31" required></label><label>执行星期快捷选择<select id="schedule-preset"><option value="all">每天执行</option><option value="workdays">工作日执行</option><option value="custom">自定义星期</option></select></label></div>
        <fieldset class="weekday-choices"><legend>执行星期（实际依据）</legend>${['日', '一', '二', '三', '四', '五', '六'].map((name, day) => `<label><input type="checkbox" name="schedule-weekday" value="${day}" checked>周${name}</label>`).join('')}</fieldset>
        <div class="form-grid"><label>每日最大任务数<input id="schedule-tasks" type="number" min="1" max="10000" placeholder="留空：不限制"></label><label>每日最大预计时长（分钟）<input id="schedule-minutes" type="number" min="1" max="100800" placeholder="留空：不限制"></label></div><p class="subtle">每个 Day 整体安排到一个日期，不拆分或重排。上限同时计算该日已有任务；实际用时不参与。</p></section>
        <p id="schedule-error" class="form-error" role="status"></p><div id="schedule-preview"></div>
        <label id="schedule-ack-row" class="checkbox-field plan-ack" hidden><input id="schedule-ack" type="checkbox">我已了解超限或未知时长提示，仍保持此安排</label>
        <label id="duplicate-ack-row" class="checkbox-field plan-ack" hidden><input id="duplicate-ack" type="checkbox">此计划已导入过，我确认再次追加一份完整计划</label>
      </div><p class="notice">预览和取消不会修改任务。确认后追加到各日期，已有任务及完成状态保留。</p>
      <div class="dialog-actions"><button class="secondary-button" data-plan-close="full-plan-dialog">取消</button><button id="full-plan-confirm" class="primary-button" disabled>确认导入整个计划</button></div>
    </dialog>`);
  let draft = null, preview = null, busy = false;
  document.querySelectorAll('[data-plan-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.planClose).close()));
  $('open-ai-prompt').addEventListener('click', () => $('prompt-dialog').showModal());
  $('prompt-form').addEventListener('submit', event => {
    event.preventDefault(); $('prompt-error').textContent = '';
    try {
      $('prompt-output').value = P.prompt({ goal: $('prompt-goal').value, days: Number($('prompt-days').value), minutes: Number($('prompt-minutes').value), requirements: $('prompt-requirements').value });
      $('prompt-copy').disabled = false;
    } catch (error) { $('prompt-error').textContent = error.message; }
  });
  $('prompt-form').addEventListener('input', () => { $('prompt-output').value = ''; $('prompt-copy').disabled = true; });
  $('prompt-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('prompt-output').value); A.toast('提示词已复制，请自行发送给 AI。'); }
    catch { $('prompt-output').focus(); $('prompt-output').select(); $('prompt-error').textContent = '浏览器未允许复制，已选中文本，请按 Ctrl+C 或长按复制。'; }
  });
  function invalidate() {
    draft = null; preview = null; $('full-plan-details').hidden = true;
    $('full-plan-confirm').disabled = true; $('full-plan-error').textContent = '';
  }
  $('open-full-plan').addEventListener('click', () => {
    invalidate(); $('schedule-start').value = A.getToday(); $('schedule-preset').value = 'all';
    $('full-plan-input').disabled = false; $('full-plan-parse').disabled = false;
    $('full-plan-confirm').textContent = '确认导入整个计划';
    $('full-plan-dialog').querySelector('.dialog-actions [data-plan-close]').textContent = '取消';
    document.querySelectorAll('[name="schedule-weekday"]').forEach(input => { input.checked = true; });
    $('schedule-tasks').value = ''; $('schedule-minutes').value = '';
    $('full-plan-dialog').showModal();
  });
  $('full-plan-input').addEventListener('input', invalidate);
  $('full-plan-dialog').addEventListener('close', () => { invalidate(); });
  function readRules() {
    return { startDate: $('schedule-start').value, weekdays: [...document.querySelectorAll('[name="schedule-weekday"]:checked')].map(input => Number(input.value)), maxTasks: $('schedule-tasks').value === '' ? null : Number($('schedule-tasks').value), maxMinutes: $('schedule-minutes').value === '' ? null : Number($('schedule-minutes').value) };
  }
  function enableConfirm() {
    $('full-plan-confirm').disabled = busy || !preview || (preview.needsAcknowledgement && !$('schedule-ack').checked) || (!$('duplicate-ack-row').hidden && !$('duplicate-ack').checked);
  }
  function updatePreview(reset = true) {
    if (!draft) return;
    if (reset) { $('schedule-ack').checked = false; $('duplicate-ack').checked = false; }
    $('schedule-error').textContent = ''; preview = null;
    try {
      const current = A.getData();
      preview = P.schedule(draft, readRules(), current);
      const repeats = P.duplicates(current, draft);
      $('duplicate-ack-row').hidden = !repeats.length;
      $('schedule-ack-row').hidden = !preview.needsAcknowledgement;
      $('schedule-preview').innerHTML = `<h3>实际日期预览</h3><p class="subtle">预计结束：<strong>${esc(preview.endDate)}</strong> · ${preview.mapping.length} 个执行日${repeats.length ? ` · 已导入 ${repeats.length} 次` : ''}</p>` + preview.mapping.map(entry => {
        const day = draft.days[entry.day - 1];
        return `<article class="scheduled-day"><div class="scheduled-heading"><strong>Day ${entry.day} → ${esc(entry.date)}</strong><small>已有 ${entry.existing} 项 · 新增 ${day.tasks.length} 项</small></div><ol>${day.tasks.map(task => `<li><span>${esc(task.title)}</span><small>${esc(task.category)} · ${task.estimatedMinutes === null ? '预计时长未知' : `${task.estimatedMinutes} 分钟`} · ${{low:'低',medium:'中',high:'高'}[task.priority]}优先级</small>${task.note ? `<p>${esc(task.note)}</p>` : ''}</li>`).join('')}</ol>${entry.warnings.map(warning => `<p class="schedule-warning">${esc(entry.date)}：${esc(warning)}</p>`).join('')}</article>`;
      }).join('');
    } catch (error) { $('schedule-error').textContent = error.message; $('schedule-preview').replaceChildren(); $('schedule-ack-row').hidden = true; }
    enableConfirm();
  }
  $('full-plan-parse').addEventListener('click', () => {
    invalidate();
    try {
      draft = P.parse($('full-plan-input').value);
      const summary = P.summarize(draft);
      $('full-plan-summary').innerHTML = `<h3>${esc(draft.planName)}</h3>${draft.goal ? `<p>${esc(draft.goal)}</p>` : ''}<p>${summary.days} 个执行日 · ${summary.tasks} 项任务 · 已知预计 ${summary.minutes} 分钟 · ${summary.unknown} 项缺少时长</p>`;
      $('full-plan-details').hidden = false; updatePreview();
    } catch (error) { $('full-plan-error').textContent = error.message; }
  });
  $('schedule-preset').addEventListener('change', () => {
    const preset = $('schedule-preset').value;
    if (preset !== 'custom') document.querySelectorAll('[name="schedule-weekday"]').forEach(input => { input.checked = preset === 'all' || (Number(input.value) >= 1 && Number(input.value) <= 5); });
    updatePreview();
  });
  document.querySelector('.weekday-choices').addEventListener('change', () => { $('schedule-preset').value = 'custom'; updatePreview(); });
  for (const id of ['schedule-start', 'schedule-tasks', 'schedule-minutes']) $(id).addEventListener('input', () => updatePreview());
  for (const id of ['schedule-ack', 'duplicate-ack']) $(id).addEventListener('change', enableConfirm);
  $('full-plan-confirm').addEventListener('click', () => {
    if (busy || !draft || !preview || $('full-plan-confirm').disabled) return;
    busy = true; enableConfirm();
    const currentPlan = draft, currentPreview = preview;
    let record;
    const saved = A.mutate(next => {
      const fresh = P.schedule(currentPlan, currentPreview.rules, next);
      if (JSON.stringify(fresh.mapping) !== JSON.stringify(currentPreview.mapping)) throw new Error('目标日期任务已变化，请重新检查预览后确认。');
      record = P.importPlan(next, currentPlan, currentPreview.rules, { keepSchedule: $('schedule-ack').checked, allowDuplicate: $('duplicate-ack').checked });
    });
    busy = false;
    if (saved) {
      // Keep the modal in a completed state: a second click cannot hit a task underneath it.
      draft = null; preview = null; $('full-plan-input').disabled = true; $('full-plan-parse').disabled = true;
      $('full-plan-confirm').disabled = true; $('full-plan-confirm').textContent = '已导入';
      $('full-plan-dialog').querySelector('.dialog-actions [data-plan-close]').textContent = '完成';
      $('full-plan-summary').innerHTML = `<h3>✓ 导入成功</h3><p>${esc(record.plan.planName)} · ${record.mapping.length} 个执行日已追加。关闭此窗口即可查看任务。</p>`;
      $('full-plan-input').value = '';
      A.selectDate(record.mapping[0].date); A.toast(`已追加完整计划“${record.plan.planName}”，共 ${record.mapping.length} 个执行日。`);
    } else updatePreview();
  });
  const records = document.createElement('section'); records.className = 'settings-section'; records.id = 'imported-plans';
  $('settings-view').append(records);
  function renderRecords() {
    records.innerHTML = '<h2>已导入计划</h2><p class="subtle">仅记录计划来源和排期。手动转入今日不会改变原计划或历史。</p>' + (A.getData().plans?.length ? A.getData().plans.map(record => `<p><button class="text-button" data-plan-date="${esc(record.mapping[0].date)}">${esc(record.plan.planName)}</button> <small class="subtle">${record.mapping[0].date} → ${record.mapping[record.mapping.length - 1].date} · ${record.mapping.length} 个执行日</small></p>`).join('') : '<p class="subtle">还没有导入多日计划。</p>');
  }
  records.addEventListener('click', event => { const button = event.target.closest('[data-plan-date]'); if (button) A.selectDate(button.dataset.planDate); });
  document.addEventListener('todaywork:render', renderRecords); renderRecords();
})();
