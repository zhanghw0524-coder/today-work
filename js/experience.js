(function () {
  'use strict';
  const A = window.TodayWorkApp, S = window.StudyStorage, Sound = window.TodayWorkSounds;
  const $ = id => document.getElementById(id), esc = A.escape, mobile = matchMedia('(max-width: 720px)');
  const plans = document.createElement('section'); plans.id = 'plans-view'; plans.className = 'view'; plans.hidden = true;
  plans.innerHTML = `<div class="plan-entry-grid"><article class="plan-entry-card"><span class="eyebrow">从目标开始</span><h2>生成新计划</h2><p>还没有具体安排？填写目标，复制提示词到你常用的 AI。</p><button class="primary-button" data-plan-entry="open-ai-prompt">开始制定计划</button></article><article class="plan-entry-card"><span class="eyebrow">接着原来的讨论</span><h2>转换已有计划</h2><p>已经和 AI 聊好了？让原对话整理格式，保留内容和约束。</p><button class="secondary-button" data-plan-entry="open-plan-convert">复制转换提示词</button></article></div><section class="record-panel plan-next-step"><h2>已经拿到 AI 的结果？</h2><p>粘贴后检查任务、日期和每日预算。确认前可修改，现有任务不会被覆盖。</p><button class="primary-button" data-plan-entry="open-full-plan">粘贴 AI 结果，预览导入</button><details class="plan-help"><summary>查看完整步骤</summary><ol><li>在这里生成提示词，或转换已有讨论。</li><li>自行发送到外部 AI，复制它返回的结果。</li><li>回到 TW 粘贴，检查预览并确认导入。</li></ol><p>TW 不连接 AI，无需 API Key。</p></details></section><details class="record-panel plan-tools"><summary>已有计划与更多工具</summary><div class="button-row"><button class="secondary-button" data-work-view="settings">管理已导入计划</button><button class="secondary-button" data-work-view="routes">学习路线</button><button class="secondary-button" data-work-view="leetcode">刷题记录</button><button class="secondary-button" data-work-view="history">历史记录</button><button class="text-button" data-plan-entry="open-plan-import">兼容旧版单日导入</button></div></details>`;
  $('today-view').after(plans);
  const desktopPlans = document.createElement('button'); desktopPlans.className = 'nav-item'; desktopPlans.innerHTML = '<span aria-hidden="true">◇</span>计划'; desktopPlans.dataset.workView = 'plans';
  document.querySelector('.sidebar [data-view="today"]')?.after(desktopPlans);
  const nav = document.createElement('nav'); nav.className = 'mobile-nav'; nav.setAttribute('aria-label', '手机主导航');
  nav.innerHTML = [['today','☑','今天'],['plans','◇','计划'],['stats','◴','进度'],['settings','⚙','设置']].map(([view,icon,label])=>`<button data-work-view="${view}"><span aria-hidden="true">${icon}</span>${label}</button>`).join(''); document.body.append(nav);
  $('stats-view').insertAdjacentHTML('afterbegin','<div class="button-row progress-actions"><button class="secondary-button" data-work-view="history">查看历史记录</button></div>');
  document.addEventListener('click', event => {
    const view = event.target.closest('[data-work-view]'), entry = event.target.closest('[data-plan-entry]');
    if (view) { if (view.dataset.workView === 'today') A.selectDate(A.getToday()); else A.switchView(view.dataset.workView); window.scrollTo({top:0,behavior:'instant'}); }
    if (entry) $(entry.dataset.planEntry).click();
  });
  $('open-ai-prompt').textContent = '生成新计划'; $('open-plan-convert').textContent = '转换已有计划'; $('open-full-plan').textContent = '粘贴 AI 结果';
  const legacy = document.createElement('details'); legacy.className = 'legacy-import'; legacy.innerHTML = '<summary>旧版导入</summary>';
  $('open-plan-import').before(legacy); legacy.append($('open-plan-import'));
  document.querySelector('.daily-progress').after(document.querySelector('.task-tools'));
  const sourceFold=document.createElement('details');sourceFold.id='plan-source-fold';sourceFold.open=true;sourceFold.innerHTML='<summary>粘贴 AI 结果</summary>';
  const sourceLabel=$('full-plan-input').previousElementSibling;sourceLabel.before(sourceFold);sourceFold.append(sourceLabel,$('full-plan-input'));
  const advanced=document.createElement('details');advanced.id='schedule-advanced';advanced.innerHTML='<summary>更多规则：截止日期、任务上限与估算</summary><div class="form-grid"></div>';
  const scheduleSection=document.querySelector('.schedule-settings'),primaryGrid=scheduleSection.querySelector('.form-grid'),extraGrid=advanced.querySelector('.form-grid');
  for(const id of ['schedule-preset','schedule-deadline','schedule-tasks','schedule-default'])extraGrid.append($(id).closest('label'));
  primaryGrid.append($('schedule-minutes').closest('label'));scheduleSection.querySelectorAll('.form-grid').forEach(grid=>{if(!grid.children.length)grid.remove();});advanced.append(scheduleSection.querySelector('p'));scheduleSection.append(advanced);
  $('full-plan-parse').addEventListener('click',()=>{if(!$('full-plan-details').hidden){sourceFold.open=false;sourceFold.querySelector('summary').textContent='查看或修改原始结果';advanced.open=!!$('schedule-deadline').value;$('full-plan-summary').closest('section').scrollIntoView({block:'start',behavior:'instant'});}});
  const resetInputView=()=>{sourceFold.open=true;sourceFold.querySelector('summary').textContent='粘贴 AI 结果';advanced.open=false;};$('open-full-plan').addEventListener('click',resetInputView);$('prompt-to-import').addEventListener('click',resetInputView);
  const hero = document.createElement('div'); hero.className = 'today-hero'; hero.innerHTML = '<div><p id="today-month" class="subtle"></p><h2 id="today-date"></h2></div><button id="quick-add-task" class="primary-button">＋ 添加任务</button>'; $('today-view').prepend(hero);
  document.body.insertAdjacentHTML('beforeend', '<dialog id="quick-task-dialog" class="edit-dialog" aria-labelledby="quick-task-title"><form id="quick-task-form"><div class="dialog-header"><h2 id="quick-task-title">添加任务</h2><button type="button" id="quick-task-close" class="icon-button" aria-label="关闭添加任务">×</button></div><label>要完成什么？<input id="quick-task-name" type="text" maxlength="160" required autocomplete="off"></label><label>分类<select id="quick-task-category"></select></label><p id="quick-task-error" class="form-error" role="status"></p><div class="dialog-actions"><button type="button" id="quick-task-cancel" class="secondary-button">取消</button><button type="submit" class="primary-button">添加到当天</button></div></form></dialog>');
  $('quick-add-task').addEventListener('click', () => {
    const categories = A.getData().days[A.getSelected()]?.categories || [];
    $('quick-task-category').innerHTML = categories.map(category=>`<option value="${esc(category.id)}">${esc(category.name)}</option>`).join('') + '<option value="">未分类</option>';
    $('quick-task-title').textContent = `添加任务 · ${A.getSelected()}`; $('quick-task-name').value = ''; $('quick-task-error').textContent = ''; $('quick-task-dialog').showModal(); $('quick-task-name').focus();
  });
  for (const id of ['quick-task-close','quick-task-cancel']) $(id).addEventListener('click',()=> $('quick-task-dialog').close());
  $('quick-task-form').addEventListener('submit',event=>{
    event.preventDefault(); const title=$('quick-task-name').value.trim(); if(!title){$('quick-task-error').textContent='请输入任务内容。';return;}
    const date=A.getSelected(), id=$('quick-task-category').value;
    if(A.mutate(next=>{const day=next.days[date] ||= {categories:[]}; let category=id?day.categories.find(item=>item.id===id):day.categories.find(item=>item.name==='未分类'); if(id&&!category)throw Error('分类已变化，请重新打开。'); if(!category){category={id:S.uid(),name:'未分类',tasks:[]};day.categories.push(category);}category.tasks.push({id:S.uid(),title,done:false});})) $('quick-task-dialog').close(); else $('quick-task-error').textContent=A.getLastError();
  });
  const calendar = document.querySelector('.calendar-card'), calendarFold = document.createElement('details'); calendarFold.className='calendar-fold';calendarFold.innerHTML='<summary>日历与最近记录</summary>';calendar.before(calendarFold);calendarFold.append(calendar,document.querySelector('.recent-card')); calendarFold.open=!mobile.matches;
  const leftCard=document.querySelector('.goal-box'), leftAnchor=document.createComment('left-card-home');leftCard.before(leftAnchor);
  function arrangeMobile(){ calendarFold.open=!mobile.matches;if(mobile.matches)document.querySelector('.right-column').append(leftCard);else leftAnchor.after(leftCard); }
  mobile.addEventListener('change',arrangeMobile);arrangeMobile();
  function taskDetails(){
    for(const row of document.querySelectorAll('.task-row')){
      const box=row.querySelector('.task-label input'),group=A.getData().days[A.getSelected()]?.categories.find(item=>item.id===box?.dataset.category),task=group?.tasks.find(item=>item.id===box.dataset.task);if(!task)continue;
      const signature=JSON.stringify([task.stage,task.description,task.note,task.resources]);if(row.dataset.detailSignature===signature)continue;row.dataset.detailSignature=signature;row.querySelector('.task-extra')?.remove();
      if(!task.stage&&!task.description&&!task.note&&!task.resources?.length)continue;
      const details=document.createElement('details');details.className='task-extra';const summary=document.createElement('summary');summary.textContent='说明与资源';details.append(summary);
      for(const text of [task.stage?`阶段：${task.stage}`:'',task.description,task.note])if(text){const p=document.createElement('p');p.textContent=text;details.append(p);}
      for(const resource of Array.isArray(task.resources)?task.resources:[]){if(!/^https?:\/\/[^\s<>"']+$/i.test(resource.url))continue;const a=document.createElement('a');a.href=resource.url;a.textContent=resource.title||resource.url;a.target='_blank';a.rel='noopener noreferrer';details.append(a);}
      row.append(details);
    }
  }
  const soundSection=document.createElement('section');soundSection.className='settings-section';soundSection.id='sound-settings';soundSection.dataset.plays='0';
  soundSection.innerHTML='<h2>轻量音效</h2><p class="subtle">默认关闭。仅手动完成任务时提示；最后一项只播放“今日全部完成”，不叠加两种声音。</p><label class="checkbox-field"><input id="sound-enabled" type="checkbox">完成任务时播放音效</label><label class="volume-label">音量 <output id="sound-volume-value">25%</output><input id="sound-volume" type="range" min="0" max="100" step="1" value="25" aria-label="音效音量"></label><div class="button-row"><button class="secondary-button" data-sound-preview="task">试听单条完成</button><button class="secondary-button" data-sound-preview="all">试听今日全部完成</button></div><p id="sound-status" class="subtle" role="status"></p><p class="subtle">声音由本机浏览器生成，无需联网。请按需调整系统音量；后台或锁屏时的播放由浏览器决定。</p>';
  $('settings-view').querySelector('.settings-section').after(soundSection);
  function saveSound(){Sound.player.stop();const value={enabled:$('sound-enabled').checked,volume:Number($('sound-volume').value)/100}; if(!A.mutate(next=>{next.settings.sound=Sound.settings(value);},{tasks:false}))$('sound-status').textContent=A.getLastError();}
  $('sound-enabled').addEventListener('change',saveSound);$('sound-volume').addEventListener('input',()=>{$('sound-volume-value').value=$('sound-volume').value+'%';});$('sound-volume').addEventListener('change',saveSound);
  soundSection.addEventListener('click',async event=>{const button=event.target.closest('[data-sound-preview]');if(!button)return;const ok=await Sound.player.play(button.dataset.soundPreview,{enabled:true,volume:Number($('sound-volume').value)/100},true);$('sound-status').textContent=ok?'已播放试听，可调整音量后再试。':Number($('sound-volume').value)===0?'当前音量为 0，未播放。':'浏览器暂未允许播放，请检查系统静音或稍后重试。任务保存不受影响。';});
  document.addEventListener('todaywork:sound',event=>{soundSection.dataset.plays=String(Number(soundSection.dataset.plays)+1);soundSection.dataset.lastKind=event.detail.kind;});
  function viewport(){const visual=window.visualViewport;document.documentElement.style.setProperty('--visible-height',`${visual?.height||window.innerHeight}px`);}
  window.visualViewport?.addEventListener('resize',viewport);viewport();
  function render(){
    for(const button of document.querySelectorAll('[data-work-view]')){const current=A.getView(),target=button.dataset.workView,active=current===target||(target==='plans'&&['routes','leetcode'].includes(current))||(target==='stats'&&current==='history');button.classList.toggle('active',active);if(button.closest('nav')){if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}}
    const date=S.parseDate(A.getSelected());$('today-month').textContent=date.toLocaleDateString('zh-CN',{year:'numeric',month:'long'});$('today-date').textContent=date.toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'});
    const sound=Sound.settings(A.getData().settings.sound);$('sound-enabled').checked=sound.enabled;if(document.activeElement!==$('sound-volume'))$('sound-volume').value=Math.round(sound.volume*100);$('sound-volume-value').value=Math.round(sound.volume*100)+'%';if(!sound.enabled)Sound.player.stop();
    taskDetails();const empty=document.querySelector('.empty-tasks');if(empty){empty.querySelector('h3').textContent='这一天还没有任务';empty.querySelector('p').textContent='添加一项任务，或从 AI 计划安排这一天。';empty.querySelector('button').className='text-button';}
  }
  document.addEventListener('todaywork:render',render);render();
})();
