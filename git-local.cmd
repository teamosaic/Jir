@echo off
setlocal
set "ROOT=%~dp0"
"%ROOT%.git-tools\mingit\mingw64\bin\git.exe" %*
endlocal
