@echo off
:: 库存管理系统 - Windows 开机自启动设置脚本
:: 以管理员身份运行

set "SCRIPT_DIR=%~dp0"
set "APP_DIR=%SCRIPT_DIR%.."
set "SHORTCUT_NAME=库存管理系统"

echo ====================================
echo  库存管理系统 - 开机自启动设置
echo ====================================
echo.
echo 1. 添加快捷方式到启动文件夹
echo 2. 移除开机自启动
echo 3. 退出
echo.

set /p choice="请选择 (1-3): "

if "%choice%"=="1" goto add_startup
if "%choice%"=="2" goto remove_startup
if "%choice%"=="3" exit /b

:add_startup
echo.
echo 正在设置开机自启动...
powershell -Command ^
  "$WshShell = New-Object -ComObject WScript.Shell; ^
   $Shortcut = $WshShell.CreateShortcut('%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\%SHORTCUT_NAME%.lnk'); ^
   $Shortcut.TargetPath = 'node.exe'; ^
   $Shortcut.Arguments = '%APP_DIR%\server.cjs'; ^
   $Shortcut.WorkingDirectory = '%APP_DIR%'; ^
   $Shortcut.Save()"
if %errorlevel% equ 0 (
    echo ✓ 开机自启动设置成功！
) else (
    echo ✗ 设置失败，请以管理员身份运行此脚本
)
pause
exit /b

:remove_startup
echo.
echo 正在移除开机自启动...
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\%SHORTCUT_NAME%.lnk" 2>nul
echo ✓ 已移除开机自启动
pause
exit /b
