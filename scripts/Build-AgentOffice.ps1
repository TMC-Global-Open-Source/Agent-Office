$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
try {
    Set-Location -LiteralPath $root
    if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw 'Install Node.js LTS (22.13 or newer) from https://nodejs.org, then run Install-Agent-Office.cmd first.'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules'))) {
        throw 'Dependencies are not installed. Run Install-Agent-Office.cmd first.'
    }
    Write-Host 'Building Agent Office. Close any running Agent Office console first, then relaunch after the build.'
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Application build failed. Review the output above. If dependencies changed, run Install-Agent-Office.cmd and retry.' }
    Write-Host ''
    Write-Host 'Build complete. Double-click Launch-Agent-Office.cmd to start the updated app.'
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
}
