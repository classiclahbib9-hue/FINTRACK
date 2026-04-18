@echo off
echo Starting FineTrack dev server...
cd /d "%~dp0"
start chrome --incognito --disable-application-cache http://localhost:3000
npx live-server --port=3000 --no-browser --watch=index.html,app.js,style.css
pause
