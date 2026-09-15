# ADR 0001 — Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-09-15

## Context

`IMPLEMENTATION_PLAN.md` §14 pins a technology stack and states that
"rationale is recorded so future-you does not relitigate". A plan document is
a poor place to keep that record: it describes the system as it is meant to
be, not the sequence of choices that produced it, and it gets rewritten.

Six months from now the questions that will actually come up are of the form
"why didn't we just use X?" — and without a written answer, the argument gets
had a second time, usually at a worse moment.

## Decision

Every decision that is expensive to reverse gets an ADR in `docs/adr/`,
numbered sequentially, in the format used by this file: Context, Decision,
Consequences. An ADR is immutable once accepted. A later decision that
supersedes it gets its own ADR and both are marked.

What warrants an ADR:

- A pinned dependency that would be costly to swap (the runtime, the database,
  the payment provider, the desktop shell).
- A modelling decision that the schema encodes (money in integer paise,
  pricing per physical sheet, double-entry ledger).
- Anything in §14's "considered and rejected" list.
- Anything in Appendix D once it is settled — record the answer both in the
  Appendix D table and, if it is structural, as an ADR.

What does not: library choices that are one afternoon to replace, file layout,
naming.

## Consequences

- A small, permanent cost per structural decision.
- `docs/adr/` becomes the first place to look when a choice is questioned.
- Appendix D of the plan stays the live register of _open_ questions; ADRs are
  the record of _closed_ ones.
