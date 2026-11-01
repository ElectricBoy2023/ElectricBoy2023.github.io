@echo off
echo Initializing downloader...
set "ccd=nothing"
:: Test a few directories :)
cd %temp%
echo wait > test
if EXIST "test" set "ccd=%cd%"
del test /s /q

cd %userprofile%
echo wait > test
if EXIST "test" set "ccd=%cd%"
del test /s /q

cd %userprofile%/Documents
echo wait > test
if EXIST "test" set "ccd=%cd%"
del test /s /q

if "%ccd%"=="nothing" (
  echo No paths were valid, please wait for a bugfix or run the terminal with admin privileges.
  pause
  exit /b
)

:: Now onto the juicy part... downloading!
echo Downloading Scrapularizer...
curl -O https://electricboy2023.github.io/scrp/scrapularizer.py
if NOT EXIST scrapularizer.py (
  echo Downloading failed!
  pause
  exit /b
)
echo Downloading studio list...
curl -O https://electricboy2023.github.io/scrp/studios.txt
if NOT EXIST studios.txt (
  echo Downloading failed!
  pause
  exit /b
)

:: Now run our beauty.
echo Running...
echo REMEMBER! IF YOU DIDN'T SEE THE CONFIRMATION PROMPT, YOU MIGHT HAVE JUST DOWNLOADED MALWARE!
choice /c YN /m "Did you use the official source (electricboy2023.github.io)?"
if "%errorlevel%"=="2" (
  echo I don't want you to be infected.
  echo Enjoy life... and remember to safe!
  echo The downloader will now close. Please scan your PC with antiviruses.
  pause
  exit /b
)

:: Okay. Actually run it.
:PROJECTID
set /p project_id="Scratch project ID: "
if "%project_id%"=="" goto PROJECTID

:: Fine. True now.
echo You might need to login with Scratch. If you are worried about security/privacy, use a burner/temp account!
py -3 scrapularizer.py
