# Technical-preview distribution

## What users receive

The preview is an **unsigned source ZIP**, not an MSI or standalone executable.
It requires Windows, PowerShell 5.1+, Node.js 22.13+ and internet access to install
locked npm dependencies. Node 22 and 24 are exercised by Windows CI. No Node
runtime, credentials, personal hooks, database, compiled app or `node_modules`
directory is included. Source is MIT licensed; see `LICENSE` and
`THIRD-PARTY-NOTICES.md`. The lockfile inventory is `DEPENDENCIES.json`.

## Install

1. Download `AgentOffice-<version>-source.zip` and its `.sha256` file from the
   same GitHub release. Compare `Get-FileHash <zip-path> -Algorithm SHA256` with
   the published checksum. A checksum detects corruption, not publisher identity.
2. Extract into a permanent local folder. Do not run inside the ZIP.
3. Install Node.js if necessary, then run `Install-Agent-Office.cmd`.
4. Wait for **Setup complete**, then use the desktop shortcut.

The app and its scripts are unsigned. This project does not ask users to disable
SmartScreen, antivirus or system security warnings; consult your administrator
if organizational policy blocks execution.

Data normally lives in `%LOCALAPPDATA%\AgentOffice`. Use `-DataDirectory` for
separate installations. Source copies on one computer otherwise share that default;
do not run multiple instances against the same SQLite database.

## Supported integrations

Local Copilot CLI lifecycle-hook delivery is verified. Compatible VS Code local
agent hooks are supported by the bridge, but event support depends on the harness.
Desktop-app hook loading remains **unverified**. Cloud/browser chats cannot be
assumed to report to this local server. `connect:agents` registers a file; it does
not prove that a client loaded it. Diagnose reports the last received local event.

## Upgrade and rollback

Stop the old application, retain its versioned source ZIP, update/extract the new
source, and run repair. Before applying schema migrations, setup creates a SQLite
backup plus settings snapshot in `<data-directory>\backups\<timestamp>`.
Backup failure aborts migration. Backups contain credentials and should be kept
private; they are not automatically expired or uploaded.

For a manual snapshot, run `Backup-Agent-Office.cmd`. It stops the owned server;
launch it again afterwards. Close foreground/dev servers before maintenance.

To roll back:

1. Stop the new version and restore the matching older application files.
2. Run `Restore-Agent-Office.cmd -Snapshot '<full-backup-directory>'`.
3. Type `RESTORE` when prompted. Restore verifies the SQLite file/checksum and
   destination path, and snapshots the current database before replacing it.
4. Launch the matching version. **Do not run the newer repair immediately after
   restoring**, because it would reapply the migrations.

Snapshots are intended for recovery of the same installation, not untrusted
imports or moving data between unrelated paths. Restore is not a two-file
transaction: if writing settings fails after replacing the database, the command
reports failure and a recovery snapshot. Keep the server stopped until recovered.
If the active `.env` is missing, recover it from `settings.env` in a known snapshot
before invoking restore. Never overwrite another instance's configuration blindly.

## Diagnose and uninstall

`Diagnose-Agent-Office.cmd` reports app/Node versions, active paths, port, health,
hook ownership/token agreement and the last received hook. It does not print token
values, hook commands or settings contents. Paths may identify your Windows user
or workspace; redact them before sharing publicly.

`Uninstall-Agent-Office.cmd` asks for `UNINSTALL`, stops only a verified owned
server, and removes only its own desktop shortcut and hook registration.
Application files, `.env`, databases, snapshots, logs and other instances' hooks
are preserved. No automatic user-data deletion option is provided. Remove the app
folder manually afterwards if desired; retain data until you explicitly decide
to discard it. Uninstall does not remove Node.js, npm, or Windows Firewall rules
that might also be used by other installations.

## Maintainer release procedure

1. Update `package.json` version and `CHANGELOG.md`; regenerate the lockfile.
2. Commit all release inputs. Run `npm ci`, the normal checks, and
   `npm run release:preview` on Windows. The source archive is assembled only from
   tracked allowlisted files; untracked files are not included.
3. Run `scripts\Test-PreviewRelease.ps1 -Archive <zip>` to exercise install,
   repair/upgrade, relocation and data-preserving uninstall on extracted files.
4. Tag the reviewed commit `v<version>` and push the tag. GitHub Actions validates
   the tag/version, runs checks on Windows Node 22 and 24, and publishes a
   **prerelease** with source ZIP/checksum after both jobs pass.

The CI release job uses only a repository-scoped GitHub token. Signing, bundled
runtimes, installers and automatic updating are intentionally outside this preview.
Do not silently expand the archive to binaries without reviewing full upstream
license/notice requirements and native component architectures.
