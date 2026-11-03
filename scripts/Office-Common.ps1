function Initialize-OfficeRuntime {
    param([string]$Root)
    $candidates = @()
    $manifestPath = Join-Path $Root '.agent-office\installation.json'
    if (Test-Path -LiteralPath $manifestPath) {
        $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        if ($manifest.nodePath) { $candidates += $manifest.nodePath }
    }
    $command = Get-Command node -ErrorAction SilentlyContinue
    if ($command) { $candidates += $command.Source }
    foreach ($candidate in $candidates | Select-Object -Unique) {
        if (Test-OfficeNode $candidate) { return $candidate }
    }
    $fnm = Get-Command fnm -ErrorAction SilentlyContinue
    if ($fnm) {
        $initialization = & $fnm.Source env --shell powershell
        if ($LASTEXITCODE -eq 0) {
            $initialization | Out-String | Invoke-Expression
            & $fnm.Source use default | Out-Host
            if ($LASTEXITCODE -eq 0) {
                $command = Get-Command node -ErrorAction SilentlyContinue
                if ($command -and (Test-OfficeNode $command.Source)) { return $command.Source }
            }
        }
    }
    throw 'Node.js 22.13 or newer was not found. Install a current LTS from https://nodejs.org, or set a supported fnm default, then run Repair-Agent-Office.cmd.'
}

function Test-OfficeNode([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    $versionText = & $Path -p 'process.versions.node'
    if ($LASTEXITCODE -ne 0) { return $false }
    $version = $null
    if (-not [version]::TryParse(($versionText | Out-String).Trim(), [ref]$version)) { return $false }
    if ($version -lt [version]'22.13.0') { return $false }
    $env:PATH = "$(Split-Path $Path -Parent);$env:PATH"
    return $true
}

function Get-OfficePaths([string]$Root, [string]$Node) {
    $json = & $Node (Join-Path $Root 'scripts\manage-installation.mjs') paths
    if ($LASTEXITCODE -ne 0) { throw 'Could not resolve settings. Run Repair-Agent-Office.cmd.' }
    return ($json | Out-String | ConvertFrom-Json)
}

function Get-OfficeSettings($Paths) {
    if (-not (Test-Path -LiteralPath $Paths.envPath)) {
        throw "Settings are missing at $($Paths.envPath). Run Install-Agent-Office.cmd (or Repair-Agent-Office.cmd after a move)."
    }
    $settings = @{}
    foreach ($property in $Paths.settings.PSObject.Properties) {
        $settings[$property.Name] = $property.Value
    }
    return $settings
}
