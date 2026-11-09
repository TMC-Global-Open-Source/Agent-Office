# Changelog

## 0.1.0 - Technical preview

- Windows source-folder setup, repair, launch and ownership-checked stop.
- Per-user configuration and SQLite data with non-destructive legacy migration.
- Node.js discovery, configured-port lifecycle hooks and startup diagnostics.
- N-API SQLite dependency to avoid the Node.js 24 native cleanup assertion.
- Pre-migration backups, explicit restore, diagnostic and uninstall commands.
- Versioned source release ZIPs, SHA-256 checksums and dependency inventory.

Local Copilot CLI hook delivery is verified. Desktop-app hook loading remains
unverified. Registration writes configuration; it does not confirm event delivery.
This preview requires Windows, PowerShell 5.1+, Node.js 22.13+ and internet access
for npm dependencies. No runtime, signed installer or automatic updater is bundled.
