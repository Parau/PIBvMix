@echo off
setlocal
cd /d "%~dp0"

echo.
echo PIBvMix - Instalacao do driver USB Samsung
echo ==========================================
echo.

rem Verifica privilegio de administrador
fltmc >nul 2>&1
if errorlevel 1 (
    echo Este processo precisa de permissao de Administrador.
    echo Solicitando elevacao...
    echo.

    powershell -NoProfile -Command ^
      "Start-Process -FilePath '%~f0' -Verb RunAs"

    exit /b
)

set "DRIVER_DIR=%~dp0driver-samsung\25_escape"

if not exist "%DRIVER_DIR%\ssudbus.inf" (
    echo ERRO: ssudbus.inf nao encontrado.
    echo Esperado em:
    echo %DRIVER_DIR%
    pause
    exit /b 1
)

if not exist "%DRIVER_DIR%\ssudadb.inf" (
    echo ERRO: ssudadb.inf nao encontrado.
    echo Esperado em:
    echo %DRIVER_DIR%
    pause
    exit /b 1
)

echo Instalando Samsung USB Composite Device...
pnputil /add-driver "%DRIVER_DIR%\ssudbus.inf" /install

if errorlevel 1 (
    echo.
    echo AVISO: houve problema ao instalar ssudbus.inf
)

echo.
echo Instalando Samsung Android ADB Interface...
pnputil /add-driver "%DRIVER_DIR%\ssudadb.inf" /install

if errorlevel 1 (
    echo.
    echo AVISO: houve problema ao instalar ssudadb.inf
)

echo.
echo ==========================================
echo Instalacao concluida.
echo.
echo Desconecte e conecte novamente o tablet.
echo Depois execute o iniciar-teste.bat.
echo.
pause