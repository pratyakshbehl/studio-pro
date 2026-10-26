@echo off
title Studio Pro
cd /d "%~dp0"
if not exist "dist\index.html" (
  echo First run: building Studio Pro. This takes a few seconds...
  call npm run build
)
start "" http://localhost:4800
node server.mjs
pause
