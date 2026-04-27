import { useState } from "react";
import { signInExpert, signUpExpert } from "../lib/authService.js";

function getAuthErrorMessage(error) {
  if (!error) return "";

  const message = error.message || "";
  const normalizedMessage = message.toLowerCase();
  const status = error.status || error.code;

  if (
    error instanceof TypeError ||
    normalizedMessage.includes("failed to fetch") ||
    normalizedMessage.includes("network") ||
    normalizedMessage.includes("fetch")
  ) {
    return "Problème de connexion";
  }

  if (
    status === 401 ||
    status === 403 ||
    normalizedMessage.includes("permission") ||
    normalizedMessage.includes("not authorized") ||
    normalizedMessage.includes("unauthorized") ||
    normalizedMessage.includes("row-level security") ||
    normalizedMessage.includes("rls")
  ) {
    return "Accès non autorisé";
  }

  if (
    status === 429 ||
    normalizedMessage.includes("rate limit") ||
    normalizedMessage.includes("too many")
  ) {
    return "Trop de tentatives. Merci d’attendre quelques minutes avant de réessayer.";
  }

  if (normalizedMessage.includes("invalid login credentials")) {
    return "Email ou mot de passe incorrect.";
  }

  if (
    normalizedMessage.includes("user already registered") ||
    normalizedMessage.includes("already registered") ||
    normalizedMessage.includes("already exists")
  ) {
    return "Un compte existe déjà avec cet email. Essayez de vous connecter.";
  }

  if (
    normalizedMessage.includes("email not confirmed") ||
    normalizedMessage.includes("not confirmed")
  ) {
    return "Merci de confirmer votre email avant de vous connecter. Vérifiez votre boîte mail et vos spams.";
  }

  if (normalizedMessage.includes("password")) {
    return "Le mot de passe doit respecter les règles de sécurité Supabase.";
  }

  if (normalizedMessage.includes("supabase is not configured")) {
    return "Supabase n’est pas encore configuré pour cet environnement.";
  }

  return "Une erreur est survenue";
}

export default function AuthModal({ onClose, onSuccess }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    if (isSubmitting) return;

    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const result =
        mode === "signin"
          ? await signInExpert(email.trim(), password)
          : await signUpExpert(email.trim(), password);

      if (result.error) {
        setError(getAuthErrorMessage(result.error));
        return;
      }

      if (mode === "signin") {
        setMessage("Connexion réussie.");
        onSuccess?.(result.data);
      } else {
        setMessage(
          "Compte créé. Un email de confirmation vous a été envoyé. Vérifiez votre boîte mail et vos spams.",
        );
        setMode("signin");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setError("");
    setMessage("");
  }

  return (
    <div className="authOverlay" role="presentation" onClick={onClose}>
      <div
        className="authModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="expert-auth-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="authClose"
          onClick={onClose}
          aria-label="Fermer"
        >
          ×
        </button>

        <p className="appEyebrow">Accès expert</p>
        <h2 id="expert-auth-title">
          {mode === "signin" ? "Connexion" : "Inscription"}
        </h2>

        <div className="authModeSwitch" role="tablist" aria-label="Mode d’authentification">
          <button
            type="button"
            className={`authModeButton${mode === "signin" ? " isActive" : ""}`}
            onClick={() => switchMode("signin")}
          >
            Connexion
          </button>
          <button
            type="button"
            className={`authModeButton${mode === "signup" ? " isActive" : ""}`}
            onClick={() => switchMode("signup")}
          >
            Inscription
          </button>
        </div>

        <form className="authForm" onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="field">
            <span>Mot de passe</span>
            <input
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          <button
            type="submit"
            className="btn btnPrimary"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? "Veuillez patienter..."
              : mode === "signin"
                ? "Se connecter"
                : "Créer un compte"}
          </button>
        </form>

        {message && <div className="authNotice">{message}</div>}
        {error && <div className="authError">{error}</div>}
      </div>
    </div>
  );
}
