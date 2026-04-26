import { useEffect, useMemo, useState } from "react";
import "./ExpertDashboard.css";

export const EXPERT_CLIENTS_STORAGE_KEY = "microassist_expert_clients";
export const EXPERT_HISTORY_STORAGE_KEY = "microassist_expert_history";

const FILTERS = [
  { key: "all", label: "Tous" },
  { key: "late", label: "En retard" },
  { key: "tva", label: "Risque TVA" },
  { key: "warning", label: "Alertes" },
  { key: "ok", label: "OK" },
];

const ACTIVITY_OPTIONS = [
  "Vente / commerce",
  "Prestations de services",
  "Profession libérale",
  "Activité mixte",
  "Artisanat",
  "Formation",
  "Autre",
];

const PERIODICITY_OPTIONS = ["Mensuelle", "Trimestrielle", "Inconnue"];
const TVA_OPTIONS = ["Non applicable", "Applicable", "Inconnue"];
const ACRE_OPTIONS = ["Oui", "Non", "Inconnue"];

const CHARGE_RATES = {
  "Vente / commerce": 0.123,
  "Prestations de services": 0.22,
  "Profession libérale": 0.22,
  "Activité mixte": 0.18,
  Artisanat: 0.22,
  Formation: 0.22,
  Autre: 0.22,
};

const LEGACY_ACTIVITY_MAP = {
  "Vente en ligne": "Vente / commerce",
  "E-commerce": "Vente / commerce",
  "Prestation de services": "Prestations de services",
  Consulting: "Prestations de services",
  Graphisme: "Prestations de services",
  Coaching: "Prestations de services",
  "Développement web": "Prestations de services",
};

const DEFAULT_CLIENT_FORM = {
  name: "",
  activity: "",
  periodicity: "Inconnue",
  revenue: "",
  lastDeclarationDate: "",
  tva: "Inconnue",
  acre: "Inconnue",
};

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const STATUS_RECOMMENDATIONS = {
  late: "Régulariser le dossier et relancer le client.",
  tva: "Vérifier les seuils TVA et préparer la facturation.",
  warning: "Contrôler le point de vigilance avant échéance.",
  ok: "Continuer le suivi régulier du dossier.",
};

const STATUS_PRIORITY_LEVELS = {
  late: 1,
  tva: 2,
  warning: 3,
  ok: 4,
};

const STATUS_DEFAULT_ACTIONS = {
  late: "Déclaration à vérifier ou régulariser",
  tva: "Vérifier le seuil TVA",
  warning: "Contrôler les charges estimées",
  ok: "Aucune action urgente",
};

export const seedClients = [
  {
    id: "seed-1",
    name: "Sophie Martin",
    activity: "Consulting",
    revenue: 4850,
    status: "ok",
    nextAction: "Déclaration URSSAF le 30 avril",
    notes: [
      {
        date: "2026-04-22T09:30:00.000Z",
        text: "Cliente autonome, peu de relances nécessaires.",
      },
    ],
    updatedAt: "2026-04-22T09:30:00.000Z",
    priorities: [
      "Vérifier la prochaine échéance URSSAF",
      "Préparer le suivi mensuel",
    ],
  },
  {
    id: "seed-2",
    name: "Lucas Bernard",
    activity: "E-commerce",
    revenue: 12400,
    status: "tva",
    nextAction: "Vérifier le seuil TVA",
    notes: [
      {
        date: "2026-04-21T14:10:00.000Z",
        text: "CA en hausse, surveiller le passage de seuil.",
      },
    ],
    updatedAt: "2026-04-21T14:10:00.000Z",
    priorities: [
      "Contrôler le seuil TVA",
      "Préparer un point client sur la facturation",
    ],
  },
  {
    id: "seed-3",
    name: "Emma Petit",
    activity: "Formation",
    revenue: 2100,
    status: "late",
    nextAction: "Déclaration en retard à régulariser",
    notes: [
      {
        date: "2026-04-20T08:45:00.000Z",
        text: "Besoin d’un rappel rapide cette semaine.",
      },
    ],
    updatedAt: "2026-04-20T08:45:00.000Z",
    priorities: [
      "Régulariser la déclaration",
      "Envoyer un rappel client",
    ],
  },
  {
    id: "seed-4",
    name: "Nina Robert",
    activity: "Graphisme",
    revenue: 6320,
    status: "ok",
    nextAction: "Préparer l’échéance CFE",
    notes: [
      {
        date: "2026-04-18T16:00:00.000Z",
        text: "RAS, dossier stable.",
      },
    ],
    updatedAt: "2026-04-18T16:00:00.000Z",
    priorities: [
      "Préparer l’échéance CFE",
      "Vérifier les charges estimées",
    ],
  },
  {
    id: "seed-5",
    name: "Thomas Garcia",
    activity: "Activité mixte",
    revenue: 8970,
    status: "warning",
    nextAction: "Contrôler les charges estimées",
    notes: [
      {
        date: "2026-04-17T10:15:00.000Z",
        text: "Activité mixte, points de vigilance sur le suivi.",
      },
    ],
    updatedAt: "2026-04-17T10:15:00.000Z",
    priorities: [
      "Vérifier la ventilation vente / service",
      "Contrôler les charges estimées",
    ],
  },
  {
    id: "seed-6",
    name: "Camille Moreau",
    activity: "Coaching",
    revenue: 3650,
    status: "ok",
    nextAction: "Planifier le point mensuel",
    notes: [],
    updatedAt: "2026-04-16T13:20:00.000Z",
    priorities: [
      "Planifier le point mensuel",
      "Vérifier les derniers encaissements",
    ],
  },
  {
    id: "seed-7",
    name: "Yanis Lefevre",
    activity: "Développement web",
    revenue: 10950,
    status: "tva",
    nextAction: "Préparer un audit TVA avant nouvelle facture",
    notes: [
      {
        date: "2026-04-15T11:00:00.000Z",
        text: "Plusieurs missions signées ce mois-ci, seuils à surveiller.",
      },
    ],
    updatedAt: "2026-04-15T11:00:00.000Z",
    priorities: [
      "Contrôler le seuil TVA",
      "Revoir les mentions de facturation",
    ],
  },
];

function getStatusGroup(status) {
  if (status === "tva_risk") return "tva";
  if (status === "alert") return "warning";
  return status || "ok";
}

function getStatusLabel(status) {
  switch (getStatusGroup(status)) {
    case "late":
      return "En retard";
    case "tva":
      return "Risque TVA";
    case "warning":
      return "Alerte";
    default:
      return "OK";
  }
}

function parseRevenueValue(revenue) {
  if (typeof revenue === "number") return revenue;

  const normalizedRevenue = String(revenue || "")
    .trim()
    .replace(/\s/g, "")
    .replace("€", "")
    .replace(",", ".");
  const revenueValue = Number(normalizedRevenue);

  return Number.isNaN(revenueValue) ? 0 : revenueValue;
}

function normalizeActivity(activity) {
  return LEGACY_ACTIVITY_MAP[activity] || activity || "";
}

function getChargeRate(activity) {
  return CHARGE_RATES[normalizeActivity(activity)] || CHARGE_RATES.Autre;
}

function getEstimatedCharges(client) {
  if (typeof client?.estimatedCharges === "number") {
    return client.estimatedCharges;
  }

  return Math.round(parseRevenueValue(client?.revenue) * getChargeRate(client?.activity));
}

function formatCurrency(value) {
  const amount = Number(value);

  if (Number.isNaN(amount)) {
    return "—";
  }

  return `${amount.toLocaleString("fr-FR")} €`;
}

function parseClientDate(value) {
  if (typeof value !== "string") return null;

  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));

  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) {
    return null;
  }

  return date;
}

function getIsoDateValue(value) {
  return parseClientDate(value) ? value.trim() : "";
}

function getDaysSinceLastDeclaration(dateValue) {
  const declarationDate = parseClientDate(dateValue);

  if (!declarationDate) return null;

  const today = new Date();
  const todayDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  return Math.floor((todayDate.getTime() - declarationDate.getTime()) / MILLISECONDS_PER_DAY);
}

function getComputedClientStatus(client) {
  const revenueValue = parseRevenueValue(client?.revenue);
  const tva = client?.tva || "Inconnue";
  const periodicity = client?.periodicity || "Inconnue";
  const daysSinceLastDeclaration = getDaysSinceLastDeclaration(
    client?.lastDeclarationDate,
  );

  if (
    periodicity === "Mensuelle" &&
    daysSinceLastDeclaration !== null &&
    daysSinceLastDeclaration > 45
  ) {
    return "late";
  }

  if (
    periodicity === "Trimestrielle" &&
    daysSinceLastDeclaration !== null &&
    daysSinceLastDeclaration > 120
  ) {
    return "late";
  }

  if (revenueValue >= 12000 && tva !== "Applicable") {
    return "tva";
  }

  return "ok";
}

function getComputedNextAction(client, status = getComputedClientStatus(client)) {
  if (status === "tva") {
    return "Vérifier le seuil TVA";
  }

  if (status === "late") {
    return "Déclaration à vérifier ou régulariser";
  }

  return "Aucune action urgente";
}

function getComputedPriorities(client, status = getComputedClientStatus(client)) {
  const priorities = [];

  if (status === "tva") {
    priorities.push("Vérifier le seuil TVA");
  }

  if (status === "late") {
    priorities.push("Vérifier la dernière déclaration");
    priorities.push("Régulariser la déclaration si nécessaire");
  }

  priorities.push("Contrôler les charges estimées");

  if (client?.acre === "Oui") {
    priorities.push("Vérifier la période ACRE");
  }

  if (status === "ok") {
    priorities.push("Continuer le suivi régulier du dossier");
  }

  return [...new Set(priorities)];
}

function buildClientFromForm(formData) {
  const activity = normalizeActivity(formData.activity);
  const revenue = parseRevenueValue(formData.revenue);
  const clientDraft = {
    name: formData.name.trim(),
    activity,
    periodicity: formData.periodicity || "Inconnue",
    revenue,
    lastDeclarationDate: getIsoDateValue(formData.lastDeclarationDate),
    tva: formData.tva || "Inconnue",
    acre: formData.acre || "Inconnue",
  };
  const estimatedCharges = Math.round(revenue * getChargeRate(activity));
  const status = getComputedClientStatus(clientDraft);
  const nextAction = getComputedNextAction(clientDraft, status);
  const priorities = getComputedPriorities(clientDraft, status);

  return {
    ...clientDraft,
    estimatedCharges,
    status,
    nextAction,
    priorities,
    notes: "Dossier ajouté automatiquement par l’assistant client.",
    history: [],
  };
}

function getClientRisk(client) {
  const hasAssistedData =
    client?.periodicity || client?.tva || client?.acre || client?.lastDeclarationDate;
  const status = getStatusGroup(
    hasAssistedData ? getComputedClientStatus(client) : client?.status || "ok",
  );

  return {
    status,
    label: getStatusLabel(status),
    priorityLevel: STATUS_PRIORITY_LEVELS[status] || STATUS_PRIORITY_LEVELS.ok,
    recommendedAction: STATUS_RECOMMENDATIONS[status] || STATUS_RECOMMENDATIONS.ok,
  };
}

function getClientNextAction(client) {
  const risk = getClientRisk(client);
  const hasAssistedData =
    client?.periodicity || client?.tva || client?.acre || client?.lastDeclarationDate;

  return hasAssistedData
    ? getComputedNextAction(client, risk.status)
    : client?.nextAction || STATUS_DEFAULT_ACTIONS[risk.status];
}

function createClientHistoryEntry(entry) {
  const entryDate = entry.date ? new Date(entry.date) : new Date();

  return {
    type: entry.type,
    label: entry.label,
    date: Number.isNaN(entryDate.getTime())
      ? new Date().toISOString()
      : entryDate.toISOString(),
  };
}

function getClientHistoryEntries(client, legacyHistory = []) {
  const clientHistory = Array.isArray(client?.history) ? client.history : [];
  const normalizedClientHistory = clientHistory
    .map((entry) => ({
      ...entry,
      date: typeof entry.date === "string" ? entry.date : new Date(entry.date).toISOString(),
    }))
    .filter((entry) => entry.label && !Number.isNaN(new Date(entry.date).getTime()));

  const normalizedLegacyHistory = legacyHistory
    .map((entry) => ({
      type: entry.type,
      label: entry.label,
      date:
        entry.date instanceof Date
          ? entry.date.toISOString()
          : new Date(entry.date).toISOString(),
    }))
    .filter((entry) => entry.label && !Number.isNaN(new Date(entry.date).getTime()));

  return [...normalizedClientHistory, ...normalizedLegacyHistory].sort(
    (firstEntry, secondEntry) =>
      new Date(secondEntry.date).getTime() - new Date(firstEntry.date).getTime(),
  );
}

function getHistoryDateGroup(dateValue) {
  const date = new Date(dateValue);
  const today = new Date();
  const todayDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const entryDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const daysDifference = Math.floor(
    (todayDate.getTime() - entryDate.getTime()) / MILLISECONDS_PER_DAY,
  );

  if (daysDifference === 0) return "Aujourd’hui";
  if (daysDifference === 1) return "Hier";
  return "Avant";
}

function groupHistoryByDate(entries) {
  const groups = {
    "Aujourd’hui": [],
    Hier: [],
    Avant: [],
  };

  entries.forEach((entry) => {
    groups[getHistoryDateGroup(entry.date)].push(entry);
  });

  return Object.entries(groups)
    .map(([label, items]) => ({ label, items }))
    .filter((group) => group.items.length > 0);
}

function getCabinetStats(clients) {
  return clients.reduce(
    (stats, client) => {
      const history = Array.isArray(client.history) ? client.history : [];

      history.forEach((entry) => {
        if (entry.type === "reminder") {
          stats.remindersCount += 1;
        }

        if (entry.type === "note") {
          stats.notesCount += 1;
        }

        if (entry.type === "update") {
          stats.updatesCount += 1;
        }
      });

      return stats;
    },
    {
      remindersCount: 0,
      notesCount: 0,
      updatesCount: 0,
    },
  );
}

export function getClientReminderMessage(client) {
  const name = client?.name || "client";
  const risk = getClientRisk(client).status;

  switch (risk) {
    case "late":
      return `Bonjour ${name},\n\nVotre déclaration semble en retard. Merci de me transmettre les éléments nécessaires afin de régulariser rapidement la situation.\n\nBien à vous,\n[Nom du cabinet]`;
    case "tva":
      return `Bonjour ${name},\n\nVotre chiffre d’affaires approche le seuil de TVA. Je vous propose de faire un point afin d’anticiper les prochaines obligations.\n\nBien à vous,\n[Nom du cabinet]`;
    case "warning":
      return `Bonjour ${name},\n\nUn point de vigilance a été détecté sur votre dossier. Je vous propose de vérifier ensemble les éléments concernés.\n\nBien à vous,\n[Nom du cabinet]`;
    default:
      return `Bonjour ${name},\n\nTout est à jour pour le moment. Je reste disponible si besoin.\n\nBien à vous,\n[Nom du cabinet]`;
  }
}

function getClientActionPlan(client) {
  const plan = {
    today: [],
    thisWeek: [],
    later: [],
  };
  const risk = getClientRisk(client);
  const revenueValue = parseRevenueValue(client?.revenue);
  const hasTvaRisk =
    revenueValue >= 10000 && (client?.tva || "Inconnue") !== "Applicable";

  if (risk.status === "late") {
    plan.today.push("Déclaration en retard à régulariser immédiatement");
    plan.today.push("Contacter le client pour régularisation");
  }

  if (hasTvaRisk) {
    plan.thisWeek.push("Vérifier le seuil TVA");
    plan.thisWeek.push("Informer le client du changement de régime");
  }

  if (client?.acre === "Oui") {
    plan.later.push("Vérifier la fin de la période ACRE");
    plan.later.push("Anticiper évolution des charges");
  }

  if (risk.status === "ok" && plan.today.length === 0 && plan.thisWeek.length === 0) {
    plan.later.push("Suivi normal du dossier");
    plan.later.push("Préparer prochaine déclaration");
  }

  if (
    plan.today.length === 0 &&
    plan.thisWeek.length === 0 &&
    plan.later.length === 0
  ) {
    plan.thisWeek.push("Vérifier les informations du dossier");
  }

  return {
    today: [...new Set(plan.today)],
    thisWeek: [...new Set(plan.thisWeek)],
    later: [...new Set(plan.later)],
  };
}

function getCabinetSchedule(clients) {
  return clients.reduce(
    (schedule, client) => {
      const plan = getClientActionPlan(client);

      plan.today.forEach((action) => {
        schedule.today.push({
          clientId: client.id,
          clientName: client.name,
          action,
          priority: "today",
        });
      });

      plan.thisWeek.forEach((action) => {
        schedule.thisWeek.push({
          clientId: client.id,
          clientName: client.name,
          action,
          priority: "week",
        });
      });

      plan.later.forEach((action) => {
        schedule.later.push({
          clientId: client.id,
          clientName: client.name,
          action,
          priority: "later",
        });
      });

      return schedule;
    },
    {
      today: [],
      thisWeek: [],
      later: [],
    },
  );
}

function normalizeNoteEntry(note) {
  if (note && typeof note === "object") {
    return {
      date: note.date || null,
      text: note.text || "",
    };
  }

  return {
    date: null,
    text: String(note || ""),
  };
}

function getClientNoteEntries(client) {
  if (!client) return [];

  if (Array.isArray(client.notesList) && client.notesList.length > 0) {
    return client.notesList.map(normalizeNoteEntry).filter((note) => note.text);
  }

  if (Array.isArray(client.notes)) {
    return client.notes.map(normalizeNoteEntry).filter((note) => note.text);
  }

  return client.notes ? [{ date: null, text: client.notes }] : [];
}

function formatRevenue(revenue) {
  return formatCurrency(parseRevenueValue(revenue));
}

function getFormattedRevenueInput(revenue) {
  const revenueValue = parseRevenueValue(revenue);

  return revenueValue > 0 ? String(revenueValue) : "";
}

function getClientFormState(client) {
  return {
    name: client?.name || "",
    activity: ACTIVITY_OPTIONS.includes(normalizeActivity(client?.activity))
      ? normalizeActivity(client?.activity)
      : "Autre",
    periodicity: client?.periodicity || "Inconnue",
    revenue: getFormattedRevenueInput(client?.revenue),
    lastDeclarationDate: getIsoDateValue(client?.lastDeclarationDate),
    tva: client?.tva || "Inconnue",
    acre: client?.acre || "Inconnue",
  };
}

export default function ExpertDashboard({ view = "dashboard", onOpenClient }) {
  const [clients, setClients] = useState(() => {
    try {
      const raw = localStorage.getItem(EXPERT_CLIENTS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [reminderClientId, setReminderClientId] = useState(null);
  const [reminderMessage, setReminderMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [clientHistory, setClientHistory] = useState(() => {
    try {
      const raw = localStorage.getItem(EXPERT_HISTORY_STORAGE_KEY);

      if (!raw) {
        return [];
      }

      return JSON.parse(raw).map((event) => ({
        ...event,
        date: new Date(event.date),
      }));
    } catch {
      return [];
    }
  });
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [editingClientId, setEditingClientId] = useState(null);
  const [addClientError, setAddClientError] = useState("");
  const [noteClientId, setNoteClientId] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteError, setNoteError] = useState("");
  const [notesClientId, setNotesClientId] = useState(null);
  const [inlineNoteDraft, setInlineNoteDraft] = useState("");
  const [inlineNoteError, setInlineNoteError] = useState("");
  const [newClientForm, setNewClientForm] = useState(DEFAULT_CLIENT_FORM);

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) || null,
    [clients, selectedClientId],
  );
  const reminderClient = useMemo(
    () => clients.find((client) => client.id === reminderClientId) || null,
    [clients, reminderClientId],
  );
  const noteClient = useMemo(
    () => clients.find((client) => client.id === noteClientId) || null,
    [clients, noteClientId],
  );
  const selectedClientHistory = useMemo(() => {
    if (!selectedClient) return [];

    const legacyHistory = clientHistory.filter(
      (event) => event.clientId === selectedClient.id,
    );

    return getClientHistoryEntries(selectedClient, legacyHistory);
  }, [clientHistory, selectedClient]);
  const selectedClientHistoryGroups = useMemo(
    () => groupHistoryByDate(selectedClientHistory),
    [selectedClientHistory],
  );
  const selectedClientNotes = useMemo(() => {
    return getClientNoteEntries(selectedClient);
  }, [selectedClient]);
  const notesClient = useMemo(() => {
    if (notesClientId) {
      return clients.find((client) => client.id === notesClientId) || clients[0] || null;
    }

    return clients[0] || null;
  }, [clients, notesClientId]);
  const notesClientEntries = useMemo(
    () => getClientNoteEntries(notesClient),
    [notesClient],
  );
  const editingClient = useMemo(
    () => clients.find((client) => client.id === editingClientId) || null,
    [clients, editingClientId],
  );

  const kpis = useMemo(() => {
    const clientsSuivis = clients.length;
    const enRetard = clients.filter(
      (client) => getClientRisk(client).status === "late",
    ).length;
    const risqueTva = clients.filter(
      (client) => getClientRisk(client).status === "tva",
    ).length;
    const actionsCetteSemaine = clients.filter(
      (client) => ["late", "tva", "warning"].includes(getClientRisk(client).status),
    ).length;

    return { clientsSuivis, enRetard, risqueTva, actionsCetteSemaine };
  }, [clients]);
  const cabinetStats = useMemo(() => getCabinetStats(clients), [clients]);
  const urgentClients = useMemo(
    () =>
      clients.filter((client) =>
        ["late", "tva", "warning"].includes(getClientRisk(client).status),
      ),
    [clients],
  );
  const dailyPriorities = useMemo(() => {
    const priorityClients = urgentClients.length > 0 ? urgentClients : clients;

    return [...priorityClients]
      .sort(
        (firstClient, secondClient) =>
          getClientRisk(firstClient).priorityLevel -
          getClientRisk(secondClient).priorityLevel,
      )
      .slice(0, 4)
      .map((client) => {
        const risk = getClientRisk(client);

        return {
          id: client.id,
          clientName: client.name,
          risk,
          action: getClientNextAction(client),
        };
      });
  }, [clients, urgentClients]);
  const globalAlerts = useMemo(
    () => [
      {
        label: "Dossiers en retard",
        value: kpis.enRetard,
        helper:
          kpis.enRetard > 0
            ? "Déclarations ou relances à régulariser"
            : "Aucun retard identifié",
      },
      {
        label: "Risques TVA",
        value: kpis.risqueTva,
        helper:
          kpis.risqueTva > 0
            ? "Seuils à contrôler sur les prochains dossiers"
            : "Aucun seuil critique détecté",
      },
      {
        label: "Alertes cabinet",
        value: clients.filter(
          (client) => getClientRisk(client).status === "warning",
        ).length,
        helper: "Points de vigilance à suivre cette semaine",
      },
    ],
    [clients, kpis.enRetard, kpis.risqueTva],
  );
  const alertGroups = useMemo(
    () => [
      {
        key: "late",
        title: "Déclarations en retard",
        description: "Dossiers à régulariser rapidement.",
        clients: clients.filter((client) => getClientRisk(client).status === "late"),
      },
      {
        key: "tva",
        title: "Risques TVA",
        description: "Clients proches ou au-dessus des seuils de vigilance.",
        clients: clients.filter(
          (client) => getClientRisk(client).status === "tva",
        ),
      },
      {
        key: "warning",
        title: "Autres vigilances",
        description: "Points à contrôler avant la prochaine échéance.",
        clients: clients.filter((client) => getClientRisk(client).status === "warning"),
      },
    ],
    [clients],
  );
  const cabinetSchedule = useMemo(() => getCabinetSchedule(clients), [clients]);

  const visibleClients = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return clients.filter((client) => {
      const matchesFilter =
        activeFilter === "all"
          ? true
          : getClientRisk(client).status === activeFilter;
      const matchesSearch = normalizedQuery
        ? client.name.toLowerCase().includes(normalizedQuery)
        : true;

      return matchesFilter && matchesSearch;
    });
  }, [activeFilter, clients, searchQuery]);
  useEffect(() => {
    try {
      localStorage.setItem(EXPERT_CLIENTS_STORAGE_KEY, JSON.stringify(clients));
    } catch {
      // Ignore localStorage issues in the expert prototype.
    }
  }, [clients]);

  useEffect(() => {
    try {
      localStorage.setItem(
        EXPERT_HISTORY_STORAGE_KEY,
        JSON.stringify(clientHistory),
      );
    } catch {
      // Ignore localStorage issues in the expert prototype.
    }
  }, [clientHistory]);

  function openReminderModal(client) {
    setReminderClientId(client.id);
    setReminderMessage(getClientReminderMessage(client));
  }

  function closeReminderModal() {
    setReminderClientId(null);
    setReminderMessage("");
  }

  function addClientHistory(clientId, entry) {
    const historyEntry = createClientHistoryEntry(entry);

    setClients((currentClients) =>
      currentClients.map((client) =>
        client.id === clientId
          ? {
              ...client,
              history: [historyEntry, ...(Array.isArray(client.history) ? client.history : [])],
            }
          : client,
      ),
    );
  }

  function openNoteModal(client) {
    setNoteClientId(client.id);
    setNoteDraft("");
    setNoteError("");
  }

  function closeNoteModal() {
    setNoteClientId(null);
    setNoteDraft("");
    setNoteError("");
  }

  function openAddClientModal() {
    setEditingClientId(null);
    setAddClientError("");
    setNewClientForm(DEFAULT_CLIENT_FORM);
    setShowAddClientModal(true);
  }

  function openEditClientModal(client) {
    if (!client) return;

    setEditingClientId(client.id);
    setAddClientError("");
    setNewClientForm(getClientFormState(client));
    setShowAddClientModal(true);
  }

  function closeAddClientModal() {
    setEditingClientId(null);
    setAddClientError("");
    setShowAddClientModal(false);
  }

  function handleNewClientChange(field, value) {
    setNewClientForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }

  function handleSaveClient() {
    const clientName = newClientForm.name.trim();
    const clientActivity = newClientForm.activity.trim();
    const clientRevenue = newClientForm.revenue.trim();
    const normalizedRevenue = clientRevenue.replace(/\s/g, "").replace(",", ".");
    const revenueValue = Number(normalizedRevenue);

    if (!clientName) {
      setAddClientError("Le nom du client est requis.");
      return;
    }

    if (!clientActivity) {
      setAddClientError("L’activité est requise.");
      return;
    }

    if (!clientRevenue || Number.isNaN(revenueValue) || revenueValue <= 0) {
      setAddClientError("Le chiffre d’affaires doit être un nombre positif.");
      return;
    }

    setAddClientError("");
    const computedClient = buildClientFromForm({
      ...newClientForm,
      name: clientName,
      activity: clientActivity,
      revenue: revenueValue,
    });

    if (editingClient) {
      setClients((currentClients) =>
        currentClients.map((client) =>
          client.id === editingClient.id
            ? {
                ...client,
                ...computedClient,
                notes: client.notes,
                notesList: client.notesList,
                history: Array.isArray(client.history) ? client.history : [],
                updatedAt: new Date().toISOString(),
              }
            : client,
        ),
      );
      addClientHistory(editingClient.id, {
        type: "update",
        label: "Fiche client modifiée",
      });
      setSuccessMessage(`Client modifié : ${clientName}`);
      closeAddClientModal();
      return;
    }

    const nextClient = {
      id: Date.now(),
      ...computedClient,
      history: [
        createClientHistoryEntry({
          type: "create",
          label: "Client ajouté au portefeuille",
        }),
      ],
      updatedAt: new Date().toISOString(),
    };

    setClients((currentClients) => [nextClient, ...currentClients]);
    setSuccessMessage(`Client ajouté : ${clientName}`);
    closeAddClientModal();
  }

  async function handleCopyReminderMessage() {
    if (!reminderClient) return;

    try {
      await navigator.clipboard.writeText(reminderMessage);

      addClientHistory(reminderClient.id, {
        type: "reminder",
        label: "Relance préparée",
      });
      setSuccessMessage(`Message copié pour ${reminderClient.name}.`);
    } catch {
      setSuccessMessage("Impossible de copier le message automatiquement.");
    }
  }

  function handleAddNote() {
    if (!noteClient) return;

    const trimmedNote = noteDraft.trim();

    if (!trimmedNote) {
      setNoteError("La note expert ne peut pas être vide.");
      return;
    }

    const nextNoteEntry = {
      date: new Date().toISOString(),
      text: trimmedNote,
    };
    const nextNotesList = [nextNoteEntry, ...getClientNoteEntries(noteClient)];

    setClients((currentClients) =>
      currentClients.map((client) =>
        client.id === noteClient.id
          ? {
              ...client,
              notes: trimmedNote,
              notesList: nextNotesList,
            }
          : client,
      ),
    );

    addClientHistory(noteClient.id, {
      type: "note",
      label: "Note ajoutée",
    });

    setSuccessMessage(`Note ajoutée pour ${noteClient.name}.`);
    closeNoteModal();
  }

  function handleAddInlineNote() {
    if (!notesClient) return;

    const trimmedNote = inlineNoteDraft.trim();

    if (!trimmedNote) {
      setInlineNoteError("La note expert ne peut pas être vide.");
      return;
    }

    const nextNoteEntry = {
      date: new Date().toISOString(),
      text: trimmedNote,
    };
    const nextNotesList = [nextNoteEntry, ...getClientNoteEntries(notesClient)];

    setClients((currentClients) =>
      currentClients.map((client) =>
        client.id === notesClient.id
          ? {
              ...client,
              notes: trimmedNote,
              notesList: nextNotesList,
            }
          : client,
      ),
    );

    addClientHistory(notesClient.id, {
      type: "note",
      label: "Note ajoutée",
    });

    setInlineNoteDraft("");
    setInlineNoteError("");
    setSuccessMessage(`Note ajoutée pour ${notesClient.name}.`);
  }

  function handleDeleteClient(client) {
    if (!client) return;

    const shouldDelete = window.confirm("Supprimer ce client du prototype ?");

    if (!shouldDelete) {
      return;
    }

    setClients((currentClients) =>
      currentClients.filter((currentClient) => currentClient.id !== client.id),
    );
    setClientHistory((currentHistory) =>
      currentHistory.filter((event) => event.clientId !== client.id),
    );
    setReminderClientId((currentId) => (currentId === client.id ? null : currentId));
    setNoteClientId((currentId) => (currentId === client.id ? null : currentId));
    setSelectedClientId((currentId) => (currentId === client.id ? null : currentId));
    setSuccessMessage(`Client supprimé : ${client.name}`);
  }

  function handleOpenClientFromAlert(client) {
    setSelectedClientId(client.id);
    onOpenClient?.(client);
  }

  function handleOpenClientFromSchedule(item) {
    const client = clients.find((currentClient) => currentClient.id === item.clientId);

    if (!client) return;

    setSelectedClientId(client.id);
    onOpenClient?.(client);
  }

  function renderEmptyState({
    text = "Ajoutez votre premier client pour activer le suivi, les alertes et les notes.",
  } = {}) {
    return (
      <div className="expertEmptyState expertEmptyState--primary">
        <h3>Aucun client pour le moment</h3>
        <p>{text}</p>
        <button
          type="button"
          className="btn btnPrimary btnSmall"
          onClick={openAddClientModal}
        >
          + Ajouter client
        </button>
      </div>
    );
  }

  function renderAddClientModal() {
    if (!showAddClientModal) {
      return null;
    }

    const isEditingClient = Boolean(editingClient);
    const modalTitle = isEditingClient ? "Modifier un client" : "Ajouter un client";
    const submitLabel = isEditingClient ? "Enregistrer" : "Ajouter";

    return (
      <div className="expertModalOverlay" role="presentation">
        <div
          className="expertModalCard"
          role="dialog"
          aria-modal="true"
          aria-labelledby="expert-add-client-title"
        >
          <div className="expertModalHeader">
            <div>
              <h3 id="expert-add-client-title">{modalTitle}</h3>
            </div>
            <button
              type="button"
              className="btn btnGhost btnSmall"
              onClick={closeAddClientModal}
            >
              Fermer
            </button>
          </div>

          <div className="expertModalField">
            <label htmlFor="expert-client-name">Nom du client</label>
            <input
              id="expert-client-name"
              type="text"
              className="expertModalInput"
              value={newClientForm.name}
              onChange={(event) =>
                handleNewClientChange("name", event.target.value)
              }
            />
          </div>

          <div className="expertModalField">
            <label htmlFor="expert-client-activity">Type d’activité</label>
            <select
              id="expert-client-activity"
              className="expertModalSelect"
              value={newClientForm.activity}
              onChange={(event) =>
                handleNewClientChange("activity", event.target.value)
              }
            >
              <option value="">Sélectionner une activité</option>
              {ACTIVITY_OPTIONS.map((activity) => (
                <option key={activity} value={activity}>
                  {activity}
                </option>
              ))}
            </select>
          </div>

          <div className="expertModalField">
            <label htmlFor="expert-client-periodicity">
              Périodicité de déclaration
            </label>
            <select
              id="expert-client-periodicity"
              className="expertModalSelect"
              value={newClientForm.periodicity}
              onChange={(event) =>
                handleNewClientChange("periodicity", event.target.value)
              }
            >
              {PERIODICITY_OPTIONS.map((periodicity) => (
                <option key={periodicity} value={periodicity}>
                  {periodicity}
                </option>
              ))}
            </select>
          </div>

          <div className="expertModalField">
            <label htmlFor="expert-client-revenue">
              Chiffre d’affaires encaissé
            </label>
            <input
              id="expert-client-revenue"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              className="expertModalInput"
              value={newClientForm.revenue}
              onChange={(event) =>
                handleNewClientChange("revenue", event.target.value)
              }
            />
          </div>

          <div className="expertModalField">
            <label htmlFor="expert-client-last-declaration">
              Dernière déclaration
            </label>
            <input
              id="expert-client-last-declaration"
              type="date"
              className="expertModalInput"
              value={newClientForm.lastDeclarationDate}
              onChange={(event) =>
                handleNewClientChange("lastDeclarationDate", event.target.value)
              }
            />
          </div>

          <div className="expertModalField">
            <label htmlFor="expert-client-tva">TVA</label>
            <select
              id="expert-client-tva"
              className="expertModalSelect"
              value={newClientForm.tva}
              onChange={(event) =>
                handleNewClientChange("tva", event.target.value)
              }
            >
              {TVA_OPTIONS.map((tva) => (
                <option key={tva} value={tva}>
                  {tva}
                </option>
              ))}
            </select>
          </div>

          <div className="expertModalField">
            <label htmlFor="expert-client-acre">ACRE</label>
            <select
              id="expert-client-acre"
              className="expertModalSelect"
              value={newClientForm.acre}
              onChange={(event) =>
                handleNewClientChange("acre", event.target.value)
              }
            >
              {ACRE_OPTIONS.map((acre) => (
                <option key={acre} value={acre}>
                  {acre}
                </option>
              ))}
            </select>
          </div>

          {addClientError && (
            <div className="expertModalError" role="alert">
              {addClientError}
            </div>
          )}

          <div className="expertModalActions">
            <button
              type="button"
              className="btn btnGhost btnSmall"
              onClick={closeAddClientModal}
            >
              Annuler
            </button>
            <button
              type="button"
              className="btn btnPrimary btnSmall"
              onClick={handleSaveClient}
            >
              {submitLabel}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === "dashboard") {
    return (
      <section className="expertDashboard">
        <div className="expertBanner">
          Microassist Expert aide les professionnels à suivre plusieurs
          micro-entrepreneurs, repérer les risques et éviter les oublis côté
          client.
          <div className="expertBannerHint">
            Mode prototype : les données expert sont enregistrées localement
            dans ce navigateur.
          </div>
        </div>

        <div className="expertDashboard__header">
          <div>
            <p className="expertDashboard__eyebrow">Vue cabinet</p>
            <h2>Tableau de bord</h2>
            <p className="expertDashboard__subtitle">
              Synthèse des priorités, risques et signaux de la semaine.
            </p>
          </div>
        </div>

        {clients.length === 0 ? (
          <>
            {renderEmptyState()}
            {renderAddClientModal()}
          </>
        ) : (
        <div className="expertOverviewGrid">
          <section className="expertOverviewCard expertOverviewCard--wide">
            <div className="expertOverviewHeader">
              <div>
                <p className="expertDashboard__eyebrow">Priorités du jour</p>
                <h3>Actions urgentes</h3>
              </div>
              <span className="expertOverviewCount">
                {dailyPriorities.length}
              </span>
            </div>

            {dailyPriorities.length > 0 ? (
              <ul className="expertPriorityBoard">
                {dailyPriorities.map((priority) => (
                  <li key={`priority-${priority.id}`}>
                    <span
                      className={`expertBadge expertBadge--${priority.risk.status}`}
                    >
                      {priority.risk.label}
                    </span>
                    <div>
                      <strong>{priority.clientName}</strong>
                      <p>{priority.action}</p>
                      {priority.risk.recommendedAction && (
                        <p className="expertRecommendedAction">
                          {priority.risk.recommendedAction}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="expertOverviewEmpty">
                Aucune priorité urgente pour le moment.
              </p>
            )}
          </section>

          <section className="expertOverviewCard">
            <div className="expertOverviewHeader">
              <div>
                <p className="expertDashboard__eyebrow">Alertes globales</p>
                <h3>Risques</h3>
              </div>
            </div>

            <div className="expertAlertSummary">
              {globalAlerts.map((alert) => (
                <div className="expertAlertSummaryItem" key={alert.label}>
                  <span>{alert.label}</span>
                  <strong>{alert.value}</strong>
                  <p>{alert.helper}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="expertOverviewCard expertOverviewCard--full">
            <div className="expertOverviewHeader">
              <div>
                <p className="expertDashboard__eyebrow">Activité de la semaine</p>
                <h3>Résumé KPI</h3>
              </div>
            </div>

            <div className="expertKpis expertKpis--compact">
              <div className="expertKpiCard">
                <span>Clients suivis</span>
                <strong>{kpis.clientsSuivis}</strong>
              </div>
              <div className="expertKpiCard">
                <span>Actions cette semaine</span>
                <strong>{kpis.actionsCetteSemaine}</strong>
              </div>
              <div className="expertKpiCard">
                <span>Relances effectuées</span>
                <strong>{cabinetStats.remindersCount}</strong>
              </div>
              <div className="expertKpiCard">
                <span>Notes ajoutées</span>
                <strong>{cabinetStats.notesCount}</strong>
              </div>
              <div className="expertKpiCard">
                <span>Dossiers mis à jour</span>
                <strong>{cabinetStats.updatesCount}</strong>
              </div>
            </div>
          </section>
        </div>
        )}
      </section>
    );
  }

  if (view === "alertes") {
    return (
      <section className="expertDashboard">
        <div className="expertDashboard__header">
          <div>
            <p className="expertDashboard__eyebrow">Risk monitoring</p>
            <h2>Alertes cabinet</h2>
            <p className="expertDashboard__subtitle">
              Risques et actions à traiter en priorité
            </p>
          </div>
        </div>

        {clients.length === 0 ? (
          <>
            {renderEmptyState({
              text: "Aucun risque à traiter pour le moment, car aucun client n’a encore été ajouté.",
            })}
            {renderAddClientModal()}
          </>
        ) : (
        <div className="expertAlertGroups">
          {alertGroups.map((group) => (
            <section className="expertAlertGroup" key={group.key}>
              <div className="expertAlertGroupHeader">
                <div>
                  <h3>{group.title}</h3>
                  <p>{group.description}</p>
                </div>
                <span className="expertOverviewCount">
                  {group.clients.length}
                </span>
              </div>

              {group.clients.length > 0 ? (
                <div className="expertAlertList">
                  {group.clients.map((client) => (
                    <article className="expertAlertItem" key={client.id}>
                      <div className="expertAlertItemMain">
                        <div>
                          <h4>{client.name}</h4>
                          <p>
                            {getClientNextAction(client)}
                          </p>
                          <p className="expertRecommendedAction">
                            {getClientRisk(client).recommendedAction}
                          </p>
                        </div>
                        <span
                          className={`expertBadge expertBadge--${getClientRisk(client).status}`}
                        >
                          {getClientRisk(client).label}
                        </span>
                      </div>

                      <button
                        type="button"
                        className="btn btnPrimary btnSmall"
                        onClick={() => handleOpenClientFromAlert(client)}
                      >
                        Voir fiche
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="expertAlertEmpty">
                  Aucun dossier dans ce groupe.
                </div>
              )}
            </section>
          ))}
        </div>
        )}
      </section>
    );
  }

  if (view === "echeancier") {
    const scheduleSections = [
      {
        key: "today",
        title: "Aujourd’hui",
        badge: "Urgent",
        items: cabinetSchedule.today,
      },
      {
        key: "thisWeek",
        title: "Cette semaine",
        badge: "Cette semaine",
        items: cabinetSchedule.thisWeek,
      },
      {
        key: "later",
        title: "Plus tard",
        badge: "Plus tard",
        items: cabinetSchedule.later,
      },
    ];
    const hasScheduledActions = scheduleSections.some(
      (section) => section.items.length > 0,
    );

    return (
      <section className="expertDashboard">
        <div className="expertDashboard__header">
          <div>
            <p className="expertDashboard__eyebrow">Pilotage cabinet</p>
            <h2>Échéancier cabinet</h2>
            <p className="expertDashboard__subtitle">
              Actions générées automatiquement à partir des dossiers clients
            </p>
          </div>
        </div>

        {clients.length === 0 ? (
          <>
            {renderEmptyState({
              text: "Ajoutez un client pour générer automatiquement l’échéancier du cabinet.",
            })}
            {renderAddClientModal()}
          </>
        ) : hasScheduledActions ? (
          <div className="expertSchedule">
            {scheduleSections.map((section) => (
              <section
                className={`expertScheduleGroup expertScheduleGroup--${section.key}`}
                key={section.key}
              >
                <div className="expertScheduleHeader">
                  <div>
                    <h3>{section.title}</h3>
                    <p>{section.items.length} action(s)</p>
                  </div>
                  <span className="expertActionPlanBadge">{section.badge}</span>
                </div>

                {section.items.length > 0 ? (
                  <div className="expertScheduleList">
                    {section.items.map((item, index) => (
                      <article
                        className="expertScheduleItem"
                        key={`${item.priority}-${item.clientId}-${item.action}-${index}`}
                      >
                        <div>
                          <h4>{item.clientName}</h4>
                          <p>{item.action}</p>
                        </div>
                        <button
                          type="button"
                          className="btn btnPrimary btnSmall"
                          onClick={() => handleOpenClientFromSchedule(item)}
                        >
                          Voir fiche
                        </button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="expertAlertEmpty">
                    Aucune action à planifier
                  </div>
                )}
              </section>
            ))}
          </div>
        ) : (
          <div className="expertEmptyState">Aucune action à planifier</div>
        )}
      </section>
    );
  }

  if (view === "notes") {
    return (
      <section className="expertDashboard">
        <div className="expertDashboard__header">
          <div>
            <p className="expertDashboard__eyebrow">Historique cabinet</p>
            <h2>Notes clients</h2>
            <p className="expertDashboard__subtitle">
              Suivi et historique des échanges
            </p>
          </div>
        </div>

        {clients.length === 0 ? (
          <>
            {renderEmptyState({
              text: "Ajoutez ou sélectionnez un client pour commencer à centraliser les notes.",
            })}
            {renderAddClientModal()}
          </>
        ) : (
        <div className="expertNotesWorkspace">
          <aside className="expertNotesClientList" aria-label="Clients">
            {clients.map((client) => (
              <button
                type="button"
                key={client.id}
                className={`expertNotesClientButton${
                  notesClient?.id === client.id
                    ? " expertNotesClientButton--active"
                    : ""
                }`}
                onClick={() => {
                  setNotesClientId(client.id);
                  setInlineNoteDraft("");
                  setInlineNoteError("");
                }}
              >
                <span className="expertNotesClientButtonTop">
                  <strong>{client.name}</strong>
                  <span className={`expertBadge expertBadge--${getClientRisk(client).status}`}>
                    {getClientRisk(client).label}
                  </span>
                </span>
                <small>{client.activity}</small>
                <small>{getClientNoteEntries(client).length} note(s)</small>
              </button>
            ))}
          </aside>

          <section className="expertNotesPanel">
            {notesClient ? (
              <>
                <div className="expertNotesPanelHeader">
                  <div>
                    <p className="expertDashboard__eyebrow">Client sélectionné</p>
                    <h3>{notesClient.name}</h3>
                  </div>
                  <span className={`expertBadge expertBadge--${getClientRisk(notesClient).status}`}>
                    {getClientRisk(notesClient).label}
                  </span>
                </div>

                <div className="expertNotesTimeline">
                  {notesClientEntries.length > 0 ? (
                    notesClientEntries.map((note, index) => (
                      <article
                        className="expertNoteEntry"
                        key={`${notesClient.id}-inline-note-${index}`}
                      >
                        <time>
                          {note.date
                            ? new Date(note.date).toLocaleDateString("fr-FR", {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                              })
                            : "Note existante"}
                        </time>
                        <p>{note.text}</p>
                      </article>
                    ))
                  ) : (
                    <div className="expertAlertEmpty">
                      Aucune note pour ce client.
                    </div>
                  )}
                </div>

                <div className="expertInlineNoteForm">
                  <label htmlFor="expert-inline-note">Nouvelle note</label>
                  <textarea
                    id="expert-inline-note"
                    className="expertModalTextarea"
                    value={inlineNoteDraft}
                    onChange={(event) => {
                      setInlineNoteDraft(event.target.value);
                      if (inlineNoteError) {
                        setInlineNoteError("");
                      }
                    }}
                    rows={5}
                    placeholder="Ex : Appelé le client, relance URSSAF prévue, attente de réponse..."
                  />
                  {inlineNoteError && (
                    <div className="expertModalError" role="alert">
                      {inlineNoteError}
                    </div>
                  )}
                  <div className="expertModalActions">
                    <button
                      type="button"
                      className="btn btnPrimary btnSmall"
                      onClick={handleAddInlineNote}
                    >
                      Ajouter note
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="expertAlertEmpty">
                Aucun client disponible pour ajouter une note.
              </div>
            )}
          </section>
        </div>
        )}

        {successMessage && (
          <div className="expertToast" role="status" aria-live="polite">
            <span>{successMessage}</span>
            <button
              type="button"
              className="expertToastClose"
              onClick={() => setSuccessMessage("")}
              aria-label="Fermer le message"
            >
              ✕
            </button>
          </div>
        )}
      </section>
    );
  }

  if (selectedClient) {
    const selectedClientActionPlan = getClientActionPlan(selectedClient);
    const actionPlanSections = [
      {
        key: "today",
        title: "Aujourd’hui",
        badge: "Urgent",
        actions: selectedClientActionPlan.today,
      },
      {
        key: "thisWeek",
        title: "Cette semaine",
        badge: "Cette semaine",
        actions: selectedClientActionPlan.thisWeek,
      },
      {
        key: "later",
        title: "Plus tard",
        badge: "Plus tard",
        actions: selectedClientActionPlan.later,
      },
    ].filter((section) => section.actions.length > 0);

    return (
      <section className="expertDashboard">
        <div className="expertBanner">
          Microassist Expert aide les professionnels à suivre plusieurs
          micro-entrepreneurs, repérer les risques et éviter les oublis côté
          client.
          <div className="expertBannerHint">
            Mode prototype : les données expert sont enregistrées localement
            dans ce navigateur.
          </div>
        </div>

        <div className="expertDetail">
          <div className="expertDetailActions">
            <button
              type="button"
              className="btn btnGhost btnSmall"
              onClick={() => setSelectedClientId(null)}
            >
              Retour à la liste
            </button>
            <button
              type="button"
              className="btn btnPrimary btnSmall"
              onClick={() => openEditClientModal(selectedClient)}
            >
              Modifier client
            </button>
            <button
              type="button"
              className="btn btnGhost btnSmall expertDangerButton"
              onClick={() => handleDeleteClient(selectedClient)}
            >
              Supprimer client
            </button>
          </div>

          <div className="expertDetailCard">
            <div className="expertDetailHeader">
              <div>
                <p className="expertDashboard__eyebrow">Fiche client</p>
                <h2>{selectedClient.name}</h2>
              </div>
              <span
                className={`expertBadge expertBadge--${getClientRisk(selectedClient).status}`}
              >
                {getClientRisk(selectedClient).label}
              </span>
            </div>

            <div className="expertDetailGrid">
              <div className="expertInfoBlock">
                <span>Chiffre d’affaires</span>
                <strong>{formatRevenue(selectedClient.revenue)}</strong>
              </div>
              <div className="expertInfoBlock">
                <span>Charges estimées</span>
                <strong>{formatCurrency(getEstimatedCharges(selectedClient))}</strong>
              </div>
              <div className="expertInfoBlock">
                <span>Périodicité</span>
                <strong>{selectedClient.periodicity || "Inconnue"}</strong>
              </div>
              <div className="expertInfoBlock">
                <span>TVA</span>
                <strong>{selectedClient.tva || "Inconnue"}</strong>
              </div>
              <div className="expertInfoBlock">
                <span>ACRE</span>
                <strong>{selectedClient.acre || "Inconnue"}</strong>
              </div>
              <div className="expertInfoBlock">
                <span>Prochaine action</span>
                <strong>
                  {getClientNextAction(selectedClient)}
                </strong>
              </div>
              <div className="expertInfoBlock">
                <span>Statut</span>
                <strong>{getClientRisk(selectedClient).label}</strong>
              </div>
            </div>

            <div className="expertPanelBlock">
              <h3>Notes expert</h3>
              {selectedClientNotes.length > 0 ? (
                <ul className="expertNotesList">
                  {selectedClientNotes.map((note, index) => (
                    <li key={`${selectedClient.id}-note-${index}`}>
                      <span className="expertNoteDate">
                        {note.date
                          ? new Date(note.date).toLocaleDateString("fr-FR", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })
                          : "Note existante"}
                      </span>
                      {note.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Aucune note pour ce client.</p>
              )}
            </div>

            <div className="expertPanelBlock">
              <h3>Smart Priorités</h3>
              <ul className="expertPriorityList">
                {getComputedPriorities(
                  selectedClient,
                  getClientRisk(selectedClient).status,
                ).map((priority) => (
                  <li key={priority}>{priority}</li>
                ))}
              </ul>
            </div>

            <div className="expertPanelBlock">
              <h3>Plan d’action</h3>
              <div className="expertActionPlan">
                {actionPlanSections.map((section) => (
                  <section
                    className={`expertActionPlanGroup expertActionPlanGroup--${section.key}`}
                    key={section.key}
                  >
                    <div className="expertActionPlanHeader">
                      <h4>{section.title}</h4>
                      <span className="expertActionPlanBadge">{section.badge}</span>
                    </div>
                    <ul>
                      {section.actions.map((action) => (
                        <li key={action}>{action}</li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </div>

            <div className="expertPanelBlock">
              <h3>Historique des actions</h3>
              {selectedClientHistory.length === 0 ? (
                <p className="expertHistoryEmpty">Aucune action pour ce client.</p>
              ) : (
                <div className="expertHistoryGroups">
                  {selectedClientHistoryGroups.map((group) => (
                    <section className="expertHistoryGroup" key={group.label}>
                      <h4>{group.label}</h4>
                      <ul className="expertHistoryList">
                        {group.items.map((event, index) => (
                          <li
                            key={`${event.type}-${event.date}-${index}`}
                          >
                            <span className="expertHistoryText">
                              {event.label}
                            </span>
                            <span className="expertHistoryDate">
                              {new Date(event.date).toLocaleTimeString("fr-FR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {successMessage && (
          <div className="expertToast" role="status" aria-live="polite">
            <span>{successMessage}</span>
            <button
              type="button"
              className="expertToastClose"
              onClick={() => setSuccessMessage("")}
              aria-label="Fermer le message"
            >
              ✕
            </button>
          </div>
        )}

        {renderAddClientModal()}
      </section>
    );
  }

  return (
    <section className="expertDashboard">
      <div className="expertBanner">
        Microassist Expert aide les professionnels à suivre plusieurs
        micro-entrepreneurs, repérer les risques et éviter les oublis côté
        client.
        <div className="expertBannerHint">
          Mode prototype : les données expert sont enregistrées localement dans
          ce navigateur.
        </div>
      </div>

      <div className="expertDashboard__header">
        <div>
          <p className="expertDashboard__eyebrow">Mode expert</p>
          <h2>Portefeuille clients</h2>
          <p className="expertDashboard__subtitle">
            Suivi des dossiers micro-entrepreneurs
          </p>
        </div>
        <button
          type="button"
          className="btn btnPrimary btnSmall"
          onClick={openAddClientModal}
        >
          + Ajouter client
        </button>
      </div>

      {clients.length === 0 ? (
        renderEmptyState()
      ) : (
      <>
      <div className="expertKpis">
        <div className="expertKpiCard">
          <span>Clients suivis</span>
          <strong>{kpis.clientsSuivis}</strong>
        </div>
        <div className="expertKpiCard">
          <span>Dossiers en retard</span>
          <strong>{kpis.enRetard}</strong>
        </div>
        <div className="expertKpiCard">
          <span>Risques TVA</span>
          <strong>{kpis.risqueTva}</strong>
        </div>
        <div className="expertKpiCard">
          <span>Actions à traiter</span>
          <strong>{kpis.actionsCetteSemaine}</strong>
        </div>
      </div>

      <div className="expertFilters">
        <div className="expertSearch">
          <label className="expertSearchLabel" htmlFor="expert-client-search">
            Recherche client
          </label>
          <input
            id="expert-client-search"
            type="text"
            className="expertSearchInput"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Rechercher un client..."
          />
        </div>
        <div className="expertFilterList" role="tablist" aria-label="Filtres clients">
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`expertFilterButton ${
                activeFilter === filter.key ? "expertFilterButton--active" : ""
              }`}
              onClick={() => setActiveFilter(filter.key)}
              aria-pressed={activeFilter === filter.key}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="expertFilterCount">
          {visibleClients.length} dossier(s) affiché(s)
        </div>
      </div>

      <div className="expertDashboard__grid">
        {visibleClients.map((client) => (
          <article
            key={client.id}
            className={`expertCard expertCard--${getClientRisk(client).status}`}
          >
            <div className="expertCard__top">
              <div>
                <h3>{client.name}</h3>
                <p>{client.activity}</p>
              </div>
              <span className={`expertBadge expertBadge--${getClientRisk(client).status}`}>
                {getClientRisk(client).label}
              </span>
            </div>

            <div className="expertCard__body">
              <div>
                <span>Chiffre d’affaires</span>
                <strong>{formatRevenue(client.revenue)}</strong>
              </div>
              <div>
                <span>Charges estimées</span>
                <strong>{formatCurrency(getEstimatedCharges(client))}</strong>
              </div>
              <div>
                <span>Prochaine action</span>
                <strong>
                  {getClientNextAction(client)}
                </strong>
              </div>
            </div>

            <div className="expertCard__actions">
              <button
                type="button"
                className="btn btnPrimary btnSmall"
                onClick={() => setSelectedClientId(client.id)}
              >
                Voir fiche
              </button>
              <button
                type="button"
                className="btn btnGhost btnSmall"
                onClick={() => openReminderModal(client)}
              >
                Envoyer rappel
              </button>
              <button
                type="button"
                className="btn btnGhost btnSmall"
                onClick={() => openNoteModal(client)}
              >
                Ajouter note
              </button>
              <button
                type="button"
                className="btn btnGhost btnSmall expertDangerButton"
                onClick={() => handleDeleteClient(client)}
              >
                Supprimer client
              </button>
            </div>
          </article>
        ))}

        {visibleClients.length === 0 && (
          <div className="expertEmptyState">Aucun dossier pour cette recherche.</div>
        )}
      </div>
      </>
      )}

      {successMessage && (
        <div className="expertToast" role="status" aria-live="polite">
          <span>{successMessage}</span>
          <button
            type="button"
            className="expertToastClose"
            onClick={() => setSuccessMessage("")}
            aria-label="Fermer le message"
          >
            ✕
          </button>
        </div>
      )}

      {reminderClient && (
        <div className="expertModalOverlay" role="presentation">
          <div
            className="expertModalCard"
            role="dialog"
            aria-modal="true"
            aria-labelledby="expert-reminder-title"
          >
            <div className="expertModalHeader">
              <div>
                <h3 id="expert-reminder-title">Rappel client</h3>
                <p className="expertModalSubtitle">{reminderClient.name}</p>
              </div>
              <button
                type="button"
                className="btn btnGhost btnSmall"
                onClick={closeReminderModal}
              >
                Fermer
              </button>
            </div>

            <div className="expertModalField">
              <label htmlFor="expert-reminder-message">Message</label>
              <textarea
                id="expert-reminder-message"
                className="expertModalTextarea"
                value={reminderMessage}
                onChange={(event) => setReminderMessage(event.target.value)}
                rows={8}
              />
            </div>

            <div className="expertModalActions">
              <button
                type="button"
                className="btn btnGhost btnSmall"
                onClick={closeReminderModal}
              >
                Fermer
              </button>
              <button
                type="button"
                className="btn btnPrimary btnSmall"
                onClick={handleCopyReminderMessage}
              >
                Copier
              </button>
            </div>
          </div>
        </div>
      )}

      {renderAddClientModal()}

      {noteClient && (
        <div className="expertModalOverlay" role="presentation">
          <div
            className="expertModalCard"
            role="dialog"
            aria-modal="true"
            aria-labelledby="expert-add-note-title"
          >
            <div className="expertModalHeader">
              <div>
                <h3 id="expert-add-note-title">Ajouter une note</h3>
                <p className="expertModalSubtitle">{noteClient.name}</p>
              </div>
              <button
                type="button"
                className="btn btnGhost btnSmall"
                onClick={closeNoteModal}
              >
                Fermer
              </button>
            </div>

            <div className="expertModalField">
              <label htmlFor="expert-note-message">Note expert</label>
              <textarea
                id="expert-note-message"
                className="expertModalTextarea"
                value={noteDraft}
                onChange={(event) => {
                  setNoteDraft(event.target.value);
                  if (noteError) {
                    setNoteError("");
                  }
                }}
                rows={5}
              />
            </div>

            {noteError && (
              <div className="expertModalError" role="alert">
                {noteError}
              </div>
            )}

            <div className="expertModalActions">
              <button
                type="button"
                className="btn btnGhost btnSmall"
                onClick={closeNoteModal}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn btnPrimary btnSmall"
                onClick={handleAddNote}
              >
                Ajouter la note
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
