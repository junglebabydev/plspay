# PRD: PlsPay v2

Status: draft. Product name: PlsPay. Owner: Vaibhav. Builder: Claude Code, reviewed by Uraj.

## 1. Problem

Collecting money from a group in Singapore means a PayNow number in a chat, screenshots as proof, and manually working out who has paid. Organisers chase, payers forget, nobody is sure.

Existing tools (PayLah split, SplitNow, Gaodim, PayMeLah) generate QRs but track payment by self-report or screenshot. Screenshots are faked. None give the organiser a trustworthy view of who paid.

## 2. Users

1. **Organiser.** Collects from 2 to 50 people. Friends splitting a bill, group activity organisers, small merchants collecting fees. Has a PayNow mobile number or UEN.
2. **Payer.** Receives a link on WhatsApp. Has any Singapore bank app. Will not install an app or sign up.

## 3. Goals

1. Every payer pays the right amount to the right account without asking a question.
2. The organiser can tell who has paid in under 5 seconds per person.
3. Nobody except the organiser can see a collection's status.
4. We never hold money.

## 4. Non-goals (v2)

1. Automatic payment verification. The organiser's bank alert is the source of truth.
2. Holding, pooling or routing funds.
3. Payer accounts.
4. Native apps. Mobile web only.
5. Recurring collections, reminders on a schedule, multiple organisers per collection.

## 5. Scope

| ID | Feature | Spec |
|---|---|---|
| F01 | Organiser sign-in with phone OTP | `specs/F01-auth.md` |
| F02 | PayNow profile | `specs/F02-paynow-profile.md` |
| F03 | Create a collection (split or custom amounts) | `specs/F03-create-collection.md` |
| F04 | Payer page with PayNow QR | `specs/F04-payer-page.md` |
| F05 | Status board | `specs/F05-status-board.md` |
| F06 | Expiry, revoke, delete, retention | `specs/F06-lifecycle.md` |

## 6. Key product decisions

1. **Unique amounts.** Payers in a collection never share an amount. Equal shares get 1 cent added per collision so bank alerts identify the payer.
2. **Reference in the QR.** Each payer has a reference locked into the QR, e.g. `FRID-PRIYA`.
3. **Amount locked.** QR is non-editable.
4. **Two-step status.** Payer can claim "I've paid". Only the organiser can confirm "Paid".
5. **PayNow details frozen per collection.** Changing your PayNow number never changes existing links.

## 7. Rollout

1. **Pilot.** Runs on a Mac mini with a local database, public through a Cloudflare Tunnel. Up to 20 organisers.
2. **Cloud.** Move to Supabase cloud and Vercel once the pilot hits its metrics or the Mac mini becomes a reliability risk. Same code and migrations.

## 8. Success metrics (first 30 days, 20 organisers)

| Metric | Target |
|---|---|
| Collections fully paid within 48h | 70% |
| Payers who ask the organiser a question | under 10% |
| Organisers who create a second collection | 50% |
| Security incidents (unauthorised status access) | 0 |

## 9. Risks

1. Banks may drop the reference from the receiver's alert. Mitigation: unique amounts are the primary identifier.
2. OTP cost abuse. Mitigation: rate limits, see SPEC section 6.
3. PDPA: we store third-party names and phone numbers. Mitigation: minimal fields, 90-day retention, privacy notice.
4. Phishing using our brand. Mitigation: server-held details, bank name check copy, links only on our domain.
5. Pilot runs on one machine. A power cut or disk failure takes it down. Mitigation: nightly encrypted backups off the machine, UPS, move to cloud before any wider launch.
6. Name: PlsPay pending domain, IPOS trademark (classes 9, 36) and app store checks.
