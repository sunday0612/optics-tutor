@echo off
cd /d "%~dp0"
set PY=python
where python >nul 2>nul
if errorlevel 1 (
  where py >nul 2>nul
  if errorlevel 1 (
    echo [!] Python not found. Please install Python 3.12 from https://www.python.org and tick "Add python.exe to PATH".
    pause
    exit /b 1
  )
  set PY=py -3
)
%PY% build.py
pause
