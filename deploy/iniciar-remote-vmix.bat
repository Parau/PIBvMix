@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem ================================================================
rem Configuracao local
rem Altere as portas somente aqui. O Caddyfile usa WEB_PORT por
rem variavel de ambiente e recebe o mesmo valor automaticamente.
rem ================================================================
set "WEB_PORT=4174"
set "VMIX_PORT=8088"

echo.
echo PIBvMix - servidor local via USB
echo =================================
echo Porta web:  %WEB_PORT%
echo Porta vMix: %VMIX_PORT%
echo.

rem Evita iniciar o Caddy em uma porta que ja esteja ocupada.
netstat -ano | findstr /R /C:":%WEB_PORT% .*LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo ERRO: a porta %WEB_PORT% ja esta em uso.
    echo.
    netstat -ano | findstr /R /C:":%WEB_PORT% .*LISTENING"
    echo.
    echo Feche o processo que esta usando a porta ou altere WEB_PORT
    echo no inicio deste arquivo e execute novamente.
    echo.
    pause
    exit /b 1
)

if not exist "adb\adb.exe" (
    echo ERRO: adb\adb.exe nao foi encontrado.
    pause
    exit /b 1
)

if not exist "caddy_windows_amd64.exe" (
    echo ERRO: caddy_windows_amd64.exe nao foi encontrado.
    pause
    exit /b 1
)

if not exist "Caddyfile" (
    echo ERRO: Caddyfile nao foi encontrado.
    pause
    exit /b 1
)

if not exist "vmix\index.html" (
    echo ERRO: vmix\index.html nao foi encontrado.
    echo Execute atualizar-vmix-local.bat antes de iniciar o servidor.
    pause
    exit /b 1
)

echo Iniciando ADB...
adb\adb.exe start-server

echo.
echo Verificando dispositivos Android...
adb\adb.exe devices

echo.
echo Configurando acesso USB ao servidor web...
adb\adb.exe reverse tcp:%WEB_PORT% tcp:%WEB_PORT%
if errorlevel 1 (
    echo.
    echo ERRO: nao foi possivel configurar a porta %WEB_PORT%.
    echo Verifique se o tablet esta conectado, com Depuracao USB habilitada
    echo e com este computador autorizado.
    echo.
    pause
    exit /b 1
)

echo Configurando acesso USB ao vMix...
adb\adb.exe reverse tcp:%VMIX_PORT% tcp:%VMIX_PORT%
if errorlevel 1 (
    echo.
    echo ERRO: nao foi possivel configurar a porta %VMIX_PORT% do vMix.
    echo.
    pause
    exit /b 1
)

echo.
echo Acesso configurado com sucesso.
echo.
echo No computador:
echo   http://127.0.0.1:%WEB_PORT%
echo.
echo No tablet:
echo   http://127.0.0.1:%WEB_PORT%
echo.
echo Endereco do vMix no PIBvMix:
echo   127.0.0.1:%VMIX_PORT%
echo.
echo O navegador sera aberto assim que o Caddy estiver respondendo.
echo Pressione Ctrl+C para encerrar o servidor Caddy.
echo.

rem Abre o navegador apos uma pequena espera, sem usar PowerShell.
rem O processo auxiliar serve apenas para abrir a URL; o Caddy abaixo
rem continua em primeiro plano, preso a esta janela do CMD.
start "" /B cmd.exe /D /C "timeout /T 2 /NOBREAK >NUL & start http://127.0.0.1:%WEB_PORT%"

echo Iniciando servidor Caddy...
echo.
caddy_windows_amd64.exe run --config Caddyfile --adapter caddyfile
set "CADDY_RC=%ERRORLEVEL%"

echo.
echo O servidor Caddy foi encerrado. Codigo de saida: %CADDY_RC%
echo Pressione uma tecla para fechar esta janela.
pause >nul
exit /b %CADDY_RC%
