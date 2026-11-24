$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$stateDir = Join-Path $root '.agent-office'
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
$log = Join-Path $stateDir 'autostart.log'
"`n[$([DateTime]::Now.ToString('o'))] Starting Agent Office at Windows sign-in." |
    Out-File -LiteralPath $log -Append -Encoding utf8
$ErrorActionPreference = 'Continue'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Launch-AgentOffice.ps1') -NoBrowser 2>&1 |
    Out-File -LiteralPath $log -Append -Encoding utf8
$exitCode = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($exitCode -ne 0) {
    "Autostart failed with exit code $exitCode. See this log and server-error.log." |
        Out-File -LiteralPath $log -Append -Encoding utf8
    exit $exitCode
}
