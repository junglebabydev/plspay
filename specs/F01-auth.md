# F01: Organiser sign-in

Organisers sign in with a Singapore mobile number and a one-time code. No passwords.

## Acceptance criteria

- **AC-F01-01** Given a +65 mobile number, when the organiser requests a code, then an OTP is sent and the screen asks for it.
- **AC-F01-02** Given a non-Singapore number, when they request a code, then no OTP is sent and they see "Use a Singapore mobile number".
- **AC-F01-03** Given a fourth code request for the same number within 10 minutes, then it is refused with "Too many codes. Try again in a few minutes". (SEC-04)
- **AC-F01-04** Given a correct code, then the organiser lands on their collections. Given a wrong code, then they see "That code didn't work" and stay on the screen.
- **AC-F01-05** Given no session, when anyone opens any `/app/*` route, then they are redirected to sign-in and no collection data is returned.
