# F04: Payer page

Route: `/p/[token]`. Server rendered. No login.

## Acceptance criteria

- **AC-F04-01** Given a valid token, then the page shows title, amount, payee name, reference and a PayNow QR.
- **AC-F04-02** Given the QR is decoded, then it is a valid SGQR PayNow payload with editable = 0, the exact amount, the reference, the expiry date and a correct CRC.
- **AC-F04-03** Given a valid token, then the page does not show other payers, collection totals, or the organiser's WhatsApp number. (SPEC section 3)
- **AC-F04-04** Given an invalid, expired or revoked token, then the page shows "This link no longer works. Ask the person collecting for a new one." with identical HTML for all three cases.
- **AC-F04-05** Given the page, then it offers Save QR beside the QR, and copy PayNow ID, copy amount and copy reference inside the transfer section (AC-F04-10).
- **AC-F04-06** Given the page, then it shows "Check your bank shows the name {payee} before you confirm".
- **AC-F04-07** Given the payer taps "I've paid", then status moves waiting to claimed. Tapping again changes nothing. The payer can never set paid.
- **AC-F04-08** Given more than 30 requests per minute from one IP to `/p/*` or `/api/claim`, then further requests get 429. (SEC-03)
- **AC-F04-09** Given the page HTML and Open Graph tags, then they contain no payer name or phone. (SEC-06)
- **AC-F04-10** Given the page, then it has a collapsed "Can't scan? Pay by PayNow transfer" section. Expanded, it shows numbered steps: 1. open your bank app's PayNow transfer, 2. choose mobile or UEN (whichever the organiser uses), 3. paste the PayNow ID, 4. check the name shown is {payee}, 5. paste the amount, 6. paste the reference into the comments or reference field. Each value has its own Copy button. It shows no payer name or phone. (SEC-06)
