@echo off
chcp 65001 >nul
rem 雙擊此檔即可啟動 YTM 盲盒監控；關閉視窗即停止監控
title YTM 盲盒監控
cd /d "%~dp0"
node monitor.js
pause
