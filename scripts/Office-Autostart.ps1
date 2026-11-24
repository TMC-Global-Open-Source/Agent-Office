function Get-OfficeAutostartSpec([string]$root, [string]$startupDirectory) {
    $script = Join-Path $root 'scripts\Start-AgentOfficeAutostart.ps1'
    return @{
        path = Join-Path $startupDirectory 'Copilot Agent Office.lnk'
        target = Join-Path $PSHOME 'powershell.exe'
        arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
    }
}

function Test-OfficeAutostartOwnership($shortcut, $spec, [string]$root) {
    return $shortcut.TargetPath -eq $spec.target -and
        $shortcut.Arguments -eq $spec.arguments -and
        $shortcut.WorkingDirectory -eq $root
}

function Set-OfficeAutostart([string]$action, [string]$root, [string]$startupDirectory, [switch]$PreserveOther) {
    if (-not (Test-Path -LiteralPath $startupDirectory -PathType Container)) {
        throw "Windows Startup folder is unavailable: $startupDirectory"
    }
    $spec = Get-OfficeAutostartSpec $root $startupDirectory
    $shell = New-Object -ComObject WScript.Shell
    if (Test-Path -LiteralPath $spec.path) {
        $shortcut = $shell.CreateShortcut($spec.path)
        if (-not (Test-OfficeAutostartOwnership $shortcut $spec $root)) {
            if ($PreserveOther) {
                Write-Host 'Autostart shortcut belongs to another installation or has been modified; preserved.'
                return
            }
            throw "Startup shortcut belongs to another installation or has been modified: $($spec.path). It was not changed."
        }
        if ($action -eq 'Disable') {
            Remove-Item -LiteralPath $spec.path
            Write-Host 'Autostart disabled for this installation. A running server was not stopped.'
        } else {
            Write-Host 'Autostart is already enabled for this installation.'
        }
        return
    }
    if ($action -eq 'Disable') {
        Write-Host 'Autostart is not enabled for this installation. A running server was not stopped.'
        return
    }
    $shortcut = $shell.CreateShortcut($spec.path)
    $shortcut.TargetPath = $spec.target
    $shortcut.Arguments = $spec.arguments
    $shortcut.WorkingDirectory = $root
    $shortcut.WindowStyle = 7
    $shortcut.Description = 'Start Copilot Agent Office in the background when this user signs in'
    $shortcut.Save()
    Write-Host "Autostart enabled for this Windows user at sign-in: $($spec.path)"
    Write-Host 'The server starts without opening a browser. Use the desktop shortcut to open the dashboard.'
}
