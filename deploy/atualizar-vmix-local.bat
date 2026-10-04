@echo off
setlocal EnableExtensions
cd /d "%~dp0"

for %%I in ("%~dp0..") do set "ROOT=%%~fI"
set "DEST=%~dp0vmix"

echo.
echo PIBvMix - Atualizacao do pacote local
echo =====================================
echo.

if not exist "%ROOT%\index.html" (
    echo ERRO: index.html nao encontrado em:
    echo %ROOT%
    echo.
    pause
    exit /b 1
)

if not exist "%ROOT%\src\" (
    echo ERRO: pasta src nao encontrada em:
    echo %ROOT%\src
    echo.
    pause
    exit /b 1
)

if not exist "%DEST%" mkdir "%DEST%"

echo Copiando index.html...
copy /Y "%ROOT%\index.html" "%DEST%\index.html" >nul
if errorlevel 1 (
    echo ERRO ao copiar index.html.
    pause
    exit /b 1
)

echo Sincronizando src...
robocopy "%ROOT%\src" "%DEST%\src" /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /NP
set "ROBOCOPY_RC=%ERRORLEVEL%"

rem No Robocopy, codigos de 0 a 7 indicam sucesso ou diferencas tratadas.
if %ROBOCOPY_RC% GEQ 8 (
    echo.
    echo ERRO ao sincronizar src. Codigo Robocopy: %ROBOCOPY_RC%
    pause
    exit /b %ROBOCOPY_RC%
)

echo.
echo Pacote local atualizado com sucesso:
echo %DEST%
echo.
echo Agora execute iniciar-remote-vmix.bat para iniciar o acesso local via USB.
echo.
pause
exit /b 0
