import { ACCESS_MATRIX } from "../config/accessMatrix.js";

export default function PricingPage({
  onClose,
  onSelectPlan,
  onTryWithoutAccount,
  onOpenFutureAdvanced,
}) {
  const freeFeatures = ACCESS_MATRIX.registered_free.features;
  const premiumFeatures = ACCESS_MATRIX.premium_active.features;
  const founderFeatures = ACCESS_MATRIX.founder_trial.features;
  const freeSmartPrioritiesCount =
    freeFeatures.smart_priorities_count === "all"
      ? "toutes"
      : freeFeatures.smart_priorities_count;
  const premiumSmartPrioritiesCount =
    premiumFeatures.smart_priorities_count === "all"
      ? "toutes"
      : premiumFeatures.smart_priorities_count;
  const formatFeatureValue = (value, fallbackFalse = "❌") => {
    if (value === true) return "✅";
    if (value === false) return fallbackFalse;
    return value;
  };

  return (
    <div className="pricingPage">
      <div className="pricingHeader">
        <div>
          <h1>💰 Tarifs simples et transparents</h1>
         
        </div>

        {onClose && (
          <button className="closeButton" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        )}
      </div>

      {/* Bloc informatif : test sans compte */}
      <div className="pricingIntroNotice">
        <div className="pricingIntroNoticeText">
          <h2>Tester sans compte</h2>
          <p>
            Découvre Microassist immédiatement, sans créer de compte.
          </p>
          <p>
          Sans compte, tes données restent sur cet appareil. Elles peuvent être perdues.
          </p>
        </div>

        <button
          className="btn btnGhost"
          onClick={() => onTryWithoutAccount?.()}
          type="button"
        >
          Continuer sans compte
        </button>
      </div>

      {/* Grille principale : 2 vraies offres */}
      <div className="pricingGrid pricingGridTwoCols">
        {/* Compte gratuit */}
        <div className="pricingCard">
          <div className="pricingBadge">⭐ Recommandé pour démarrer</div>
          <h2>Compte gratuit</h2>
          <div className="price">
            0€ <span>/mois</span>
          </div>

          <p className="pricingCardIntro">
            Tu suis ton activité et tu consultes l’essentiel.
          </p>

          <ul>
            <li>
              {freeFeatures.revenue_tracking ? "✅" : "❌"} Suivi des revenus
            </li>
            <li>✅ Calcul des charges URSSAF</li>
            <li>✅ Alerte TVA</li>
            <li>✅ Prise en compte de l’ACRE</li>
            <li>✅ Espace personnel sécurisé</li>
            <li>✅ Retrouver ton espace avec un compte gratuit</li>
            <li>
              {freeSmartPrioritiesCount > 0 ? "⚠" : "❌"}{" "}
              {freeSmartPrioritiesCount > 0
                ? `${freeSmartPrioritiesCount} Smart Priorité visible`
                : "Smart Priorités avancées"}
            </li>
            <li>✅ Export PDF</li>
            <li>✅ Export CSV</li>
            <li>✅ Factures illimitées</li>
            <li>❌ Alertes email automatiques</li>
            <li>❌ Alertes intelligentes prioritaires</li>
            <li>✅ Tu consultes l’essentiel de ton suivi</li>
          </ul>

          <p className="muted" style={{ marginTop: 14, marginBottom: 0 }}>
            Tu peux commencer gratuitement.
            Passe à Premium quand ton activité grandit.
          </p>

          <button
            className="btn btnSecondary"
            onClick={() => onSelectPlan?.("free")}
            type="button"
          >
            Créer mon compte
          </button>
        </div>

        {/* Premium */}
        <div className="pricingCard featured">
          <div className="popularBadge">🚀 Le plus complet</div>
          <h2>Premium</h2>
          <div className="price">
            5€ <span>/mois</span>
          </div>
          <div className="annualPrice">Paiement en cours d’ouverture</div>

          <p className="pricingCardIntro">
            Microassist te prévient automatiquement avant les échéances importantes.
          </p>

          <ul>
            <li>✅ Tout le compte gratuit</li>
            <li>
              {premiumFeatures.declaration_email_j7 ? "✅" : "❌"} Alertes email avant échéance
              {" "}({premiumFeatures.declaration_email_j7 ? "J-7" : "—"} / {premiumFeatures.declaration_email_j2 ? "J-2" : "—"})
            </li>
            <li>
              {premiumSmartPrioritiesCount === "toutes" ? "✅" : "⚠"} Smart
              Priorités complètes
            </li>
            <li>✅ Export PDF + suivi avancé</li>
            <li>✅ Export CSV</li>
            <li>✅ Factures illimitées + suivi fiscal</li>
            <li>
              {premiumFeatures.smart_priority_email ? "✅" : "❌"} Alertes
              intelligentes par email
            </li>
            <li>
              {premiumFeatures.reminders_advanced ? "✅" : "❌"} Rappels et
              priorités avancés
            </li>
            <li>
              {premiumFeatures.premium_like_access ? "✅" : "❌"} Accès complet
              aux fonctionnalités Premium
            </li>
          </ul>

          <p className="muted" style={{ marginTop: 14, marginBottom: 0 }}>
            Premium te prévient automatiquement avant les échéances importantes
            pour éviter les oublis.
          </p>

          <button
            className="btn btnPrimary"
            onClick={() => onSelectPlan?.("premium")}
            type="button"
          >
            Anticiper mes échéances
          </button>

          <div className="guarantee">
            Sans engagement. Résiliation possible à tout moment.
          </div>
        </div>
      </div>

      <div className="pricingIntroNotice" style={{ marginTop: 18 }}>
        <div className="pricingIntroNoticeText">
          <h2>Période d’essai</h2>
          <p>
            Les fondateurs bénéficient de {founderFeatures.trial_days} jours
            d’essai. Les comptes standard profitent d’un essai plus court.
          </p>
          <p>
            Les premiers jours incluent une période découverte avec accès
            complet pour tester comment Microassist t’aide à agir plus tôt.
            Cet accès découverte dépend de ton onboarding, pas de la formule
            gratuite ou Premium.
          </p>
          <p>
            Microassist évolue en 3 niveaux d’accompagnement : d’abord
            comprendre, ensuite anticiper, puis automatiser.
          </p>
        </div>
      </div>

      <div className="pricingIntroNotice" style={{ marginTop: 18 }}>
        <div className="pricingIntroNoticeText">
          <h2>Offre avancée à venir</h2>
          <p>SMS, automatisation et fonctionnalités plus avancées.</p>
          <p>
            Cette offre restera distincte du Premium actuel et sera proposée
            progressivement.
          </p>
        </div>

        <button
          className="btn btnGhost"
          onClick={() => onOpenFutureAdvanced?.()}
          type="button"
        >
          Découvrir les fonctionnalités à venir
        </button>
      </div>

      {/* Comparatif visuel */}
      <div className="pricingCompareSection">
        <h3>Comparer les formules</h3>

        <div className="pricingCompareTable">
          <div className="pricingCompareRow pricingCompareHead">
            <div>Fonctionnalité</div>
            <div>Compte gratuit</div>
            <div>Premium</div>
          </div>

          <div className="pricingCompareRow">
            <div>Suivi des revenus</div>
            <div>{formatFeatureValue(freeFeatures.revenue_tracking)}</div>
            <div>{formatFeatureValue(premiumFeatures.revenue_tracking)}</div>
          </div>

          <div className="pricingCompareRow">
            <div>Calcul des charges</div>
            <div>✅</div>
            <div>✅</div>
          </div>

          <div className="pricingCompareRow">
            <div>Alerte TVA</div>
            <div>✅</div>
            <div>✅</div>
          </div>

          <div className="pricingCompareRow">
            <div>Retrouver ton espace</div>
            <div>✅</div>
            <div>✅</div>
          </div>

          <div className="pricingCompareRow">
            <div>Smart Priorités visibles</div>
            <div>
              {freeSmartPrioritiesCount === 0
                ? "Aucune"
                : freeSmartPrioritiesCount}
            </div>
            <div>{premiumSmartPrioritiesCount}</div>
          </div>

          <div className="pricingCompareRow">
            <div>Export PDF</div>
            <div>oui</div>
            <div>oui</div>
          </div>

          <div className="pricingCompareRow">
            <div>Export CSV</div>
            <div>✅</div>
            <div>✅</div>
          </div>

          <div className="pricingCompareRow">
            <div>Factures</div>
            <div>illimitées</div>
            <div>illimitées + suivi fiscal</div>
          </div>

          <div className="pricingCompareRow">
            <div>Email rappel J-7</div>
            <div>{formatFeatureValue(freeFeatures.declaration_email_j7)}</div>
            <div>{formatFeatureValue(premiumFeatures.declaration_email_j7)}</div>
          </div>

          <div className="pricingCompareRow">
            <div>Email rappel J-2</div>
            <div>{formatFeatureValue(freeFeatures.declaration_email_j2)}</div>
            <div>{formatFeatureValue(premiumFeatures.declaration_email_j2)}</div>
          </div>

          <div className="pricingCompareRow">
            <div>Alerte intelligente par email</div>
            <div>{formatFeatureValue(freeFeatures.smart_priority_email)}</div>
            <div>{formatFeatureValue(premiumFeatures.smart_priority_email)}</div>
          </div>

        </div>
      </div>

      {/* FAQ */}
      <div className="faqSection">
        <h3>Questions fréquentes</h3>

        <details>
          <summary>Puis-je résilier à tout moment ?</summary>
          <p>
            Oui. Tu peux arrêter à tout moment, sans engagement long terme.
          </p>
        </details>

        <details>
          <summary>Ai-je besoin d’un compte pour tester Microassist ?</summary>
          <p>
            Non. Tu peux commencer gratuitement sans compte. Créer un compte
            gratuit permet surtout de retrouver ton espace plus tard.
          </p>
        </details>

        <details>
          <summary>Quels moyens de paiement sont acceptés ?</summary>
          <p>
            Carte bancaire via Stripe. Le paiement est sécurisé.
          </p>
        </details>

        <details>
          <summary>Mes données sont-elles sécurisées ?</summary>
          <p>
            Oui. Les échanges sont chiffrés et les données sont hébergées en
            Europe.
          </p>
        </details>

        <details>
          <summary>Que se passe-t-il si je reste en gratuit ?</summary>
          <p>
            Tu suis ton activité et tu consultes l’essentiel. Premium te
            prévient automatiquement avant les échéances importantes.
          </p>
        </details>
      </div>
    </div>
  );
}
