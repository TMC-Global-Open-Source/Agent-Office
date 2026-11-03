# Third-party notices

Agent Office source is MIT licensed; dependencies retain their respective licenses.
The technical-preview ZIP is source-only: it does not redistribute Node.js, npm
packages, generated Prisma clients, or compiled application assets. Setup downloads
dependencies pinned by `package-lock.json`; their license information and notices
are included in the downloaded packages.

Release archives include `DEPENDENCIES.json`, generated from the lockfile. It lists
dependency versions, integrity hashes and declared licenses, including development
and platform-specific dependencies. This inventory is not a substitute for the
packages' full license texts. Review upstream terms before redistributing a bundled
runtime or binary build; those forms are not part of this technical preview.

Notable runtime components include React, Three.js, Express, Socket.IO, Zod,
Prisma, better-sqlite3 and SQLite. Node.js is installed separately by the user.
