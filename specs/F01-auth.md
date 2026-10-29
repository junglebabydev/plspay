# F01: Organiser sign-in

Organisers sign in with an email address and a password. There is no public sign-up: a superuser creates each organiser account in the PocketBase admin (`https://plspay-api.usestack.ai/_/`, behind Cloudflare Access) and gives the organiser their password. PlsPay sends no SMS and no email.

## Acceptance criteria

- **AC-F01-04** Given an organiser account, when the organiser signs in with the right email and password, then they land on their collections. Given a wrong password or an email with no account, then they see "Wrong email or password" and stay on sign-in. The message is the same in both cases.
- **AC-F01-05** Given no session, when anyone opens any `/app/*` route, then they are redirected to sign-in and no collection data is returned.
- **AC-F01-06** Given anyone without superuser rights, then they cannot create an organiser account: the app has no sign-up page or link, and the backend refuses sign-up requests. An organiser cannot delete their own account.
- **AC-F01-07** Given an 11th sign-in attempt from one IP within 10 minutes, then it is refused with "Too many attempts. Try again in a few minutes" and the backend is not asked. (SEC-12)

## Changes

- 2026-10-29: AC-F01-04 changed from "a correct code signs in, a wrong code shows That code didn't work" to the email and password wording above. AC-F01-06 and AC-F01-07 are new.

## Retired

Phone OTP sign-in was removed on 2026-10-29. Vaibhav's decision: email and password, accounts created by a superuser, no SMS (Twilio removed).

- AC-F01-01 (an OTP is sent to a +65 number and the screen asks for it): there is no OTP.
- AC-F01-02 (a non-Singapore number gets "Use a Singapore mobile number"): there is no phone sign-in. Singapore number validation remains for WhatsApp numbers (AC-F05-05).
- AC-F01-03 (a fourth code request for one number within 10 minutes is refused, SEC-04): replaced by the per-IP sign-in limit, AC-F01-07 (SEC-12).
