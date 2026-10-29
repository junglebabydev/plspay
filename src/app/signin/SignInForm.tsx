"use client";
import { useActionState } from "react";
import { signIn, type SignInState } from "./actions";

export function SignInForm() {
  const [state, action, pending] = useActionState(signIn, {} as SignInState);

  return (
    // method="post": if someone submits before the JS has loaded, the password must not land in the URL.
    <form action={action} method="post" className="flex flex-col gap-3">
      {state.error && <p role="alert" className="error">{state.error}</p>}
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" inputMode="email" autoComplete="username" required className="input" defaultValue={state.email ?? ""} />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      <button type="submit" disabled={pending} className="btn-primary">{pending ? "Signing in…" : "Sign in"}</button>
      <p className="text-xs text-stone-500">Organiser accounts are set up by the PlsPay team. There is no sign-up.</p>
    </form>
  );
}
