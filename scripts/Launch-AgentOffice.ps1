param(
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$process = $null

function Get-OfficeHealth([string]$url) {
    try {
        return (Invoke-RestMethod -Uri "$url/api/v1/health" -TimeoutSec 2).data
    } catch {
        if ($_.Exception.Response) {
            throw "The configured port is serving another application. Close it or change PORT in .env."
        }
        return $null
    }
}

try {
    Set-Location -LiteralPath $root
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { throw 'Node.js was not found. Run Install-Agent-Office.cmd first.' }
    $envPath = Join-Path $root '.env'
    if (-not (Test-Path -LiteralPath $envPath)) { throw 'Settings are missing. Run Install-Agent-Office.cmd first.' }
    $settings = @{}
    foreach ($line in Get-Content -LiteralPath $envPath) {
        if ($line -match '^\s*(HOST|PORT|WEB_PORT)\s*=\s*(.*?)\s*$') {
            $settings[$Matches[1]] = $Matches[2].Trim('"', "'")
        }
    }
    foreach ($name in @('HOST', 'PORT', 'WEB_PORT')) {
        $value = [Environment]::GetEnvironmentVariable($name)
        if ($value) { $settings[$name] = $value }
    }
    $bindHost = if ($settings.HOST) { $settings.HOST } else { '127.0.0.1' }
    if ($bindHost -notin @('127.0.0.1', 'localhost', '::1')) {
        throw 'The desktop launcher requires a loopback HOST in .env (127.0.0.1, localhost, or ::1).'
    }
    $port = if ($settings.PORT) { [int]$settings.PORT } else { 4000 }
    $webPort = if ($settings.WEB_PORT) { [int]$settings.WEB_PORT } else { 5173 }
    if ($port -lt 1 -or $port -gt 65535 -or $webPort -lt 1 -or $webPort -gt 65535) {
        throw 'PORT and WEB_PORT must be between 1 and 65535.'
    }
    $urlHost = if ($bindHost -eq '::1') { '[::1]' } else { $bindHost }
    $apiUrl = "http://${urlHost}:$port"
    $health = Get-OfficeHealth $apiUrl
    if ($health) {
        if ($health.application -ne 'copilot-agent-office') {
            throw 'The configured API port is already occupied. Close that application and retry.'
        }
        $dashboardUrl = if ($health.mode -eq 'production') { $apiUrl } else { "http://${urlHost}:$webPort" }
        if (-not $NoBrowser) { Start-Process $dashboardUrl }
        Write-Host "Agent Office is already running at $dashboardUrl"
        exit 0
    }
    $entry = Join-Path $root 'apps\server\dist\index.js'
    if (-not (Test-Path -LiteralPath $entry) -or -not (Test-Path -LiteralPath (Join-Path $root 'apps\web\dist\index.html'))) {
        throw 'Built application files are missing. Run Install-Agent-Office.cmd first.'
    }
    $env:NODE_ENV = 'production'
    $process = Start-Process -FilePath $node.Source -ArgumentList @("`"$entry`"") -WorkingDirectory $root -NoNewWindow -PassThru
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if ($process.HasExited) { throw 'Agent Office stopped during startup. Review the server error above.' }
        $health = Get-OfficeHealth $apiUrl
        if ($health) {
            if ($health.application -ne 'copilot-agent-office') { throw 'Another application is using the configured port.' }
            $ready = $true
            break
        }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) { throw 'Agent Office did not become ready. Review the console output and .env settings.' }
    if (-not $NoBrowser) { Start-Process $apiUrl }
    Write-Host ''
    Write-Host "Agent Office is running at $apiUrl"
    Write-Host 'Keep this window open. Press Ctrl+C or close the window to stop the office.'
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw "Agent Office exited with code $($process.ExitCode)." }
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
} finally {
    if ($process -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
    }
}
