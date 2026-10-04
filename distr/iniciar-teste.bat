@echo off
setlocal
cd /d "%~dp0"

echo.
echo PIBvMix - teste do servidor local
echo =================================
echo Abrindo em: http://127.0.0.1:4173
echo Pressione Ctrl+C para encerrar.
echo.

start "" "http://127.0.0.1:4173"
caddy_windows_amd64.exe run --config Caddyfile --adapter caddyfile

echo.
echo O servidor foi encerrado.
pause
