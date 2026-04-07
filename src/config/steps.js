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
    help: "Microassist couvre principalement la micro-entreprise. Une version pour les autres statuts est en préparation.",
  },

  {
    key: "activity_type",
    title: "Activité",
    mode: "choice",
    question: "Quelle est ton activité principale ?",
    options: [
      { value: "services", label: "💻 Services" },
      { value: "vente", label: "🛒 Vente" },
      { value: "mixte", label: "🎨 Mixte" },
    ],
    help: "Les obligations et les taux de cotisation varient selon ton activité.",
  },

  {
    key: "acre",
    title: "Aide (ACRE)",
    mode: "choice",
    question: "Bénéficies-tu de l’ACRE ?",
    options: [
      { value: "yes", label: "✅ Oui" },
      { value: "no", label: "❌ Non" },
      { value: "unknown", label: "🤔 Je ne sais pas" },
    ],
    help: "L’ACRE (Aide aux Créateurs et Repreneurs d’Entreprise) réduit les charges sociales la première année.",
  },

  {
    key: "monthly_expenses",
    title: "Dépenses",
    mode: "input",
    question: "Quelles sont tes dépenses mensuelles ?",
    placeholder: "Ex: 1500",
    help: "Loyer, charges personnelles, salaires, assurances… Cela nous aidera à évaluer ta santé financière.",
  },

  {
    key: "declaration_frequency",
    title: "Périodicité",
    mode: "choice",
    question: "Quel est ton rythme de déclaration ?",
    options: [
      { value: "mensuel", label: "Mensuel" },
      { value: "trimestriel", label: "Trimestriel" },
    ],
    help: "Tu peux modifier ce choix plus tard depuis ton espace fiscal.",
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