# ADR 0002 — Electron over Tauri for the shop app

- **Status:** Accepted
- **Date:** 2026-09-15
- **Relates to:** IMPLEMENTATION_PLAN.md §14 (Desktop), Risk register #3

## Context

The shop app has to do four things that are all Windows-specific and all
unforgiving:

1. Enumerate printers and read their real status (`Get-Printer`, WMI
   `Win32_Printer`).
2. Read true "paper physically came out" signals over SNMP against the
   standard Printer MIB.
3. Drive a print with exact copies / duplex / colour / page-range settings.
4. Survive a power cut mid-queue without printing anything twice or losing a
   paid job.

The shell candidates were Electron, Tauri and .NET/WPF.

Tauri is better on paper: a 5–10 MB installer against Electron's ~150 MB, and
roughly 60 MB of RAM against ~200 MB. Shop PCs are not powerful machines, so
this is a real consideration and not vanity.

.NET/WPF is arguably the _correct_ answer for a Windows-only print utility:
first-class `System.Printing`, a tiny footprint, no bundled browser engine.

## Decision

**Electron + React + TypeScript, Windows x64 only.**

The deciding argument is where the risk sits. With Tauri, the printer layer,
the spooler polling and the SNMP client all land in Rust — which is exactly
the hardest and least-certain part of this build (Risk #2: cheap printers
report no useful status; Risk #3: SumatraPDF may not drive duplex on a given
driver). Node has prebuilt, well-travelled libraries for every one of those
four jobs. Paying a Rust learning curve precisely on the part of the system
most likely to need three attempts is the wrong trade.

The footprint saving buys nothing else: Windows-only means cross-platform
portability is worth zero here, and an installer size that only a shopkeeper
sees once is not a product problem.

.NET/WPF was rejected on a different axis — it splits the codebase across two
languages and slows UI iteration, and the operator UI (Phase 16) is where most
of the remaining product work is.

## Consequences

- ~150 MB installer, ~200 MB RAM per shop PC. Acceptable; measured during the
  Phase 21 pilot.
- One language across backend, desktop and shared domain logic, so
  `packages/shared` (pricing, state machine, protocol) runs unmodified in both
  processes. This is a large, ongoing win — the pricing engine that quotes a
  student and the one that validates on the device are literally the same code.
- `better-sqlite3` and `electron-builder` are native-module dependencies; the
  Windows build toolchain is now a CI requirement (Phase 19).
- Auto-update comes free via `electron-updater` against GitHub Releases.
- **Revisit trigger:** if pilot shop PCs prove too weak to keep the app open
  all day — the premise the entire product rests on (Risk #1) — reopen this
  for v2. Nothing in `packages/shared` would need to change; the rewrite would
  be confined to `apps/desktop/electron/`.
