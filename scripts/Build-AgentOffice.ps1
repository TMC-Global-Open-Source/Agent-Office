$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'Office-Common.ps1')
try {
    Set-Location -LiteralPath $root
    $node = Initialize-OfficeRuntime $root
    $npm = Join-Path (Split-Path $node -Parent) 'npm.cmd'
    if (-not (Test-Path -LiteralPath $npm)) { throw 'npm is missing beside Node.js. Repair your Node.js installation.' }
    if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules'))) {
        throw 'Dependencies are not installed. Run Install-Agent-Office.cmd first.'
    }
    Write-Host 'Building Agent Office. Run Stop-Agent-Office.cmd first (or close its foreground console), then relaunch after the build.'
    & $npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Application build failed. Review the output above. If dependencies changed, run Install-Agent-Office.cmd and retry.' }
    Write-Host ''
    Write-Host 'Build complete. Double-click Launch-Agent-Office.cmd to start the updated app.'
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
}
