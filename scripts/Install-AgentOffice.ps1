param(
    [switch]$ConnectAgents,
    [switch]$NoShortcut,
    [string]$DataDirectory,
    [switch]$UseExistingData
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'Office-Common.ps1')
try {
    Set-Location -LiteralPath $root
    if ($DataDirectory) {
        if (-not [IO.Path]::IsPathRooted($DataDirectory)) { throw '-DataDirectory must be an absolute path.' }
        $env:AGENT_OFFICE_DATA_DIR = $DataDirectory
    }
    if ($UseExistingData) { $env:AGENT_OFFICE_USE_EXISTING_DATA = 'true' }
    $node = Initialize-OfficeRuntime $root
    $npm = Join-Path (Split-Path $node -Parent) 'npm.cmd'
    if (-not (Test-Path -LiteralPath $npm)) { throw 'npm is missing beside Node.js. Repair your Node.js installation.' }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Stop-AgentOffice.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'Stop the original installation before repairing this copy. Process ownership could not be verified.' }
    Write-Host 'Installing dependencies. Close any foreground/development Agent Office servers first.'
    & $npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Stop running Agent Office processes and retry setup. Your settings and database were not reset.' }
    & $node (Join-Path $root 'scripts\manage-installation.mjs') prepare
    if ($LASTEXITCODE -ne 0) { throw 'Data migration was not completed. Review the error above; original data was not reset.' }
    $paths = Get-OfficePaths $root $node
    $settings = Get-OfficeSettings $paths
    & $node (Join-Path $root 'scripts\manage-installation.mjs') check-port
    if ($LASTEXITCODE -ne 0) { throw 'Close the existing server before setup continues. Database migrations were not run.' }
    & $node (Join-Path $root 'scripts\office-maintenance.mjs') backup
    if ($LASTEXITCODE -ne 0) { throw 'Backup failed. Database migrations were not run.' }
    & $npm run db:migrate
    if ($LASTEXITCODE -ne 0) { throw 'Database migration failed. Review the output above.' }
    & $npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Application build failed. Review the output above.' }
    if ($ConnectAgents -or $settings.AGENT_PROVIDER -eq 'local') {
        & $npm run connect:agents
        if ($LASTEXITCODE -ne 0) { throw 'Copilot hook setup failed. Review the output above.' }
    }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Launch-AgentOffice.ps1') -NoBrowser -SmokeTest
    if ($LASTEXITCODE -ne 0) { throw 'Installation startup check failed. Review the server error above; setup has not completed.' }
    if (-not $NoShortcut) {
        $desktop = [Environment]::GetFolderPath('Desktop')
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut((Join-Path $desktop 'Copilot Agent Office.lnk'))
        $shortcut.TargetPath = Join-Path $root 'Launch-Agent-Office.cmd'
        $shortcut.WorkingDirectory = $root
        $shortcut.Description = 'Launch the local Copilot Agent Office and open its dashboard'
        $shortcut.Save()
    }
    & $node (Join-Path $root 'scripts\manage-installation.mjs') complete
    if ($LASTEXITCODE -ne 0) { throw 'Could not save successful installation metadata. Review the error above.' }
    Write-Host ''
    Write-Host 'Setup complete. Double-click Copilot Agent Office on your desktop, or Launch-Agent-Office.cmd.'
    Write-Host "Settings and database are kept in $($paths.dataDirectory)."
    Write-Host 'After moving this folder, run Repair-Agent-Office.cmd to refresh its shortcut, runtime and hooks.'
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
}
