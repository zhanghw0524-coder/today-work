(function () {
  'use strict';
  const A = window.TodayWorkApp, D = window.TodayWorkDeletions;
  const $ = id => document.getElementById(id), esc = A.escape;
  let menuRequest = null, candidate = null, busy = false;
  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="item-actions-dialog" class="edit-dialog item-actions-dialog" aria-labelledby="item-actions-title"><div class="dialog-header"><h2 id="item-actions-title">操作</h2><button class="icon-button" data-deletion-close="item-actions-dialog" aria-label="关闭操作菜单">×</button></div><p id="item-actions-name"></p><button id="item-action-edit" class="secondary-button action-menu-button">编辑</button><button id="item-action-delete" class="secondary-button action-menu-button delete-menu-button">删除</button><button class="text-button" data-deletion-close="item-actions-dialog">取消</button></dialog>
    <dialog id="deletion-dialog" class="edit-dialog wide-dialog" aria-labelledby="deletion-title"><div class="dialog-header"><h2 id="deletion-title"></h2><button class="icon-button" data-deletion-close="deletion-dialog" aria-label="关闭删除确认">×</button></div><p id="deletion-name" class="deletion-name"></p><p id="deletion-summary"></p><fieldset id="deletion-choices"></fieldset><label id="deletion-all-row" class="checkbox-field" hidden><input id="deletion-all-ack" type="checkbox">我确认同时删除所有关联任务，包括历史和已完成记录</label><p id="deletion-error" class="form-error" role="status"></p><p class="notice">删除会立即保存并重新计算统计。可通过页面上方“撤销删除”或“设置 → 最近删除”恢复，刷新后仍可撤销。</p><div class="dialog-actions"><button class="secondary-button" data-deletion-close="deletion-dialog">取消</button><button id="deletion-confirm" class="primary-button danger-button">确认删除</button></div></dialog>
    <dialog id="clear-deletions-dialog" class="edit-dialog" aria-labelledby="clear-deletions-title"><div class="dialog-header"><h2 id="clear-deletions-title">永久清理最近删除？</h2></div><p>将清理全部撤销副本，之后不能再撤销这些删除。当前任务、分类、计划和其他数据不受影响。建议先导出完整备份。</p><div class="dialog-actions"><button class="secondary-button" data-deletion-close="clear-deletions-dialog">取消</button><button id="clear-deletions-confirm" class="primary-button danger-button">永久清理撤销副本</button></div></dialog>`);
  const notice = document.createElement('section'); notice.id = 'undo-notice'; notice.className = 'undo-notice'; notice.setAttribute('aria-label', '删除后的恢复'); notice.hidden = true;
  const postponeButton = document.createElement('button'); postponeButton.id = 'item-action-postpone'; postponeButton.className = 'secondary-button action-menu-button'; postponeButton.textContent = '推迟任务…'; $('item-action-edit').after(postponeButton);
  document.body.insertAdjacentHTML('beforeend', '<dialog id="postpone-dialog" class="edit-dialog" aria-labelledby="postpone-title"><form id="postpone-form"><h2 id="postpone-title">推迟未完成任务</h2><p>仅移动这一次未完成任务，来源关联保留，不顺延整个计划，不改动已完成历史；目标日期的预算请自行核对。</p><label>安排到日期<input id="postpone-date" type="date" min="1900-01-01" max="9999-12-31" required></label><p id="postpone-error" class="form-error" role="status"></p><div class="dialog-actions"><button type="button" id="postpone-cancel" class="secondary-button">取消</button><button type="submit" class="primary-button">确认推迟</button></div></form></dialog>');
  let postponeRequest = null;
  postponeButton.addEventListener('click', () => {
    if (!menuRequest) return; postponeRequest = { ...menuRequest }; $('item-actions-dialog').close();
    $('postpone-date').value = window.StudyStorage.shiftDate(postponeRequest.date, 1); $('postpone-error').textContent = ''; $('postpone-dialog').showModal();
  });
  $('postpone-cancel').addEventListener('click', () => $('postpone-dialog').close());
  $('postpone-form').addEventListener('submit', event => {
    event.preventDefault(); if (!postponeRequest || busy) return; busy = true;
    const saved = A.mutate(next => window.TodayWorkModels.postponeTask(next, postponeRequest.date, postponeRequest.taskId, $('postpone-date').value)); busy = false;
    if (saved) { const date = $('postpone-date').value; postponeRequest = null; $('postpone-dialog').close(); A.selectDate(date); A.toast('任务已推迟，来源关联保留。'); } else $('postpone-error').textContent = '未推迟，请查看页面保存提示。';
  });
  $('storage-warning').after(notice);
  const recent = document.createElement('section'); recent.className = 'settings-section'; recent.id = 'recent-deletions'; $('settings-view').append(recent);
  document.querySelectorAll('[data-deletion-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.deletionClose).close()));
  function openMenu(request) {
    try {
      const info = D.describe(A.getData(), request, A.getToday()); menuRequest = request;
      $('item-actions-title').textContent = request.type === 'task' ? '任务操作' : '分类操作';
      $('item-actions-name').textContent = info.label;
      $('item-action-edit').textContent = request.type === 'task' ? '编辑任务' : '重命名分类';
      $('item-action-delete').textContent = request.type === 'task' ? '删除任务' : '删除分类';
      postponeButton.hidden = request.type !== 'task' || !!info.done;
      $('item-actions-dialog').showModal();
    } catch (error) { A.toast(error.message); }
  }
  $('item-actions-dialog').addEventListener('close', () => { menuRequest = null; });
  $('item-action-edit').addEventListener('click', () => {
    const request = menuRequest; if (!request) return;
    $('item-actions-dialog').close();
    A.openEditor(request.type === 'task' ? 'edit-task' : 'rename-category', request.categoryId, request.taskId);
  });
  $('item-action-delete').addEventListener('click', () => {
    const request = menuRequest; if (!request) return;
    $('item-actions-dialog').close(); openConfirmation(request);
  });
  function openConfirmation(request) {
    try {
      const info = D.describe(A.getData(), request, A.getToday()); candidate = { request, signature: info.signature };
      $('deletion-error').textContent = ''; $('deletion-name').textContent = info.label;
      $('deletion-all-ack').checked = false; $('deletion-all-row').hidden = true; $('deletion-confirm').disabled = false;
      $('deletion-title').textContent = { task: '删除这项任务？', category: '删除这个分类？', plan: '删除整个计划？' }[request.type];
      const radio = (value, title, description, checked = false) => `<label class="deletion-choice"><input type="radio" name="deletion-mode" value="${value}" ${checked ? 'checked' : ''}><span><strong>${title}</strong><small>${description}</small></span></label>`;
      if (request.type === 'task') {
        $('deletion-summary').textContent = `仅删除 ${request.date} 的这一次任务记录${info.done ? '（已完成）' : ''}。其他日期的任务及原计划保持不变。`;
        $('deletion-choices').innerHTML = '';
      } else if (request.type === 'category') {
        $('deletion-summary').textContent = `${request.date} · 分类内 ${info.linked.length} 项任务，其中 ${info.done} 项已完成。${info.label.trim() === '未分类' && info.linked.length ? '保留任务时仍需要“未分类”容器，会建立新的未分类容器。' : ''}`;
        $('deletion-choices').innerHTML = `<legend>分类内任务如何处理</legend>${radio('keep', '保留任务，移到“未分类”', '默认选项。完成状态、备注和来源计划关联均保留。', true)}${radio('delete', '同时删除其中任务', `删除此日期分类内全部 ${info.linked.length} 项任务，包括已完成任务。`)}`;
      } else {
        $('deletion-summary').textContent = `关联 ${info.linked.length} 条任务记录（${info.logical} 项原始任务，含手动转入的记录），其中 ${info.done} 条已完成，今日及以后未完成 ${info.pending.length} 条。`;
        $('deletion-choices').innerHTML = `<legend>关联任务如何处理</legend>${radio('keep', '删除计划，保留全部任务', `保留 ${info.linked.length} 条记录及完成状态，解除来源计划关联。`, true)}${radio('pending', '同时删除今日及以后未完成任务', `删除 ${info.pending.length} 条待办，保留 ${info.linked.length - info.pending.length} 条历史或已完成记录并解除关联。`)}${radio('all', '同时删除全部关联任务', `删除全部 ${info.linked.length} 条记录，包含历史和 ${info.done} 条已完成记录。`)}`;
      }
      $('deletion-choices').hidden = request.type === 'task'; $('deletion-dialog').showModal();
    } catch (error) { A.toast(error.message); }
  }
  function updateConfirmation() {
    const all = candidate?.request.type === 'plan' && document.querySelector('[name="deletion-mode"]:checked')?.value === 'all';
    $('deletion-all-row').hidden = !all; $('deletion-confirm').disabled = busy || (all && !$('deletion-all-ack').checked);
  }
  $('deletion-choices').addEventListener('change', () => { $('deletion-all-ack').checked = false; updateConfirmation(); });
  $('deletion-all-ack').addEventListener('change', updateConfirmation);
  $('deletion-dialog').addEventListener('close', () => { candidate = null; });
  $('deletion-confirm').addEventListener('click', () => {
    if (!candidate || busy || $('deletion-confirm').disabled) return;
    busy = true; updateConfirmation();
    const { request, signature } = candidate; let entry;
    const saved = A.mutate(next => { entry = D.execute(next, request, { expected: signature, today: A.getToday(), mode: document.querySelector('[name="deletion-mode"]:checked')?.value }); });
    busy = false;
    if (saved) {
      candidate = null;
      // Hold the completed dialog until the user leaves it; rapid double clicks cannot reach tasks underneath.
      $('deletion-title').textContent = '删除已保存'; $('deletion-summary').textContent = `已删除 ${entry.removedCount} 条任务记录${entry.movedCount ? `，${entry.movedCount} 项已移到未分类` : ''}${entry.detachedCount ? `，保留 ${entry.detachedCount} 条任务并解除关联` : ''}。关闭后可撤销。`;
      $('deletion-choices').hidden = true; $('deletion-all-row').hidden = true; $('deletion-confirm').disabled = true;
      $('deletion-confirm').textContent = '已删除'; $('deletion-dialog').querySelector('.dialog-actions [data-deletion-close]').textContent = '完成';
    } else { $('deletion-error').textContent = `未完成删除，原记录未被覆盖：${A.getLastError()}。若其他窗口改动了关联任务，请取消并重新打开确认。`; updateConfirmation(); }
  });
  function undo(id) {
    if (busy) return; busy = true;
    const saved = A.mutate(next => D.undo(next, id)); busy = false;
    if (saved) A.toast('已撤销删除，任务、分类及计划关联已恢复。');
  }
  function render() {
    const entries = A.getData().deletions || [], last = entries[entries.length - 1];
    notice.hidden = !last;
    notice.innerHTML = last ? `<div><strong>已删除：${esc(last.label)}</strong><small>已保存 · 刷新后仍可撤销</small></div><div class="button-row"><button class="secondary-button" data-undo="${esc(last.id)}">撤销删除</button><button class="text-button" data-recent-deletions>查看最近删除</button></div>` : '';
    recent.innerHTML = `<h2>最近删除</h2><p class="subtle">任务、分类与导入计划的撤销副本保存在本地，并纳入完整备份。最多保留 ${D.LIMIT} 次删除，不自动丢弃副本。若恢复存在冲突，请先撤销较新的操作。</p>${entries.length ? `<details><summary>查看 ${entries.length} 条可撤销删除</summary>${entries.slice().reverse().map(entry => `<div class="deleted-record"><div><strong>${esc(entry.label)}</strong><small>${{ task: '任务', category: '分类', plan: '计划' }[entry.type]} · ${esc(new Date(entry.deletedAt).toLocaleString('zh-CN'))} · 删除 ${entry.removedTasks.length} 条任务${entry.movedTasks.length ? ` · 移动 ${entry.movedTasks.length} 条` : ''}</small></div><button class="secondary-button" data-undo="${esc(entry.id)}">撤销</button></div>`).join('')}</details><button class="text-button delete-menu-button" data-clear-deletions>清理全部撤销副本…</button>` : '<p class="subtle">暂无可撤销的删除。</p>'}`;
    // Plan records are rendered by plan-ui before this listener runs.
    for (const row of document.querySelectorAll('#imported-plans [data-plan-row]')) {
      if (row.querySelector('[data-delete-plan]')) continue;
      const button = document.createElement('button'); button.className = 'text-button delete-menu-button'; button.textContent = '删除计划'; button.dataset.deletePlan = row.dataset.planRow; row.append(button);
    }
  }
  function click(event) {
    const restore = event.target.closest('[data-undo]'), removePlan = event.target.closest('[data-delete-plan]');
    if (restore) undo(restore.dataset.undo);
    if (removePlan) openConfirmation({ type: 'plan', planId: removePlan.dataset.deletePlan });
    if (event.target.closest('[data-recent-deletions]')) { A.switchView('settings'); document.querySelector('#recent-deletions details')?.setAttribute('open', ''); $('recent-deletions').scrollIntoView({ block: 'start', behavior: 'instant' }); }
    if (event.target.closest('[data-clear-deletions]')) $('clear-deletions-dialog').showModal();
  }
  document.addEventListener('click', click);
  $('clear-deletions-confirm').addEventListener('click', () => { if (A.mutate(next => { next.deletions = []; }, { tasks: false })) $('clear-deletions-dialog').close(); });
  window.TodayWorkDeleteUI = { openMenu, openConfirmation };
  $('deletion-dialog').addEventListener('close', () => {
    $('deletion-confirm').textContent = '确认删除'; $('deletion-dialog').querySelector('.dialog-actions [data-deletion-close]').textContent = '取消';
  });
  document.addEventListener('todaywork:render', render); render();
})();
