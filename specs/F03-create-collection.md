# F03: Create a collection

## Acceptance criteria

- **AC-F03-01** Given "Split a total" with total T and N payers (plus the organiser if "I'm in the split" is on), then each share is floor(T / people) in cents.
- **AC-F03-02** Given "Set each amount", then every payer must have an amount above S$0.00.
- **AC-F03-03** Given two or more payers with the same amount, then each later duplicate gets +1 cent until unique within the collection.
- **AC-F03-04** Given cents were added, then the preview shows the total extra before creating.
- **AC-F03-05** Given a title and payer name, then the reference is `TITL-NAME` (first 4 and 10 alphanumerics, uppercase), suffixed with 2, 3... if taken, max 25 chars.
- **AC-F03-06** Given creation succeeds, then the collection copies payee name and PayNow details from the profile and each payer gets a unique token.
- **AC-F03-07** Given a collection is created, then it expires in 30 days by default. The organiser can pick 7, 30 or 90.
- **AC-F03-08** Given 0 payers or more than 50, then creation is blocked with a clear message.
