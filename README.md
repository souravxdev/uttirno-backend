# uttirno-backend

NestJS 11 API for Uttirno — MCQ exam prep platform for Bangladeshi govt job
aspirants (POC: BCS Preliminary).

## Commands

```bash
pnpm install          # install dependencies
pnpm start:dev        # run API in watch mode (http://localhost:3000/api)
pnpm build            # compile to dist/
pnpm lint             # eslint (--fix)
pnpm test:e2e         # end-to-end tests
pnpm openapi:emit     # write openapi/openapi.json (no server start)
```

## API contract

`openapi/openapi.json` is the single source of truth for frontend API types.
After any controller/DTO/route change: `pnpm openapi:emit`, then regenerate
the frontend client in `uttirno-frontend` (`pnpm api:generate`). Backend
commits first, frontend regeneration second.

## Endpoints

- `GET /api/health` — service status and version
