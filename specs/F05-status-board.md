# F05: Status board

Route: `/app/c/[id]`. Organiser only.

## Acceptance criteria

- **AC-F05-01** Given the owner, then the board lists every payer with amount, reference and status (Waiting, Says paid, Paid), plus collected and total.
- **AC-F05-02** Given the owner taps Mark paid, then status becomes paid with a timestamp. Undo returns it to its previous state.
- **AC-F05-03** Given a signed-in organiser who is not the owner, then the board returns 404 and the database returns zero rows.
- **AC-F05-04** Given a payer claims, then the board shows "Says paid" within 10 seconds without a reload. The board polls its own server route every 5 seconds while open.
- **AC-F05-05** Given a payer with a WhatsApp number, then "WhatsApp" opens a prefilled message with their link. "Send all to group chat" prefills one message with every unpaid payer's link.
- **AC-F05-06** Given a business collection, then the collections list and the board show a "Business" label. Personal collections show no label.
