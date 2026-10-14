param(
    [switch]$ConnectAgents,
    [switch]$NoShortcut
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
try {
    Set-Location -LiteralPath $root
    if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw 'Install Node.js LTS (22.13 or newer) from https://nodejs.org, then run setup again.'
    }
    $version = [version]((& node -p 'process.versions.node').Trim())
    if ($version -lt [version]'22.13.0') {
        throw "Node.js $version is installed. Setup requires Node.js 22.13 or newer. Install a current LTS release from https://nodejs.org."
    }
    $envPath = Join-Path $root '.env'
    if (-not (Test-Path -LiteralPath $envPath)) {
        Copy-Item -LiteralPath (Join-Path $root '.env.example') -Destination $envPath
    }
    Write-Host 'Installing dependencies. Close any running Agent Office console first to avoid database-engine file locks.'
    & npm.cmd ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Close running Agent Office processes and retry setup. Your settings and database were not reset.' }
    & npm.cmd run db:migrate
    if ($LASTEXITCODE -ne 0) { throw 'Database migration failed. Review the output above.' }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Application build failed. Review the output above.' }
    if ($ConnectAgents) {
        & npm.cmd run connect:agents
        if ($LASTEXITCODE -ne 0) { throw 'Copilot hook setup failed. Review the output above.' }
    }
    if (-not $NoShortcut) {
        $desktop = [Environment]::GetFolderPath('Desktop')
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut((Join-Path $desktop 'Copilot Agent Office.lnk'))
        $shortcut.TargetPath = Join-Path $root 'Launch-Agent-Office.cmd'
        $shortcut.WorkingDirectory = $root
        $shortcut.Description = 'Launch the local Copilot Agent Office and open its dashboard'
        $shortcut.Save()
    }
    Write-Host ''
    Write-Host 'Setup complete. Double-click Copilot Agent Office on your desktop, or Launch-Agent-Office.cmd.'
    Write-Host 'Keep this folder in place; the shortcut and optional Copilot hooks refer to it.'
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
}
