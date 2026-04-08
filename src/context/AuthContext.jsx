import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";

const AuthContext = createContext({
  session: null,
  user: null,
  loading: true,
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        const isExpectedNoSession =
          !data?.session &&
          (error.message === "Auth session missing" ||
            error.message === "An unexpected error occurred");

        if (!isExpectedNoSession) {
          console.error(
            "Get session error:",
            error.message || error.name || String(error),
          );
        }
      }

      if (!mounted) return;

      setSession(data?.session ?? null);
      setLoading(false);
    }

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = {
    session,
    user: session?.user ?? null,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
