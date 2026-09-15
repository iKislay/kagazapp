# Kagaz

Unattended self-service printing for local print shops.

A student sends a file to a WhatsApp bot, picks options, pays, and the print
comes out automatically at the shop. The shop operator does nothing in the
normal path — they open the Kagaz desktop app in the morning and close it at
night. The app being open *is* the shop being open.

## Status

Pre-development. No code yet.

## Start here

**[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)** — the PRD, full system
design (schema, state machine, ledger, protocols) and a 22-phase build plan.

## Stack

| Layer | Choice |
|---|---|
| Shop app | Electron + React + TypeScript, Windows only |
| Backend | Node 20 + Fastify + TypeScript |
| Database | PostgreSQL |
| Storage | Cloudflare R2 |
| Messaging | Meta WhatsApp Cloud API |
| Payments | Razorpay + Razorpay Route |
