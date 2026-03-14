import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const profileSyncRef = useRef(false);

  async function ensureProfile(user) {
    if (!user) return;
    if (profileSyncRef.current) return;

    profileSyncRef.current = true;

    const { error } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name ?? "",
      },
      { onConflict: "id" }
    );

    if (error) {
      console.error("Profile upsert error:", error.message);
    }

    profileSyncRef.current = false;
  }

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error("Get session error:", error.message);
      }

      const currentSession = data?.session ?? null;

      if (!mounted) return;

      setSession(currentSession);

      if (currentSession?.user) {
        await ensureProfile(currentSession.user);
      }

      if (mounted) {
        setLoading(false);
      }
    }

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession ?? null);

      if (event === "SIGNED_IN" && newSession?.user) {
        ensureProfile(newSession.user);
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleMagicLink(e) {
    e.preventDefault();
    setMessage("");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Lien de connexion envoyé par email.");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  if (loading) return <p>Chargement…</p>;

  if (!session) {
    return (
      <div className="card" style={{ maxWidth: 480, margin: "24px auto" }}>
        <h2>Créer un compte</h2>
        <p className="muted">
          Sauvegarde ton profil fiscal et ton historique.
        </p>

        <form onSubmit={handleMagicLink}>
          <input
            type="email"
            placeholder="Ton email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", marginBottom: 12 }}
            required
          />
          <button className="btn btnPrimary" type="submit">
            Recevoir un lien de connexion
          </button>
        </form>

        {message && <p style={{ marginTop: 12 }}>{message}</p>}
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 12,
        }}
      >
        <button
          className="btn btnGhost btnSmall"
          onClick={handleLogout}
          type="button"
        >
          Se déconnecter
        </button>
      </div>
      {children}
    </>
  );
}
