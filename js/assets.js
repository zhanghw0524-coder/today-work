(function (global) {
  'use strict';
  const S = global.StudyStorage;
  const MAX_DATA = 700000;
  const cardDefault = () => ({ mode: 'default', assetId: null, x: 50, y: 50, overlay: false });
  function defaults() { return { rotate: true, fixed: 0, cards: { left: cardDefault(), right: cardDefault() } }; }
  function appearance(value) {
    if (value === undefined) return defaults();
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('个性化设置格式无效。');
    const result = defaults();
    if (value.rotate !== undefined && typeof value.rotate !== 'boolean') throw new Error('短句轮播设置无效。');
    if (value.fixed !== undefined && (!Number.isInteger(value.fixed) || value.fixed < 0 || value.fixed > 5)) throw new Error('固定短句设置无效。');
    result.rotate = value.rotate ?? true; result.fixed = value.fixed ?? 0;
    if (value.cards !== undefined && (!value.cards || typeof value.cards !== 'object' || Array.isArray(value.cards))) throw new Error('卡片设置无效。');
    for (const side of ['left', 'right']) {
      const card = value.cards?.[side];
      if (card === undefined) continue;
      if (!card || !['default', 'image', 'hidden'].includes(card.mode)) throw new Error('卡片模式无效。');
      if (card.mode === 'image' && (typeof card.assetId !== 'string' || !card.assetId || card.assetId.length > 150)) throw new Error('图片关联无效。');
      for (const key of ['x', 'y']) if (card[key] !== undefined && (!Number.isFinite(card[key]) || card[key] < 0 || card[key] > 100)) throw new Error('图片裁剪位置无效。');
      if (card.overlay !== undefined && typeof card.overlay !== 'boolean') throw new Error('卡片文案设置无效。');
      result.cards[side] = { mode: card.mode, assetId: card.mode === 'image' ? card.assetId : null, x: card.x ?? 50, y: card.y ?? 50, overlay: card.overlay ?? false };
    }
    return result;
  }
  const idsFor = data => [...new Set(Object.values(appearance(data.settings?.personalization).cards).filter(card => card.mode === 'image').map(card => card.assetId))];
  function validateAsset(asset) {
    if (!asset || typeof asset.id !== 'string' || !asset.id || asset.id.length > 150 || typeof asset.dataUrl !== 'string' || asset.dataUrl.length > MAX_DATA || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(asset.dataUrl) || !Number.isInteger(asset.width) || !Number.isInteger(asset.height) || asset.width < 1 || asset.height < 1 || asset.width > 1600 || asset.height > 1600) throw new Error('备份图片无效或超过大小限制。');
    return asset;
  }
  function validateBackup(data, assets = {}) {
    if (!assets || typeof assets !== 'object' || Array.isArray(assets) || Object.keys(assets).length > 2) throw new Error('备份图片集合无效。');
    const ids = idsFor(data);
    if (Object.keys(assets).some(id => !ids.includes(id))) throw new Error('备份含未关联的图片。');
    for (const id of ids) { if (!Object.hasOwn(assets, id) || validateAsset(assets[id]).id !== id) throw new Error('备份缺少卡片图片，恢复已取消。'); }
    return assets;
  }
  let databasePromise;
  function database() {
    if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
      if (!global.indexedDB) { reject(new Error('浏览器未开放图片存储，请检查本地存储权限。')); return; }
      const request = global.indexedDB.open('today-work-images', 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('images')) request.result.createObjectStore('images', { keyPath: 'id' }); };
      request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); databasePromise = null; }; resolve(db); };
      request.onerror = () => reject(request.error || new Error('无法打开图片存储。'));
      request.onblocked = () => reject(new Error('图片存储升级被其他窗口阻止，请关闭其他 Today Work 窗口后重试。'));
    }).catch(error => { databasePromise = null; throw error; });
    return databasePromise;
  }
  async function transaction(mode, operation) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('images', mode); let output;
      tx.oncomplete = () => resolve(output);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error('图片存储失败，原设置已保留。'));
      try {
        const request = operation(tx.objectStore('images'));
        if (request) request.onsuccess = () => { output = request.result; };
      } catch (error) { tx.abort(); reject(error); }
    });
  }
  const get = id => transaction('readonly', store => store.get(id));
  const put = asset => transaction('readwrite', store => store.put(validateAsset(asset)));
  const remove = id => transaction('readwrite', store => store.delete(id));
  function decode(url) {
    return new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('无法读取图片，请选择有效的 JPG、PNG 或 WebP。')); image.src = url;
    });
  }
  async function compress(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('仅支持 JPG、PNG、WebP 图片。');
    if (file.size > 15 * 1024 * 1024) throw new Error('原图不能超过 15MB，请先缩小图片。');
    const url = URL.createObjectURL(file);
    try {
      const image = await decode(url);
      if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 40000000) throw new Error('图片像素过大，请先缩小到 4000 万像素以内。');
      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d'); if (!context) throw new Error('当前浏览器不支持图片处理。');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let dataUrl;
      for (const quality of [0.85, 0.7, 0.5, 0.3]) { dataUrl = canvas.toDataURL('image/webp', quality); if (dataUrl.length <= MAX_DATA) break; }
      // Older browsers can fall back to PNG; retry as JPEG against a neutral background.
      if (dataUrl.length > MAX_DATA) {
        context.globalCompositeOperation = 'destination-over'; context.fillStyle = '#f4f3f8'; context.fillRect(0, 0, canvas.width, canvas.height);
        dataUrl = canvas.toDataURL('image/jpeg', 0.65);
      }
      if (dataUrl.length > MAX_DATA) throw new Error('压缩后的图片仍过大，请选择更简单或更小的图片。');
      return validateAsset({ id: S.uid(), dataUrl, width: canvas.width, height: canvas.height });
    } finally { URL.revokeObjectURL(url); }
  }
  async function exportFor(data) {
    const assets = {};
    for (const id of idsFor(data)) {
      const asset = await get(id); if (!asset) throw new Error('一张自定义卡片图片暂时不可读取，未生成不完整备份。请重试或恢复该卡片默认样式。');
      Object.defineProperty(assets, id, { value: validateAsset(asset), enumerable: true });
    }
    return assets;
  }
  async function backup(data, exportedAt) {
    const result = S.backup(data, exportedAt); result.imageAssets = await exportFor(data); return result;
  }
  async function restore(candidate) {
    validateBackup(candidate.data, candidate.imageAssets);
    const next = JSON.parse(JSON.stringify(candidate.data)), staged = [];
    try {
      // New immutable IDs keep the currently displayed images intact until localStorage commits.
      for (const oldId of idsFor(next)) {
        const asset = candidate.imageAssets[oldId];
        const image = await decode(asset.dataUrl);
        if (image.naturalWidth !== asset.width || image.naturalHeight !== asset.height) throw new Error('备份图片尺寸与内容不一致。');
        const id = S.uid(); await put({ ...asset, id }); staged.push(id);
        for (const card of Object.values(next.settings.personalization.cards)) if (card.assetId === oldId) card.assetId = id;
      }
      const previous = S.restore(next);
      return { data: next, previous };
    } catch (error) {
      await Promise.allSettled(staged.map(remove)); throw error;
    }
  }
  global.TodayWorkAssets = { defaults, appearance, idsFor, validateAsset, validateBackup, get, put, remove, compress, backup, restore, MAX_DATA };
})(globalThis);
