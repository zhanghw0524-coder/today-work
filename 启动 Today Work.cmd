@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js LTS, or use: python -m http.server 8765 --bind 127.0.0.1
  pause
  exit /b 1
)
echo Open http://127.0.0.1:8765/ in Edge or Chrome.
echo Keep this window open while using the local address. Ctrl+C stops the server.
node server.cjs
pause
