# Starts HomePortal automatically when you log in to Windows (minimized window).
# Run:  powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1
# Remove: Unregister-ScheduledTask -TaskName HomePortal -Confirm:$false
$root = Split-Path -Parent $PSScriptRoot
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c start `"HomePortal`" /min `"$root\start.bat`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0
Register-ScheduledTask -TaskName "HomePortal" -Action $action -Trigger $trigger -Settings $settings -Description "HomePortal game server panel" -Force | Out-Null
Write-Host "HomePortal will now start when $env:USERNAME logs in."
