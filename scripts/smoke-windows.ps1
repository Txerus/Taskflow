$ErrorActionPreference = 'Stop'
$installer = Get-ChildItem 'release/TaskFlow-Setup-*.exe' | Select-Object -First 1
if (-not $installer) { throw 'Installeur absent' }
$taskflowInstall = Join-Path $env:TEMP ('TaskFlow-' + [guid]::NewGuid().ToString())
$taskflowProfile = Join-Path $env:TEMP ('TaskFlow-profile-' + [guid]::NewGuid().ToString())
$process = $null
try {
  $install = Start-Process -FilePath $installer.FullName -ArgumentList '/S',"/D=$taskflowInstall" -Wait -PassThru
  if ($install.ExitCode -ne 0) { throw "Échec NSIS : $($install.ExitCode)" }
  $binary = Join-Path $taskflowInstall 'TaskFlow.exe'
  if (-not (Test-Path $binary)) { throw 'Binaire installé absent' }
  $env:TASKFLOW_E2E = '1'
  $env:TASKFLOW_USER_DATA = $taskflowProfile
  $process = Start-Process -FilePath $binary -PassThru
  $deadline = (Get-Date).AddSeconds(30)
  do {
    Start-Sleep -Milliseconds 500
    $process.Refresh()
    if ($process.HasExited) { throw "Application arrêtée : $($process.ExitCode)" }
    if ($process.MainWindowHandle -ne 0 -and (Test-Path (Join-Path $taskflowProfile 'taskflow.db'))) { break }
  } while ((Get-Date) -lt $deadline)
  if ($process.MainWindowHandle -eq 0) { throw 'Aucune fenêtre après installation' }
  if (-not (Test-Path (Join-Path $taskflowProfile 'taskflow.db'))) { throw 'Base SQLite non créée' }
  Write-Output 'Installation, fenêtre et SQLite vérifiés.'
} finally {
  if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force }
  Remove-Item Env:TASKFLOW_E2E -ErrorAction SilentlyContinue
  Remove-Item Env:TASKFLOW_USER_DATA -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $taskflowInstall -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $taskflowProfile -Recurse -Force -ErrorAction SilentlyContinue
}
