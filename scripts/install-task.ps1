<#
.SYNOPSIS
  Install (or remove) the scheduled task that pushes daily readings to Today's Teachings.

.DESCRIPTION
  Registers a Windows Scheduled Task that runs push-readings.mjs. Everything is
  detected at install time - Node's location, this script's folder, the current
  user - so the same command works unchanged on any machine. Re-running it
  re-registers the task, so it doubles as "repair".

  The task is configured to survive a sleeping machine:
    - WakeToRun          : wakes the PC from sleep to run
    - StartWhenAvailable : if the PC was off, runs shortly after next boot
    - battery settings   : allowed to start and continue on battery

  Two triggers are installed by default (morning and midday). The job is
  idempotent - the second run is a no-op once the day is stored - so the extra
  trigger is free insurance against a missed or failed morning run.

.PARAMETER Time
  One or more HH:mm local times. Default: 05:30 and 12:30.

.PARAMETER TaskName
  Scheduled task name. Default: TodaysTeachings-DailyReadings

.PARAMETER Uninstall
  Remove the task instead of installing it.

.EXAMPLE
  .\install-task.ps1
.EXAMPLE
  .\install-task.ps1 -Time '06:00','18:00'
.EXAMPLE
  .\install-task.ps1 -Uninstall
#>

[CmdletBinding()]
param(
  [string[]]$Time = @('05:30', '12:30'),
  [string]$TaskName = 'TodaysTeachings-DailyReadings',
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

# --- Uninstall -------------------------------------------------------------
if ($Uninstall) {
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($null -eq $existing) {
    Write-Host "Task '$TaskName' is not installed - nothing to do."
    return
  }
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Removed scheduled task '$TaskName'."
  return
}

# --- Resolve everything relative to this script ----------------------------
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptPath = Join-Path $here 'push-readings.mjs'

if (-not (Test-Path $scriptPath)) {
  throw "Could not find push-readings.mjs next to this installer (looked in $here)."
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($null -eq $nodeCmd) {
  throw "Node.js was not found on PATH. Install Node 18+ and re-run this script."
}
$nodeExe = $nodeCmd.Source

$nodeVersion = (& $nodeExe --version).TrimStart('v')
$nodeMajor = [int]($nodeVersion.Split('.')[0])
if ($nodeMajor -lt 18) {
  throw "Node $nodeVersion found at $nodeExe, but this script needs Node 18+ (it uses global fetch)."
}

# --- Warn if no credentials are reachable ----------------------------------
$cfgFile = Join-Path $here 'push-readings.config.json'
$envFile = Join-Path (Split-Path -Parent $here) '.env.local'
if (-not (Test-Path $cfgFile) -and -not (Test-Path $envFile) -and -not $env:TT_INGEST_SECRET) {
  Write-Warning "No push-readings.config.json, no ../.env.local, and TT_INGEST_SECRET is unset."
  Write-Warning "The task will install but fail until a secret is available. See scripts/README.md."
}

# --- Build the task --------------------------------------------------------
$action = New-ScheduledTaskAction -Execute $nodeExe -Argument "`"$scriptPath`"" -WorkingDirectory $here

$triggers = foreach ($t in $Time) {
  if ($t -notmatch '^\d{1,2}:\d{2}$') { throw "Invalid -Time value '$t'. Use HH:mm, e.g. 05:30." }
  New-ScheduledTaskTrigger -Daily -At $t
}

$settings = New-ScheduledTaskSettingsSet `
  -WakeToRun `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -DontStopOnIdleEnd `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 10) `
  -MultipleInstances IgnoreNew

$userId = "$env:USERDOMAIN\$env:USERNAME"

$isAdmin = (New-Object Security.Principal.WindowsPrincipal(
  [Security.Principal.WindowsIdentity]::GetCurrent()
)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

# S4U runs the task whether or not you are signed in, but registering it
# requires an elevated shell. Interactive needs no elevation and runs only
# while you are signed in. Try the better one first when we can.
$modes = if ($isAdmin) { @('S4U', 'Interactive') } else { @('Interactive', 'S4U') }

$registered = $null
$logonMode = $null
$errors = @()

foreach ($mode in $modes) {
  try {
    $principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType $mode -RunLevel Limited
    $task = New-ScheduledTask -Action $action -Trigger $triggers -Settings $settings -Principal $principal
    # -ErrorAction Stop is required: Register-ScheduledTask reports failures as
    # NON-terminating CIM errors that $ErrorActionPreference does not convert,
    # so without this the catch never fires and failure looks like success.
    Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force -ErrorAction Stop | Out-Null
  }
  catch {
    $errors += "$mode : $($_.Exception.Message.Trim())"
    continue
  }

  # Never trust the call -- confirm the task is really there.
  $registered = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($registered) {
    $logonMode = if ($mode -eq 'S4U') {
      'S4U (runs whether or not you are signed in)'
    } else {
      'Interactive (runs only while you are signed in)'
    }
    break
  }
  $errors += "$mode : call reported success but no task was created"
}

if (-not $registered) {
  Write-Host ""
  Write-Host "FAILED to register '$TaskName'." -ForegroundColor Red
  foreach ($e in $errors) { Write-Host "  $e" -ForegroundColor Red }
  Write-Host ""
  Write-Host "Most likely cause: this shell is not elevated and policy requires it." -ForegroundColor Yellow
  Write-Host "Re-run from an elevated PowerShell:" -ForegroundColor Yellow
  Write-Host "  Start-Process powershell -Verb RunAs -ArgumentList '-NoExit','-File','$($MyInvocation.MyCommand.Path)'"
  exit 1
}

# --- Report ----------------------------------------------------------------
Write-Host ""
Write-Host "Installed scheduled task '$TaskName'" -ForegroundColor Green
Write-Host "  Node        : $nodeExe (v$nodeVersion)"
Write-Host "  Script      : $scriptPath"
Write-Host "  Runs at     : $($Time -join ', ') local time, daily"
Write-Host "  Logon mode  : $logonMode"
Write-Host "  Log file    : $(Join-Path $here 'push-readings.log')"
Write-Host ""

# Surface the power settings that decide whether a sleeping machine wakes up.
$wakeAc = (powercfg /q SCHEME_CURRENT SUB_SLEEP RTCWAKE | Select-String 'Current AC Power Setting Index').ToString().Split(':')[-1].Trim()
if ($wakeAc -eq '0x00000001') {
  Write-Host "  Wake timers : enabled on AC - the PC will wake to run this." -ForegroundColor Green
} else {
  Write-Warning "  Wake timers are NOT enabled on AC power. The task will not wake a sleeping PC."
  Write-Warning "  Fix with: powercfg /setacvalueindex SCHEME_CURRENT SUB_SLEEP RTCWAKE 1; powercfg /S SCHEME_CURRENT"
}

Write-Host ""
Write-Host "Test it now with:" -ForegroundColor Cyan
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "  Get-Content '$(Join-Path $here 'push-readings.log')' -Tail 20"
