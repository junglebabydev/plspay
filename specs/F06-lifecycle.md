# F06: Expiry, revoke, delete, retention

## Acceptance criteria

- **AC-F06-01** Given the organiser revokes a payer link, then that token returns the "no longer works" page immediately.
- **AC-F06-02** Given the organiser closes a collection, then all its payer links stop working.
- **AC-F06-03** Given the organiser deletes a collection, then it and all payers are removed immediately.
- **AC-F06-04** Given a collection closed or expired more than 90 days ago, then the nightly job deletes it and its payers.
- **AC-F06-05** Given a revoked payer, then the organiser can issue a new link, which gets a new token.
