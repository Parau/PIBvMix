@echo off
setlocal
cd /d "%~dp0"

echo.
echo PIBvMix - teste do servidor local
echo =================================
echo.

echo Iniciando ADB...
adb\adb.exe start-server

echo.
echo Verificando dispositivos Android...
adb\adb.exe devices

echo.
echo Configurando acesso USB ao servidor...
adb\adb.exe reverse tcp:4173 tcp:4173

if errorlevel 1 (
    echo.
    echo ERRO: nao foi possivel configurar o acesso USB.
    echo.
    echo Verifique:
    echo - tablet conectado por USB
    echo - Depuracao USB habilitada
    echo - autorizacao deste computador aceita no tablet
    echo.
    pause
    exit /b 1
)

echo.
echo Acesso configurado com sucesso.
echo.
echo No computador:
echo   http://127.0.0.1:4173
echo.
echo No tablet:
echo   http://localhost:4173
echo.
echo Pressione Ctrl+C para encerrar o servidor.
echo.

start "" "http://127.0.0.1:4173"

caddy_windows_amd64.exe run --config Caddyfile --adapter caddyfile

echo.
echo O servidor foi encerrado.
pause