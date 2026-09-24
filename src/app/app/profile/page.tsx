import { createSessionClient } from "@/server/supabase";
import { getProfile } from "@/server/data";
import { ProfileForm } from "./ProfileForm";

export const metadata = { title: "PayNow profile" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const { first } = await searchParams;
  const supabase = await createSessionClient();
  const profile = await getProfile(supabase);
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">PayNow profile</h1>
      {(first || !profile) && <p className="notice">Set up your PayNow details first. Every collection you create copies them, so payers always pay the right account.</p>}
      <ProfileForm profile={profile} />
    </main>
  );
}
