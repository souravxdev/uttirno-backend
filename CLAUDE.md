# Uttirno backend — NestJS 11 + Prisma + Postgres 16

## Module layout
One module per domain: auth, taxonomy (exam/subject/topic), questions,
quiz-sessions, import. No god modules.

## Conventions
- DTO validation with zod pipes; domain zod schemas live in src/domain/
- Config via @nestjs/config with a validated env schema; no raw process.env
- Every controller/DTO change must keep @nestjs/swagger decorators
  complete — the OpenAPI spec is the public contract
- `pnpm openapi:emit` writes openapi/openapi.json without starting the server
- JWT auth (access + refresh), passport-jwt; roles: LEARNER | ADMIN

## Data invariants (enforce in zod AND at DB level where possible)
- Correct answers never leave the server before session submission
- Scoring server-side only; negative marking 0.50 per wrong answer
- sourceYear + sourceExam required when sourceType = PAST_PAPER
- AI_GENERATED questions enter as DRAFT or IN_REVIEW, never PUBLISHED

## Dependencies
Do not add beyond: prisma, zod, @nestjs/config, @nestjs/swagger,
passport-jwt, argon2. Ask before anything else.

## Database
- Postgres 16 via docker-compose; never prisma migrate reset without asking
- All text columns UTF-8; verify Bangla round-trips in any new text field

## Git
Claude NEVER runs git operations (see root git-handoff skill): stop at
each committable portion, report changed files, suggest a conventional
commit message, and wait for the user to commit.
