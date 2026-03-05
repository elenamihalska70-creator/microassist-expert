// src/config/steps.fiscal.js

export const FISCAL_STEPS = [
  {
    key: "entry_status",
    title: "Démarrage",
    mode: "choice",
    question: "Tu es déjà entrepreneur ?",
    options: [
      { value: "new", label: "🆕 Je me lance" },
      { value: "existing", label: "🚀 Déjà entrepreneur" },
      { value: "unknown", label: "🤔 Je ne sais pas" },
    ],
    help: "Choisis selon ta situation. Tu pourras ajuster ensuite.",
  },

  // Onboarding (peut être “skippé” plus tard par la logique)
  {
    key: "status",
    title: "Statut",
    mode: "choice",
    question: "Ton statut ?",
    options: [
      { value: "auto_entrepreneur", label: "Auto-entrepreneur" },
      { value: "ei_eurl", label: "EI / EURL" },
      { value: "sas_sasu", label: "SAS / SASU" },
      { value: "unknown", label: "❓ Je ne sais pas" },
    ],
    help: "Le statut détermine tes déclarations et paiements.",
  },

  {
    key: "activity_type",
    title: "Activité",
    mode: "choice",
    question: "Ton activité principale ?",
    options: [
      { value: "services", label: "💻 Services" },
      { value: "vente", label: "🛒 Vente" },
      { value: "mixte", label: "🎨 Mixte" },
    ],
    help: "Certaines obligations dépendent de ton activité.",
  },

  {
    key: "declaration_frequency",
    title: "Rythme",
    mode: "choice",
    question: "Déclarations ?",
    options: [
      { value: "monthly", label: "Mensuel" },
      { value: "quarterly", label: "Trimestriel" },
      { value: "unknown", label: "❓ Je ne sais pas" },
    ],
    help: "Tu peux changer plus tard.",
  },


  // CA (chiffre d’affaires) — rapide + autre
  {
    key: "ca_preset",
    title: "CA",
    mode: "choice",
    question: "Ton CA du mois ?",
    options: [
      { value: 0, label: "0 €" },
      { value: 500, label: "500 €" },
      { value: 1000, label: "1 000 €" },
      { value: 2500, label: "2 500 €" },
      { value: 5000, label: "5 000 €" },
      { value: "other", label: "✍️ Autre" },
    ],
    help: "CA = chiffre d’affaires du mois (total facturé).",
  },

  // Saisie manuelle si “Autre”
  {
    key: "ca_month",
    title: "CA",
    question: "Entre ton CA du mois (en €)",
    placeholder: "Ex: 1200",
    // pas de mode => ça utilise l’input texte existant
  },

  // Dashboard (cœur du produit) — pas encore de calculs, juste structure
  {
    key: "fiscal_dashboard",
    title: "Tableau fiscal",
    mode: "dashboard",
    question: "Tableau de bord",
    cards: [
      { key: "next_declaration", label: "📄 Prochaine déclaration" },
      { key: "estimated_amount", label: "💶 Montant estimé" },
      { key: "deadline", label: "📆 Date limite" },
      { key: "reminders", label: "🔔 Rappel activé" },
      { key: "tva", label: "TVA" },
      { key: "treasury", label: "💰 À garder de côté" },

    ],
  },
];

