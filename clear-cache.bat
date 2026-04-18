@echo off
echo Clearing Chrome cache for FineTrack...

taskkill /F /IM chrome.exe /T >nul 2>&1
timeout /t 2 /nobreak >nul

start chrome --disable-application-cache --disable-cache --user-data-dir="%TEMP%\chrome-clean" https://fintrackers-506db.web.app

echo Done! Chrome opened fresh with no cache.
