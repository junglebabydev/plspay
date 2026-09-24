"use client";
import { useActionState, useState } from "react";
import { saveProfile, type ProfileState } from "./actions";
import type { Profile } from "@/server/data";

export function ProfileForm({ profile }: { profile: Profile | null }) {
  const [state, action, pending] = useActionState(saveProfile, {} as ProfileState);
  const [type, setType] = useState<"mobile" | "uen">(profile?.paynow_type ?? "mobile");

  return (
    <form action={action} className="card flex flex-col gap-4">
      {state.error && <p role="alert" className={state.needCode ? "notice" : "error"}>{state.error}</p>}
      {state.saved && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Profile saved. Existing collections keep their old PayNow details.</p>}

      <div>
        <label htmlFor="display_name" className="label">Display name</label>
        <input id="display_name" name="display_name" required maxLength={40} className="input" defaultValue={profile?.display_name ?? ""} placeholder="What payers see, e.g. your bank account name" />
        <p className="mt-1 text-xs text-stone-500">Payers are told to check this name in their bank app before paying.</p>
      </div>

      <fieldset>
        <legend className="label">PayNow type</legend>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name="paynow_type" value="mobile" checked={type === "mobile"} onChange={() => setType("mobile")} /> Mobile number</label>
          <label className="flex items-center gap-2"><input type="radio" name="paynow_type" value="uen" checked={type === "uen"} onChange={() => setType("uen")} /> UEN</label>
        </div>
      </fieldset>

      <div>
        <label htmlFor="paynow_id" className="label">{type === "mobile" ? "PayNow mobile number" : "PayNow UEN"}</label>
        <input id="paynow_id" name="paynow_id" required className="input" inputMode={type === "mobile" ? "numeric" : "text"} defaultValue={profile?.paynow_id ?? ""} placeholder={type === "mobile" ? "91234567" : "201912345K"} />
      </div>

      <div>
        <label htmlFor="whatsapp" className="label">Your WhatsApp (optional)</label>
        <input id="whatsapp" name="whatsapp" type="tel" className="input" defaultValue={profile?.whatsapp?.replace(/^\+65/, "") ?? ""} placeholder="9123 4567" />
        <p className="mt-1 text-xs text-stone-500">Never shown to payers.</p>
      </div>

      {state.needCode && (
        <div>
          <label htmlFor="code" className="label">Code</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="input tracking-widest" autoFocus />
        </div>
      )}

      <button type="submit" disabled={pending} className="btn-primary">{pending ? "Saving…" : state.needCode ? "Confirm and save" : "Save profile"}</button>
    </form>
  );
}
