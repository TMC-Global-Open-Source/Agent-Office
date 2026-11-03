param([string]$OutputDirectory = (Join-Path (Split-Path $PSScriptRoot -Parent) 'releases'))
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'Office-Common.ps1')
$stage = $null
$completed = $false
$archiveCreated = $false
$archive = $null
$temporaryArchive = $null
try {
    $node = Initialize-OfficeRuntime $root
    $changes = & git -C $root status --porcelain --untracked-files=normal
    if ($LASTEXITCODE -ne 0) { throw 'Release packaging requires a Git checkout.' }
    if ($changes) { throw 'Commit or otherwise resolve working-tree changes before packaging a release.' }
    $version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
    New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
    $output = (Resolve-Path -LiteralPath $OutputDirectory).Path
    $archive = Join-Path $output "AgentOffice-$version-source.zip"
    if ((Test-Path -LiteralPath $archive) -or (Test-Path -LiteralPath "$archive.sha256")) { throw "Release already exists: $archive. Choose another output folder." }
    $stage = Join-Path $output ("stage-" + [Guid]::NewGuid().ToString('N'))
    & $node (Join-Path $root 'scripts\prepare-release.mjs') $stage
    if ($LASTEXITCODE -ne 0) { throw 'Release staging failed.' }
    # Compress-Archive can omit dotfiles; ZipFile includes .env.example and all source configuration.
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $temporaryArchive = Join-Path $output ([Guid]::NewGuid().ToString('N') + '.zip')
    [IO.Compression.ZipFile]::CreateFromDirectory($stage, $temporaryArchive)
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        $hash = [BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($temporaryArchive))).Replace('-', '').ToLowerInvariant()
    } finally { $sha.Dispose() }
    Move-Item -LiteralPath $temporaryArchive -Destination $archive
    $archiveCreated = $true
    "$hash  $([IO.Path]::GetFileName($archive))" | Set-Content -LiteralPath "$archive.sha256" -Encoding ASCII
    $completed = $true
    Write-Host "Release ready: $archive"
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
} finally {
    if ($stage -and (Test-Path -LiteralPath $stage)) { Remove-Item -LiteralPath $stage -Recurse -Force }
    if ($temporaryArchive -and (Test-Path -LiteralPath $temporaryArchive)) { Remove-Item -LiteralPath $temporaryArchive }
    if (-not $completed -and $archiveCreated -and (Test-Path -LiteralPath $archive)) {
        Remove-Item -LiteralPath $archive
    }
}
