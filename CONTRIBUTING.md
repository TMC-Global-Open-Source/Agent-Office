# Contributing

Use Node.js 20+ and npm. Run `npm install`, `npm run db:migrate`, and `npm run db:seed` for a seeded local database; `npm run dev` starts server and web workspaces. Before submitting changes, run `npm run format`, `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build`.

Keep shared provider contracts in `packages/shared`, provider-specific API code on the server, and scene components separate from dashboard UI. Tests must use mocked providers and must not require live GitHub credentials or calls. Never add tokens or local database files to source control.
