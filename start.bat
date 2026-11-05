@echo off
setlocal
cd /d "%~dp0"

echo ====================================
echo  Axon Data Portal: Entwicklungsumgebung
echo ====================================
echo.

where pnpm >nul 2>&1
if errorlevel 1 (
  echo FEHLER: pnpm wurde nicht gefunden. Erst "corepack enable" ausfuehren.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Abhaengigkeiten werden installiert, das dauert einen Moment ...
  call pnpm install
  if errorlevel 1 (
    echo FEHLER: pnpm install ist fehlgeschlagen.
    pause
    exit /b 1
  )
  echo.
)

if not exist ".env" (
  echo .env fehlt, wird aus .env.example angelegt.
  copy /y ".env.example" ".env" >nul
  echo Bitte ADMIN_EMAIL und ADMIN_PASSWORT darin eintragen und neu starten.
  echo.
)

rem Fester Datenordner im Repo, egal aus welchem Ordner der Server startet.
set "DATA_DIR=%~dp0data"

echo Server startet auf http://localhost:3300  (Daten in %DATA_DIR%)
start "Axon Data Portal Server" cmd /k "pnpm dev:server"

echo Oberflaeche startet auf http://localhost:5180
start "Axon Data Portal Oberflaeche" cmd /k "pnpm dev"

echo.
echo Beide Fenster laufen weiter. Zum Beenden dort jeweils Strg+C.
echo Anmeldung fuer Organisationen und Verwaltung: http://localhost:5180/anmelden
echo Der Browser oeffnet gleich die Oberflaeche.
ping -n 6 127.0.0.1 >nul
start "" "http://localhost:5180"

endlocal
