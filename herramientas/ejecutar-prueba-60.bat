@echo off
setlocal
cd /d "%~dp0\.."
"C:\Users\mgo17\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" ".\herramientas\simular-60-firebase.mjs" --per-game 30 --seconds 60 --hz 2 --auth-pool 8
echo.
pause
