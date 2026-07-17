"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Email + password sign-in. There is deliberately no sign-up action: portal
 * accounts are created by hand in the Supabase dashboard, since every account
 * must be tied to a client and handed to a specific person.
 */
export async function login(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/portal");

  if (!email || !password) {
    return { error: "Fyll inn e-post og passord." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Deliberately vague: distinguishing "wrong password" from "no such user"
    // would let anyone probe which emails have accounts.
    return { error: "Feil e-post eller passord." };
  }

  revalidatePath("/", "layout");
  redirect(next.startsWith("/portal") ? next : "/portal");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
