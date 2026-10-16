param(
    [switch]$NoBrowser,
    [switch]$Foreground,
    # Listen on the network so other computers can view the office (read-only for them).
    [switch]$Share
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$process = $null
$backgroundReady = $false

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

function Get-NetworkUrls([int]$port) {
    try {
        # Prefer real network adapters (those with a default gateway) over virtual switches.
        $addresses = @(Get-NetIPConfiguration -ErrorAction Stop |
            Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
            ForEach-Object { $_.IPv4Address.IPAddress })
        if (-not $addresses.Count) {
            $addresses = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
                Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
                ForEach-Object { $_.IPAddress })
        }
        @("http://$($env:COMPUTERNAME):$port") + ($addresses | ForEach-Object { "http://${_}:$port" })
    } catch {
        @("http://$($env:COMPUTERNAME):$port")
    }
}

function Enable-OfficeFirewallRule([int]$port) {
    $ruleName = "Copilot Agent Office (TCP $port)"
    try {
        if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) { return $true }
        $identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
        if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { return $false }
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $port `
            -Action Allow -Profile Private, Domain | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Write-ShareInfo([int]$port) {
    $urls = @(Get-NetworkUrls $port)
    Write-Host ''
    Write-Host 'Sharing is on. Other computers on your network can view the office (read-only) at:'
    $urls | ForEach-Object { Write-Host "  $_" }
    if (-not (Enable-OfficeFirewallRule $port)) {
        Write-Host ''
        Write-Host "If other computers cannot connect, allow inbound TCP port $port in Windows Firewall"
        Write-Host '(run this launcher once as administrator to add the rule automatically, or accept'
        Write-Host 'the Windows Firewall prompt for Node.js on private networks).'
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
    $bindHost = if ($Share) { '0.0.0.0' } elseif ($settings.HOST) { $settings.HOST } else { '127.0.0.1' }
    $loopbackHosts = @('127.0.0.1', 'localhost', '::1')
    $sharing = $bindHost -notin $loopbackHosts
    $port = if ($settings.PORT) { [int]$settings.PORT } else { 4000 }
    $webPort = if ($settings.WEB_PORT) { [int]$settings.WEB_PORT } else { 5173 }
    if ($port -lt 1 -or $port -gt 65535 -or $webPort -lt 1 -or $webPort -gt 65535) {
        throw 'PORT and WEB_PORT must be between 1 and 65535.'
    }
    # Health checks and the local browser always use loopback; wildcard binds include it.
    $urlHost = if ($bindHost -eq '::1') { '[::1]' } elseif ($bindHost -in @('0.0.0.0', '::', '[::]')) { '127.0.0.1' } else { $bindHost }
    $apiUrl = "http://${urlHost}:$port"
    $health = Get-OfficeHealth $apiUrl
    if ($health) {
        if ($health.application -ne 'copilot-agent-office') {
            throw 'The configured API port is already occupied. Close that application and retry.'
        }
        if ($sharing -and -not $health.shared) {
            throw 'Agent Office is already running without sharing. Run Stop-Agent-Office.cmd, then launch again with sharing.'
        }
        $dashboardUrl = if ($health.mode -eq 'production') { $apiUrl } else { "http://${urlHost}:$webPort" }
        if (-not $NoBrowser) { Start-Process $dashboardUrl }
        Write-Host "Agent Office is already running at $dashboardUrl"
        if ($health.shared) { Write-ShareInfo $port }
        exit 0
    }
    $entry = Join-Path $root 'apps\server\dist\index.js'
    if (-not (Test-Path -LiteralPath $entry) -or -not (Test-Path -LiteralPath (Join-Path $root 'apps\web\dist\index.html'))) {
        throw 'Built application files are missing. Run Build-Agent-Office.cmd (or Install-Agent-Office.cmd for first setup).'
    }
    $env:NODE_ENV = 'production'
    $env:HOST = $bindHost
    $stateDir = Join-Path $root '.agent-office'
    if ($Foreground) {
        $process = Start-Process -FilePath $node.Source -ArgumentList @("`"$entry`"") -WorkingDirectory $root -NoNewWindow -PassThru
    } else {
        New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
        $process = Start-Process -FilePath $node.Source -ArgumentList @("`"$entry`"") -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $stateDir 'server.log') -RedirectStandardError (Join-Path $stateDir 'server-error.log')
    }
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if ($process.HasExited) { throw 'Agent Office stopped during startup. Review .agent-office\server-error.log (or the foreground console).' }
        $health = Get-OfficeHealth $apiUrl
        if ($health) {
            if ($health.application -ne 'copilot-agent-office') { throw 'Another application is using the configured port.' }
            $ready = $true
            break
        }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) { throw 'Agent Office did not become ready. Review .agent-office\server-error.log (or the foreground console) and .env settings.' }
    if (-not $Foreground) {
        @{
            pid = $process.Id
            startedAt = $process.StartTime.ToUniversalTime().ToString('o')
            entry = $entry
        } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stateDir 'server.json') -Encoding UTF8
        $backgroundReady = $true
    }
    if (-not $NoBrowser) { Start-Process $apiUrl }
    Write-Host ''
    Write-Host "Agent Office is running at $apiUrl"
    if ($sharing) { Write-ShareInfo $port }
    if ($backgroundReady) {
        Write-Host 'Running in the background. Use Stop-Agent-Office.cmd to stop it.'
        exit 0
    }
    Write-Host 'Keep this window open. Press Ctrl+C or close the window to stop the office.'
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw "Agent Office exited with code $($process.ExitCode)." }
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
} finally {
    if ($process -and -not $backgroundReady -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
    }
}
