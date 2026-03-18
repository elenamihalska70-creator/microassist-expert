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
    help: "Certaines obligations et estimations dépendent de ton activité.",
  },

  {
    key: "declaration_frequency",
    title: "Rythme",
    mode: "choice",
    question: "Quel est ton rythme de déclaration ?",
    options: [
      { value: "monthly", label: "Mensuel" },
      { value: "quarterly", label: "Trimestriel" },
    ],
    help: "Tu peux modifier ce choix plus tard.",
  },

  {
    key: "fiscal_dashboard",
    title: "Profil fiscal",
    mode: "dashboard",
    question: "Ton profil fiscal est prêt",
    cards: [
      { key: "next_declaration", label: "📄 Prochaine déclaration" },
      { key: "deadline", label: "📆 Date limite" },
      { key: "tva", label: "TVA" },
      { key: "reminders", label: "🔔 Rappel" },
      { key: "estimated_rate", label: "📊 Taux estimé" },
      { key: "treasury", label: "💰 À mettre de côté" },
    ],
  },
];