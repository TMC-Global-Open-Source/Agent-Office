param(
    [Parameter(Mandatory = $true)][ValidateSet('Enable', 'Disable')][string]$Action,
    [string]$StartupDirectory = [Environment]::GetFolderPath('Startup')
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'Office-Autostart.ps1')
try {
    if ($Action -eq 'Enable') {
        . (Join-Path $PSScriptRoot 'Office-Common.ps1')
        $node = Initialize-OfficeRuntime $root
        $paths = Get-OfficePaths $root $node
        $null = Get-OfficeSettings $paths
        foreach ($path in @('node_modules\dotenv', 'apps\server\dist\index.js', 'apps\web\dist\index.html')) {
            if (-not (Test-Path -LiteralPath (Join-Path $root $path))) {
                throw 'The installed application is incomplete. Run Repair-Agent-Office.cmd before enabling autostart.'
            }
        }
    }
    Set-OfficeAutostart $Action $root $StartupDirectory
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
}
