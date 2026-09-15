# Kagaz

Unattended self-service printing for local print shops.

A student sends a file to a WhatsApp bot, picks options, pays, and the print
comes out automatically at the shop. The shop operator does nothing in the
normal path — they open the Kagaz desktop app in the morning and close it at
night. The app being open _is_ the shop being open.

## Status

**Phase 0–1 of 21.** Foundations and data model. No business logic yet — the
next phase is the pure domain layer (pricing, page ranges, money, the order
state machine).

## Start here

**[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)** — the PRD, full system
design (schema, state machine, ledger, protocols) and a 22-phase build plan.

**[apps/backend/prisma/README.md](./apps/backend/prisma/README.md)** — database
setup, migrations, and the conventions the money data depends on.

## Stack

| Layer     | Choice                                      |
| --------- | ------------------------------------------- |
| Shop app  | Electron + React + TypeScript, Windows only |
| Backend   | Node 20 + Fastify + TypeScript              |
| Database  | PostgreSQL + Prisma                         |
| Storage   | Cloudflare R2                               |
| Messaging | Meta WhatsApp Cloud API                     |
| Payments  | Razorpay + Razorpay Route                   |

## Getting started

```bash
pnpm install
cp .env.example .env          # fill in DATABASE_URL at minimum

# database — see apps/backend/prisma/README.md for the first-run migration steps
pnpm db:reset

pnpm dev:backend              # http://localhost:8080/health
pnpm dev:desktop              # the Electron shell
```

Checks, the same three CI runs:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

## Layout

```
apps/backend     Fastify API, Prisma schema, migrations, seed
apps/desktop     Electron shop app (main process + React renderer)
packages/shared  pure domain logic shared by both — no I/O, ever
packages/config  eslint / prettier / tsconfig presets
docs/adr         architecture decision records
```
