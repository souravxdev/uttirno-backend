---
name: verify
description: Verify the backend is healthy — build, lint, tests, OpenAPI emit,
  and health-endpoint smoke test. Use after any backend change, before handing
  off to the user for commit.
---
1. `pnpm build` — must produce dist/main.js with no errors.
2. `pnpm lint` — zero errors.
3. `pnpm test:e2e` — all green.
4. `pnpm openapi:emit` — openapi/openapi.json regenerates; the diff must
   show only intended contract changes.
5. Start the API and `curl http://localhost:3000/api/health` — expect
   `{"status":"ok","version":"..."}`. Stop the API afterwards.
6. If the contract changed, remind the user that the api-contract-sync
   skill (root repo) must run before any frontend work.
