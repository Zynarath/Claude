# Opens Windows Firewall for HomePortal and the default game port ranges.
# Run from an elevated PowerShell:  powershell -ExecutionPolicy Bypass -File scripts\open-firewall.ps1
param(
  [int]$PanelPort = 8080,
  [string]$MinecraftPorts = "25565-25575",
  [string]$ArkPorts = "7777-7790",
  [string]$CodPorts = "4976,27016,28960-28970",
  [string]$WowPorts = "3724,8085",
  [int]$SharePort = 0
)
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Error "Run this script as Administrator (right-click PowerShell > Run as administrator)."
  exit 1
}
function Add-Rule($name, $proto, $ports) {
  Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Allow -Protocol $proto -LocalPort $ports -Profile Any | Out-Null
  Write-Host "Opened $proto $ports ($name)"
}
Add-Rule "HomePortal panel" TCP $PanelPort
Add-Rule "HomePortal Minecraft" TCP $MinecraftPorts
Add-Rule "HomePortal ARK" UDP $ArkPorts
Add-Rule "HomePortal Call of Duty" UDP $CodPorts
Add-Rule "HomePortal WoW" TCP $WowPorts
if ($SharePort -gt 0) { Add-Rule "HomePortal file share" TCP $SharePort }
Write-Host "Done. Remember to forward the game ports on your router too (not the panel port unless you know you want that)."
