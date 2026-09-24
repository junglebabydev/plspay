"use client";
import { useActionState } from "react";
import { sendCode, verifyCode, type SignInState } from "./actions";

const initial: SignInState = { step: "phone" };

export function SignInForm() {
  const [state, send, sending] = useActionState(sendCode, initial);
  const [verifyState, verify, verifying] = useActionState(verifyCode, initial);
  // The verify action owns errors once we're on the code step; sending owns the step itself.
  const step = state.step;
  const error = verifyState.error ?? state.error;

  if (step === "code" && state.phone) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-stone-600">We sent a 6-digit code to <span className="font-medium text-stone-900">{state.phone}</span>.</p>
        {error && <p role="alert" className="error">{error}</p>}
        <form action={verify} className="flex flex-col gap-3">
          <input type="hidden" name="phone" value={state.phone} />
          <div>
            <label htmlFor="code" className="label">Code</label>
            <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required className="input tracking-widest" autoFocus />
          </div>
          <button type="submit" disabled={verifying} className="btn-primary">{verifying ? "Checking…" : "Sign in"}</button>
        </form>
        <form action={send} className="flex items-center justify-between text-sm">
          <input type="hidden" name="phone" value={state.phone} />
          <button type="submit" disabled={sending} className="text-brand underline">Resend code</button>
          <a href="/signin" className="text-stone-500 underline">Use a different number</a>
        </form>
      </div>
    );
  }

  return (
    <form action={send} className="flex flex-col gap-3">
      {error && <p role="alert" className="error">{error}</p>}
      <div>
        <label htmlFor="phone" className="label">Mobile number</label>
        <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="9123 4567" required className="input" defaultValue={state.phone?.replace(/^\+65/, "") ?? ""} />
        <p className="mt-1 text-xs text-stone-500">Singapore numbers only. We text you a one-time code.</p>
      </div>
      <button type="submit" disabled={sending} className="btn-primary">{sending ? "Sending…" : "Send code"}</button>
    </form>
  );
}
