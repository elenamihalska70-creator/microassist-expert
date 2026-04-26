import { supabase } from "./supabase.js";

function getMissingSupabaseResult() {
  return {
    data: null,
    error: new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    ),
  };
}

export async function signUpExpert(email, password) {
  if (!supabase) {
    return getMissingSupabaseResult();
  }

  return supabase.auth.signUp({
    email,
    password,
  });
}

export async function signInExpert(email, password) {
  if (!supabase) {
    return getMissingSupabaseResult();
  }

  return supabase.auth.signInWithPassword({
    email,
    password,
  });
}

export async function signOutExpert() {
  if (!supabase) {
    return getMissingSupabaseResult();
  }

  return supabase.auth.signOut();
}

export async function getCurrentSession() {
  if (!supabase) {
    return getMissingSupabaseResult();
  }

  return supabase.auth.getSession();
}
