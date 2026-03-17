import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";

export default function AuthGate({ onClose, onSuccess }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        onSuccess?.();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [onSuccess]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setNotice("");

    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setError("Merci d’indiquer votre email.");
      return;
    }

    setSending(true);

    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    setSending(false);

    if (error) {
      setError(error.message || "Impossible d’envoyer le lien.");
      return;
    }

    setNotice("Lien envoyé. Vérifie ta boîte mail.");
  }

  return (
    <div className="authOverlay" onClick={onClose}>
      <div
        className="authModal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
      >
        <button
          type="button"
          className="authClose"
          onClick={onClose}
          aria-label="Fermer"
        >
          ✕
        </button>

        <h2 id="auth-title">Créer un compte</h2>

        <p className="muted">
          Crée un compte gratuit pour sauvegarder ton profil fiscal et ton
          historique.
        </p>

        <form onSubmit={handleSubmit} className="authForm">
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ton@email.com"
              autoComplete="email"
              required
            />
          </label>

          <button
            type="submit"
            className="btn btnPrimary"
            disabled={sending}
          >
            {sending ? "Envoi..." : "Recevoir un lien de connexion"}
          </button>
        </form>

        {notice && <p className="authNotice">{notice}</p>}
        {error && <p className="authError">{error}</p>}
      </div>
    </div>
  );
}