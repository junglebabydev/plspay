import { redirect } from "next/navigation";
import { createSessionClient } from "@/server/pb";
import { getProfile } from "@/server/data";
import { NewCollectionForm } from "./NewCollectionForm";

export const metadata = { title: "New collection" };

export default async function NewCollection() {
  const pb = await createSessionClient();
  if (!(await getProfile(pb))) redirect("/app/profile?first=1"); // AC-F02-01
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">New collection</h1>
      <NewCollectionForm />
    </main>
  );
}
