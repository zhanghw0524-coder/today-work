(function () {
  'use strict';
  const status = document.getElementById('pwa-status');
  const button = document.getElementById('pwa-install');
  const standalone = matchMedia('(display-mode: standalone)');
  let pendingPrompt = null;
  function installed() { return standalone.matches || navigator.standalone === true; }
  function refreshButton() { button.hidden = !pendingPrompt || installed(); }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); pendingPrompt = event; refreshButton();
  });
  window.addEventListener('appinstalled', () => { pendingPrompt = null; refreshButton(); });
  standalone.addEventListener('change', refreshButton);
  button.addEventListener('click', async () => {
    const prompt = pendingPrompt;
    if (!prompt || installed()) return;
    pendingPrompt = null; button.hidden = true;
    try { await prompt.prompt(); await prompt.userChoice; }
    catch { status.textContent = '暂时无法显示安装窗口，也可以使用浏览器菜单中的安装入口。'; }
  });
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  new MutationObserver(() => { themeMeta.content = document.documentElement.dataset.theme === 'dark' ? '#17181d' : '#4f46e5'; }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  themeMeta.content = document.documentElement.dataset.theme === 'dark' ? '#17181d' : '#4f46e5';
  if (location.protocol === 'file:') {
    status.textContent = '当前为文件打开模式。任务可正常使用；安装和离线缓存请使用固定本地网址或 HTTPS 网站。';
    status.dataset.state = 'file'; return;
  }
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    status.textContent = '此环境暂不支持安装和离线缓存。请使用 HTTPS 或本机 localhost 地址。';
    status.dataset.state = 'unsupported'; return;
  }
  navigator.serviceWorker.register(new URL('../service-worker.js', document.currentScript.src), { updateViaCache: 'none' }).then(registration => {
    function readWorkerVersion() {
      const worker = navigator.serviceWorker.controller;
      if (!worker) return;
      const channel = new MessageChannel();
      const cleanup = setTimeout(() => { channel.port1.close(); }, 3000);
      channel.port1.onmessage = event => { status.dataset.cacheVersion = event.data.version; clearTimeout(cleanup); channel.port1.close(); };
      worker.postMessage({ type: 'TODAY_WORK_VERSION' }, [channel.port2]);
    }
    navigator.serviceWorker.ready.then(() => {
      status.textContent = '离线资源已就绪 · 可离线打开并使用本地功能。'; status.dataset.state = 'ready';
      readWorkerVersion();
    });
    navigator.serviceWorker.addEventListener('controllerchange', readWorkerVersion);
    function showUpdate() {
      if (registration.waiting && navigator.serviceWorker.controller) status.textContent = '新版本已准备好，关闭所有 Today Work 窗口后重新打开即可更新。';
    }
    showUpdate();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', showUpdate);
    });
    // Check the worker file, without interrupting work or forcing a page reload.
    registration.update().catch(() => {});
  }).catch(error => {
    status.textContent = '离线资源暂未准备好，请联网刷新后重试。当前本地数据保持不变。'; status.dataset.state = 'error';
    console.error('Today Work 离线注册失败：', error);
  });
})();
