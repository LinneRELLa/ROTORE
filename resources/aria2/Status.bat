@echo off & title Aria2 Status
chcp 65001
TaskList /FI "IMAGENAME eq aria2c.exe" /FO LIST
pause > nul