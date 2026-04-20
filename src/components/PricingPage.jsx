// src/components/PricingPage.jsx
import React from 'react';

export default function PricingPage({ onClose, onSelectPlan }) {
  return (
    <div className="pricingPage">
      <div className="pricingHeader">
        <h1>💰 Tarifs simples et transparents</h1>
        <p>Choisis la formule qui correspond à ton besoin. Sans engagement.</p>
        {onClose && (
          <button className="closeButton" onClick={onClose}>✕</button>
        )}
      </div>

      <div className="pricingGrid">
        {/* Offre Gratuite */}
        <div className="pricingCard">
          <div className="pricingBadge">🎁 Pour démarrer</div>
          <h2>Gratuit</h2>
          <div className="price">0€ <span>/mois</span></div>
          <ul>
            <li>✅ Calcul des charges URSSAF</li>
            <li>✅ Alerte TVA</li>
            <li>✅ Suivi des revenus</li>
            <li>✅ ACRE intégrée</li>
            <li>❌ Historique illimité</li>
            <li>❌ Export PDF</li>
            <li>❌ Rappels email</li>
          </ul>
          <button 
            className="btn btnSecondary" 
            onClick={() => onSelectPlan?.('free')}
          >
            Commencer gratuitement
          </button>
        </div>

        {/* Offre Compte gratuit */}
        <div className="pricingCard">
          <div className="pricingBadge">🔐 Recommandé</div>
          <h2>Compte</h2>
          <div className="price">0€ <span>/mois</span></div>
          <ul>
            <li>✅ Tout le gratuit</li>
            <li>✅ Synchronisation multi-appareils</li>
            <li>✅ Historique sauvegardé</li>
            <li>✅ Espace personnel sécurisé</li>
            <li>❌ Export PDF</li>
            <li>❌ Rappels email</li>
          </ul>
          <button 
            className="btn btnSecondary" 
            onClick={() => onSelectPlan?.('account')}
          >
            Créer mon compte
          </button>
        </div>

        {/* Offre Premium */}
        <div className="pricingCard featured">
          <div className="popularBadge">⭐ Le plus populaire</div>
          <h2>Premium</h2>
          <div className="price">5€ <span>/mois</span></div>
          <div className="annualPrice">ou 49€/an (économie 18%)</div>
          <ul>
            <li>✅ Tout le compte gratuit</li>
            <li>✅ Historique illimité</li>
            <li>✅ Export PDF professionnel</li>
            <li>✅ Rappels email avant échéance</li>
            <li>✅ Alertes SMS</li>
            <li>✅ Support prioritaire</li>
          </ul>
          <button 
            className="btn btnPrimary" 
            onClick={() => onSelectPlan?.('premium')}
          >
            Choisir Premium
          </button>
          <div className="guarantee">🎁 3 premiers mois gratuits</div>
        </div>
      </div>

      {/* FAQ */}
      <div className="faqSection">
        <h3>Questions fréquentes</h3>
        <details>
          <summary>Puis-je résilier à tout moment ?</summary>
          <p>Oui, sans frais. Tu gardes l'accès jusqu'à la fin de la période payée.</p>
        </details>
        <details>
          <summary>Quels moyens de paiement ?</summary>
          <p>Carte bancaire (Visa, Mastercard) via Stripe. Paiement 100% sécurisé.</p>
        </details>
        <details>
          <summary>Les données sont-elles sécurisées ?</summary>
          <p>Oui, chiffrement SSL et hébergement en Europe (Supabase).</p>
        </details>
        <details>
          <summary>Que devient mon compte si je passe de Premium à Gratuit ?</summary>
          <p>Tu gardes ton historique en lecture seule. Pour ajouter de nouveaux revenus, passe à Premium.</p>
        </details>
      </div>
    </div>
  );
}