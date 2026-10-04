@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "DRIVER_DIR=%~dp0driver-samsung\25_escape"
set "PNPUTIL=%SystemRoot%\System32\pnputil.exe"
set "FAILED=0"
set "REBOOT=0"

echo.
echo PIBvMix - Instalacao do driver USB Samsung
echo ==========================================
echo.

rem Verifica se o processo esta executando como Administrador.
powershell -NoProfile -Command ^
  "if (([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { exit 0 } else { exit 1 }"

if errorlevel 1 (
    echo Este processo precisa de permissao de Administrador.
    echo Solicitando elevacao...
    echo.

    powershell -NoProfile -Command ^
      "Start-Process -FilePath '%~f0' -Verb RunAs"

    exit /b
)

rem Confere se os dois pacotes necessarios estao presentes.
if not exist "%DRIVER_DIR%\ssudbus.inf" (
    echo ERRO: ssudbus.inf nao encontrado.
    echo Esperado em:
    echo %DRIVER_DIR%
    echo.
    pause
    exit /b 1
)

if not exist "%DRIVER_DIR%\ssudadb.inf" (
    echo ERRO: ssudadb.inf nao encontrado.
    echo Esperado em:
    echo %DRIVER_DIR%
    echo.
    pause
    exit /b 1
)

echo Instalando Samsung USB Composite Device...
call :InstallDriver "%DRIVER_DIR%\ssudbus.inf" "Samsung USB Composite Device"

echo.
echo Instalando Samsung Android ADB Interface...
call :InstallDriver "%DRIVER_DIR%\ssudadb.inf" "Samsung Android ADB Interface"

echo.
echo ==========================================

if "%FAILED%"=="1" (
    echo A instalacao terminou com erro.
    echo.
    echo Consulte tambem:
    echo %SystemRoot%\INF\setupapi.dev.log
    echo.
    pause
    exit /b 1
)

echo Drivers Samsung processados com sucesso.

if "%REBOOT%"=="1" (
    echo.
    echo O Windows informou que e necessario reiniciar
    echo o computador para concluir a instalacao.
) else (
    echo.
    echo Desconecte e conecte novamente o tablet.
)

echo.
echo Depois execute o iniciar-teste.bat.
echo.
pause
exit /b 0


:InstallDriver
"%PNPUTIL%" /add-driver "%~1" /install
set "RC=%ERRORLEVEL%"

if "%RC%"=="0" (
    echo OK: %~2
    exit /b 0
)

if "%RC%"=="259" (
    echo OK: pacote adicionado.
    echo Nenhum dispositivo correspondente precisou ser atualizado,
    echo ou o Windows ja esta usando um driver de prioridade superior.
    exit /b 0
)

if "%RC%"=="3010" (
    echo OK: %~2
    echo Reinicializacao do Windows necessaria.
    set "REBOOT=1"
    exit /b 0
)

echo.
echo ERRO ao processar %~2.
echo Codigo retornado pelo PnPUtil: %RC%
set "FAILED=1"
exit /b 0