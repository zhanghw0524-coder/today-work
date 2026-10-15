# Today Work 正式图标

实色靛蓝 `#4F46E5`，白色 TW 圆头粗线条；W 末笔向右上延伸为完成勾。字标全部由 SVG 路径构成，不依赖字体、图片嵌入或外部资源。

- `logo.svg`：正式矢量母版，侧栏与现代浏览器 favicon 共用。
- `logo-maskable.svg`：独立 maskable 母版，字标围绕中心缩放至 85%，保留裁切安全空间。
- `icon-192.png`、`icon-512.png`：普通 PWA 图标。
- `icon-maskable-192.png`、`icon-maskable-512.png`：独立 maskable PWA 图标，白色字标完全位于中央半径 40% 的安全圆内。
- `apple-touch-icon.png`：180×180 Apple Touch Icon。
- `favicon-32.png`、`favicon-16.png`：小尺寸浏览器图标。

所有 PNG 完全不透明，背景铺满方形画布，未预先裁掉圆角；PWA 由系统决定圆形或圆角裁切。侧栏通过现有 CSS 圆角显示。

在 Windows PowerShell 中运行 `./tools/generate-icons.ps1`，可从两份 SVG 母版重新生成 PNG。生成器支持当前母版使用的 M/L 路径，通过 4 倍分辨率抗锯齿输出。

Service Worker 缓存修订已更新为 v2.0.6。已打开的旧版本会等待窗口关闭后再启用新资源；无需清除 localStorage。
