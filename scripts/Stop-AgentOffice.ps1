$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$statePath = Join-Path $root '.agent-office\server.json'
try {
    if (-not (Test-Path -LiteralPath $statePath)) {
        Write-Host 'No background office owned by this folder. Foreground/development servers must be stopped in their console.'
        exit 0
    }
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $ownedProcess = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
    if ($ownedProcess) {
        $expectedEntry = Join-Path $root 'apps\server\dist\index.js'
        $details = Get-CimInstance Win32_Process -Filter "ProcessId = $($ownedProcess.Id)"
        if ($state.entry -ne $expectedEntry -or
            $ownedProcess.StartTime.ToUniversalTime().ToString('o') -ne $state.startedAt -or
            -not $details.CommandLine.Contains("`"$expectedEntry`"") -or
            $ownedProcess.ProcessName -ne 'node') {
            throw 'Saved process ownership does not match. Refusing to stop an unrelated process.'
        }
        Stop-Process -Id $ownedProcess.Id
        $ownedProcess.WaitForExit()
        Write-Host 'Agent Office stopped.'
    } else {
        Write-Host 'The background office has already stopped.'
    }
    Remove-Item -LiteralPath $statePath
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
}
