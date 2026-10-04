@echo off
setlocal
cd /d "%~dp0"

echo.
echo PIBvMix - servidor local via USB
echo =================================
echo.

echo Iniciando ADB...
adb\adb.exe start-server

echo.
echo Verificando dispositivos Android...
adb\adb.exe devices

echo.
echo Configurando acesso USB ao servidor web...
adb\adb.exe reverse tcp:4173 tcp:4173
if errorlevel 1 (
    echo.
    echo ERRO: nao foi possivel configurar a porta 4173.
    echo Verifique se o tablet esta conectado, com Depuracao USB habilitada
    echo e com este computador autorizado.
    echo.
    pause
    exit /b 1
)

echo Configurando acesso USB ao vMix...
adb\adb.exe reverse tcp:8088 tcp:8088
if errorlevel 1 (
    echo.
    echo ERRO: nao foi possivel configurar a porta 8088 do vMix.
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
echo   http://127.0.0.1:4173
echo.
echo Endereco do vMix no PIBvMix:
echo   127.0.0.1:8088
echo.
echo Pressione Ctrl+C para encerrar o servidor Caddy.
echo.

start "" "http://127.0.0.1:4173"

caddy_windows_amd64.exe run --config Caddyfile --adapter caddyfile

echo.
echo O servidor foi encerrado.
pause
