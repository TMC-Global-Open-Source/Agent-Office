param([Parameter(Mandatory = $true)][string]$Archive)
$ErrorActionPreference = 'Stop'
$sandbox = Join-Path ([IO.Path]::GetTempPath()) ("AgentOffice-preview-" + [Guid]::NewGuid().ToString('N'))
$app = Join-Path $sandbox 'application with spaces'
$data = Join-Path $sandbox 'persistent data'
$environmentNames = @('AGENT_OFFICE_DATA_DIR', 'PORT', 'HOST', 'WEB_PORT', 'DATABASE_URL', 'AGENT_PROVIDER', 'AGENT_OFFICE_HOOK_TOKEN', 'COPILOT_USAGE_DB_PATH', 'VSCODE_USAGE_TRACKING')
$saved = @{}
foreach ($name in $environmentNames) {
    $saved[$name] = [Environment]::GetEnvironmentVariable($name)
    [Environment]::SetEnvironmentVariable($name, $null)
}
try {
    New-Item -ItemType Directory -Path $sandbox | Out-Null
    Expand-Archive -LiteralPath $Archive -DestinationPath $app
    if (-not (Test-Path -LiteralPath (Join-Path $app '.env.example'))) { throw 'Release is missing .env.example.' }
    if (Test-Path -LiteralPath (Join-Path $app 'node_modules')) { throw 'Source preview must not contain dependencies.' }
    $env:AGENT_OFFICE_DATA_DIR = $data
    $env:COPILOT_USAGE_DB_PATH = Join-Path $sandbox 'missing-usage.db'
    $env:VSCODE_USAGE_TRACKING = 'false'
    $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $env:PORT = [string]$listener.LocalEndpoint.Port
    $listener.Stop()
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $app 'scripts\Install-AgentOffice.ps1') -NoShortcut -DataDirectory $data
    if ($LASTEXITCODE -ne 0) { throw 'Extracted fresh installation failed.' }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $app 'scripts\Install-AgentOffice.ps1') -NoShortcut
    if ($LASTEXITCODE -ne 0) { throw 'Extracted upgrade/repair failed.' }
    if (-not (Get-ChildItem -LiteralPath (Join-Path $data 'backups') -Directory).Count) { throw 'Upgrade did not create a backup.' }
    $moved = Join-Path $sandbox 'relocated application'
    Move-Item -LiteralPath $app -Destination $moved
    $app = $moved
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $app 'scripts\Install-AgentOffice.ps1') -NoShortcut
    if ($LASTEXITCODE -ne 0) { throw 'Relocated repair failed.' }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $app 'scripts\Maintain-AgentOffice.ps1') -Action Diagnose
    if ($LASTEXITCODE -ne 0) { throw 'Diagnostics failed.' }
    $snapshot = (Get-ChildItem -LiteralPath (Join-Path $data 'backups') -Directory | Sort-Object Name | Select-Object -First 1).FullName
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $app 'scripts\Maintain-AgentOffice.ps1') -Action Restore -Snapshot $snapshot -ConfirmRestore
    if ($LASTEXITCODE -ne 0) { throw 'Confirmed backup restore failed.' }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $app 'scripts\Maintain-AgentOffice.ps1') -Action Uninstall -ConfirmUninstall
    if ($LASTEXITCODE -ne 0) { throw 'Uninstall failed.' }
    foreach ($file in @('.env', 'dev.db')) {
        if (-not (Test-Path -LiteralPath (Join-Path $data $file))) { throw "Uninstall removed $file." }
    }
    Write-Host 'Extracted release: install, upgrade, relocation, restore and data-preserving uninstall passed.'
} finally {
    if (Test-Path -LiteralPath (Join-Path $app 'scripts\Stop-AgentOffice.ps1')) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $app 'scripts\Stop-AgentOffice.ps1')
        if ($LASTEXITCODE -ne 0) { throw "Could not stop the test server. Preserving test folder: $sandbox" }
    }
    foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $saved[$name]) }
    if (Test-Path -LiteralPath $sandbox) { Remove-Item -LiteralPath $sandbox -Recurse -Force }
}
