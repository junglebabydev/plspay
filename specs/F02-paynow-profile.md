# F02: PayNow profile

## Acceptance criteria

- **AC-F02-01** Given a first sign-in, then the organiser must save a display name and a PayNow mobile or UEN before creating a collection.
- **AC-F02-02** Given a PayNow mobile, then it must be 8 digits starting 8 or 9. Given a UEN, then it must be 9 or 10 characters, letters and digits.
- **AC-F02-03** Given an existing profile, when the organiser changes PayNow details, then they must re-enter an OTP verified within 5 minutes. (SEC-05)
- **AC-F02-04** Given PayNow details change, then existing collections keep the old details and their QRs are unchanged.
- **AC-F02-05** Given organiser A is signed in, then A cannot read or update organiser B's profile.
