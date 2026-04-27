import { supabase } from "./supabase.js";

function getMissingSupabaseResult() {
  return {
    data: null,
    error: new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    ),
  };
}

function getCaughtSupabaseResult(error) {
  logAuthError("Supabase request failed →", error);

  return {
    data: null,
    error,
  };
}

function logAuthError(...details) {
  if (import.meta.env.DEV) {
    console.error(...details);
  }
}

export async function signUpExpert(email, password) {
  if (!supabase) {
    return getMissingSupabaseResult();
  }

  try {
    const result = await supabase.auth.signUp({
      email,
      password,
    });

    if (result.error) {
      logAuthError("Auth error detail →", result.error);
    }

    return result;
  } catch (error) {
    return getCaughtSupabaseResult(error);
  }
}

export async function signInExpert(email, password) {
  if (!supabase) {
    return getMissingSupabaseResult();
  }

  try {
    const result = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (result.error) {
      logAuthError("Auth error detail →", result.error);
    }

    return result;
  } catch (error) {
    return getCaughtSupabaseResult(error);
  }
}

export async function signOutExpert() {
  if (!supabase) {
    return getMissingSupabaseResult();
  }

  try {
    return await supabase.auth.signOut();
  } catch (error) {
    return getCaughtSupabaseResult(error);
  }
}

export async function getCurrentSession() {
  if (!supabase) {
    return getMissingSupabaseResult();
  }

  try {
    return await supabase.auth.getSession();
  } catch (error) {
    return getCaughtSupabaseResult(error);
  }
}

export async function ensureExpertCabinet(user) {
  if (!supabase || !user) {
    return null;
  }

  try {
    const { data: existingMembership, error: membershipError } = await supabase
      .from("cabinet_members")
      .select("cabinet_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      logAuthError("Cabinet membership lookup failed →", membershipError);
      return null;
    }

    if (existingMembership?.cabinet_id) {
      const { data: cabinet, error: cabinetError } = await supabase
        .from("cabinets")
        .select("*")
        .eq("id", existingMembership.cabinet_id)
        .single();

      if (cabinetError) {
        logAuthError("Cabinet lookup failed →", cabinetError);
        return null;
      }

      return cabinet;
    }

    const { data: cabinet, error: rpcError } = await supabase.rpc(
      "create_cabinet_for_current_user",
    );

    if (rpcError) {
      logAuthError("Cabinet bootstrap RPC failed →", rpcError);
      return null;
    }

    return cabinet;
  } catch (error) {
    logAuthError("Cabinet bootstrap failed →", error);
    return null;
  }
}
