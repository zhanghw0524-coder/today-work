(function () {
  'use strict';
  const A = window.TodayWorkApp, B = window.TodayWorkAssets;
  const $ = id => document.getElementById(id);
  const quotes = ['每天前进一点点。', '把计划，变成今天要做的事。', '不必一次完成，先开始一步。', '今天的行动，会成为明天的底气。', '按自己的节奏，持续向前。', '先完成今天，再考虑远方。'];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let quoteIndex = 0, quoteSignature = '', draft = null, draftSide = '', uploading = false, uploadToken = 0;
  const cache = new Map(), cards = {};
  const getSettings = () => B.appearance(A.getData().settings.personalization);
  for (const [side, selector] of [['left', '.goal-box'], ['right', '.focus-card']]) {
    const card = document.querySelector(selector), copy = document.createElement('div'), image = document.createElement('img');
    copy.className = 'card-copy'; copy.append(...card.childNodes);
    image.className = 'personal-card-image'; image.alt = side === 'left' ? '左侧自定义卡片' : '右侧自定义卡片'; image.hidden = true;
    card.append(image, copy); cards[side] = { card, image, copy, token: 0 };
  }
  document.querySelector('#settings-view .settings-section h2').textContent = '外观与个性化';
  const section = document.createElement('div'); section.className = 'personalization-settings';
  section.innerHTML = `<h3>首页顶部短句</h3><label class="checkbox-field"><input id="quote-rotate" type="checkbox">每 8 秒轮播短句</label><label>固定短句 / 轮播起始句<select id="quote-fixed">${quotes.map((quote, index) => `<option value="${index}">${quote}</option>`).join('')}</select></label><p class="subtle">关闭轮播后固定显示所选短句。系统开启“减少动态效果”时也会固定显示。</p><h3>励志卡片</h3><div class="card-settings-grid">${['left', 'right'].map(side => `<section class="card-setting"><h4>${side === 'left' ? '左侧励志卡片' : '右侧日历下方卡片'}</h4><label>显示方式<select id="card-${side}-mode" data-card-mode="${side}"><option value="default">默认卡片</option><option value="image">自定义图片</option><option value="hidden">隐藏</option></select></label><div class="button-row"><button class="secondary-button" data-card-upload="${side}">选择 / 更换图片</button><button class="text-button" data-card-adjust="${side}">调整图片</button><button class="text-button" data-card-reset="${side}">恢复默认</button></div><input id="card-${side}-file" class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="${side === 'left' ? '左侧' : '右侧'}卡片图片文件"><p id="card-${side}-status" class="subtle" role="status"></p></section>`).join('')}</div><p class="subtle">图片仅保存在本地 IndexedDB。支持 JPG、PNG、WebP，原图 ≤15MB；自动缩至最长边 1600px、压缩后约 ≤512KiB。两张卡片独立设置，图片不会拉伸。手机优先展示任务，侧栏卡片沿用默认的隐藏方式。</p>`;
  document.querySelector('#settings-view .settings-section').append(section);
  document.body.insertAdjacentHTML('beforeend', `<dialog id="card-image-dialog" class="edit-dialog wide-dialog" aria-labelledby="card-image-title"><div class="dialog-header"><h2 id="card-image-title">预览与裁剪位置</h2><button id="card-image-close" class="icon-button" aria-label="关闭图片预览">×</button></div><div id="card-image-preview" class="image-crop-preview"><img id="card-image-crop" alt="卡片图片裁剪预览"><div id="card-image-overlay"></div></div><label>水平裁剪位置<input id="card-image-x" type="range" min="0" max="100" value="50"></label><label>垂直裁剪位置<input id="card-image-y" type="range" min="0" max="100" value="50"></label><label class="checkbox-field"><input id="card-image-text" type="checkbox">叠加原卡片文案</label><p class="subtle">图片保持比例，超出卡片的部分裁掉。滑动位置后检查预览，确认前不会更改当前卡片。</p><p id="card-image-error" class="form-error" role="status"></p><div class="dialog-actions"><button id="card-image-cancel" class="secondary-button">取消</button><button id="card-image-save" class="primary-button">确认保存图片</button></div></dialog>`);
  function updateSettings(change) {
    return A.mutate(next => { const settings = B.appearance(next.settings.personalization); change(settings); next.settings.personalization = settings; }, { tasks: false });
  }
  $('quote-rotate').addEventListener('change', () => updateSettings(settings => { settings.rotate = $('quote-rotate').checked; }));
  $('quote-fixed').addEventListener('change', () => updateSettings(settings => { settings.fixed = Number($('quote-fixed').value); }));
  function updateQuote(animate = false) {
    const settings = getSettings();
    const signature = `${settings.rotate}:${settings.fixed}:${motion.matches}`;
    if (signature !== quoteSignature) { quoteIndex = settings.fixed; quoteSignature = signature; }
    if (A.getView() !== 'today') return;
    const heading = $('page-title');
    if (heading.textContent === quotes[quoteIndex]) return;
    heading.textContent = quotes[quoteIndex];
    if (animate && !motion.matches) heading.animate?.([{ opacity: 0.35, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 450, easing: 'ease-out' });
  }
  setInterval(() => {
    const settings = getSettings();
    if (A.getView() !== 'today' || document.hidden || !settings.rotate || motion.matches) return;
    quoteIndex = (quoteIndex + 1) % quotes.length; updateQuote(true);
  }, 8000);
  motion.addEventListener('change', () => updateQuote());
  async function renderCard(side, settings) {
    const { card, image } = cards[side]; const token = ++cards[side].token;
    card.hidden = settings.mode === 'hidden';
    card.classList.toggle('custom-card', settings.mode === 'image'); card.classList.toggle('card-with-copy', settings.mode === 'image' && settings.overlay);
    image.hidden = settings.mode !== 'image';
    if (settings.mode !== 'image') { image.removeAttribute('src'); return; }
    image.style.objectPosition = `${settings.x}% ${settings.y}%`;
    try {
      const asset = cache.get(settings.assetId) || await B.get(settings.assetId);
      if (cards[side].token !== token) return;
      if (!asset) throw new Error('图片记录暂时不可读取，请重试或重新选择。');
      B.validateAsset(asset); cache.set(settings.assetId, asset); image.src = asset.dataUrl;
    } catch (error) {
      if (cards[side].token !== token) return;
      image.hidden = true; card.classList.remove('custom-card', 'card-with-copy');
      $(`card-${side}-status`).textContent = `图片未显示：${error.message}`;
    }
  }
  function render() {
    const settings = getSettings(); updateQuote();
    $('quote-rotate').checked = settings.rotate; $('quote-fixed').value = String(settings.fixed);
    for (const side of ['left', 'right']) {
      const card = settings.cards[side]; $(`card-${side}-mode`).value = card.mode;
      $(`card-${side}-status`).textContent = card.mode === 'image' ? '自定义图片 · 已保存到本地' : card.mode === 'hidden' ? '已隐藏' : '默认设计';
      section.querySelector(`[data-card-adjust="${side}"]`).disabled = card.mode !== 'image';
      renderCard(side, card);
    }
  }
  function previewCrop() {
    $('card-image-crop').style.objectPosition = `${$('card-image-x').value}% ${$('card-image-y').value}%`;
    $('card-image-overlay').hidden = !$('card-image-text').checked;
  }
  function openPreview(side, asset, settings = {}) {
    draftSide = side; draft = asset;
    $('card-image-title').textContent = `${side === 'left' ? '左侧' : '右侧'}卡片 · 预览与裁剪`;
    $('card-image-crop').src = asset.dataUrl;
    $('card-image-x').value = settings.x ?? 50; $('card-image-y').value = settings.y ?? 50; $('card-image-text').checked = settings.overlay ?? false;
    $('card-image-preview').dataset.side = side;
    $('card-image-overlay').replaceChildren(cards[side].copy.cloneNode(true));
    $('card-image-error').textContent = ''; $('card-image-save').disabled = false;
    previewCrop(); $('card-image-dialog').showModal();
  }
  for (const id of ['card-image-x', 'card-image-y', 'card-image-text']) $(id).addEventListener('input', previewCrop);
  for (const id of ['card-image-close', 'card-image-cancel']) $(id).addEventListener('click', () => { if (!uploading) $('card-image-dialog').close(); });
  $('card-image-dialog').addEventListener('cancel', event => { if (uploading) event.preventDefault(); });
  $('card-image-dialog').addEventListener('close', () => { draft = null; $('card-image-crop').removeAttribute('src'); });
  section.addEventListener('click', async event => {
    const upload = event.target.closest('[data-card-upload]'), reset = event.target.closest('[data-card-reset]'), adjust = event.target.closest('[data-card-adjust]');
    if (upload) { const input = $(`card-${upload.dataset.cardUpload}-file`); input.value = ''; input.click(); }
    if (reset) updateSettings(settings => { settings.cards[reset.dataset.cardReset] = B.defaults().cards[reset.dataset.cardReset]; });
    if (adjust) {
      const side = adjust.dataset.cardAdjust, settings = getSettings().cards[side];
      try { const asset = await B.get(settings.assetId); if (!asset) throw new Error('图片未找到，请重新选择。'); openPreview(side, asset, settings); }
      catch (error) { A.toast(error.message); }
    }
  });
  section.addEventListener('change', event => {
    const side = event.target.dataset.cardMode;
    if (!side) return;
    const mode = event.target.value;
    if (mode === 'image') {
      const current = getSettings().cards[side];
      if (current.mode !== 'image') { event.target.value = current.mode; A.toast('请先选择图片，预览确认后保存。'); $(`card-${side}-file`).click(); }
    } else updateSettings(settings => { settings.cards[side] = { ...B.defaults().cards[side], mode }; });
  });
  for (const side of ['left', 'right']) $(`card-${side}-file`).addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    const token = ++uploadToken;
    $(`card-${side}-status`).textContent = '正在本地压缩图片…';
    try {
      const asset = await B.compress(file);
      if (token !== uploadToken) return;
      $(`card-${side}-status`).textContent = `压缩完成 · ${asset.width} × ${asset.height} · ${Math.ceil(asset.dataUrl.length * 0.75 / 1024)} KiB，确认后保存`;
      openPreview(side, asset);
    } catch (error) { if (token === uploadToken) $(`card-${side}-status`).textContent = error.message; }
  });
  $('card-image-save').addEventListener('click', async () => {
    if (!draft || uploading) return;
    uploading = true; $('card-image-save').disabled = true;
    const asset = { ...draft, id: window.StudyStorage.uid() }, side = draftSide;
    const settings = { mode: 'image', assetId: asset.id, x: Number($('card-image-x').value), y: Number($('card-image-y').value), overlay: $('card-image-text').checked };
    try {
      await B.put(asset);
      if (!updateSettings(value => { value.cards[side] = settings; })) {
        await B.remove(asset.id).catch(() => {}); throw new Error('卡片设置未保存，原卡片保持不变，请检查存储空间后重试。');
      }
      cache.set(asset.id, asset); $('card-image-dialog').close(); A.toast('图片与裁剪位置已保存到本地。');
    } catch (error) { $('card-image-error').textContent = error.message; }
    finally { uploading = false; $('card-image-save').disabled = false; }
  });
  document.addEventListener('todaywork:render', render); render();
})();
