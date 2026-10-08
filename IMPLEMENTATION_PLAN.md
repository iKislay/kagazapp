# Kagaz — PRD & Implementation Plan

**Unattended self-service printing for local print shops.**

| | |
|---|---|
| Document version | 1.0 |
| Date | 15 September 2026 |
| Repository | `github.com/iKislay/kagazapp` |
| Status | Pre-development. No code written yet. |

---

## Table of contents

**Part A — Product Requirements**
1. [Problem](#1-problem)
2. [Solution](#2-solution)
3. [Goals and non-goals](#3-goals-and-non-goals)
4. [Personas](#4-personas)
5. [Glossary](#5-glossary)
6. [User stories](#6-user-stories)
7. [Functional requirements](#7-functional-requirements)
8. [Non-functional requirements](#8-non-functional-requirements)
9. [Business model](#9-business-model)
10. [Legal and compliance constraints](#10-legal-and-compliance-constraints)
11. [Success metrics](#11-success-metrics)
12. [Explicitly out of scope for v1](#12-explicitly-out-of-scope-for-v1)

**Part B — System Design**
13. [Architecture overview](#13-architecture-overview)
14. [Pinned technology stack](#14-pinned-technology-stack)
15. [Repository layout](#15-repository-layout)
16. [Database schema](#16-database-schema)
17. [Order state machine](#17-order-state-machine)
18. [Money: ledger design](#18-money-ledger-design)
19. [Money: Razorpay Route flow](#19-money-razorpay-route-flow)
20. [Pricing engine](#20-pricing-engine)
21. [File pipeline](#21-file-pipeline)
22. [Printer status model](#22-printer-status-model)
23. [WebSocket protocol](#23-websocket-protocol)
24. [REST API](#24-rest-api)
25. [WhatsApp conversation design](#25-whatsapp-conversation-design)
26. [Security and privacy](#26-security-and-privacy)
27. [Error taxonomy and refund rules](#27-error-taxonomy-and-refund-rules)

**Part C — Implementation Plan**
28. [Phase list](#28-phase-list)
29. [Phases 0–10](#phase-0--foundations)
30. [Phases 11–20](#phase-11--ledger-and-wallet)

**Part D — Appendices**
31. [Environment variables](#appendix-a--environment-variables)
32. [Test plan](#appendix-b--test-plan)
33. [Risk register](#appendix-c--risk-register)
34. [Open decisions](#appendix-d--open-decisions)

---
---

# PART A — PRODUCT REQUIREMENTS

## 1. Problem

The current flow at a college-gate print shop:

1. Student walks to the shop and finds the owner's WhatsApp number written on the wall or on a board.
2. Student sends the file to that number.
3. Student verbally tells the owner what they want — number of copies, black-and-white or colour, single or double sided, which pages.
4. Owner stops what he is doing, scrolls his desktop WhatsApp to find that message, opens the file, applies the settings by hand in the print dialog, and prints.
5. Student waits, pays cash, collects.

Every step from 2 to 4 is manual and the owner is the bottleneck. Concretely:

| Problem | Consequence |
|---|---|
| Order capture is verbal and unstructured | Wrong settings, reprints, wasted paper, arguments |
| The owner must personally handle every job | A queue forms; students leave during exam week; the shop caps out at the owner's speed |
| Settings are applied by hand each time | 30–60 seconds of owner attention per order, repeated hundreds of times a day |
| Payment is cash and untracked | No record of what was printed or collected; staff skimming is invisible to the owner |
| Collection is a pile of paper on a counter | Mismatched handovers, lost documents, no accountability |
| Shop is only "open" when a human is at the desk | Every order outside those hours is lost revenue |

The printing itself is not the problem. Any Windows PC can print. **Everything around the print is the problem.**

## 2. Solution

Kagaz turns the shop's existing printer into a self-service print vending machine.

```
Student                  Kagaz Cloud                 Shop PC (Kagaz Desktop)
   |                          |                              |
   |  1. opens WhatsApp       |                              |
   |------------------------->|                              |
   |                          | 2. is the shop online?       |
   |                          |<---------------- heartbeat --|
   |  3. uploads file         |                              |
   |------------------------->|                              |
   |                          | 4. convert to PDF, count pages
   |  5. options + price      |                              |
   |<-------------------------|                              |
   |                          | 6. preflight: can you print? |
   |                          |----------------------------->|
   |                          |<--------------- yes/no ------|
   |  7. payment link         |                              |
   |<-------------------------|                              |
   |  8. pays                 |                              |
   |------------------------->|                              |
   |                          | 9. dispatch job              |
   |                          |----------------------------->|
   |                          |                              | 10. prints
   |                          |<----------- confirmed -------|
   |  11. "ready, token #47"  |                              |
   |<-------------------------|                              |
   |                                                         |
   |  12. walks in, shows token, collects                    |
```

The shop operator does nothing in the normal path. He opens the Kagaz desktop app in the morning and closes it at night. That is his entire interaction.

**Key design decision — the app *is* the open sign.** If the Kagaz desktop app is not running, the shop is offline, the WhatsApp bot refuses new orders for it, and no money is taken. There is no separate "open/closed" toggle to forget, no background service running when the shop is shut, and no possibility of an order arriving that cannot be fulfilled.

## 3. Goals and non-goals

### Goals (v1)

- G1. A student can go from "I have a PDF" to "my print is done" without speaking to anyone.
- G2. The shop operator's per-order effort is zero in the happy path.
- G3. Every rupee is recorded. The owner can see exactly what was printed and what he earned.
- G4. Money reaches the shop owner's bank account automatically, with no manual transfer by Kagaz.
- G5. A paid order that cannot be printed is refunded automatically, without a human deciding.
- G6. The shop can be set up by a non-technical owner in under 15 minutes.

### Non-goals (v1)

- N1. Not a marketplace. One student talks to one shop. No shop discovery, no comparing prices.
- N2. Not a document store. Files are deleted within 24 hours.
- N3. Not a delivery service. Collection is in person at the shop.
- N4. No mobile app for anyone.
- N5. No web interface for students. WhatsApp only. (The Razorpay checkout page is the sole web surface the student sees.)
- N6. No multi-shop routing, no "nearest printer" logic.

## 4. Personas

**Ravi — the student (user, not customer).**
Second year engineering. Prints 20–60 pages a week, spiking to 300 during exams. Has WhatsApp, uses UPI for everything, will not install an app to print. Price-sensitive to the rupee. Wants to not stand in a queue.

**Suresh — the shop owner (customer).**
Runs a 2-printer shop outside the college gate. Profit ₹800–1,500 a day. Not technical; uses Windows because that is what the computer came with. Two things keep him awake: losing business to the shop next door, and not knowing whether his assistant is pocketing cash. He will not pay for "convenience." He will pay for *more orders* and *visible money*.

**Kagaz admin (you).**
Onboards shops, handles disputes, releases withdrawals in the early days, watches for abuse.

## 5. Glossary

| Term | Meaning |
|---|---|
| **Shop** | One business. Has a rate card, a wallet, one or more printers. |
| **Device** | One installation of the Kagaz desktop app, bound to exactly one shop. |
| **Online** | The device holds a live WebSocket to the backend and has sent a heartbeat within 30 seconds. |
| **Order** | One student request: one source file, one set of print options, one payment. |
| **Job** | The printable unit dispatched to a device. One order produces one job in v1. |
| **Rate card** | The shop's per-page prices and add-on charges. |
| **Wallet** | The shop's Kagaz balance. Mirrors Razorpay Route on-hold transfers. |
| **Preflight** | A synchronous check with the device, before payment, that the job can be printed now. |
| **Token** | The short pickup number printed on the cover sheet and sent to the student. |
| **Paise** | All money in this system is stored as integer paise. Never floats, never rupees. |

## 6. User stories

### Student

- S1. As a student, I message the shop's Kagaz number on WhatsApp and get a reply within 3 seconds telling me whether the shop is open.
- S2. As a student, I send a PDF/DOCX/JPG and am told exactly how many pages it is before I pay.
- S3. As a student, I choose colour mode, sides, copies and page range using tappable buttons, not by typing.
- S4. As a student, I see the exact total in rupees before paying.
- S5. As a student, I pay by UPI from inside WhatsApp and get confirmation.
- S6. As a student, I get a message with a pickup token when my print is physically done.
- S7. As a student, if the print fails, I get my money back without asking.
- S8. As a student, I can cancel before payment at any point by typing "cancel".
- S9. As a student, I can reprint a previous order from the last 24 hours without re-uploading.

### Shop operator

- O1. As an operator, I open one application in the morning and my shop starts taking orders.
- O2. As an operator, I close that application and orders stop. No half-finished job is lost.
- O3. As an operator, I see today's orders, what was printed, and how much I made, without clicking anything.
- O4. As an operator, I set my own prices per page and can change them at any time.
- O5. As an operator, I can cap how many pages a single order may contain.
- O6. As an operator, I can require my approval for orders above a page count I choose.
- O7. As an operator, I see which of my printers is out of paper or toner before a customer does.
- O8. As an operator, I can request a withdrawal of my wallet balance to my bank account.
- O9. As an operator, I can mark a printer as under maintenance and orders route to my other printer.

### Admin

- A1. As an admin, I onboard a shop, generate a pairing code, and collect their bank details for Razorpay Route.
- A2. As an admin, I see every order across all shops and its full state history.
- A3. As an admin, I can manually refund any order.
- A4. As an admin, I am alerted when a shop goes offline with paid, undelivered orders.

## 7. Functional requirements

Numbered so tasks in Part C can reference them.

### Shop and device

- **FR-1** A shop record holds: name, address, contact phone, GSTIN (optional), rate card, page caps, business rules, Razorpay linked account ID, status (active/suspended).
- **FR-2** A shop has exactly one WhatsApp entry point in v1 (one Kagaz number, shop selected by a per-shop keyword or QR deep link `wa.me/<num>?text=SHOP-<code>`).
- **FR-3** A device is paired to a shop using a one-time 8-character pairing code generated by admin, exchanged for a long-lived device JWT.
- **FR-4** A device opens an outbound WebSocket to the backend on launch and sends a heartbeat every 15 seconds.
- **FR-5** A shop is `online` if and only if a device socket is open and the last heartbeat is under 30 seconds old.
- **FR-6** When the socket closes, the shop is marked offline within 30 seconds and new orders are refused.
- **FR-7** On launch the device reports its printer list, each printer's capabilities (colour, duplex, paper sizes) and current status.

### Order intake

- **FR-8** The bot accepts PDF, DOCX, DOC, PPTX, XLSX, JPG, PNG, and WEBP. Max 50 MB per file. Max 1 file per order in v1.
- **FR-9** Every non-PDF upload is converted to PDF server-side before anything else happens.
- **FR-10** Page count is read from the converted PDF, never from the source file.
- **FR-11** The student is shown the page count and a thumbnail of page 1 before being asked to choose options.
- **FR-12** Options collected: colour mode (BW / colour), sides (single / double), copies (1–20), page range (all / custom), paper size (A4 default; A3 only if a printer supports it).
- **FR-13** Page range accepts the format `1-5,8,11-13`. Invalid ranges are rejected with an explanation, not silently corrected.
- **FR-14** The quoted price is computed from the shop's rate card at the moment of quoting and frozen onto the order. A later rate card change does not affect a quoted order.
- **FR-15** A quote expires after 15 minutes. An expired quote must be re-confirmed, and is re-priced.
- **FR-16** Orders above the shop's `max_pages_per_order` are refused before payment with a message telling the student to visit the counter.
- **FR-17** Orders above the shop's `approval_threshold_pages` enter `AWAITING_APPROVAL` and are dispatched only after the operator approves in the desktop app. Payment is still taken first; rejection triggers a full refund.

### Preflight and payment

- **FR-18** Before a payment link is issued, the backend sends a preflight request to the device and waits up to 5 seconds. The device replies with which printer would take the job and whether it can right now.
- **FR-19** If preflight fails (no paper, no toner, printer offline, no colour printer available for a colour job), no payment link is issued and the student is told why.
- **FR-20** Payment is via a Razorpay payment link. UPI, cards and netbanking enabled.
- **FR-21** Order transitions to `PAID` only on a verified `payment.captured` webhook. Never on a client-side success callback.
- **FR-22** All webhook handling is idempotent, keyed on Razorpay event ID.
- **FR-23** An unpaid payment link expires after 15 minutes, and the order moves to `EXPIRED`.

### Printing

- **FR-24** On `PAID`, the backend dispatches the job over the WebSocket with a presigned PDF URL valid for 10 minutes.
- **FR-25** The device downloads the entire PDF to a local temp directory before starting to print.
- **FR-26** If the internet drops after download, the device still completes the job from its local queue and reports the result when it reconnects.
- **FR-27** The device prints a cover sheet first, carrying the token number in large type, the student's masked phone number, page count and options.
- **FR-28** Print settings (copies, duplex, colour, page range, paper size) are applied programmatically. The operator is never shown a print dialog.
- **FR-29** After printing, the device confirms completion. For network printers this is an SNMP page-counter delta matching expected sheets. For USB printers it is the spooler job reaching `Printed` with no error flags.
- **FR-30** On confirmed completion the order moves to `COMPLETED` and the student is notified with the token.
- **FR-31** The device deletes the local PDF and the temp files immediately after the job reaches a terminal state.

### Money

- **FR-32** Every money movement is written as a balanced double-entry transaction. No balance is ever stored as a mutable number.
- **FR-33** The shop wallet balance is derived by summing ledger entries, and is reconciled daily against Razorpay Route.
- **FR-34** Kagaz's commission is deducted at split time, not invoiced later.
- **FR-35** The shop can request a withdrawal. In v1 this releases the Route transfer hold, and Razorpay settles to the shop's bank on its own schedule.
- **FR-36** Refunds are automatic for every failure class listed in §27. Manual refunds are admin-only and always leave a ledger trail.

### Notifications

- **FR-37** The student is messaged on: order received, quote ready, payment confirmed, print started, print complete with token, any failure with refund status.
- **FR-38** Messages sent more than 24 hours after the student's last message must use an approved WhatsApp template.

### Data lifecycle

- **FR-39** Source files and converted PDFs are deleted 24 hours after the order reaches a terminal state, enforced by both an application job and an object-storage lifecycle rule.
- **FR-40** Order metadata (who, what options, how much) is retained for 7 years for accounting. File contents are not.
- **FR-41** The shop operator can never download or open a student's file. The desktop app prints it and discards it.

## 8. Non-functional requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-1 | Bot first response time | < 3 s p95 |
| NFR-2 | PDF conversion + page count | < 10 s p95 for a 50-page DOCX |
| NFR-3 | Preflight round trip | < 5 s timeout, < 1 s typical |
| NFR-4 | Payment webhook to job dispatch | < 2 s |
| NFR-5 | Desktop app idle RAM | < 400 MB |
| NFR-6 | Desktop app installer size | < 200 MB |
| NFR-7 | Backend availability | 99% in pilot, 99.9% after |
| NFR-8 | Money correctness | Ledger must balance to zero at all times. Enforced by a test and a daily job. |
| NFR-9 | Reconnect after network drop | Automatic, exponential backoff, max 30 s |
| NFR-10 | Supported OS | Windows 10 1809+ and Windows 11, 64-bit |

## 9. Business model

**Revenue: a percentage commission per order, taken at split time.**

Start at **5% of order value, with a ₹1 minimum**, and revisit after the pilot. On a ₹30 order that is ₹1.50. Kagaz's gateway cost is roughly 2% (Razorpay standard) plus 0.25% (Route transfer), so the gross margin on that order is about ₹0.80. This is thin by design — the pitch to the shop is that Kagaz brings orders the shop would otherwise not have taken, not that it is cheap.

**Why commission rather than SaaS:** you are already in the money flow for the wallet to work. Adding a subscription on top is a second, harder sell to a shop owner who has not yet seen value. Revisit once a shop has 90 days of history showing incremental revenue — then a SaaS tier becomes an easy upsell.

**What the shop is told:**
- You keep your own prices. Kagaz does not set them.
- You pay nothing upfront and nothing monthly.
- Kagaz takes 5% of what students pay through Kagaz. Walk-in cash customers are untouched.
- Your money is visible in the app and reaches your bank automatically.

**Unit economics to track from day one:** orders per shop per day, average order value, commission per shop per month, gateway cost per order, WhatsApp message cost per order (~₹0.30 for two utility templates), refund rate, support minutes per shop per week.

## 10. Legal and compliance constraints

**This section is a constraint on the design, not legal advice. Have a CA and a lawyer review before taking real money.**

- **C1. Kagaz must not hold customer funds in its own account.** Under the RBI Payment Aggregator Directions, an entity that collects payments on behalf of merchants and settles to them is a payment aggregator, requires authorisation, must keep funds in an escrow account with a scheduled commercial bank, and must meet a ₹15 crore net worth bar at application rising to ₹25 crore. Kagaz cannot meet that and must not try.
- **C2. Therefore all money flows through Razorpay Route.** Each shop is a Route *linked account*. Funds sit in Razorpay's escrow, not Kagaz's bank account. The "wallet" is Kagaz's UI over Razorpay's `on_hold` transfer state. Kagaz is software; Razorpay is the regulated entity.
- **C3. No manual settlement.** Do not transfer money to shops by hand. That is exactly the activity C1 prohibits.
- **C4. GST.** Kagaz's commission is a service and attracts GST. The shop's print sale is the shop's own supply. Register before crossing the threshold; take advice on whether Kagaz is an e-commerce operator liable for TCS under §52 CGST — this is a real question given the model and needs an answer before scale.
- **C5. Student documents are personal data.** Aadhaar copies, marks cards and medical reports will pass through this system. Minimise retention (FR-39), encrypt in transit and at rest, never expose a file to the shop operator as a file (FR-41), and state the retention policy in the bot's first message.
- **C6. WhatsApp Business Policy.** Templates must be approved. Do not send marketing templates to students who have not opted in.
- **C7. Content liability.** The shop is printing whatever the student sends. Keep page and amount caps, log order metadata, and have a takedown/abuse path.

## 11. Success metrics

**Pilot (one shop, 6 weeks) — the only question that matters is whether the shop keeps the app open.**

| Metric | Target | Why |
|---|---|---|
| Days the app was open ≥ 6 hours | 90% of days | The single best proxy for whether the shop wants this |
| Orders completed | 150+ | Enough to see real failure modes |
| Completion rate (PAID → COMPLETED) | ≥ 95% | Below this, refunds eat trust |
| Auto-refund rate | ≤ 3% | Above this, preflight is not working |
| Orders needing operator intervention | ≤ 5% | The whole premise is zero-touch |
| Repeat students | ≥ 40% of orders from returning numbers | Proves the experience is better, not just novel |
| Support messages to Kagaz per week | < 5 | Predicts whether shop #10 is affordable |

**Anti-metrics — if these appear, stop and rethink:** operator turns the app off during business hours; students go back to the wall-number flow while the app is running; the shop asks to be shown the file before printing.

## 12. Explicitly out of scope for v1

Listed so they do not creep in. Each is a defensible v2 item, none is needed to prove the model.

- Multi-shop discovery, price comparison, "nearest shop"
- Student web portal or mobile app
- Stapling, binding, lamination, custom paper (rate card supports add-ons, but no fulfilment flow)
- Previous-year-papers / notes library
- Scheduled printing, print-later slots
- Loyalty, referrals, coupons
- Multi-language bot (English + basic Hindi/Kannada keyword recognition only)
- Shop-side analytics beyond today/this-week revenue
- Multiple files per order
- Automatic shop-to-shop failover
- Offline order queueing while the shop is closed
---
---

# PART B — SYSTEM DESIGN

## 13. Architecture overview

```
                        ┌──────────────────────────────┐
   Student's phone      │      Meta WhatsApp Cloud     │
   ┌──────────┐         │            API               │
   │ WhatsApp │◄───────►│                              │
   └──────────┘         └──────────────┬───────────────┘
                                       │ webhook (HTTPS in)
                                       │ send API (HTTPS out)
                                       ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                    KAGAZ BACKEND (cloud)                    │
   │                                                             │
   │  ┌───────────┐  ┌────────────┐  ┌──────────┐  ┌──────────┐  │
   │  │ WhatsApp  │  │  Order     │  │ Payments │  │ Ledger   │  │
   │  │ bot FSM   │  │  service   │  │ service  │  │ service  │  │
   │  └───────────┘  └────────────┘  └──────────┘  └──────────┘  │
   │  ┌───────────┐  ┌────────────┐  ┌──────────────────────┐    │
   │  │ Pricing   │  │  File /    │  │  WebSocket hub       │    │
   │  │ engine    │  │  PDF worker│  │  (device registry)   │    │
   │  └───────────┘  └────────────┘  └──────────┬───────────┘    │
   └────────────────┬────────────────────────────┼───────────────┘
                    │                            │
        ┌───────────┴───────────┐                │ outbound WSS
        ▼           ▼           ▼                │ (device dials in)
   ┌─────────┐ ┌────────┐ ┌──────────┐           │
   │Postgres │ │  R2    │ │ Razorpay │           │
   │         │ │storage │ │  + Route │           │
   └─────────┘ └────────┘ └──────────┘           │
                                                 ▼
                              ┌──────────────────────────────────┐
                              │  SHOP PC  (Windows)              │
                              │  ┌────────────────────────────┐  │
                              │  │  Kagaz Desktop (Electron)  │  │
                              │  │  ┌──────────┐ ┌──────────┐ │  │
                              │  │  │ WS client│ │ Local    │ │  │
                              │  │  │+heartbeat│ │ SQLite   │ │  │
                              │  │  └──────────┘ │ queue    │ │  │
                              │  │  ┌──────────┐ └──────────┘ │  │
                              │  │  │ Printer  │ ┌──────────┐ │  │
                              │  │  │ monitor  │ │ Print    │ │  │
                              │  │  │ WMI+SNMP │ │ executor │ │  │
                              │  │  └──────────┘ └────┬─────┘ │  │
                              │  └────────────────────┼───────┘  │
                              └───────────────────────┼──────────┘
                                                      ▼
                                          ┌────────────────────┐
                                          │  Printer(s)        │
                                          │  USB or network    │
                                          └────────────────────┘
```

### The one architectural constraint that shapes everything

**The backend cannot initiate a connection to the shop PC.** That machine sits behind a consumer router with no public address and no port forwarding. Therefore:

- The desktop app dials out to the backend over WSS and holds that socket open.
- All server→device communication (preflight requests, job dispatch, config updates, cancellations) travels down that already-open socket.
- The liveness of that socket *is* the shop's online status. This is what makes "app open = shop open" work mechanically rather than as a convention.

There is no polling, no inbound firewall rule, and nothing for the shop owner to configure.

## 14. Pinned technology stack

Decisions are final unless a phase explicitly revisits them. Rationale is recorded so future-you does not relitigate.

### Backend

| Concern | Choice | Why |
|---|---|---|
| Runtime | Node.js 20 LTS + TypeScript (strict) | Same language as the Electron app; one mental model |
| HTTP framework | Fastify | Fast, first-class schema validation, good plugin model for webhooks |
| WebSocket | `ws` via `@fastify/websocket` | Direct control over the device registry; a managed realtime service adds a hop and hides connection state, which is the exact thing we need to observe |
| Database | PostgreSQL 15 | Relational money data. Non-negotiable — do not use a document store for a ledger |
| Managed PG | Supabase or Neon | Free tier, connection pooling, PITR backups |
| ORM / query | Prisma | Migrations, type safety, good enough for this scale. Drop to raw SQL for ledger queries |
| Object storage | Cloudflare R2 | S3-compatible, zero egress fees, lifecycle rules for auto-delete |
| Background jobs | DB-backed job table + in-process worker loop in v1 | Avoids running Redis for three job types. Move to BullMQ + Redis when conversion volume justifies it (Phase 19 revisit) |
| PDF conversion | LibreOffice headless (`soffice --convert-to pdf`) | The only thing that handles real-world DOCX/PPTX/XLSX correctly |
| PDF inspection | `pdf-lib` for page count, `pdftoppm` (poppler) for the page-1 thumbnail | |
| Logging | `pino` structured JSON | |
| Errors | Sentry | |
| Hosting | Railway or Render, Docker image | LibreOffice and poppler must be in the image, so a plain buildpack host will not work |

### Desktop

| Concern | Choice | Why |
|---|---|---|
| Shell | Electron + React + TypeScript | Node ecosystem has every library this app needs prebuilt. Rust/Tauri would save ~150 MB and ~200 MB RAM but costs a Rust learning curve on exactly the hard part (spooler, SNMP). Windows-only means cross-platform is worth nothing here |
| Target OS | Windows 10 1809+ / 11, x64 only | Every print shop in scope runs Windows |
| Local queue | `better-sqlite3` | Synchronous, zero-config, survives crashes. The job queue must not be lost on a power cut |
| Print execution | Bundled **SumatraPDF** CLI | `-print-to "<printer>" -print-settings "2x,duplex,color,1-5"` applies copies/duplex/colour/page-range in one call. Doing this through raw Win32 `DEVMODE` is days of work for the same result |
| Printer enumeration and status | PowerShell `Get-Printer` / `Get-PrintJob` via `child_process`, plus WMI `Win32_Printer` | |
| Network printer status | `net-snmp` against the standard Printer MIB | The only true "paper physically came out" signal |
| Packaging | `electron-builder` → NSIS installer | |
| Auto-update | `electron-updater` against GitHub Releases | Free, and the repo is already on GitHub |
| Crash reporting | Sentry Electron SDK | |

### Integrations

| Concern | Choice | Why |
|---|---|---|
| Messaging | **Meta WhatsApp Cloud API, direct** | A BSP (AiSensy/Interakt) adds a ₹2,000–2,500/month platform fee and a visual bot builder we do not need, because the conversation logic lives in our backend anyway. Direct Cloud API costs only per-message: user-initiated service conversations are free, business-initiated utility templates ~₹0.145 each |
| Payments | **Razorpay** standard checkout via Payment Links | UPI-first, best Indian coverage |
| Split & wallet | **Razorpay Route** linked accounts with `on_hold` transfers | See §19. This is what makes the wallet legal |
| Admin UI | Next.js 14 app, deployed on Vercel, email-magic-link auth | Small; only Kagaz staff use it |

### What was considered and rejected

- **Tauri** — better on paper (5–10 MB installer, ~60 MB RAM), rejected because the print layer, spooler polling and SNMP all land in Rust and that is the riskiest part of the build. Revisit for v2 if shop PCs prove too weak.
- **.NET / WPF** — arguably the *correct* answer for a Windows-only print utility (first-class `System.Printing`, tiny footprint, no webview). Rejected only because it splits the codebase across two languages and slows UI iteration.
- **PrintNode** — solves OS printing and status for a per-printer monthly fee. Rejected: recurring cost per shop against a thin commission, plus it does not support the hold-and-release logic we may want.
- **Stripe** — not suitable for India-domestic collections at this stage.
- **Firebase/Firestore** — wrong shape for a ledger.
- **A background Windows service** — rejected deliberately. "App open = shop open" is a product decision, not a limitation.

## 15. Repository layout

pnpm workspaces monorepo.

```
kagazapp/
├── IMPLEMENTATION_PLAN.md          ← this document
├── README.md
├── package.json                    ← workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .github/workflows/
│   ├── ci.yml                      ← typecheck, lint, test on PR
│   └── release-desktop.yml         ← builds + signs the Windows installer
│
├── packages/
│   ├── shared/                     ← types + pure logic shared by all apps
│   │   └── src/
│   │       ├── money.ts            ← paise arithmetic, never floats
│   │       ├── pricing.ts          ← the pricing engine (pure)
│   │       ├── page-range.ts       ← "1-5,8,11-13" parser (pure)
│   │       ├── order-state.ts      ← state machine transition table (pure)
│   │       ├── ws-protocol.ts      ← every WS message type, zod schemas
│   │       └── errors.ts           ← the error taxonomy from §27
│   └── config/                     ← eslint, tsconfig, prettier presets
│
├── apps/
│   ├── backend/
│   │   └── src/
│   │       ├── server.ts
│   │       ├── db/                 ← prisma schema + migrations
│   │       ├── ws/                 ← hub, device registry, heartbeat
│   │       ├── whatsapp/           ← webhook, send client, bot FSM, templates
│   │       ├── orders/             ← order service, state transitions
│   │       ├── files/              ← R2 client, conversion worker, thumbnails
│   │       ├── pricing/            ← rate card resolution (wraps shared/pricing)
│   │       ├── payments/           ← razorpay client, webhooks, refunds
│   │       ├── ledger/             ← double-entry writer, balance queries
│   │       ├── route/              ← linked accounts, transfers, holds
│   │       ├── jobs/               ← DB-backed job runner
│   │       └── admin/              ← admin REST endpoints
│   │
│   ├── desktop/
│   │   ├── electron/               ← main process
│   │   │   ├── main.ts
│   │   │   ├── ws-client.ts        ← connection, heartbeat, reconnect
│   │   │   ├── queue.ts            ← better-sqlite3 local job queue
│   │   │   ├── printers/
│   │   │   │   ├── enumerate.ts    ← Get-Printer
│   │   │   │   ├── status-wmi.ts   ← spooler + Win32_Printer flags
│   │   │   │   ├── status-snmp.ts  ← Printer MIB, page counters
│   │   │   │   └── select.ts       ← printer routing/prioritisation
│   │   │   ├── print/
│   │   │   │   ├── executor.ts     ← SumatraPDF invocation
│   │   │   │   ├── cover-sheet.ts  ← generates the token page
│   │   │   │   └── verify.ts       ← post-print confirmation
│   │   │   └── ipc.ts
│   │   ├── renderer/               ← React UI
│   │   │   └── src/screens/        ← Orders, Revenue, RateCard, Printers, Wallet, Settings
│   │   └── resources/
│   │       └── SumatraPDF.exe
│   │
│   └── admin/                      ← Next.js admin panel
│
└── docs/
    ├── runbook.md
    ├── onboarding-a-shop.md
    └── adr/                        ← architecture decision records
```

## 16. Database schema

PostgreSQL. All money in **integer paise**. All timestamps `timestamptz`. All IDs are UUIDv7 (time-ordered) except where noted.

```sql
-- ============================================================
-- SHOPS AND DEVICES
-- ============================================================

CREATE TYPE shop_status AS ENUM ('onboarding', 'active', 'suspended', 'closed');

CREATE TABLE shops (
  id                      UUID PRIMARY KEY,
  code                    TEXT UNIQUE NOT NULL,   -- short code used in wa.me deep link, e.g. 'PESCE1'
  name                    TEXT NOT NULL,
  address                 TEXT,
  owner_name              TEXT NOT NULL,
  owner_phone             TEXT NOT NULL,
  gstin                   TEXT,
  status                  shop_status NOT NULL DEFAULT 'onboarding',

  -- Razorpay Route
  rz_linked_account_id    TEXT,                   -- acc_XXXXXXXX
  rz_account_status       TEXT,                   -- created | activated | needs_clarification

  -- business rules (FR-16, FR-17, O5, O6)
  max_pages_per_order     INT  NOT NULL DEFAULT 100,
  max_order_paise         INT  NOT NULL DEFAULT 50000,     -- ₹500
  approval_threshold_pages INT NOT NULL DEFAULT 50,
  max_queue_depth         INT  NOT NULL DEFAULT 10,
  secure_release          BOOLEAN NOT NULL DEFAULT false,  -- hold until student taps "print now"

  commission_bps          INT  NOT NULL DEFAULT 500,       -- 500 bps = 5%
  commission_min_paise    INT  NOT NULL DEFAULT 100,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rate card is versioned: a quoted order must be immune to a later price change (FR-14)
CREATE TABLE rate_cards (
  id            UUID PRIMARY KEY,
  shop_id       UUID NOT NULL REFERENCES shops(id),
  version       INT  NOT NULL,
  card          JSONB NOT NULL,        -- see §20 for the shape
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, version)
);
CREATE INDEX ON rate_cards (shop_id, effective_from DESC);

CREATE TABLE devices (
  id                UUID PRIMARY KEY,
  shop_id           UUID NOT NULL REFERENCES shops(id),
  name              TEXT,                      -- "Front counter PC"
  os_version        TEXT,
  app_version       TEXT,
  token_hash        TEXT NOT NULL,             -- sha256 of the device JWT's jti; supports revocation
  paired_at         TIMESTAMPTZ,
  last_seen_at      TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  is_revoked        BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON devices (shop_id);

CREATE TABLE pairing_codes (
  code        CHAR(8) PRIMARY KEY,       -- crockford base32, no ambiguous chars
  shop_id     UUID NOT NULL REFERENCES shops(id),
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE printers (
  id               UUID PRIMARY KEY,
  device_id        UUID NOT NULL REFERENCES devices(id),
  system_name      TEXT NOT NULL,        -- exact Windows printer name; used verbatim by SumatraPDF
  display_name     TEXT,
  supports_color   BOOLEAN NOT NULL DEFAULT false,
  supports_duplex  BOOLEAN NOT NULL DEFAULT false,
  paper_sizes      TEXT[] NOT NULL DEFAULT '{A4}',
  is_network       BOOLEAN NOT NULL DEFAULT false,
  snmp_host        INET,
  priority         INT NOT NULL DEFAULT 100,    -- lower wins when both can take the job
  is_enabled       BOOLEAN NOT NULL DEFAULT true,
  maintenance_note TEXT,
  last_status      JSONB,                        -- see §22
  last_status_at   TIMESTAMPTZ,
  UNIQUE (device_id, system_name)
);

-- ============================================================
-- STUDENTS
-- ============================================================

CREATE TABLE students (
  id            UUID PRIMARY KEY,
  phone_e164    TEXT UNIQUE NOT NULL,      -- +919xxxxxxxxx
  display_name  TEXT,                       -- WhatsApp profile name, best effort
  is_blocked    BOOLEAN NOT NULL DEFAULT false,
  block_reason  TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per active WhatsApp conversation. The bot's finite state machine state.
CREATE TABLE bot_sessions (
  phone_e164   TEXT PRIMARY KEY,
  shop_id      UUID REFERENCES shops(id),
  state        TEXT NOT NULL,        -- see §25
  context      JSONB NOT NULL DEFAULT '{}',
  order_id     UUID,
  expires_at   TIMESTAMPTZ NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- FILES
-- ============================================================

CREATE TYPE file_status AS ENUM ('uploading','uploaded','converting','converted','failed','deleted');

CREATE TABLE files (
  id                UUID PRIMARY KEY,
  student_id        UUID NOT NULL REFERENCES students(id),
  status            file_status NOT NULL DEFAULT 'uploading',

  original_name     TEXT,
  original_mime     TEXT,
  original_bytes    BIGINT,
  original_key      TEXT,             -- R2 object key

  pdf_key           TEXT,             -- R2 object key of the converted PDF
  pdf_bytes         BIGINT,
  pdf_sha256        TEXT,
  page_count        INT,
  thumbnail_key     TEXT,

  conversion_error  TEXT,
  delete_after      TIMESTAMPTZ,      -- FR-39
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON files (delete_after) WHERE deleted_at IS NULL;

-- ============================================================
-- ORDERS
-- ============================================================

CREATE TYPE order_status AS ENUM (
  'DRAFT','AWAITING_FILE','CONVERTING','CONVERSION_FAILED','QUOTED',
  'PREFLIGHT_FAILED','AWAITING_PAYMENT','PAYMENT_FAILED','EXPIRED',
  'PAID','AWAITING_APPROVAL','REJECTED','HELD','QUEUED','DISPATCHED',
  'PRINTING','PRINTED','COMPLETED','PRINT_FAILED','REFUND_PENDING',
  'REFUNDED','CANCELLED'
);

CREATE TABLE orders (
  id                 UUID PRIMARY KEY,
  short_code         TEXT UNIQUE NOT NULL,     -- human token, e.g. 'K7F2'
  token_number       INT,                       -- per-shop per-day counter shown on the cover sheet
  shop_id            UUID NOT NULL REFERENCES shops(id),
  student_id         UUID NOT NULL REFERENCES students(id),
  file_id            UUID REFERENCES files(id),
  status             order_status NOT NULL DEFAULT 'DRAFT',

  -- print options (FR-12)
  color_mode         TEXT,        -- 'bw' | 'color'
  sides              TEXT,        -- 'single' | 'double'
  copies             INT  NOT NULL DEFAULT 1,
  page_range         TEXT,        -- null = all
  pages_to_print     INT,         -- resolved count after applying page_range
  sheets_to_print    INT,         -- physical sheets, accounting for duplex and copies
  paper_size         TEXT NOT NULL DEFAULT 'A4',

  -- pricing (frozen at quote time, FR-14)
  rate_card_id       UUID REFERENCES rate_cards(id),
  price_breakdown    JSONB,
  total_paise        INT,
  commission_paise   INT,
  shop_share_paise   INT,
  quote_expires_at   TIMESTAMPTZ,

  -- fulfilment
  assigned_printer_id UUID REFERENCES printers(id),
  preflight_result    JSONB,
  dispatched_at       TIMESTAMPTZ,
  printed_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,

  -- failure
  failure_code        TEXT,       -- see §27
  failure_detail      TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON orders (shop_id, created_at DESC);
CREATE INDEX ON orders (student_id, created_at DESC);
CREATE INDEX ON orders (status) WHERE status NOT IN ('COMPLETED','REFUNDED','CANCELLED','EXPIRED');

-- Append-only. Every transition is recorded. This is your debugging lifeline.
CREATE TABLE order_events (
  id          BIGSERIAL PRIMARY KEY,
  order_id    UUID NOT NULL REFERENCES orders(id),
  from_status order_status,
  to_status   order_status NOT NULL,
  actor       TEXT NOT NULL,      -- 'system' | 'student' | 'device:<id>' | 'admin:<id>' | 'webhook'
  reason      TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON order_events (order_id, id);

-- ============================================================
-- PAYMENTS
-- ============================================================

CREATE TABLE payments (
  id                 UUID PRIMARY KEY,
  order_id           UUID NOT NULL REFERENCES orders(id),
  rz_payment_link_id TEXT,
  rz_order_id        TEXT,
  rz_payment_id      TEXT UNIQUE,
  amount_paise       INT NOT NULL,
  status             TEXT NOT NULL,     -- created | captured | failed | refunded | partially_refunded
  method             TEXT,              -- upi | card | netbanking
  captured_at        TIMESTAMPTZ,
  raw                JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refunds (
  id            UUID PRIMARY KEY,
  order_id      UUID NOT NULL REFERENCES orders(id),
  payment_id    UUID NOT NULL REFERENCES payments(id),
  rz_refund_id  TEXT UNIQUE,
  amount_paise  INT NOT NULL,
  reason_code   TEXT NOT NULL,
  is_automatic  BOOLEAN NOT NULL DEFAULT true,
  status        TEXT NOT NULL,          -- pending | processed | failed
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at  TIMESTAMPTZ
);

CREATE TABLE rz_transfers (
  id              UUID PRIMARY KEY,
  order_id        UUID NOT NULL REFERENCES orders(id),
  shop_id         UUID NOT NULL REFERENCES shops(id),
  rz_transfer_id  TEXT UNIQUE,
  amount_paise    INT NOT NULL,
  on_hold         BOOLEAN NOT NULL DEFAULT true,
  released_at     TIMESTAMPTZ,
  settled_at      TIMESTAMPTZ,
  status          TEXT NOT NULL,
  raw             JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every inbound webhook, stored before processing. Idempotency + replay + audit. (FR-22)
CREATE TABLE webhook_events (
  id            UUID PRIMARY KEY,
  provider      TEXT NOT NULL,          -- 'razorpay' | 'whatsapp'
  external_id   TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  payload       JSONB NOT NULL,
  signature_ok  BOOLEAN NOT NULL,
  processed_at  TIMESTAMPTZ,
  process_error TEXT,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id)
);

-- ============================================================
-- LEDGER  (see §18)
-- ============================================================

CREATE TYPE account_kind AS ENUM (
  'student_inflow',      -- external: money arriving from a student
  'shop_wallet',         -- per-shop liability
  'kagaz_revenue',       -- commission earned
  'gateway_fees',        -- expense
  'refund_outflow'       -- external: money going back to a student
);

CREATE TABLE ledger_transactions (
  id           UUID PRIMARY KEY,
  kind         TEXT NOT NULL,       -- 'order_payment' | 'refund' | 'payout_release' | 'adjustment'
  order_id     UUID REFERENCES orders(id),
  shop_id      UUID REFERENCES shops(id),
  description  TEXT NOT NULL,
  created_by   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ledger_entries (
  id             BIGSERIAL PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES ledger_transactions(id),
  account_kind   account_kind NOT NULL,
  account_ref    UUID,                     -- shop_id for shop_wallet, null for global accounts
  -- Signed amount. Positive = credit to this account, negative = debit.
  -- The sum of all entries in a transaction MUST be exactly zero.
  amount_paise   BIGINT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON ledger_entries (account_kind, account_ref);
CREATE INDEX ON ledger_entries (transaction_id);

-- Enforce balance at the database level. This is worth the trigger.
CREATE OR REPLACE FUNCTION assert_ledger_balanced() RETURNS TRIGGER AS $$
DECLARE s BIGINT;
BEGIN
  SELECT COALESCE(SUM(amount_paise),0) INTO s
  FROM ledger_entries WHERE transaction_id = NEW.transaction_id;
  IF s <> 0 THEN
    RAISE EXCEPTION 'Ledger transaction % does not balance: sum=%', NEW.transaction_id, s;
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_balance_check
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_ledger_balanced();

CREATE VIEW shop_wallet_balances AS
SELECT account_ref AS shop_id, SUM(amount_paise) AS balance_paise
FROM ledger_entries
WHERE account_kind = 'shop_wallet'
GROUP BY account_ref;

CREATE TABLE withdrawals (
  id            UUID PRIMARY KEY,
  shop_id       UUID NOT NULL REFERENCES shops(id),
  amount_paise  BIGINT NOT NULL,
  status        TEXT NOT NULL,      -- requested | releasing | released | failed
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at   TIMESTAMPTZ,
  error         TEXT
);

-- ============================================================
-- BACKGROUND JOBS
-- ============================================================

CREATE TABLE job_queue (
  id            BIGSERIAL PRIMARY KEY,
  kind          TEXT NOT NULL,        -- 'convert_file' | 'delete_expired_files' | 'reconcile_ledger' | ...
  payload       JSONB NOT NULL,
  run_after     TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts      INT NOT NULL DEFAULT 0,
  max_attempts  INT NOT NULL DEFAULT 5,
  locked_at     TIMESTAMPTZ,
  locked_by     TEXT,
  completed_at  TIMESTAMPTZ,
  last_error    TEXT
);
CREATE INDEX ON job_queue (run_after) WHERE completed_at IS NULL;
```

## 17. Order state machine

Implemented as a pure transition table in `packages/shared/src/order-state.ts`. Any transition not in the table throws. Every transition writes an `order_events` row.

```
                          ┌─────────┐
                          │  DRAFT  │  student said hi, shop resolved
                          └────┬────┘
                               ▼
                       ┌───────────────┐
                       │ AWAITING_FILE │◄──── student sent a non-file message
                       └───────┬───────┘
                               ▼ file received
                       ┌───────────────┐
                       │  CONVERTING   │
                       └───┬───────┬───┘
                  success  │       │  failure
                           ▼       ▼
                   ┌──────────┐  ┌──────────────────┐
     re-quote ────►│  QUOTED  │  │ CONVERSION_FAILED│──► terminal, no money taken
     (options      └────┬─────┘  └──────────────────┘
      changed)          │ student confirms options
                        ▼
                 ┌──────────────┐  fail  ┌──────────────────┐
                 │  preflight   │───────►│ PREFLIGHT_FAILED │──► terminal, no money taken
                 └──────┬───────┘        └──────────────────┘
                        │ ok
                        ▼
              ┌───────────────────┐
              │ AWAITING_PAYMENT  │
              └───┬──────┬────┬───┘
       captured   │      │    │ 15 min
                  │      │    └────────────► EXPIRED  (terminal)
                  │      └─────────────────► PAYMENT_FAILED ──► back to AWAITING_PAYMENT (retry)
                  ▼
              ┌────────┐
              │  PAID  │  ◄── ledger transaction written here
              └───┬────┘
                  │
      ┌───────────┼────────────┬────────────────────┐
      │           │            │                    │
 needs approval?  │      secure_release?       normal path
      ▼           │            ▼                    ▼
┌──────────────┐  │      ┌──────────┐         ┌──────────┐
│AWAITING_     │  │      │  HELD    │         │  QUEUED  │
│APPROVAL      │  │      └────┬─────┘         └────┬─────┘
└───┬──────┬───┘  │           │ student taps       │
 ok │      │ no   │           │ "print now"        │
    │      ▼      │           ▼                    │
    │  ┌─────────┐│      ┌──────────┐              │
    │  │REJECTED ││      │  QUEUED  │──────────────┤
    │  └────┬────┘│      └──────────┘              │
    │       │     │                                │
    └───────┼─────┴────────────────────────────────┤
            │                                      ▼
            │                              ┌──────────────┐
            │                              │  DISPATCHED  │ sent down the socket
            │                              └──────┬───────┘
            │                                     ▼
            │                              ┌──────────────┐
            │                              │   PRINTING   │ device acknowledged, spooling
            │                              └───┬──────┬───┘
            │                        verified  │      │  failed / unverifiable
            │                                  ▼      ▼
            │                          ┌─────────┐  ┌──────────────┐
            │                          │ PRINTED │  │ PRINT_FAILED │
            │                          └────┬────┘  └──────┬───────┘
            │                               ▼              │
            │                        ┌────────────┐        │
            │                        │ COMPLETED  │        │
            │                        └────────────┘        │
            │                          (terminal)          │
            ▼                                              ▼
      ┌────────────────┐                          ┌────────────────┐
      │ REFUND_PENDING │◄─────────────────────────┤ REFUND_PENDING │
      └───────┬────────┘                          └────────────────┘
              ▼
        ┌──────────┐
        │ REFUNDED │  (terminal)
        └──────────┘

CANCELLED: reachable from DRAFT, AWAITING_FILE, QUOTED, AWAITING_PAYMENT only.
           Once PAID, a student cannot cancel — only refund paths apply.
```

### Transition table (authoritative)

| From | Event | To | Side effects |
|---|---|---|---|
| — | `student_greeting` | `DRAFT` | create order, resolve shop, check shop online |
| `DRAFT` | `shop_resolved` | `AWAITING_FILE` | send welcome + retention notice |
| `AWAITING_FILE` | `file_received` | `CONVERTING` | enqueue `convert_file` |
| `CONVERTING` | `conversion_ok` | `QUOTED` | count pages, render thumbnail, send options prompt |
| `CONVERTING` | `conversion_failed` | `CONVERSION_FAILED` | notify student, delete file |
| `QUOTED` | `options_changed` | `QUOTED` | re-price, reset `quote_expires_at` |
| `QUOTED` | `options_confirmed` | (preflight) | send `PREFLIGHT_REQUEST` over WS |
| `QUOTED` | `preflight_ok` | `AWAITING_PAYMENT` | create Razorpay payment link, send it |
| `QUOTED` | `preflight_failed` | `PREFLIGHT_FAILED` | notify with the specific reason |
| `QUOTED` | `quote_expired` | `EXPIRED` | notify, allow restart |
| `AWAITING_PAYMENT` | `payment_captured` | `PAID` | **write ledger txn**, create Route transfer on hold |
| `AWAITING_PAYMENT` | `payment_failed` | `PAYMENT_FAILED` | notify, offer retry link |
| `PAYMENT_FAILED` | `retry` | `AWAITING_PAYMENT` | new link |
| `AWAITING_PAYMENT` | `link_expired` | `EXPIRED` | |
| `PAID` | `needs_approval` | `AWAITING_APPROVAL` | push to device UI, notify student of wait |
| `PAID` | `secure_release_on` | `HELD` | send student a "tap when you're here" button |
| `PAID` | `auto` | `QUEUED` | assign token number |
| `AWAITING_APPROVAL` | `operator_approved` | `QUEUED` | |
| `AWAITING_APPROVAL` | `operator_rejected` | `REJECTED` | → `REFUND_PENDING` |
| `HELD` | `student_released` | `QUEUED` | |
| `HELD` | `hold_expired` (6 h) | `REFUND_PENDING` | |
| `QUEUED` | `dispatched` | `DISPATCHED` | send `JOB_DISPATCH` with presigned URL |
| `DISPATCHED` | `device_ack` | `PRINTING` | |
| `DISPATCHED` | `dispatch_timeout` (60 s) | `PRINT_FAILED` | |
| `PRINTING` | `print_verified` | `PRINTED` | |
| `PRINTING` | `print_error` | `PRINT_FAILED` | record printer error code |
| `PRINTED` | `auto` | `COMPLETED` | notify student with token, schedule file deletion |
| `PRINT_FAILED` | `auto` | `REFUND_PENDING` | |
| `REJECTED` | `auto` | `REFUND_PENDING` | |
| `REFUND_PENDING` | `refund_processed` | `REFUNDED` | **write reversing ledger txn**, cancel Route transfer |
| `DRAFT`/`AWAITING_FILE`/`QUOTED`/`AWAITING_PAYMENT` | `student_cancelled` | `CANCELLED` | |

### Rules

- **R1.** A transition out of a terminal state (`COMPLETED`, `REFUNDED`, `CANCELLED`, `EXPIRED`, `CONVERSION_FAILED`, `PREFLIGHT_FAILED`) is always an error.
- **R2.** `PAID` is the point of no return. Before it, failure costs nothing. After it, every failure path must end in `REFUNDED` or `COMPLETED`. There is no third option.
- **R3.** Any order sitting in a non-terminal state for more than 2 hours is picked up by a sweeper job and forced down a refund path, with an admin alert.
- **R4.** State is changed only through `orders/transition.ts`. No `UPDATE orders SET status = ...` anywhere else in the codebase. Enforce with a lint rule if necessary.

## 18. Money: ledger design

### Principles

1. **Integer paise everywhere.** `total_paise INT`. No `float`, no `decimal` in application code, no rupees in the database. Format to rupees only at the display edge.
2. **No mutable balance column.** A shop's balance is `SUM(amount_paise)` over its ledger entries. If you ever add a `shops.balance_paise` column, a duplicated webhook will silently corrupt it and you will never find the bug.
3. **Double entry.** Every transaction has at least two entries summing to exactly zero. Enforced by a deferred database trigger (§16), not by hope.
4. **Append only.** Never update or delete a ledger entry. A mistake is corrected by a new, reversing transaction.

### Worked example — a ₹36 order

Student pays ₹36.00 (3600 paise). Commission 5% = 180 paise. Razorpay's own fee is *not* modelled as our expense in v1, because Route deducts it from the platform's share before settlement — record it during reconciliation only.

Transaction `order_payment`, order `#K7F2`, shop `S1`:

| Account | `account_ref` | `amount_paise` |
|---|---|---|
| `student_inflow` | — | −3600 |
| `shop_wallet` | S1 | +3420 |
| `kagaz_revenue` | — | +180 |
| | **sum** | **0** |

Shop S1's wallet balance increases by ₹34.20.

### Worked example — the same order refunded

Transaction `refund`, order `#K7F2`:

| Account | `account_ref` | `amount_paise` |
|---|---|---|
| `shop_wallet` | S1 | −3420 |
| `kagaz_revenue` | — | −180 |
| `refund_outflow` | — | +3600 |
| | **sum** | **0** |

Wallet returns to its prior value. Commission is given back too — Kagaz does not profit from a failed print, and a shop that felt it was charged for a failure would churn immediately.

### Invariants tested in CI

- **I1.** For every `ledger_transactions` row, its entries sum to zero.
- **I2.** For every `COMPLETED` order there is exactly one `order_payment` transaction.
- **I3.** For every `REFUNDED` order there is exactly one `order_payment` and one `refund` transaction, and their entries net to zero.
- **I4.** `SUM(amount_paise)` across the entire `ledger_entries` table is zero.
- **I5.** No shop wallet balance is ever negative.
- **I6.** `shop_wallet_balances.balance_paise` equals the sum of that shop's un-released Route transfers, within reconciliation tolerance.

## 19. Money: Razorpay Route flow

This is what makes the wallet legal (§10, C1–C3). Kagaz never holds the money.

### Onboarding a shop

1. Admin collects the shop's legal name, PAN, bank account number and IFSC.
2. Backend creates a Razorpay **Linked Account** for the shop → `acc_XXXXXXXX`, stored on `shops.rz_linked_account_id`.
3. Razorpay runs its own KYC on the linked account. `shops.status` stays `onboarding` until Razorpay reports the account activated.
4. A shop cannot go `active` — and therefore cannot take orders — until its linked account is activated. This is a hard gate; do not allow an override.

### Per-order flow

```
1. Order QUOTED, preflight OK
     └─► POST /v1/payment_links
           amount = total_paise
           notes  = { order_id, shop_id }

2. Student pays
     └─► webhook: payment.captured   (verify X-Razorpay-Signature, HMAC-SHA256)

3. Backend, inside ONE database transaction:
     a. insert webhook_events (unique on external_id → idempotent)
     b. update payments row → captured
     c. write ledger transaction 'order_payment'
     d. transition order → PAID

4. Backend, after commit:
     └─► POST /v1/payments/:id/transfer
           transfers: [{
             account:  <shop's acc_XXXXXXXX>,
             amount:   shop_share_paise,     // total − commission
             currency: 'INR',
             on_hold:  true                  // ◄── THIS is the wallet
           }]
     Kagaz's commission is simply the amount NOT transferred.
     It stays in the Kagaz Razorpay balance.

5. Order COMPLETED
     └─► the transfer stays on hold. The shop's wallet shows it as available.

6. Shop requests withdrawal in the desktop app
     └─► PATCH /v1/transfers/:id  { on_hold: false }
     for every held transfer, oldest first, until the requested amount is covered.
     Razorpay then settles those transfers to the shop's bank on its settlement schedule.

7. Order REFUNDED instead
     └─► DELETE/reverse the transfer (it is still on hold, so it can be reversed)
         POST /v1/payments/:id/refund
         write the reversing ledger transaction
```

### Why `on_hold` rather than paying out immediately

- It gives the shop a wallet they can watch grow, which is the feature they actually asked for.
- It gives Kagaz a window to reverse a transfer when a print fails, without clawing money back from a bank account.
- It covers the chargeback window. A student disputing a UPI payment after the shop has been paid out is money Kagaz eats.

### Webhooks to handle

| Event | Action |
|---|---|
| `payment.captured` | The main path. Step 3 above. |
| `payment.failed` | Mark payment failed, notify student, offer a retry link. |
| `payment_link.paid` | Redundant with `payment.captured`; log and ignore. |
| `refund.processed` | Transition `REFUND_PENDING` → `REFUNDED`. |
| `refund.failed` | Alert admin. Manual intervention. |
| `transfer.processed` | Mark `rz_transfers.status`. |
| `settlement.processed` | Used by the daily reconciliation job. |
| `account.activated` (Route) | Flip `shops.status` from `onboarding` to `active`. |

**Every webhook handler must:** verify the signature, insert into `webhook_events` first (the unique constraint gives idempotency for free), then process. Return 200 quickly; do slow work in the job queue. Razorpay retries on non-200, so a slow handler causes duplicate deliveries.

### Reconciliation job (daily, 02:00 IST)

1. Pull all Razorpay transfers and refunds for the previous day.
2. Compare against `rz_transfers` and `refunds`.
3. Compare every shop's `shop_wallet_balances` against the sum of its held transfers.
4. Any mismatch → Sentry alert + a row in an `reconciliation_exceptions` table. Never auto-correct a mismatch; a human looks at it.

## 20. Pricing engine

Pure function in `packages/shared/src/pricing.ts`. No I/O, no database, fully unit tested. The backend resolves the rate card, then calls it.

### Rate card shape (`rate_cards.card` JSONB)

```jsonc
{
  "version": 1,
  "currency": "INR",
  "min_order_paise": 500,           // ₹5 minimum, protects the shop on tiny jobs
  "print": {
    "A4": {
      "bw":    { "single": 150, "double": 250 },   // paise per SHEET
      "color": { "single": 800, "double": 1400 }
    },
    "A3": {
      "bw":    { "single": 400, "double": 700 },
      "color": { "single": 2000, "double": 3500 }
    }
  },
  "volume_discounts": [
    { "min_sheets": 50,  "discount_bps": 500 },   // 5% off at 50+ sheets
    { "min_sheets": 200, "discount_bps": 1000 }
  ],
  "addons": []                      // reserved; not fulfilled in v1
}
```

**Pricing is per physical sheet, not per logical page.** This is the single most important modelling decision here, because it is how shops actually think and it makes duplex pricing honest. A 10-page document printed double-sided uses 5 sheets, and the shop charges the `double` rate for each of those 5 sheets.

### Algorithm

```
INPUT:  pageCount, pageRange, copies, colorMode, sides, paperSize, rateCard
OUTPUT: { pagesToPrint, sheetsToPrint, breakdown[], subtotalPaise, discountPaise, totalPaise }

1. pagesToPrint = pageRange ? countPages(parseRange(pageRange, pageCount)) : pageCount
     - reject if any page number is out of bounds
     - reject if pagesToPrint == 0

2. sheetsPerCopy = sides == 'double' ? ceil(pagesToPrint / 2) : pagesToPrint

3. sheetsToPrint = sheetsPerCopy * copies
     + 1                                    // the cover sheet, always BW single-sided

4. ratePerSheet = rateCard.print[paperSize][colorMode][sides]
     - throw if the combination is not in the card

5. subtotal = (sheetsPerCopy * copies) * ratePerSheet
     // note: the cover sheet is NOT charged to the student. It is Kagaz/shop overhead.

6. discountBps = highest matching volume_discounts tier by (sheetsPerCopy * copies), else 0
   discount   = floor(subtotal * discountBps / 10000)

7. total = max(subtotal - discount, rateCard.min_order_paise)

8. commission = max(floor(total * shop.commission_bps / 10000), shop.commission_min_paise)
   shopShare  = total - commission
```

### Rounding rules

- All intermediate arithmetic is integer paise.
- `floor` for discounts (favours the shop), `floor` for commission (favours the shop).
- The student always sees a whole number of paise; display as `₹{total/100}` with two decimals.
- Never round to the nearest rupee. A shop charging ₹1.50 a sheet is common and rounding will cost them real money over a month.

### Worked examples

| Input | Sheets charged | Rate | Subtotal | Discount | Total |
|---|---|---|---|---|---|
| 12 pages, BW, single, 1 copy | 12 | 150 | 1800 | 0 | **₹18.00** |
| 12 pages, BW, double, 1 copy | 6 | 250 | 1500 | 0 | **₹15.00** |
| 12 pages, BW, double, 3 copies | 18 | 250 | 4500 | 0 | **₹45.00** |
| 60 pages, BW, double, 1 copy | 30 | 250 | 7500 | 0 | **₹75.00** |
| 120 pages, BW, double, 1 copy | 60 | 250 | 15000 | 750 (5%) | **₹142.50** |
| 4 pages, colour, single, 1 copy | 4 | 800 | 3200 | 0 | **₹32.00** |
| 1 page, BW, single | 1 | 150 | 150 | 0 | **₹5.00** (min order) |

### Page range parser

`packages/shared/src/page-range.ts`. Grammar:

```
range   := part (',' part)*
part    := number | number '-' number
number  := [1-9][0-9]*
```

Rules: 1-indexed, inclusive, ascending within a part, duplicates deduplicated, result sorted. Reject on: page 0, page > pageCount, reversed range (`5-2`), empty result, any character outside `[0-9,\-\s]`. Return a typed error, never a silent correction — a student who typed `1-500` on a 12-page file needs to be told, not given 12 pages.

## 21. File pipeline

```
WhatsApp media_id
   │
   ▼
1. GET  https://graph.facebook.com/v21.0/<media_id>        → { url, mime_type, file_size }
2. GET  <url>  with Bearer <WHATSAPP_TOKEN>                → bytes
   │  reject > 50 MB, reject disallowed mime
   ▼
3. PUT to R2:  raw/<student_id>/<file_id>/<original_name>
   files.status = 'uploaded'
   ▼
4. enqueue job 'convert_file'
   ▼
5. Worker:
   a. download from R2 to a temp dir
   b. if not PDF:
        soffice --headless --norestore --convert-to pdf --outdir <tmp> <file>
        (timeout 60 s; kill the process group on timeout — soffice hangs on malformed files)
      if image:
        convert to a single-page A4-fitted PDF (img2pdf or sharp + pdf-lib)
   c. sanitise the PDF: strip JavaScript, embedded files and open actions
   d. page_count = pdf-lib getPageCount()
   e. pdftoppm -png -r 50 -f 1 -l 1  → thumbnail
   f. sha256 of the PDF
   g. upload  pdf/<file_id>.pdf  and  thumb/<file_id>.png  to R2
   h. files.status = 'converted', set delete_after = now() + 24h
   ▼
6. Order transitions CONVERTING → QUOTED
```

### Rules

- **Only the converted PDF is ever printed.** The original is kept solely so a conversion bug can be diagnosed, and is deleted on the same schedule.
- **Conversion runs in the cloud, never on the shop PC.** The shop machine is untrusted, weak, and has no LibreOffice.
- **A conversion timeout is a failure, not a retry-forever.** Two attempts, then `CONVERSION_FAILED`, then tell the student to send a PDF instead.
- **Fidelity warning.** LibreOffice will re-flow a DOCX that uses fonts the server does not have. Install a broad font set in the Docker image (`fonts-liberation`, `fonts-dejavu`, `ttf-mscorefonts-installer`, Noto for Devanagari and Kannada). Show the student the page count *and* the page-1 thumbnail before payment so a mangled conversion is visible before money changes hands.
- **Deletion is belt and braces.** The `delete_expired_files` job deletes objects explicitly, *and* the R2 bucket has a 48-hour lifecycle rule as a backstop.

### R2 key layout

```
raw/<student_id>/<file_id>/<original_name>
pdf/<file_id>.pdf
thumb/<file_id>.png
```

All access is via presigned URLs. The bucket has no public access. Presign TTL: 10 minutes for job dispatch, 5 minutes for thumbnails.

## 22. Printer status model

### Two independent sources, used for two different purposes

| Source | Available on | Used for | Trust |
|---|---|---|---|
| **Windows spooler / WMI** | Every printer with a driver | **Preflight** — can we accept this job? | Medium. Quality depends entirely on the driver |
| **SNMP Printer MIB** | Network printers only | **Post-flight** — did paper physically come out? | High |

### Spooler status (preflight)

Read via PowerShell, parsed as JSON:

```powershell
Get-Printer | Select-Object Name,PrinterStatus,DriverName,PortName | ConvertTo-Json
Get-PrintJob -PrinterName "<name>" | Select-Object Id,JobStatus,PagesPrinted | ConvertTo-Json
```

And `Win32_Printer.PrinterStatus` / `DetectedErrorState` / `ExtendedDetectedErrorState` via WMI for the error flags:

| Flag | Meaning | Preflight verdict |
|---|---|---|
| `Idle` / `Normal` | Ready | **accept** |
| `Printing` | Busy but healthy | **accept** (queue depth permitting) |
| `PaperOut` / `PaperProblem` | No paper | **reject** — `PRINTER_NO_PAPER` |
| `PaperJam` | Jammed | **reject** — `PRINTER_JAMMED` |
| `NoToner` | Empty | **reject** — `PRINTER_NO_TONER` |
| `LowPaper` / `TonerLow` | Warning | accept, but warn the operator in the UI |
| `DoorOpen` | Open | **reject** — `PRINTER_DOOR_OPEN` |
| `Offline` / `NotAvailable` | Unreachable | **reject** — `PRINTER_OFFLINE` |
| `Error` / `ServiceRequested` | Generic fault | **reject** — `PRINTER_ERROR` |

**Known limitation, must be accounted for.** Cheap host-based/GDI printers — which is most of what these shops buy — often report only `Idle` and `Offline` and nothing else. `TonerLow` may never fire. Therefore:

- During onboarding, the desktop app runs a **capability probe** and records which status fields a given printer model actually reports. Store it in `printers.last_status.capabilities_detected`.
- If a printer reports no granular status, preflight downgrades to "is it Idle and is the spooler reachable", and the order is flagged `low_confidence_preflight`. Those orders get a more prominent "didn't get your print?" prompt after completion.
- Keep a field-tested compatibility list in `docs/printer-compatibility.md` as you onboard shops. This will become genuinely valuable.

### SNMP status (post-flight)

Standard Printer MIB (RFC 3805) and Host Resources MIB:

| OID | Name | Use |
|---|---|---|
| `1.3.6.1.2.1.43.10.2.1.4.1.1` | `prtMarkerLifeCount` | **Total pages printed, lifetime.** The delta before/after a job is the only true physical confirmation |
| `1.3.6.1.2.1.25.3.5.1.1.1` | `hrPrinterStatus` | 1 other, 2 unknown, 3 idle, 4 printing, 5 warmup |
| `1.3.6.1.2.1.25.3.5.1.2.1` | `hrPrinterDetectedErrorState` | Bit field: low paper, no paper, low toner, no toner, door open, jammed, offline, service requested |
| `1.3.6.1.2.1.43.11.1.1.9.1.1` | `prtMarkerSuppliesLevel` | Toner level |
| `1.3.6.1.2.1.43.11.1.1.8.1.1` | `prtMarkerSuppliesMaxCapacity` | Denominator for the above |

Community string `public` works on the overwhelming majority of shop printers. If SNMP is disabled or the printer is USB, fall back to spooler-only and mark the order `low_confidence_preflight`.

### Verification algorithm

```
BEFORE printing:
  if printer.is_network and snmp_available:
      counterBefore = read(prtMarkerLifeCount)

PRINT

AFTER the spooler job leaves the queue:
  if counterBefore is known:
      poll prtMarkerLifeCount every 2 s, up to 120 s
      expected = sheetsToPrint            // includes the cover sheet
      if (counterAfter - counterBefore) >= expected:
          → PRINT_VERIFIED
      else after timeout:
          → PRINT_FAILED  (code PRINT_INCOMPLETE, with actual vs expected)
  else:
      if spooler job reached 'Printed' with no error flag:
          → PRINT_VERIFIED_LOW_CONFIDENCE
      else:
          → PRINT_FAILED
```

### Printer selection (O9, FR-7)

Run in the device, not the cloud. Given a job's requirements:

```
candidates = printers
  .filter(is_enabled)
  .filter(p => !job.needsColor  || p.supports_color)
  .filter(p => !job.needsDuplex || p.supports_duplex)
  .filter(p => p.paper_sizes.includes(job.paperSize))
  .filter(p => preflightStatus(p) == 'accept')
  .sort(by priority ASC, then by current queue depth ASC)

if candidates.isEmpty → preflight fails with the most specific reason available
else → candidates[0]
```

A BW job may be sent to a colour printer if no BW printer is free, but must be forced to greyscale in the print settings so the shop is not burning colour toner on a BW-priced job. A colour job may never go to a BW printer.

## 23. WebSocket protocol

`wss://api.kagaz.app/device/ws`. Device dials out. JSON frames. Every message is validated against a zod schema in `packages/shared/src/ws-protocol.ts`.

### Envelope

```jsonc
{
  "v": 1,
  "id": "msg_01J...",        // ULID, unique per message
  "type": "JOB_DISPATCH",
  "ts": "2026-09-15T10:22:31.412Z",
  "replyTo": "msg_01J...",   // present on responses
  "payload": { }
}
```

### Connection lifecycle

```
Device                                          Backend
  │                                                │
  │── WS upgrade, Authorization: Bearer <deviceJWT>│
  │───────────────────────────────────────────────►│
  │                                                │ verify JWT, check devices.is_revoked
  │                                                │ close 4401 if invalid
  │── HELLO ──────────────────────────────────────►│
  │   { appVersion, osVersion, printers[] }        │ upsert printers, mark shop online
  │◄───────────────────────────── HELLO_ACK ───────│
  │   { shopId, config, serverTime, pendingJobs[] }│
  │                                                │
  │── HEARTBEAT (every 15 s) ─────────────────────►│ update devices.last_heartbeat_at
  │◄────────────────────────────────── PONG ───────│
  │                                                │
  │── PRINTER_STATUS (every 60 s, or on change) ──►│
  │                                                │
  │◄──────────────────────── PREFLIGHT_REQUEST ────│
  │── PREFLIGHT_RESULT ───────────────────────────►│  (must reply within 5 s)
  │                                                │
  │◄─────────────────────────── JOB_DISPATCH ──────│
  │── JOB_ACK ────────────────────────────────────►│
  │── JOB_PROGRESS (downloading/printing) ────────►│
  │── JOB_RESULT ─────────────────────────────────►│
  │                                                │
  │  socket closes (app quit, network, crash)      │
  │                                                │ mark shop offline within 30 s
```

### Device → Server

| Type | Payload | Notes |
|---|---|---|
| `HELLO` | `{ appVersion, osVersion, machineId, printers: PrinterInfo[] }` | First message after connect. Backend upserts `printers`. |
| `HEARTBEAT` | `{ uptimeSec, queueDepth }` | Every 15 s. Missing 2 in a row ⇒ offline. |
| `PRINTER_STATUS` | `{ printers: [{ systemName, status, errorFlags[], tonerPct?, pageCounter? }] }` | On change and every 60 s. |
| `PREFLIGHT_RESULT` | `{ orderId, ok, printerSystemName?, reasonCode?, confidence: 'high'\|'low' }` | Reply to `PREFLIGHT_REQUEST`. |
| `JOB_ACK` | `{ orderId, accepted, reasonCode? }` | Within 10 s of dispatch. |
| `JOB_PROGRESS` | `{ orderId, stage: 'downloading'\|'spooling'\|'printing', pct? }` | Best effort. |
| `JOB_RESULT` | `{ orderId, ok, verification: 'snmp'\|'spooler', sheetsConfirmed?, failureCode?, detail? }` | Terminal for the job. |
| `APPROVAL_DECISION` | `{ orderId, approved, operatorNote? }` | Operator acted on an `AWAITING_APPROVAL` order. |
| `RATE_CARD_UPDATE` | `{ card }` | Operator edited prices. Backend versions it. |
| `WITHDRAW_REQUEST` | `{ amountPaise }` | |
| `PRINTER_CONFIG` | `{ systemName, isEnabled, priority, maintenanceNote }` | Operator toggled a printer. |

### Server → Device

| Type | Payload | Notes |
|---|---|---|
| `HELLO_ACK` | `{ shopId, shopName, config, serverTime, pendingJobs: Job[] }` | `pendingJobs` replays anything dispatched while the device was away. |
| `PONG` | `{ serverTime }` | |
| `PREFLIGHT_REQUEST` | `{ orderId, needsColor, needsDuplex, paperSize, sheets }` | Device must answer in 5 s. |
| `JOB_DISPATCH` | `{ orderId, token, pdfUrl, pdfSha256, printerSystemName, settings: { copies, duplex, color, pageRange, paperSize }, coverSheet: {...} }` | `pdfUrl` presigned, 10 min TTL. |
| `JOB_CANCEL` | `{ orderId, reason }` | Only honoured before spooling starts. |
| `CONFIG_UPDATE` | `{ maxPagesPerOrder, approvalThresholdPages, secureRelease, ... }` | Pushed when admin changes shop settings. |
| `ORDER_UPDATE` | `{ order }` | Drives the operator's live order list. |
| `WALLET_UPDATE` | `{ balancePaise, todayPaise, todayOrders }` | |
| `FORCE_UPDATE` | `{ minVersion, downloadUrl }` | Refuse to operate below a minimum version. |

### Reliability rules

- **Reconnect:** exponential backoff 1 s → 2 s → 4 s → … capped at 30 s, with ±20% jitter. Never give up.
- **Replay on reconnect:** `HELLO_ACK.pendingJobs` contains every order in `QUEUED` or `DISPATCHED` for that shop. The device deduplicates against its local SQLite queue by `orderId`.
- **At-least-once delivery, idempotent handling.** The device may receive the same `JOB_DISPATCH` twice. It must check its local queue and ignore a duplicate `orderId`. Printing a job twice is worse than printing it late.
- **The device is the source of truth for job outcome.** The backend never assumes a job printed.
- **Clock skew:** shop PCs frequently have wrong clocks. Never use device time for anything that matters; `serverTime` in `HELLO_ACK`/`PONG` is authoritative and the device displays server time.

## 24. REST API

Internal and admin only. Students never touch it; they use WhatsApp. Operators never touch it directly; the desktop app uses the WebSocket for everything except pairing and file download.

### Public / webhook

```
POST /webhooks/whatsapp          Meta webhook. Verify X-Hub-Signature-256.
GET  /webhooks/whatsapp          Meta verification challenge (hub.mode, hub.challenge).
POST /webhooks/razorpay          Verify X-Razorpay-Signature (HMAC-SHA256 of raw body).
GET  /health                     Liveness. Returns DB + R2 + Razorpay reachability.
GET  /r/:shortCode               Student-facing "print now" release link for HELD orders.
```

### Device

```
POST /device/pair                { pairingCode, machineId, osVersion, appVersion }
                                 → { deviceId, deviceJwt, shopId, shopName }
POST /device/refresh             Rotate the device JWT. Bearer auth.
GET  /device/ws                  WebSocket upgrade. Bearer auth.
```

### Admin (email magic link + session cookie, all routes role-checked)

```
GET    /admin/shops                      list + online status + today's volume
POST   /admin/shops                      create
PATCH  /admin/shops/:id                  status, caps, commission
POST   /admin/shops/:id/pairing-code     generate an 8-char code, 24 h TTL
POST   /admin/shops/:id/linked-account   create the Razorpay Route linked account
GET    /admin/shops/:id/rate-card        current + history
PUT    /admin/shops/:id/rate-card        creates a new version

GET    /admin/orders                     filter by shop, status, date, phone
GET    /admin/orders/:id                 full order + order_events timeline
POST   /admin/orders/:id/refund          manual refund. Requires a reason. Always ledgered.
POST   /admin/orders/:id/force-complete  escape hatch. Heavily logged.

GET    /admin/ledger/shop/:shopId        entries + derived balance
GET    /admin/ledger/reconciliation      today's exceptions
POST   /admin/withdrawals/:id/release    release Route holds

GET    /admin/students/:phone            order history
POST   /admin/students/:phone/block      abuse handling
```

### Conventions

- All request and response bodies validated by zod schemas shared with the client.
- Errors: `{ error: { code, message, detail? } }` with `code` drawn from the §27 taxonomy.
- Money in responses is always `*_paise` integers. Never send a formatted rupee string from the API.
- Every mutating admin endpoint writes an audit row.

## 25. WhatsApp conversation design

### Channel setup

- Meta WhatsApp Cloud API, one Kagaz business number for the pilot.
- Shop is resolved from a deep link: the QR code at the shop counter encodes `https://wa.me/<kagaz_number>?text=PRINT%20<SHOP_CODE>`. The student's first message therefore already names the shop.
- If a student messages without a shop code and has ordered before, use their last shop. Otherwise ask them to scan the QR at the counter.

### Session state machine (`bot_sessions.state`)

```
IDLE
  └─ "PRINT <CODE>" or any greeting
      └─► SHOP_RESOLVED ──► (shop offline?) ──► send "closed", back to IDLE
            │
            ▼ shop online
         WAITING_FOR_FILE
            │  file received
            ▼
         CONVERTING            (send "Got it, checking your file…")
            │
            ▼
         ASK_COLOR       ──► ASK_SIDES ──► ASK_COPIES ──► ASK_RANGE
            │                                                 │
            ▼                                                 ▼
         SHOW_QUOTE ◄──────────────────────────────────────────┘
            │  "Confirm"          │ "Change options"
            ▼                     └──► back to ASK_COLOR
         PREFLIGHT
            │ ok
            ▼
         AWAITING_PAYMENT    (payment link sent, 15 min timer)
            │ webhook
            ▼
         PRINTING            ("Paid. Printing now…")
            │
            ▼
         DONE                ("Ready. Token #47. Collect at the counter.")
            │
            ▼
          IDLE
```

Session TTL is 30 minutes of inactivity. `CANCEL` from any state returns to `IDLE` (and cancels the order if it is pre-payment).

### Message design

Use **interactive messages**, not free text, for every choice. Free text is only accepted for the page range.

**Greeting**
> Hi! This is *Sharma Xerox* on Kagaz. 🖨
> Send me a PDF, Word file or photo and I'll print it for you.
>
> Files are deleted 24 hours after printing.

**After conversion** — image message with the page-1 thumbnail, plus:
> *Assignment_Unit3.pdf*
> 12 pages · A4
>
> Colour or black & white?
> `[ Black & White ]` `[ Colour ]`

**Sides** — buttons: `[ Single side ]` `[ Double side ]`

**Copies** — interactive list: 1, 2, 3, 4, 5, More…

**Range** — buttons: `[ All 12 pages ]` `[ Choose pages ]`. If "Choose pages", accept free text and validate.

**Quote**
> *Your order*
> 12 pages · B&W · Double side · 1 copy
> 6 sheets × ₹2.50 = *₹15.00*
>
> `[ Pay ₹15 ]` `[ Change options ]` `[ Cancel ]`

**Payment** — the Razorpay payment link as a CTA URL button.

**Completion**
> ✅ Printed!
> *Token #47* — show this at the counter.
> Order K7F2 · ₹15.00

**Failure**
> ⚠️ The printer ran out of paper before your job finished.
> Your ₹15.00 is being refunded — it'll reach your UPI app in 3–5 working days.
> Sorry about that. Order K7F2.

### Templates (must be pre-approved by Meta)

Business-initiated messages sent more than 24 hours after the student's last message require an approved template. In practice only these need to be templates, because everything else happens inside the 24-hour service window:

| Template name | Category | Body |
|---|---|---|
| `print_ready` | Utility | Your print is ready. Token {{1}}. Collect at {{2}}. Order {{3}}. |
| `print_failed_refund` | Utility | Your order {{1}} could not be printed. ₹{{2}} is being refunded. |
| `order_expired` | Utility | Your order {{1}} expired because payment wasn't completed. Nothing was charged. |

Cost planning: roughly two utility messages per order at about ₹0.145 each, so **≈₹0.30 per order** in messaging. User-initiated service conversations are free, so the whole option-picking flow costs nothing.

### Abuse handling in the bot

- Rate limit: max 10 orders per phone per hour, max 30 per day.
- Reject files over 50 MB and over `max_pages_per_order` before conversion where the page count can be cheaply determined, and immediately after conversion otherwise.
- A student with 3 auto-refunds in 7 days is flagged for admin review.
- `students.is_blocked` short-circuits everything with a polite refusal.

## 26. Security and privacy

### Authentication

| Actor | Mechanism |
|---|---|
| Student | Implicitly authenticated by WhatsApp phone number. No password, no account. |
| Device | One-time pairing code → long-lived JWT (90 days, rotating). `jti` hash stored in `devices.token_hash` so any device can be revoked instantly. |
| Admin | Email magic link → HTTP-only, secure, SameSite=Lax session cookie, 12-hour TTL. |
| Webhooks | HMAC signature verification. Razorpay: `X-Razorpay-Signature`. Meta: `X-Hub-Signature-256`. Reject and log any unsigned or mismatched request. |

### Secrets

- Never in the repo. `.env` is gitignored; `.env.example` documents every key with a fake value.
- Production secrets in the host's secret manager (Railway/Render env vars), not in the Docker image.
- The desktop app ships with **no secrets at all**. It holds only its own device JWT, stored in the Windows Credential Manager via `keytar` — never in a plaintext JSON file in `%APPDATA%`.
- Rotate the Razorpay webhook secret and the WhatsApp token on a schedule; both are single values that, if leaked, let an attacker forge payments.

### File privacy (C5, FR-41)

This is the part that will get you in trouble if you get it wrong. Students print Aadhaar copies, marks cards and medical reports.

- Encrypted in transit (TLS) and at rest (R2 server-side encryption).
- Presigned URLs only, 10-minute TTL, no public bucket access ever.
- The desktop app downloads the PDF to `%TEMP%\kagaz\<orderId>.pdf`, prints it, and deletes it in a `finally` block. There is no "open file", no "save as", and no file browser anywhere in the operator UI. The operator can see *that* a 12-page job printed; they cannot see what was in it.
- Server-side deletion 24 hours after terminal state, enforced twice (application job + R2 lifecycle rule).
- The retention policy is stated in the bot's first message. Do not bury it.

### Input validation

- Everything from WhatsApp is hostile input. Validate MIME by magic bytes, not by the filename extension.
- Sanitise PDFs before dispatch: strip embedded JavaScript, embedded files and OpenAction entries. A malicious PDF reaching a shop's Windows PC is a real risk.
- Cap decompressed size to catch PDF bombs.
- Run LibreOffice conversion with a hard timeout, in a process group that can be killed, ideally in a container with no network egress.

### Operational

- All traffic HTTPS/WSS. HSTS on.
- Rate limit every public endpoint.
- No PII in logs. Log `student_id`, never the phone number. Log `file_id`, never the filename.
- Sentry configured to scrub `phone`, `original_name`, `pdfUrl`.
- Daily encrypted Postgres backups with a 30-day retention and a **tested** restore. An untested backup is not a backup.

## 27. Error taxonomy and refund rules

Every failure has a code. The code determines the student message, whether money is refunded, and whether the operator is notified. Defined once in `packages/shared/src/errors.ts`.

### Pre-payment failures — no money involved

| Code | Cause | Student message | Order → |
|---|---|---|---|
| `SHOP_OFFLINE` | App not running | "This shop is closed right now." | `CANCELLED` |
| `SHOP_SUSPENDED` | Admin suspended | "This shop isn't accepting Kagaz orders." | `CANCELLED` |
| `FILE_TOO_LARGE` | > 50 MB | "That file is too big. Max 50 MB." | stay |
| `FILE_TYPE_UNSUPPORTED` | Bad MIME | "I can print PDF, Word, PowerPoint, Excel and images." | stay |
| `CONVERSION_FAILED` | LibreOffice failed | "I couldn't read that file. Can you send it as a PDF?" | `CONVERSION_FAILED` |
| `CONVERSION_TIMEOUT` | > 60 s | same as above | `CONVERSION_FAILED` |
| `PAGE_LIMIT_EXCEEDED` | > shop cap | "That's {n} pages — more than this shop takes online. Please visit the counter." | `CANCELLED` |
| `AMOUNT_LIMIT_EXCEEDED` | > shop cap | similar | `CANCELLED` |
| `INVALID_PAGE_RANGE` | Parser rejected | "I couldn't read that page range. Try something like 1-5,8." | stay |
| `PRINTER_NO_PAPER` | Preflight | "The printer is out of paper. Try again in a few minutes." | `PREFLIGHT_FAILED` |
| `PRINTER_NO_TONER` | Preflight | "The printer is out of toner." | `PREFLIGHT_FAILED` |
| `PRINTER_JAMMED` | Preflight | "The printer is jammed." | `PREFLIGHT_FAILED` |
| `PRINTER_OFFLINE` | Preflight | "The printer isn't responding." | `PREFLIGHT_FAILED` |
| `NO_COLOR_PRINTER` | Preflight | "This shop can't do colour right now. Black & white is available." | `PREFLIGHT_FAILED` |
| `QUEUE_FULL` | Depth > cap | "There are a lot of jobs ahead of you. Try again shortly." | `PREFLIGHT_FAILED` |
| `QUOTE_EXPIRED` | 15 min | "That quote expired. Send the file again?" | `EXPIRED` |
| `PAYMENT_LINK_EXPIRED` | 15 min | "Payment link expired. Nothing was charged." | `EXPIRED` |
| `PAYMENT_FAILED` | Gateway | "Payment didn't go through. Here's a fresh link." | `PAYMENT_FAILED` |

### Post-payment failures — **all auto-refund, no exceptions**

| Code | Cause | Notify operator | Order → |
|---|---|---|---|
| `DISPATCH_TIMEOUT` | Device didn't ack in 60 s | yes | `PRINT_FAILED` → refund |
| `DEVICE_REJECTED_JOB` | Device said no | yes | `PRINT_FAILED` → refund |
| `DOWNLOAD_FAILED` | Device couldn't fetch the PDF | yes | `PRINT_FAILED` → refund |
| `CHECKSUM_MISMATCH` | SHA-256 mismatch | yes | `PRINT_FAILED` → refund |
| `SPOOL_FAILED` | SumatraPDF non-zero exit | yes | `PRINT_FAILED` → refund |
| `PRINT_INCOMPLETE` | Page counter delta short | yes | `PRINT_FAILED` → refund |
| `PRINT_TIMEOUT` | No confirmation in 120 s | yes | `PRINT_FAILED` → refund |
| `PRINTER_ERROR_MIDJOB` | Jam/paper out during the job | yes | `PRINT_FAILED` → refund |
| `SHOP_WENT_OFFLINE` | Socket died between PAID and PRINTED | yes | `PRINT_FAILED` → refund |
| `OPERATOR_REJECTED` | Operator declined an approval | — | `REJECTED` → refund |
| `HOLD_EXPIRED` | Secure release not tapped in 6 h | — | refund |
| `STUDENT_REPORTED_MISSING` | Student said it didn't print | yes | manual review → refund |
| `STUCK_ORDER` | Sweeper found it stalled > 2 h | yes | refund + admin alert |

### Refund principles

- **R-P1.** Post-payment, there are exactly two outcomes: `COMPLETED` or `REFUNDED`. No order sits in limbo.
- **R-P2.** Refunds are full, including Kagaz's commission. Kagaz does not profit from a failed print.
- **R-P3.** Refunds are initiated automatically, within seconds, without an operator or admin decision.
- **R-P4.** The student is told the refund is happening *and* how long it takes (3–5 working days for UPI/cards). Not telling them generates a support message every single time.
- **R-P5.** The shop's wallet is debited by the reversing ledger transaction, and the Route transfer — still `on_hold` — is reversed rather than clawed back.
- **R-P6.** `STUDENT_REPORTED_MISSING` is the only manual path. Cap it: 2 free refunds per student per 30 days, then admin review. Some students will lie; most will not, and fighting the honest ones costs more than the paper.
---
---

# PART C — IMPLEMENTATION PLAN

## 28. Phase list

Phases are ordered so that each one ends in something you can demonstrate, and so that the riskiest unknowns are hit early. Estimates assume one developer working part-time; halve them for full-time.

| # | Phase | Ends with | Est. |
|---|---|---|---|
| 0 | Foundations | Repo builds, CI green, one health endpoint deployed | 2 d |
| 1 | Data model | Every table migrated, seeded, reversible | 2 d |
| 2 | Pure domain logic | Pricing, page ranges, money, state machine — all unit tested | 3 d |
| 3 | Shop onboarding and pairing | Admin creates a shop, gets a pairing code | 2 d |
| 4 | Desktop shell and socket | App connects, heartbeats, shows online | 4 d |
| 5 | Printer discovery and status | App lists printers and real statuses | 4 d |
| 6 | Print execution | App prints a PDF with correct settings from a button | 4 d |
| 7 | **Spike: end-to-end print on real hardware** | A cloud-stored PDF prints on a real shop printer | 2 d |
| 8 | File intake and conversion | DOCX in, PDF + page count + thumbnail out | 3 d |
| 9 | WhatsApp bot | Full conversation to a quote, no payment | 5 d |
| 10 | Preflight round trip | Bot refuses orders when the printer can't take them | 2 d |
| 11 | Ledger and wallet | Money movements recorded and balanced | 3 d |
| 12 | Payments | Razorpay link, webhook, order reaches PAID | 4 d |
| 13 | Route linked accounts | Split, on-hold transfer, release | 3 d |
| 14 | Job dispatch end to end | Student pays, print comes out, student notified | 3 d |
| 15 | Failures and refunds | Every code in §27 implemented and tested | 4 d |
| 16 | Operator UI | Orders, revenue, rate card, printers, wallet | 5 d |
| 17 | Approval and secure release | Optional per-shop modes work | 2 d |
| 18 | Admin panel | Shops, orders, refunds, reconciliation | 4 d |
| 19 | Packaging and updates | Signed installer, auto-update working | 3 d |
| 20 | Observability and runbook | Alerts fire, backups restore, runbook written | 3 d |
| 21 | Pilot | One real shop, six weeks | 6 w |

**Total to pilot: roughly 65 working days part-time, ~7 weeks full-time.**

The ordering is deliberate. Phases 4–7 come before any payment work because *the print actually coming out of a real printer with the right settings is the riskiest part of this entire build*. If SumatraPDF cannot drive duplex on the shop's specific printer, you need to know that in week two, not week eight.

---

## Phase 0 — Foundations

**Goal.** A monorepo that builds, typechecks, lints and deploys, with nothing in it yet.

**Why first.** Every later phase is faster if the scaffolding is right, and slower if it is not. Two days here saves two weeks later.

### Tasks

- [x] Initialise pnpm workspace at the repo root. `pnpm-workspace.yaml` listing `apps/*` and `packages/*`.
- [x] `tsconfig.base.json` with `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. Do not loosen these later; they catch exactly the class of bug that costs money here.
- [x] `packages/config` — shared eslint, prettier, tsconfig presets.
- [x] `packages/shared` — empty package, exports set up, consumed by backend and desktop to prove workspace resolution works.
- [x] `apps/backend` — Fastify server, one route `GET /health` returning `{ ok: true, version, commit }`.
- [x] Dockerfile for the backend. Base `node:20-slim`, then install `libreoffice-core libreoffice-writer libreoffice-impress libreoffice-calc poppler-utils fonts-liberation fonts-dejavu fonts-noto-core fonts-noto-devanagari`. Verify `soffice --version` and `pdftoppm -v` in the build.
- [x] `apps/desktop` — Electron app that opens a window saying "Kagaz". `electron-builder` configured for `nsis`, `win`, `x64`.
- [x] `.env.example` listing every variable from Appendix A with fake values. `.env` in `.gitignore`.
- [x] `.github/workflows/ci.yml` — on PR: `pnpm install`, typecheck all packages, lint, test.
- [ ] Deploy the backend to Railway/Render from `main`. Point a subdomain at it.
- [x] `docs/adr/0001-record-architecture-decisions.md` and `0002-electron-over-tauri.md` capturing §14's rationale.

**Status (2026-09-15).** Everything except the Railway/Render deploy is done — that needs your hosting account and is not something to do unattended. `apps/backend` currently runs against a Neon Postgres instance (`.env`, not committed) rather than local Postgres.

### Acceptance criteria

- `pnpm install && pnpm -r build && pnpm -r test` passes from a clean clone.
- `curl https://<your-backend>/health` returns 200 with the current commit SHA. — not yet checkable, no deployment exists.
- `pnpm --filter desktop build` produces a `.exe` installer that runs on a Windows machine.
- CI blocks a PR that fails typecheck.

---

## Phase 1 — Data model

**Goal.** Every table from §16 exists, migrates forward and backward, and is seeded with realistic data.

### Tasks

- [x] Translate §16 into `prisma/schema.prisma`. Keep the enum names identical to the SQL.
- [x] Write the ledger balance trigger as a raw SQL migration — Prisma will not generate it.
- [x] Write the `shop_wallet_balances` view as a raw SQL migration.
- [x] `prisma migrate dev` → review the generated SQL by hand before committing. Never commit a migration you have not read.
- [x] Seed script: 1 shop (`PESCE1`), 1 rate card, 2 printers (one BW, one colour), 3 students, 10 orders across a spread of statuses, matching ledger entries.
- [x] Verify the ledger trigger rejects an unbalanced transaction. Write this as a test, not a manual check.
- [x] Add `pnpm db:reset` (drop, migrate, seed) for local development.
- [x] Configure connection pooling (PgBouncer via Supabase, or Prisma's pool) and set a sane `connection_limit`.

**Status (2026-09-15).** All tasks done; `pnpm test` is green (16/16 backend, 8/8 shared). Ran the migrations, generated and hand-reviewed both migration.sql files, reset and seeded the database, and fixed two bugs found in the process:
- `prisma/seed.ts` built fake Razorpay ids from `orderId.slice(0, 8)`; since ids are UUIDv7, that slice is the near-constant timestamp prefix, so every paid order in a run collided on `payments.rz_payment_id`. Changed to `orderId.slice(-8)` (the random tail).
- `prisma/sql/ledger_trigger_and_views.sql` defined `shop_wallet_balances.balance_paise` as `SUM(amount_paise)`, which Postgres returns as `numeric`, not `bigint` — failing the "money is always an integer type" schema-invariant test. Added an explicit `::BIGINT` cast, in both the source `.sql` and the generated migration.

Known gap against the acceptance criteria below: seeding alone takes ~125s (not the ~20s target), and `db:reset` currently runs the seed twice — `prisma migrate reset` already auto-seeds via the `prisma.seed` field in `apps/backend/package.json`, and the script then chains an explicit `&& pnpm db:seed` on top. Not fixed yet; flagging for Phase 2+ cleanup or whenever seed performance starts to matter.

### Acceptance criteria

- `pnpm db:reset` produces a usable database in under 20 seconds. — not met; current run is ~125s×2, see status note above.
- Inserting two ledger entries summing to 100 paise raises an exception naming the transaction. — verified by `test/ledger-trigger.test.ts`.
- Every foreign key has an index. Check with a query, do not assume. — verified by `test/schema-invariants.test.ts`.
- A down-migration runs cleanly. — `pnpm db:down` exists (`scripts/db-down.ts`); not yet exercised against the current migrations.

---

## Phase 2 — Pure domain logic

**Goal.** Everything that can be a pure function is a pure function, in `packages/shared`, with no database and no network, and a test suite you trust.

**Why now.** These are the pieces where a bug costs real money or real paper. They are also the only pieces you can test exhaustively. Get them right in isolation, before any I/O can hide the failure.

### Tasks

- [x] `money.ts` — `Paise` branded type, `rupeesToPaise`, `formatPaise`, `bps` helpers. Make `number` un-assignable to `Paise` so an accidental rupee value is a compile error.
- [x] `page-range.ts` — parser per §20. Property-based tests: for any valid range string, the output is sorted, deduplicated and within bounds.
- [x] `pricing.ts` — the §20 algorithm as one pure function. Table-driven tests covering every row of the worked-examples table plus edge cases: 1 page, min-order floor, duplex odd page count, every volume tier boundary, page range reducing the count.
- [x] `order-state.ts` — the §17 transition table as data, plus `canTransition(from, event)` and `applyTransition(...)` returning the next state or a typed error. Test that every terminal state rejects all events, and that every state in the enum is reachable.
- [x] `errors.ts` — the §27 taxonomy as a const object: code, student message, refund flag, notify-operator flag, target state.
- [x] `ws-protocol.ts` — zod schema for every message in §23, plus a discriminated union and type guards.

**Status (2026-09-18).** All six modules implemented in `packages/shared/src/`, each with its own test file under `packages/shared/test/`. 113 tests, all passing. Notes on decisions the spec left open:
- `order-state.ts`: `QUOTED --options_confirmed--> QUOTED` is a same-state transition — the spec's diagram target for that edge is the pseudo-state `(preflight)`, which isn't one of the 22 real `order_status` enum values; no persisted status actually changes until `preflight_ok`/`preflight_failed` (both also `from: QUOTED`) report the outcome. `DRAFT` is documented as the order's creation default (`schema.prisma`), not reachable via `applyTransition` — there is no row to transition before it exists.
- `errors.ts`: `targetStatus` is typed `OrderStatus | 'stay'` to capture the table's "stay" entries (`FILE_TOO_LARGE`, `INVALID_PAGE_RANGE`, etc.) distinctly from a real transition.
- `pricing.ts`/`page-range.ts`: kept the `Bps`/`Paise` types from `money.ts` throughout so a rupee value or a raw float can't leak into a total by accident.
- `page-range.ts`: whitespace is stripped from each comma-separated part (not just trimmed at the ends), so `"1 - 5, 8"` parses the same as `"1-5,8"` — the grammar's `\s` in the allowed-character class implied this was meant to be tolerated, not merely not-rejected.

### Acceptance criteria

- [x] 100% line coverage on `pricing.ts`, `page-range.ts` and `order-state.ts`. These three earn it; nothing else in the codebase needs to. — enforced by `vitest.config.ts` coverage thresholds (100% lines/statements/functions/branches, scoped to those three files via `coverage.include`); `pnpm --filter @kagaz/shared test:coverage` is green.
- [x] `pricing.ts` has zero imports outside `packages/shared`. — imports only `./money.js` and `./page-range.js`.
- [x] A test asserts that `Object.keys(ORDER_STATES)` matches the database enum exactly, so the two cannot drift. — `order-state.test.ts` reads the `enum OrderStatus` block straight out of `apps/backend/prisma/schema.prisma` and compares it against `ORDER_STATES`.

---

## Phase 3 — Shop onboarding and pairing

**Goal.** An admin can create a shop and produce a pairing code. No UI yet — REST endpoints and a seed script are enough.

### Tasks

- [ ] `POST /admin/shops` — create shop with defaults from §16.
- [ ] `PUT /admin/shops/:id/rate-card` — creates a new `rate_cards` row with `version = max + 1`. Never mutate an existing card.
- [ ] `POST /admin/shops/:id/pairing-code` — 8-char Crockford base32 (no I, L, O, U), 24-hour TTL, single use.
- [ ] `POST /device/pair` — validate code, mark consumed, create `devices` row, issue a device JWT (90-day expiry, `jti` stored hashed).
- [ ] `POST /device/refresh` — rotate the JWT, invalidate the old `jti`.
- [ ] Admin auth: email magic link. Use a simple signed token by email; do not build user management.
- [ ] Audit log table and middleware for every mutating admin route.

### Acceptance criteria

- A pairing code can be consumed exactly once. The second attempt returns 409.
- An expired code returns 410.
- Revoking a device (`is_revoked = true`) causes its next WebSocket connect to be refused with close code 4401.
- The JWT contains only `deviceId`, `shopId`, `jti`, `exp`. No secrets, no PII.

---

## Phase 4 — Desktop shell and socket

**Goal.** The desktop app pairs, connects, heartbeats, and the backend correctly shows the shop as online and offline.

**This is the phase that proves the core product decision.** By the end of it, closing the app must make the shop offline within 30 seconds, and reopening it must make the shop online within 2 seconds.

### Tasks

- [ ] Electron main process skeleton: single window, single instance lock (`app.requestSingleInstanceLock()` — two copies running would double-print).
- [ ] Pairing screen: 8-character input, calls `POST /device/pair`, stores the JWT in Windows Credential Manager via `keytar`.
- [ ] `ws-client.ts`: connect with `Authorization: Bearer`, send `HELLO`, handle `HELLO_ACK`, heartbeat every 15 s, reconnect with exponential backoff + jitter capped at 30 s.
- [ ] Backend `ws/hub.ts`: in-memory `Map<shopId, DeviceConnection>`, JWT verification on upgrade, `HELLO` handling, heartbeat tracking writing `devices.last_heartbeat_at`.
- [ ] Backend sweeper: every 10 s, mark shops offline whose last heartbeat is older than 30 s.
- [ ] `isShopOnline(shopId)` helper used by everything downstream.
- [ ] Tray icon with the connection state. Clicking the window's X **minimises to tray**; quitting requires the tray menu or an explicit "Go Offline & Quit" button. This preserves "app open = shop open" while preventing an accidental close from shutting the shop.
- [ ] "Launch on login" setting, default on, implemented with `app.setLoginItemSettings`. Windows reboots overnight for updates; without this the shop is silently closed all morning.
- [ ] Connection status UI: a prominent green "Open for orders" / red "Closed" banner. This is the most important pixel in the app.

### Acceptance criteria

- Kill the app process. Within 30 s, `GET /admin/shops` shows it offline.
- Unplug the network. The app shows "Reconnecting…" and recovers automatically when the network returns, without a restart.
- Two instances cannot run at once.
- Reboot the PC. The app comes back and the shop goes online without anyone touching it.
- The device JWT is not present in plaintext anywhere under `%APPDATA%`.

---

## Phase 5 — Printer discovery and status

**Goal.** The app knows what printers exist, what they can do, and whether they can print right now.

**Highest-uncertainty phase. Do it on a real printer, not a virtual one.** Buy or borrow the cheapest laser printer you can find, because that is what shops own.

### Tasks

- [ ] `enumerate.ts` — `Get-Printer | ConvertTo-Json` via `child_process`, parsed and normalised. Handle the single-printer case where PowerShell returns an object rather than an array.
- [ ] Capability detection: colour support and duplex support from the driver. Cross-check against `Get-PrinterProperty` where available; where it is not, expose a manual toggle in Settings, because the driver will sometimes lie.
- [ ] `status-wmi.ts` — `Win32_Printer.PrinterStatus`, `DetectedErrorState`, `ExtendedDetectedErrorState`, mapped to the §22 verdict table.
- [ ] `status-snmp.ts` — `net-snmp` against the OIDs in §22. 2-second timeout, community `public`, graceful fallback.
- [ ] **Capability probe**, run once per printer at pairing: record which status fields the printer actually populates, store in `printers.last_status.capabilities_detected`, and mark the printer `low_confidence` if it reports nothing beyond Idle/Offline.
- [ ] `select.ts` — the printer-selection algorithm from §22.
- [ ] Send `PRINTER_STATUS` on change and every 60 s.
- [ ] Printers screen in the UI: per printer, status light, toner bar where available, enable/disable toggle, priority, maintenance note.
- [ ] Start `docs/printer-compatibility.md` and record the first real model.

### Acceptance criteria

- Physically remove the paper tray. The app reflects `PaperOut` within 60 seconds, and the backend has the updated status.
- Turn the printer off. The app reflects `Offline`.
- On a network printer, toner percentage matches what the printer's own web page reports.
- On a USB host-based printer that reports nothing useful, the app still works and marks it `low_confidence` rather than crashing or claiming everything is fine.

---

## Phase 6 — Print execution

**Goal.** A button in the app prints a local PDF with exactly the requested settings.

### Tasks

- [ ] Bundle `SumatraPDF.exe` under `apps/desktop/resources/`. Add it to `electron-builder`'s `extraResources` and resolve the path correctly in both dev and packaged builds (`process.resourcesPath`).
- [ ] `executor.ts` — build the command line:
      `SumatraPDF.exe -print-to "<systemName>" -print-settings "<settings>" -silent -exit-when-done "<file>"`
      where settings compose as `2x` (copies), `duplex` / `duplexshort` / `simplex`, `color` / `monochrome`, `1-5,8` (range), `paper=A4`, `noscale`.
- [ ] Verify every setting *individually on paper* before trusting the composition. Duplex in particular behaves differently per driver.
- [ ] `cover-sheet.ts` — generate a one-page A4 PDF with `pdf-lib`: token number in very large type, order short code, masked phone (`+91 98••• ••210`), page count, options, timestamp. Always BW, always single-sided. Printed first so it lands face-up on top of the stack.
- [ ] Merge cover sheet + document, or print as two sequential jobs. Prefer merging — two jobs can interleave with another student's job.
- [ ] `verify.ts` — the §22 verification algorithm: SNMP counter delta where available, spooler job state otherwise.
- [ ] `queue.ts` — `better-sqlite3` local queue: `jobs(orderId PK, payload, state, attempts, createdAt, updatedAt)`. States: `queued → downloading → printing → done/failed`. Survives a crash and resumes on launch.
- [ ] Dev-only screen: pick a local PDF, pick settings, print. This is your test harness for the rest of the project.

### Acceptance criteria

- 3 copies of a 4-page PDF, double-sided, produces 3 stacks of 2 sheets each. Count them by hand.
- A page range of `2-3` on a 10-page document prints exactly 2 pages, and they are pages 2 and 3.
- A colour job on a colour printer produces colour; a BW job on the same printer produces greyscale and does not consume colour toner.
- Killing the app mid-print and restarting it does not reprint a completed job.
- The temp PDF is gone from `%TEMP%` after the job reaches a terminal state, including on the failure path.

---

## Phase 7 — Spike: end-to-end print on real hardware

**Goal.** Prove the riskiest path works before building anything on top of it. No bot, no payments, no database — a script and a printer.

**Timebox this to two days.** If it does not work, the stack choice changes and you need to know now.

### Tasks

- [ ] Upload a PDF to R2 by hand.
- [ ] Generate a presigned URL from the backend.
- [ ] Send a hand-crafted `JOB_DISPATCH` frame down the WebSocket from a REPL.
- [ ] Watch the device download, verify the SHA-256, print with settings, verify via SNMP, and return `JOB_RESULT`.
- [ ] Repeat on at least two physically different printer models, ideally one USB and one network.
- [ ] Record results in `docs/printer-compatibility.md`.

### Acceptance criteria

- Paper comes out of a real printer, with the right settings, triggered entirely by a cloud message.
- `JOB_RESULT` reports `verification: 'snmp'` with a correct sheet count on the network printer.
- Total time from dispatch to paper is under 30 seconds for a 12-page document.

**If this phase fails:** the fallback order is (1) different SumatraPDF settings syntax, (2) `pdf-to-printer` npm package, (3) a small .NET helper binary invoked from Electron using `System.Printing`, (4) reconsider .NET for the whole desktop app. Do not proceed to Phase 8 until one of these works.

---

## Phase 8 — File intake and conversion

**Goal.** Bytes in, a validated PDF with a page count and a thumbnail out.

### Tasks

- [ ] R2 client: presigned PUT and GET, key layout per §21.
- [ ] `job_queue` runner: poll every 2 s with `SELECT ... FOR UPDATE SKIP LOCKED`, exponential backoff on failure, dead-letter after `max_attempts`.
- [ ] `convert_file` job implementing the §21 pipeline.
- [ ] MIME detection by magic bytes (`file-type`), not by extension. Reject mismatches.
- [ ] LibreOffice invocation with a 60-second timeout, killing the whole process group on timeout. Run with a per-conversion `-env:UserInstallation` profile directory so concurrent conversions do not collide — this is a real and very confusing failure mode.
- [ ] Image → PDF: fit to A4 with margins, preserve aspect ratio, respect EXIF rotation.
- [ ] PDF sanitisation: strip `/JavaScript`, `/EmbeddedFile`, `/OpenAction`, `/Launch`.
- [ ] Page count via `pdf-lib`. Thumbnail via `pdftoppm -png -r 50 -f 1 -l 1`.
- [ ] `delete_expired_files` job, hourly. Plus the R2 lifecycle rule as a backstop.
- [ ] Test corpus in `apps/backend/test/fixtures/`: a normal DOCX, a DOCX with an uncommon font, a 200-page PDF, a password-protected PDF (must fail cleanly), a corrupt PDF, a 49 MB PDF, a JPEG from a phone camera in portrait with EXIF rotation, a PPTX, an XLSX with a wide sheet.

### Acceptance criteria

- Every fixture either converts correctly or fails with a specific error code. Nothing hangs.
- A password-protected PDF returns `CONVERSION_FAILED`, not a stack trace.
- Ten concurrent conversions do not interfere with each other.
- A file with `delete_after` in the past is gone from R2 within an hour, and `files.deleted_at` is set.

---

## Phase 9 — WhatsApp bot

**Goal.** A student can complete the entire conversation up to seeing a price. No payment yet.

### Tasks

- [ ] Meta developer app, WhatsApp product, test number, permanent access token. Do this first — verification takes time.
- [ ] `GET /webhooks/whatsapp` — respond to the `hub.challenge` verification handshake.
- [ ] `POST /webhooks/whatsapp` — verify `X-Hub-Signature-256` against the raw body, insert into `webhook_events` for idempotency, return 200 immediately, process asynchronously. Meta retries aggressively on a slow response.
- [ ] Send client: text, interactive buttons (max 3), interactive lists (max 10 rows), image with caption, CTA URL button. Handle rate limits and retries.
- [ ] Media download: `GET /v21.0/<media_id>` then fetch the returned URL with the bearer token. Note the URL is short-lived.
- [ ] Bot FSM per §25, state in `bot_sessions`, 30-minute TTL, `CANCEL` from any state.
- [ ] Shop resolution from the `PRINT <CODE>` deep link, falling back to the student's last shop.
- [ ] Shop-offline check as the very first gate.
- [ ] Wire in conversion (Phase 8) and pricing (Phase 2) to produce a real quote.
- [ ] Generate and print the shop's QR code poster (`wa.me/<num>?text=PRINT%20<CODE>`) as a PDF for the counter. This is the entire distribution mechanism — make it look good.
- [ ] Submit the three templates from §25 for Meta approval. Approval takes days; submit before you need them.

### Acceptance criteria

- From a real phone: send `PRINT PESCE1`, upload a DOCX, tap through colour/sides/copies/range, and see a correct price. Under 60 seconds end to end.
- Sending a 60 MB file produces `FILE_TOO_LARGE`, not a crash.
- Sending a `.exe` produces `FILE_TYPE_UNSUPPORTED`.
- Closing the desktop app and then messaging the bot produces "this shop is closed".
- Replaying the same webhook payload twice produces exactly one order.
- Typing `cancel` at any pre-payment step ends the session cleanly.

---

## Phase 10 — Preflight round trip

**Goal.** The bot refuses to quote when the printer cannot actually do the job.

### Tasks

- [ ] Backend: `PREFLIGHT_REQUEST` sender with a 5-second timeout and a correlation ID, awaiting `PREFLIGHT_RESULT`.
- [ ] Device: handle `PREFLIGHT_REQUEST` → run printer selection (Phase 5) → reply with the chosen printer or the most specific failure reason.
- [ ] Map every preflight failure to its §27 code and student message.
- [ ] Queue-depth check against `shops.max_queue_depth`.
- [ ] Page-cap and amount-cap checks (FR-16), before preflight so the round trip is not wasted.
- [ ] Timeout handling: no reply in 5 s is treated as `PRINTER_OFFLINE`, and the shop is probed for liveness.
- [ ] Store `preflight_result` and `assigned_printer_id` on the order — the dispatch in Phase 14 reuses the same printer.

### Acceptance criteria

- Remove the paper. Order a print. The bot says the printer is out of paper and never issues a payment link.
- Disable the only colour printer. A colour order is refused with `NO_COLOR_PRINTER`; a BW order still succeeds.
- Kill the device mid-preflight. The order fails cleanly within 5 seconds with a sensible message.
- A 300-page order against a 100-page cap is refused before conversion finishes, not after.
---

## Phase 11 — Ledger and wallet

**Goal.** Money movements are recorded correctly, before any real money exists.

**Build this before payments.** It is far easier to get the ledger right against fake transactions than to retrofit it once real money is flowing and the numbers are already wrong.

### Tasks

- [ ] `ledger/write.ts` — a single function that takes a transaction kind and a list of entries, opens a database transaction, inserts `ledger_transactions` + `ledger_entries`, and relies on the deferred trigger to reject an imbalance. **This is the only place in the codebase that writes to the ledger.**
- [ ] `recordOrderPayment(order)` — builds the three-entry transaction from §18.
- [ ] `recordRefund(order, amount)` — builds the reversing transaction.
- [ ] `getShopBalance(shopId)` — reads the view. Never a stored column.
- [ ] `getShopDailySummary(shopId, date)` — order count, gross, commission, net, for the operator UI.
- [ ] Invariant test suite implementing I1–I6 from §18.
- [ ] A `reconcile_ledger` job that asserts I4 (whole-ledger sum is zero) nightly and alerts on failure.
- [ ] Property test: generate 1,000 random sequences of payments and refunds, assert the ledger balances and no wallet goes negative.

### Acceptance criteria

- The invariant suite passes against the seeded database and against 1,000 generated sequences.
- Attempting to write an unbalanced transaction throws, and no partial rows are left behind.
- `getShopBalance` for a shop with 50 orders and 3 refunds returns a hand-computable number that you have actually computed by hand once.

---

## Phase 12 — Payments

**Goal.** A student pays a real (test-mode) payment and the order reaches `PAID` with a ledger entry.

### Tasks

- [ ] Razorpay test account, API keys, webhook secret.
- [ ] `payments/razorpay.ts` — client wrapper with request signing and typed responses.
- [ ] Create a payment link on `preflight_ok`: amount, description (`Print at <shop> · <n> sheets`), 15-minute expiry, `notes: { order_id, shop_id }`, callback disabled.
- [ ] Send the link as a WhatsApp CTA URL button.
- [ ] `POST /webhooks/razorpay` — verify `X-Razorpay-Signature` as HMAC-SHA256 of the **raw request body** with the webhook secret. Fastify must be configured to preserve the raw body; this is the single most common implementation mistake here.
- [ ] Insert into `webhook_events` keyed on the Razorpay event ID before processing. The unique constraint provides idempotency.
- [ ] Handle `payment.captured`: inside one database transaction — update `payments`, write the ledger transaction, transition the order to `PAID`. If any step fails, all roll back and the webhook is retried by Razorpay.
- [ ] Handle `payment.failed`: notify the student, offer a fresh link.
- [ ] Link expiry sweeper: `AWAITING_PAYMENT` older than 15 minutes → `EXPIRED`, notify.
- [ ] Explicitly do **not** trust any client-side success callback. `PAID` comes from the webhook and nowhere else (FR-21).

### Acceptance criteria

- A test-mode UPI payment moves the order to `PAID` within 3 seconds of capture.
- Replaying the same webhook 5 times produces exactly one ledger transaction.
- A webhook with a tampered body is rejected with 400 and logged.
- Killing the backend between capture and processing, then letting Razorpay retry, still results in exactly one `PAID` transition.
- An unpaid link expires and the student is told nothing was charged.

---

## Phase 13 — Route linked accounts

**Goal.** The shop's share is split at payment time and held; the shop can request release.

### Tasks

- [ ] Enable Route on the Razorpay account.
- [ ] `POST /admin/shops/:id/linked-account` — create the linked account from the shop's legal name, PAN, bank account and IFSC.
- [ ] Handle the Route account-activation webhook; flip `shops.status` to `active` only when Razorpay reports the account activated. Hard gate — a shop with an unactivated linked account cannot take orders (§19).
- [ ] After `payment.captured`, create the transfer with `on_hold: true` and `amount = shop_share_paise`. Store in `rz_transfers`.
- [ ] `WITHDRAW_REQUEST` handler: create a `withdrawals` row, release held transfers oldest-first until the requested amount is covered, via `PATCH /v1/transfers/:id { on_hold: false }`.
- [ ] Transfer reversal on refund, while the transfer is still on hold.
- [ ] Daily reconciliation job per §19: compare Razorpay's transfers and settlements against `rz_transfers` and the ledger, write exceptions, alert. Never auto-correct.
- [ ] Handle the partial case: a withdrawal larger than the held balance is rejected with a clear message, not partially fulfilled.

### Acceptance criteria

- A test payment produces a held transfer visible in the Razorpay dashboard with the correct split.
- Kagaz's commission remains in the Kagaz balance and is not transferred.
- Releasing a hold moves the transfer to settlement in Razorpay.
- A refund reverses the held transfer and leaves the ledger balanced.
- The reconciliation job reports zero exceptions on a clean day and a specific exception when you deliberately introduce a mismatch.

---

## Phase 14 — Job dispatch end to end

**Goal.** The full happy path. Student pays, paper comes out, student gets a token.

### Tasks

- [ ] On `PAID` → assign a per-shop, per-day `token_number` (reset at midnight IST, via a `SELECT ... FOR UPDATE` counter row or a sequence per shop-day).
- [ ] Transition to `QUEUED`, then dispatch: presign the PDF for 10 minutes, send `JOB_DISPATCH` with settings and cover-sheet data, transition to `DISPATCHED`.
- [ ] Device: `JOB_ACK` within 10 s → download → verify SHA-256 → merge cover sheet → print → verify → `JOB_RESULT`.
- [ ] Backend: `JOB_RESULT` ok → `PRINTED` → `COMPLETED`, notify the student with the token, schedule file deletion.
- [ ] `pendingJobs` replay in `HELLO_ACK` for orders in `QUEUED`/`DISPATCHED` when a device reconnects.
- [ ] Device-side deduplication by `orderId` against the local SQLite queue. Printing twice is worse than printing late.
- [ ] Dispatch timeout sweeper: `DISPATCHED` with no ack for 60 s → `PRINT_FAILED`.
- [ ] `ORDER_UPDATE` pushes to drive the operator's live list.

### Acceptance criteria

- **The full demo works:** scan the QR, send a PDF, choose options, pay in test mode, paper comes out with a cover sheet on top, phone receives "Token #1". Under 2 minutes.
- Disconnecting the device between `PAID` and dispatch, then reconnecting, prints the job from the replay.
- Sending the same `JOB_DISPATCH` twice prints once.
- The token number on the cover sheet matches the token in the WhatsApp message.

---

## Phase 15 — Failures and refunds

**Goal.** Every code in §27 is implemented, triggerable, and ends in the right state with the right message.

**This phase is what makes the product trustworthy.** Budget properly for it; it is not polish.

### Tasks

- [ ] Implement every post-payment failure code from §27 with its refund path.
- [ ] `refundOrder(order, reasonCode)` — create the Razorpay refund, reverse the Route transfer, write the reversing ledger transaction, transition to `REFUND_PENDING`, notify the student including the 3–5 working day expectation (R-P4).
- [ ] Handle `refund.processed` → `REFUNDED`. Handle `refund.failed` → admin alert.
- [ ] Mid-job printer failure: device detects an error flag during printing, aborts, reports `PRINTER_ERROR_MIDJOB` with the sheets actually printed.
- [ ] `SHOP_WENT_OFFLINE`: sweeper finds orders `PAID`/`QUEUED`/`DISPATCHED` for a shop that has been offline for 5 minutes → refund + alert both operator and admin.
- [ ] `STUCK_ORDER` sweeper: any non-terminal order older than 2 hours → refund + alert (R3).
- [ ] `STUDENT_REPORTED_MISSING`: a "Didn't get your print?" button attached to the completion message, valid for 2 hours, with the 2-per-30-days cap from R-P6.
- [ ] Operator notification for every failure that is their problem, as a prominent in-app alert, not a toast that disappears.
- [ ] A chaos test script that triggers each failure code against a staging environment.

### Acceptance criteria

- Pull the paper tray mid-job. The student is refunded automatically and told why, within 60 seconds, with no human action.
- Kill the device after payment. The order refunds within 5 minutes.
- Every code in §27 has a test that drives the order into that state and asserts the final state, the ledger balance, and the student message.
- After running the full chaos suite, the whole-ledger sum is still exactly zero.

---

## Phase 16 — Operator UI

**Goal.** The shop owner opens the app and sees what he needs, with no training.

**Design constraint.** Suresh is not technical and is standing at a counter, often glancing from two metres away. Big type, high contrast, no more than five things on any screen. Black and white with one accent colour for status. No dashboards-for-the-sake-of-dashboards.

### Tasks

- [ ] **Home / Today.** One screen. Big green "Open for orders" banner. Today's orders, today's revenue, pending count. A live list of orders with token, page count, options, status, timestamp. Auto-scrolling, newest first.
- [ ] **Order detail.** What was printed (metadata only, never the file), which printer, the full `order_events` timeline. A "reprint" button for `COMPLETED` orders that failed physically — reprints at Kagaz's cost, no second charge to the student.
- [ ] **Revenue.** Today / this week / this month: gross, Kagaz commission, net. A simple table, not a chart. The daily reconciliation view the owner will actually check every night.
- [ ] **Wallet.** Balance, held transfers, withdraw button, withdrawal history.
- [ ] **Rate card editor.** A table of per-sheet prices, A4/A3 × BW/colour × single/double, plus minimum order and volume tiers. Saving sends `RATE_CARD_UPDATE`; the backend versions it. Show a warning that in-flight quotes keep their old price.
- [ ] **Printers.** Status lights, toner bars, enable/disable, priority, maintenance note.
- [ ] **Settings.** Page cap, amount cap, approval threshold, secure release toggle, queue depth, launch-on-login, "Go Offline & Quit".
- [ ] **Alert surface.** Printer problems and failed orders appear as a persistent banner that must be dismissed, not a toast.
- [ ] Sound on new order, on by default, toggleable. Shops are noisy.

### Acceptance criteria

- A shop owner who has never seen the app can, without help: tell whether the shop is open, see today's earnings, and change the price of a BW page.
- The order list updates live as orders arrive, with no refresh.
- Nowhere in the UI can a student's file be opened, previewed, saved, or located on disk.
- The app is legible from two metres away.

---

## Phase 17 — Approval and secure release

**Goal.** The two optional per-shop modes work.

### Tasks

- [ ] **Approval mode** (FR-17): orders above `approval_threshold_pages` go to `AWAITING_APPROVAL` after payment. The device shows a prominent approve/reject card with page count, options and cost. `APPROVAL_DECISION` over the socket. Rejection triggers a full refund. A 30-minute timeout auto-rejects and refunds.
- [ ] **Secure release** (`shops.secure_release`): on `PAID`, the order goes to `HELD` and the student gets a "Print now — tap when you're at the shop" CTA pointing at `GET /r/:shortCode`. Tapping transitions to `QUEUED`. A 6-hour timeout refunds.
- [ ] Notify the student clearly in both modes so the wait is never unexplained.

### Acceptance criteria

- With approval mode on, a 60-page order waits for the operator and prints immediately on approval.
- Rejecting refunds in full within 60 seconds.
- With secure release on, nothing prints until the link is tapped, and the paper is therefore never sitting unattended in the output tray.
- Both modes off produces the Phase 14 behaviour exactly.

---

## Phase 18 — Admin panel

**Goal.** You can run the business without opening a database client.

### Tasks

- [ ] Next.js app, magic-link auth, deployed on Vercel.
- [ ] Shops list with live online status, today's volume, wallet balance, linked-account state.
- [ ] Shop create/edit, rate card editor, pairing code generation, linked-account creation.
- [ ] Orders table with filters (shop, status, date, phone) and a detail view showing the full `order_events` timeline — this is your primary debugging tool.
- [ ] Manual refund with a mandatory reason, always ledgered.
- [ ] Force-complete escape hatch, heavily logged.
- [ ] Ledger view per shop; reconciliation exceptions view.
- [ ] Withdrawal queue with a release action.
- [ ] Student lookup by phone, order history, block/unblock.
- [ ] Alerts inbox: offline shops with paid orders, stuck orders, reconciliation mismatches, refund failures.

### Acceptance criteria

- Every support scenario in the runbook can be resolved from the admin panel alone.
- Every mutating action writes an audit row naming the admin.
- The orders timeline makes it obvious, at a glance, why any given order failed.

---

## Phase 19 — Packaging and updates

**Goal.** A shop owner installs the app by double-clicking one file, and never thinks about updates again.

### Tasks

- [ ] `electron-builder` NSIS config: per-machine install, desktop shortcut, start-menu entry, custom icon.
- [ ] **Code signing.** An unsigned installer triggers a full-screen SmartScreen warning that a non-technical shop owner will not click through. Buy an OV code-signing certificate (roughly ₹15,000–25,000/year); an EV certificate builds SmartScreen reputation faster but costs more and needs a hardware token. Budget for this — it is not optional.
- [ ] `electron-updater` against GitHub Releases. Check on launch and every 6 hours. Download in the background, apply on next launch, never interrupt a print.
- [ ] `FORCE_UPDATE` handling: below `minVersion`, refuse to take orders and show an update prompt. You will need this the first time you ship a money-affecting bug fix.
- [ ] `.github/workflows/release-desktop.yml`: on a version tag, build, sign, publish the release with `latest.yml`.
- [ ] Staged rollout: a `beta` channel so the pilot shop gets updates before everyone else.
- [ ] Installer smoke test on a clean Windows 10 VM and a clean Windows 11 VM.
- [ ] `docs/onboarding-a-shop.md`: a one-page printable guide — install, enter the pairing code, set prices, print the QR poster.

### Acceptance criteria

- A clean Windows 10 machine goes from downloading the installer to a paired, online shop in under 15 minutes, following only the printed guide.
- No SmartScreen warning appears.
- Publishing a new tag causes an already-installed app to update itself within 6 hours without user action.
- An update that arrives during a print job applies only after the job finishes.

---

## Phase 20 — Observability and runbook

**Goal.** You find out about problems before the shop owner calls you.

### Tasks

- [ ] `pino` structured logging with a request ID and an order ID on every line. No PII (§26).
- [ ] Sentry on backend, desktop and admin, with PII scrubbing configured and verified.
- [ ] Metrics: orders by status per hour, conversion duration p50/p95, preflight duration, dispatch-to-printed duration, refund rate, per-shop online percentage.
- [ ] Alerts (to your phone, not to email): shop offline more than 30 min during declared business hours; any paid order unfulfilled for more than 5 min; refund rate above 5% in an hour; reconciliation exception; whole-ledger sum non-zero; backend health check failing.
- [ ] Uptime monitoring on `/health` from outside your host.
- [ ] Nightly encrypted Postgres backup, 30-day retention. **Perform and document a full restore into a scratch database.** An untested backup is not a backup.
- [ ] `docs/runbook.md` covering: shop reports nothing is printing; student says they paid and got nothing; ledger does not balance; Razorpay webhooks stopped arriving; WhatsApp token expired; how to refund manually; how to revoke a device; how to roll back a desktop release.

### Acceptance criteria

- Deliberately breaking a webhook produces an alert on your phone within 5 minutes.
- A restore from last night's backup into a scratch database succeeds and the ledger balances.
- Someone other than you can follow the runbook to resolve "student paid, nothing printed".

---

## Phase 21 — Pilot

**Goal.** Six weeks at one real shop. Answer one question: does the owner keep the app open?

### Before switching on

- [ ] Choose the shop. PESCE is the obvious campus — you have distribution and can walk there in minutes when something breaks. Pick the busiest shop at the gate, not the friendliest; the busiest one has the queue problem you are solving.
- [ ] **Run it manually for one week first.** No code. A WhatsApp group, a spreadsheet, and you converting files by hand at the counter. You will learn the real rate card, the actual paper sizes, the add-ons people ask for, and the failure modes you have not imagined. This week will change the product more than any other week in the project.
- [ ] Razorpay account moved to live mode; the shop's linked account KYC completed and activated.
- [ ] WhatsApp templates approved.
- [ ] QR posters printed and placed: at the counter, on the shop's shutter, and on the department noticeboards.
- [ ] Agree the commission with the owner in writing. Make it plain that walk-in cash customers are untouched.
- [ ] Give the owner your personal number and tell him to call you, not to debug anything.

### During

- [ ] Be physically present for the first three days. Watch students use it without helping them. Write down every moment of hesitation.
- [ ] Daily: check the alerts inbox, the reconciliation exceptions, and the completion rate.
- [ ] Weekly: sit with the owner for 15 minutes. The question is always "what annoyed you this week", never "do you like it".
- [ ] Keep a decisions log. Every change you make in response to the pilot goes in `docs/adr/`.

### Exit criteria — go/no-go for shop #2

Measured against §11. Proceed only if:

- The app was open more than 6 hours on at least 90% of days.
- 150 or more orders completed.
- Completion rate at or above 95%.
- Auto-refund rate at or below 3%.
- Fewer than 5 support messages per week in the final two weeks.
- The owner says yes when asked whether he would pay for this if it were not free.

If the owner turns the app off during business hours, stop and find out why before writing another line of code. That single behaviour invalidates the premise faster than any metric.

---
---

# PART D — APPENDICES

## Appendix A — Environment variables

```ini
# ---- Core ----
NODE_ENV=production
PORT=8080
APP_VERSION=                       # injected at build from the git tag
GIT_COMMIT=                        # injected at build

# ---- Database ----
DATABASE_URL=postgresql://user:pass@host:5432/kagaz?schema=public
DIRECT_DATABASE_URL=               # non-pooled, for migrations

# ---- Cloudflare R2 ----
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=kagaz-files
R2_PUBLIC_BASE=                    # optional CDN base; bucket itself stays private

# ---- WhatsApp Cloud API ----
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_ACCESS_TOKEN=             # permanent system-user token
WHATSAPP_VERIFY_TOKEN=             # your own string, for the webhook handshake
WHATSAPP_APP_SECRET=               # for X-Hub-Signature-256 verification
WHATSAPP_API_VERSION=v21.0

# ---- Razorpay ----
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
RAZORPAY_ROUTE_ENABLED=true

# ---- Auth ----
DEVICE_JWT_SECRET=                 # 32+ random bytes
DEVICE_JWT_TTL_DAYS=90
ADMIN_SESSION_SECRET=
ADMIN_MAGIC_LINK_TTL_MIN=15
ADMIN_ALLOWED_EMAILS=              # comma separated

# ---- Email (magic links, alerts) ----
SMTP_URL=
ALERT_EMAIL=

# ---- Observability ----
SENTRY_DSN=
LOG_LEVEL=info

# ---- Tunables ----
QUOTE_TTL_MINUTES=15
PAYMENT_LINK_TTL_MINUTES=15
PREFLIGHT_TIMEOUT_MS=5000
DISPATCH_ACK_TIMEOUT_MS=60000
PRINT_VERIFY_TIMEOUT_MS=120000
HEARTBEAT_INTERVAL_MS=15000
OFFLINE_THRESHOLD_MS=30000
FILE_RETENTION_HOURS=24
MAX_UPLOAD_BYTES=52428800
CONVERSION_TIMEOUT_MS=60000
STUCK_ORDER_THRESHOLD_MINUTES=120
```

Desktop app (no secrets — everything else comes from `HELLO_ACK`):

```ini
KAGAZ_API_BASE=https://api.kagaz.app
KAGAZ_WS_URL=wss://api.kagaz.app/device/ws
KAGAZ_UPDATE_CHANNEL=latest        # or 'beta' for the pilot shop
```

## Appendix B — Test plan

### Unit (fast, run on every commit)

| Area | What |
|---|---|
| `pricing.ts` | Every row of the §20 worked-examples table, plus min-order floor, every volume tier boundary, odd page counts with duplex, page range narrowing the count |
| `page-range.ts` | Valid forms, out of bounds, reversed, zero, duplicates, whitespace, garbage input |
| `money.ts` | No float ever escapes; formatting round-trips |
| `order-state.ts` | Every valid transition; every terminal state rejects every event; all states reachable |
| `errors.ts` | Every code has a student message and a defined target state |
| Ledger | I1–I6, plus 1,000 generated payment/refund sequences |

### Integration (against a real Postgres and a mocked Razorpay/WhatsApp)

- Webhook idempotency: the same event replayed 5× produces one state change.
- Signature verification rejects tampered bodies.
- Conversion pipeline against the full fixture corpus.
- Preflight timeout behaviour.
- Dispatch replay after device reconnect.
- The `job_queue` runner under concurrency (`SKIP LOCKED` correctness).

### End-to-end (staging, real device, real printer)

- Happy path, all option combinations.
- Every §27 failure code, driven by the chaos script.
- Network partition during each phase of the job lifecycle.
- App killed at each state.
- Printer off, paper out, toner out, door open, jam — each at preflight and each mid-job.
- Two students ordering simultaneously at the same shop.
- The same file ordered twice in quick succession.

### Manual, on real hardware (the checklist before any release)

- [ ] 3 copies, double-sided, page range — count the sheets by hand.
- [ ] Colour job produces colour; BW job on the colour printer produces greyscale.
- [ ] Cover sheet is on top and readable from two metres.
- [ ] Temp files gone from `%TEMP%` after both success and failure.
- [ ] Installer runs clean on fresh Windows 10 and Windows 11 VMs with no SmartScreen warning.
- [ ] Reboot mid-queue: nothing is printed twice and nothing is lost.

## Appendix C — Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **The shop owner does not keep the app open.** The entire premise fails. | Medium | Fatal | Phase 21 measures exactly this. Launch-on-login. Make the revenue screen the reason he opens it daily. If it still fails, the product is wrong, not the code |
| 2 | Cheap printers report no useful status, so preflight is blind | High | High | Capability probe (Phase 5), `low_confidence` flag, "didn't get your print" refund path, printer compatibility list |
| 3 | SumatraPDF cannot drive duplex on a particular driver | Medium | High | Phase 7 spike catches it early; documented fallback chain ending in a .NET helper |
| 4 | LibreOffice mangles a student's DOCX and the page count is wrong | High | Medium | Broad font set in the image; show the thumbnail *and* page count before payment; auto-refund on dispute |
| 5 | RBI/PA compliance challenged | Low | Fatal | Route from day one; Kagaz never touches funds (§10, §19); CA review before live mode |
| 6 | GST / TCS obligations as an e-commerce operator | Medium | High | Get a written CA opinion before scaling past the pilot shop |
| 7 | Payment disputes and chargebacks | Low | Medium | `on_hold` transfers cover the window; refund-first policy keeps disputes rare |
| 8 | Students print illegal or offensive material | Medium | Medium | Page and amount caps, order metadata retention, block list, abuse path, approval mode for large jobs |
| 9 | A student's document is seen or taken by the wrong person | Medium | High | Secure release (Phase 17), cover sheet with token, operator never sees file contents |
| 10 | WhatsApp account restricted by Meta | Low | High | Follow the business policy strictly, no marketing templates, keep a fallback web order form designed but unbuilt |
| 11 | Shop's internet is unreliable | High | Medium | Local SQLite queue, full download before printing, replay on reconnect |
| 12 | A competitor (Achigo, Printster, others) reaches the campus first | Medium | Medium | Density beats features — own every shop at one gate before widening |
| 13 | Commission too thin to be a business | High | High | Track unit economics from order one; a SaaS tier is the planned answer once value is proven |
| 14 | Double printing from a duplicated dispatch | Medium | High | Device-side deduplication by `orderId`; single-instance lock; tested explicitly |
| 15 | Ledger drift from a duplicated webhook | Medium | High | `webhook_events` unique constraint, deferred balance trigger, nightly reconciliation |

## Appendix D — Open decisions

Record the answer here as each one is settled, with the date.

| # | Question | Notes | Status |
|---|---|---|---|
| D1 | One Kagaz WhatsApp number for all shops, or one per shop? | One number with a shop code is cheaper and simpler; one per shop feels more like "the shop's own number" to students. Start with one. | Decided: one number, revisit at 10 shops |
| D2 | Commission rate | 5% with a ₹1 minimum is the starting assumption. Validate against real order values in the pilot. | Open — decide by end of pilot week 2 |
| D3 | Is Kagaz an e-commerce operator liable for TCS under §52 CGST? | Needs a written CA opinion. Materially affects the model. | **Open — blocking for live mode** |
| D4 | Who pays for a reprint when the physical print is bad but the system reported success? | Currently Kagaz absorbs it via the reprint button. Cheap now, may not scale. | Open |
| D5 | Secure release on or off by default? | Off is simpler and faster for the student; on is better for privacy. Pilot with it off, measure how often documents go missing. | Open |
| D6 | Do students want a print history / reprint-previous feature? | FR/S9 is specified but unbuilt. Cheap to add if the pilot asks for it. | Deferred to v2 |
| D7 | A3 support in v1? | Schema and rate card support it; no shop may actually have an A3 printer. | Open — check during the manual pilot week |
| D8 | Rate-card migration when a shop changes prices mid-day | Versioned cards handle it; confirm the operator understands in-flight quotes keep the old price. | Decided: versioned, warn in UI |

---

## Where to start tomorrow

1. Read Part B once end to end. It is the contract the rest of the work is written against.
2. Do **Phase 0**, then **Phase 2**. Both are pure code with no external dependencies, and finishing them gives you a tested pricing engine and state machine before anything can go wrong at the edges.
3. In parallel, start the two things with external lead times, because they will block you later if you do not: the **Meta WhatsApp business verification**, and the **Razorpay account plus Route enablement**.
4. Buy or borrow the cheapest laser printer you can find. Phase 5 and Phase 7 are worthless against a virtual printer, and they are the phases most likely to change the plan.
5. Before Phase 21, spend the manual week at the shop. It is the highest-value week in this document.
