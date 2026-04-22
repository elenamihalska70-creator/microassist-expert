import React from "react";

export default function PricingPage({
  onClose,
  onSelectPlan,
  onTryWithoutAccount,
}) {
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
          Tes données restent uniquement sur cet appareil.
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
            Commence gratuitement. Crée un compte pour retrouver ton espace.
          </p>

          <ul>
            <li>✅ Suivi des revenus</li>
            <li>✅ Calcul des charges URSSAF</li>
            <li>✅ Alerte TVA</li>
            <li>✅ Prise en compte de l’ACRE</li>
            <li>✅ Espace personnel sécurisé</li>
            <li>✅ Synchronisation multi-appareils</li>
            <li>⚠ Historique avancé limité</li>
            <li>❌ Export PDF complet</li>
            <li>❌ Rappels email et SMS avancés</li>
          </ul>

          <button
            className="btn btnSecondary"
            onClick={() => onSelectPlan?.("free")}
            type="button"
          >
            Créer mon compte gratuit
          </button>
        </div>

        {/* Premium */}
        <div className="pricingCard featured">
          <div className="popularBadge">🚀 Le plus complet</div>
          <h2>Premium</h2>
          <div className="price">
            5€ <span>/mois</span>
          </div>
          <div className="annualPrice">ou 49€/an</div>

          <p className="pricingCardIntro">
            Gagne du temps, évite les oublis et suis ton activité plus sereinement.
          </p>

          <ul>
            <li>✅ Tout le compte gratuit</li>
            <li>✅ Historique complet</li>
            <li>✅ Export PDF professionnel</li>
            <li>✅ Export CSV</li>
            <li>✅ Rappels email avant échéance</li>
            <li>✅ Alertes SMS importantes</li>
            <li>✅ Recommandations plus avancées</li>
            <li>✅ Support prioritaire</li>
          </ul>

          <button
            className="btn btnPrimary"
            onClick={() => onSelectPlan?.("premium")}
            type="button"
          >
            Activer Premium • 5€/mois
          </button>

          <div className="guarantee">
            Sans engagement. Résiliation possible à tout moment.
          </div>
        </div>
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
            <div>✅</div>
            <div>✅</div>
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
            <div>Synchronisation multi-appareils</div>
            <div>✅</div>
            <div>✅</div>
          </div>

          <div className="pricingCompareRow">
            <div>Historique</div>
            <div>Limité</div>
            <div>Illimité</div>
          </div>

          <div className="pricingCompareRow">
            <div>Export PDF</div>
            <div>❌</div>
            <div>✅</div>
          </div>

          <div className="pricingCompareRow">
            <div>Rappels email</div>
            <div>❌</div>
            <div>✅</div>
          </div>

          <div className="pricingCompareRow">
            <div>Alertes SMS</div>
            <div>❌</div>
            <div>✅</div>
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
            Tu gardes les fonctions essentielles. Premium sert surtout à aller
            plus loin avec l’historique complet, les exports et certains
            rappels.
          </p>
        </details>
      </div>
    </div>
  );
}
