import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";

const PASSWORD_MIN_LENGTH = 8;
const RECOVERY_SUCCESS_REDIRECT_DELAY_MS = 900;

function isRecoveryUrlNow() {
  const search = window.location.search || "";
  const hash = window.location.hash || "";
  return (
    search.includes("mode=recovery") ||
    hash.includes("type=recovery") ||
    hash.includes("access_token=") ||
    hash.includes("refresh_token=")
  );
}

function hasRecoveryParams() {
  if (typeof window === "undefined") {
    return false;
  }

  return isRecoveryUrlNow();
}

function getFriendlyAuthError(error, mode) {
  const message = error?.message?.toLowerCase() || "";

  if (message.includes("invalid login credentials")) {
    return "Email ou mot de passe incorrect.";
  }

  if (message.includes("user already registered")) {
    return "Un compte existe déjà avec cet email. Connecte-toi pour continuer.";
  }

  if (message.includes("password should be at least")) {
    return `Ton mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`;
  }

  if (message.includes("email not confirmed")) {
    return "Ton compte existe, mais l’email doit encore être confirmé.";
  }

  if (message.includes("rate limit")) {
    return "Trop de tentatives en peu de temps. Merci de réessayer dans quelques minutes.";
  }

  return mode === "signup"
    ? "Impossible de créer ton compte pour le moment."
    : "Impossible de te connecter pour le moment.";
}

function isExistingAccountSignUpError(error) {
  const message = error?.message?.toLowerCase() || "";
  return message.includes("user already registered");
}

function isEmailNotConfirmedError(error) {
  const message = error?.message?.toLowerCase() || "";
  return message.includes("email not confirmed");
}

function isExistingAccountSignUpResult(data) {
  const identities = data?.user?.identities;

  return Array.isArray(identities) && identities.length === 0;
}

export default function AuthGate({
  onClose,
  onSuccess,
  onRecoveryComplete,
  onLogout,
  onGoToDashboard,
  initialMode = "signup",
  isAuthenticated = false,
  isRecoveryFlow = false,
}) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const [signupCompleted, setSignupCompleted] = useState(false);
  const [showResendConfirmation, setShowResendConfirmation] = useState(false);
  const [resendingConfirmation, setResendingConfirmation] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [recoveryCompleted, setRecoveryCompleted] = useState(false);
  const successSentRef = useRef(false);
  const modeRef = useRef(mode);
  const recoverySuccessTimeoutRef = useRef(null);
  const recoveryFlowRef = useRef(
    initialMode === "recovery" || hasRecoveryParams(),
  );

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    recoveryFlowRef.current = mode === "recovery" || hasRecoveryParams();
  }, [mode]);

  const completeSuccess = useCallback(() => {
    if (successSentRef.current) return;
    successSentRef.current = true;
    onSuccess?.();
  }, [onSuccess]);

  useEffect(() => {
    if (!supabase) {
      return undefined;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const recoveryFromUrl = hasRecoveryParams();
      console.log("[recovery-debug] auth event", {
        event,
        mode: modeRef.current,
        recoveryFromUrl,
        recoveryRef: recoveryFlowRef.current,
      });

      if (
        event === "PASSWORD_RECOVERY" ||
        recoveryFromUrl ||
        recoveryFlowRef.current
      ) {
        if (event === "PASSWORD_RECOVERY") {
          console.info("[recovery] PASSWORD_RECOVERY received");
        }

        recoveryFlowRef.current = true;
        setMode("recovery");
        setEmail(session?.user?.email || "");
        setPassword("");
        setConfirmPassword("");
        setNotice(
          "Tu peux maintenant définir un nouveau mot de passe pour sécuriser et reconnecter ton compte.",
        );
        setError("");
        setSignupCompleted(false);
        setForgotPasswordSent(false);
        return;
      }

      if (
        event === "SIGNED_IN" &&
        session &&
        (recoveryFlowRef.current || recoveryFromUrl)
      ) {
        console.info("[recovery] SIGNED_IN ignored during recovery");
        return;
      }

      if (event === "SIGNED_IN" && session) {
        const recoveryFromUrl = isRecoveryUrlNow();

        console.log("[recovery-debug] SIGNED_IN in AuthGate", {
          mode: modeRef.current,
          isRecoveryFlow,
          recoveryFromUrl,
        });

        if (
          modeRef.current === "recovery" ||
          isRecoveryFlow ||
          recoveryFromUrl
        ) {
          return;
        }

        completeSuccess();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [completeSuccess, isRecoveryFlow]);

  useEffect(() => {
    recoveryFlowRef.current =
      initialMode === "recovery" || hasRecoveryParams();
    setMode(
      initialMode === "signin"
        ? "signin"
        : initialMode === "recovery"
          ? "recovery"
          : "signup",
    );
    setSignupCompleted(false);
    setForgotPasswordSent(false);
    setShowResendConfirmation(false);
    setResendingConfirmation(false);
    setNotice("");
    setError("");
    setPassword("");
    setConfirmPassword("");
    setRecoveryCompleted(false);
  }, [initialMode]);

  useEffect(() => {
    return () => {
      if (recoverySuccessTimeoutRef.current) {
        clearTimeout(recoverySuccessTimeoutRef.current);
      }
    };
  }, []);

  function resetFeedback(nextMode) {
    setMode(nextMode);
    setSignupCompleted(false);
    setForgotPasswordSent(false);
    setShowResendConfirmation(false);
    setResendingConfirmation(false);
    setNotice("");
    setError("");
    setPassword("");
    setConfirmPassword("");
    setRecoveryCompleted(false);
  }

  function switchToSignInWithExistingAccountMessage() {
    setMode("signin");
    setSignupCompleted(false);
    setNotice("");
    setPassword("");
    setShowResendConfirmation(false);
    setError("Ce compte existe déjà. Connecte-toi pour retrouver ton espace.");
  }

  function handleUnconfirmedEmailState() {
    setShowResendConfirmation(true);
    setNotice("");
    setError("Ton compte existe, mais ton email n’est pas encore confirmé.");
  }

  function validateForm(cleanEmail, cleanPassword) {
    if (mode === "recovery") {
      if (!cleanPassword) {
        return "Merci de renseigner ton nouveau mot de passe.";
      }

      if (!confirmPassword) {
        return "Merci de confirmer ton nouveau mot de passe.";
      }

      if (cleanPassword.length < PASSWORD_MIN_LENGTH) {
        return `Ton mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`;
      }

      if (cleanPassword !== confirmPassword) {
        return "Les deux mots de passe doivent être identiques.";
      }

      return null;
    }

    if (!cleanEmail) {
      return "Merci de renseigner ton email.";
    }

    if (!cleanPassword) {
      return "Merci de renseigner ton mot de passe.";
    }

    if (mode === "signup" && cleanPassword.length < PASSWORD_MIN_LENGTH) {
      return `Ton mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`;
    }

    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!supabase) {
      setNotice("");
      setError("L’authentification est désactivée en mode local.");
      return;
    }

    if (submitting || (mode === "signup" && signupCompleted)) {
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password;
    const validationError = validateForm(cleanEmail, cleanPassword);

    setNotice("");
    setError("");
    setShowResendConfirmation(false);

    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    try {
      if (mode === "recovery") {
        const { error: updateError } = await supabase.auth.updateUser({
          password: cleanPassword,
        });

        if (updateError) {
          setError(
            updateError?.message?.toLowerCase?.().includes("password")
              ? `Ton mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`
              : "Impossible de mettre à jour ton mot de passe pour le moment.",
          );
          return;
        }

        setRecoveryCompleted(true);
        recoveryFlowRef.current = false;
        console.info("[recovery] password updated successfully");
        setNotice(
          "Mot de passe mis à jour ✅ Ton accès est sécurisé. Retour à ton espace en cours.",
        );
        recoverySuccessTimeoutRef.current = window.setTimeout(() => {
          onRecoveryComplete?.();
        }, RECOVERY_SUCCESS_REDIRECT_DELAY_MS);
        return;
      }

      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password: cleanPassword,
          options: {
            data: {
              auth_flow: "password",
            },
          },
        });

        if (signUpError) {
          if (isEmailNotConfirmedError(signUpError)) {
            setMode("signin");
            setPassword("");
            handleUnconfirmedEmailState();
            return;
          }
          if (isExistingAccountSignUpError(signUpError)) {
            switchToSignInWithExistingAccountMessage();
            return;
          }
          setError(getFriendlyAuthError(signUpError, mode));
          return;
        }

        if (isExistingAccountSignUpResult(data)) {
          switchToSignInWithExistingAccountMessage();
          return;
        }

        if (data?.session) {
          completeSuccess();
          return;
        }

        setSignupCompleted(true);
        setNotice(
          "Compte créé. Vérifie ton email pour confirmer l’inscription.",
        );
        return;
      }

      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPassword,
        });

      if (signInError) {
        if (isEmailNotConfirmedError(signInError)) {
          handleUnconfirmedEmailState();
          return;
        }
        setError(getFriendlyAuthError(signInError, mode));
        return;
      }

      if (data?.session) {
        completeSuccess();
        return;
      }

      setError("La session n’a pas pu être initialisée. Merci de réessayer.");
    } catch (unexpectedError) {
      console.error("AuthGate unexpected error:", unexpectedError);
      setError(getFriendlyAuthError(unexpectedError, mode));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    if (!supabase) {
      setNotice("");
      setError("L’authentification est désactivée en mode local.");
      return;
    }

    if (submitting) {
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setError("Merci d’indiquer ton email pour recevoir le lien de réinitialisation.");
      setNotice("");
      return;
    }

    setSubmitting(true);
    setNotice("");
    setError("");

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        cleanEmail,
        {
          redirectTo: `${window.location.origin}${window.location.pathname}?mode=recovery`,
        },
      );

      if (resetError) {
        setError("Impossible d’envoyer l’email de réinitialisation pour le moment.");
        return;
      }

      setForgotPasswordSent(true);
      setNotice(
        "Email envoyé. Vérifie ta boîte mail pour réinitialiser ton mot de passe.",
      );
    } catch (unexpectedError) {
      console.error("Reset password unexpected error:", unexpectedError);
      setError("Impossible d’envoyer l’email de réinitialisation pour le moment.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendConfirmation() {
    if (!supabase) {
      setNotice("");
      setError("L’authentification est désactivée en mode local.");
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || resendingConfirmation) {
      return;
    }

    setResendingConfirmation(true);
    setNotice("");
    setError("");

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: cleanEmail,
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname,
        },
      });

      if (resendError) {
        setError("Impossible de renvoyer l’email de confirmation pour le moment.");
        return;
      }

      setShowResendConfirmation(true);
      setNotice("Email de confirmation renvoyé. Vérifie ta boîte mail.");
    } catch (unexpectedError) {
      console.error("Resend confirmation unexpected error:", unexpectedError);
      setError("Impossible de renvoyer l’email de confirmation pour le moment.");
    } finally {
      setResendingConfirmation(false);
    }
  }

  const submitLabel =
    mode === "recovery"
      ? submitting
        ? "Mise à jour..."
        : "Mettre à jour mon mot de passe"
      : mode === "signup"
      ? submitting
        ? "Création..."
        : signupCompleted
          ? "Email envoyé"
        : "Créer mon compte"
      : submitting
        ? "Connexion..."
        : "Se connecter";

  const isSubmitLocked =
    submitting || recoveryCompleted || (mode === "signup" && signupCompleted);

  if (isAuthenticated && mode !== "recovery") {
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

          <h2 id="auth-title">Tu es déjà connectée</h2>
          <p className="muted">
            Tu es déjà connectée à ton espace. Déconnecte-toi d’abord si tu veux
            utiliser un autre compte.
          </p>

          <div className="authConnectedActions">
            <button
              type="button"
              className="btn btnPrimary"
              onClick={onLogout}
            >
              Se déconnecter
            </button>
            <button
              type="button"
              className="btn btnGhost"
              onClick={onGoToDashboard || onClose}
            >
              Retour à mon espace fiscal
            </button>
          </div>
        </div>
      </div>
    );
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

        <h2 id="auth-title">
          {mode === "signup"
            ? "Créer un compte"
            : mode === "recovery"
              ? "Réinitialiser mon mot de passe"
              : "Connexion à ton espace"}
        </h2>

        <p className="muted">
          {mode === "recovery"
            ? "Tu es en mode récupération de mot de passe. Étape 1 : choisis un nouveau mot de passe. Étape 2 : valide pour retrouver ton espace."
            : "Utilise ton email et ton mot de passe pour retrouver ton profil fiscal, tes revenus, tes factures et ton historique."}
        </p>

        {mode !== "recovery" && (
          <p className="authPathHint">
            <strong>Nouveau compte</strong> : S’inscrire
            <br />
            <strong>Compte existant</strong> : Connexion
          </p>
        )}

        {mode !== "recovery" && (
          <div
            className="authModeSwitch"
            role="tablist"
            aria-label="Type d’accès"
          >
            <button
              type="button"
              className={`authModeButton ${mode === "signup" ? "isActive" : ""}`}
              onClick={() => resetFeedback("signup")}
              aria-pressed={mode === "signup"}
            >
              S’inscrire
            </button>
            <button
              type="button"
              className={`authModeButton ${mode === "signin" ? "isActive" : ""}`}
              onClick={() => resetFeedback("signin")}
              aria-pressed={mode === "signin"}
            >
              Connexion
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="authForm">
          {mode !== "recovery" && (
            <label className="field">
              <span>Email</span>
              <input
                id="auth-email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ton@email.com"
                autoComplete="email"
                required
                disabled={isSubmitLocked}
              />
            </label>
          )}

          <label className="field">
            <span>
              {mode === "recovery" ? "Nouveau mot de passe" : "Mot de passe"}
            </span>
            <input
              id={mode === "recovery" ? "auth-new-password" : "auth-password"}
              name={mode === "recovery" ? "newPassword" : "password"}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Au moins 8 caractères"
              autoComplete={
                mode === "signup" || mode === "recovery"
                  ? "new-password"
                  : "current-password"
              }
              required
              disabled={isSubmitLocked}
            />
          </label>

          {mode === "recovery" && (
            <label className="field">
              <span>Confirmer le mot de passe</span>
              <input
                id="auth-confirm-password"
                name="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Répète le nouveau mot de passe"
                autoComplete="new-password"
                required
                disabled={isSubmitLocked}
              />
            </label>
          )}

          <button
            type="submit"
            className="btn btnPrimary"
            disabled={isSubmitLocked}
          >
            {submitLabel}
          </button>
        </form>

        {mode === "signin" && (
          <div className="authUtilityActions">
            <button
              type="button"
              className="authLinkButton"
              onClick={handleForgotPassword}
              disabled={submitting || forgotPasswordSent}
            >
              {forgotPasswordSent ? "Email de réinitialisation envoyé" : "Mot de passe oublié ?"}
            </button>

            {showResendConfirmation && (
              <button
                type="button"
                className="authLinkButton"
                onClick={handleResendConfirmation}
                disabled={submitting || resendingConfirmation}
              >
                {resendingConfirmation
                  ? "Renvoi..."
                  : "Renvoyer l’email de confirmation"}
              </button>
            )}
          </div>
        )}

        <p className="muted authHelper">
          {mode === "recovery"
            ? "Le lien reçu par email ouvre cette étape de réinitialisation sécurisée."
            : mode === "signup"
            ? "Ton compte gratuit te permet de synchroniser ton espace fiscal sur plusieurs appareils."
            : "Si tu as oublié ton mot de passe, utilise le lien de réinitialisation ci-dessus."}
        </p>

        {notice && <p className="authNotice">{notice}</p>}
        {error && <p className="authError">{error}</p>}
      </div>
    </div>
  );
}
