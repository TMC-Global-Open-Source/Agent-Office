param(
    [Parameter(Mandatory = $true)][ValidateSet('Backup', 'Restore', 'Diagnose', 'Uninstall')][string]$Action,
    [string]$Snapshot,
    [switch]$ConfirmRestore,
    [switch]$ConfirmUninstall
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'Office-Common.ps1')
try {
    $node = Initialize-OfficeRuntime $root
    $maintenance = Join-Path $root 'scripts\office-maintenance.mjs'
    if ($Action -eq 'Diagnose') {
        & $node $maintenance diagnose
        if ($LASTEXITCODE -ne 0) { throw 'Diagnostics failed. Review the error above.' }
        exit 0
    }
    if ($Action -eq 'Restore') {
        if (-not $Snapshot) { throw 'Provide -Snapshot with the backup directory printed by setup or backup.' }
        if (-not $ConfirmRestore -and (Read-Host 'Restore replaces the current database and settings. Type RESTORE to confirm') -cne 'RESTORE') {
            throw 'Restore cancelled; no data was changed.'
        }
    }
    if ($Action -eq 'Uninstall') {
        if (-not $ConfirmUninstall -and (Read-Host 'Remove the owned shortcut and hooks, preserving all data? Type UNINSTALL to confirm') -cne 'UNINSTALL') {
            throw 'Uninstall cancelled; no data was changed.'
        }
    }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'scripts\Stop-AgentOffice.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'Could not verify process ownership. Stop the original installation before maintenance.' }
    switch ($Action) {
        'Backup' { & $node $maintenance backup }
        'Restore' { & $node $maintenance restore $Snapshot --confirmed }
        'Uninstall' {
            # Do not change a shortcut or hook registration now owned by a different installation.
            & $node $maintenance unregister
            if ($LASTEXITCODE -ne 0) { throw 'Could not inspect/remove hook registration.' }
            $shortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Copilot Agent Office.lnk'
            if (Test-Path -LiteralPath $shortcutPath) {
                $shell = New-Object -ComObject WScript.Shell
                $shortcut = $shell.CreateShortcut($shortcutPath)
                if ($shortcut.TargetPath -eq (Join-Path $root 'Launch-Agent-Office.cmd')) {
                    Remove-Item -LiteralPath $shortcutPath
                } else {
                    Write-Host 'Desktop shortcut points to another installation; preserved.'
                }
            }
            Write-Host 'Uninstalled the owned shortcut and hooks. Application files, settings, databases, backups and logs are preserved.'
            Write-Host 'You may remove this application folder manually. No user-data deletion is performed by this command.'
        }
    }
    if ($LASTEXITCODE -ne 0) { throw "$Action failed. Review the error above." }
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
}
