// src/config/steps.fiscal.js

export const FISCAL_STEPS = [
  {
    key: "entry_status",
    title: "Démarrage",
    mode: "choice",
    question: "Tu es en micro-entreprise (auto-entrepreneur) ?",
    options: [
      { value: "micro_yes", label: "✅ Oui, micro-entreprise" },
      { value: "micro_no", label: "❌ Non (SAS / EI / EURL…)" },
    ],
    help: "Microassist (MVP) couvre surtout la micro-entreprise. Si tu n’es pas micro, une version dédiée arrive.",
  },

  /*
  {
    key: "status",
    title: "Statut",
    mode: "choice",
    question: "Ton statut ?",
    options: [
      { value: "auto_entrepreneur", label: "Auto-entrepreneur" },
      { value: "ei_eurl", label: "EI / EURL" },
      { value: "sas_sasu", label: "SAS / SASU" },
    ],
    help: "Le statut détermine tes déclarations et paiements.",
  },
*/
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
    ],
    help: "Tu peux changer plus tard.",
  },

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

  {
    key: "ca_month",
    title: "CA",
    question: "Entre ton CA du mois (en €)",
    placeholder: "Ex: 1200",
  },

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