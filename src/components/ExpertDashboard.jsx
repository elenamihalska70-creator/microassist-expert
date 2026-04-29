import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import "./ExpertDashboard.css";
import robotoBoldUrl from "../assets/fonts/Roboto-Bold.ttf?url";
import robotoRegularUrl from "../assets/fonts/Roboto-Regular.ttf?url";
import { supabase } from "../lib/supabase";

export const EXPERT_CLIENTS_STORAGE_KEY = "microassist_expert_clients_v1";
export const EXPERT_HISTORY_STORAGE_KEY = "microassist_expert_history";
export const EXPERT_CLIENTS_REPLACED_EVENT = "microassist:clients-replaced";
export const LEGACY_EXPERT_CLIENTS_STORAGE_KEY = "microassist_expert_clients";

const PDF_FONT_FAMILY = "Roboto";
const PDF_FONT_FILES = {
  normal: "Roboto-Regular.ttf",
  bold: "Roboto-Bold.ttf",
};
let pdfFontCache = null;

const FILTERS = [
  { key: "all", label: "Tous" },
  { key: "priority", label: "Prioritaire" },
  { key: "watch", label: "À surveiller" },
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
const CLIENT_TYPE_OPTIONS = [
  "Standard",
  "À surveiller",
  "Prioritaire",
  "Nouveau client",
];

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
  region: "Non renseignée",
  clientType: "Standard",
  note: "",
  siret: "",
  regime: "inconnu",
  activityType: "",
  tvaThresholdMode: "auto",
  chargeRate: "",
  assignedTo: "Non assigné",
  dataSource: "manual",
};

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

const DEFAULT_INVOICE_FORM = {
  amount: "",
  status: "draft",
  issuedAt: getTodayIsoDate(),
};

const CSV_TEMPLATE_COLUMNS = [
  "name",
  "activity",
  "revenue",
  "region",
  "client_type",
  "periodicity",
  "tva_status",
  "acre_status",
  "next_action",
  "risk_score",
];

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    activity: "Prestations de services",
    periodicity: "Mensuelle",
    revenue: 4850,
    estimatedCharges: 1067,
    lastDeclarationDate: "2026-04-05",
    tva: "Non applicable",
    acre: "Non",
    status: "ok",
    riskScore: 25,
    riskLabel: "OK",
    nextAction: "Suivi mensuel à maintenir",
    notes: [
      {
        id: "seed-note-1",
        date: "2026-04-22T09:30:00.000Z",
        createdAt: "2026-04-22T09:30:00.000Z",
        text: "Cliente autonome, peu de relances nécessaires.",
      },
    ],
    actions: [
      {
        id: "seed-action-1",
        text: "Vérifier la prochaine échéance URSSAF",
        status: "todo",
        createdAt: "2026-04-24T10:00:00.000Z",
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
    activity: "Vente / commerce",
    periodicity: "Mensuelle",
    revenue: 12400,
    estimatedCharges: 1525,
    lastDeclarationDate: "2026-04-01",
    tva: "Non applicable",
    acre: "Non",
    status: "tva",
    riskScore: 80,
    riskLabel: "Risque TVA",
    nextAction: "Vérifier le seuil TVA",
    notes: [
      {
        id: "seed-note-2",
        date: "2026-04-21T14:10:00.000Z",
        createdAt: "2026-04-21T14:10:00.000Z",
        text: "CA en hausse, surveiller le passage de seuil.",
      },
    ],
    actions: [
      {
        id: "seed-action-2",
        text: "Préparer un point TVA avec le client",
        status: "todo",
        createdAt: "2026-04-18T08:30:00.000Z",
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
    periodicity: "Mensuelle",
    revenue: 2100,
    estimatedCharges: 462,
    lastDeclarationDate: "2026-02-10",
    tva: "Non applicable",
    acre: "Oui",
    status: "late",
    riskScore: 90,
    riskLabel: "En retard",
    nextAction: "Déclaration en retard à régulariser",
    notes: [
      {
        id: "seed-note-3",
        date: "2026-04-20T08:45:00.000Z",
        createdAt: "2026-04-20T08:45:00.000Z",
        text: "Besoin d’un rappel rapide cette semaine.",
      },
    ],
    actions: [
      {
        id: "seed-action-3",
        text: "Relancer pour les justificatifs manquants",
        status: "todo",
        createdAt: "2026-04-11T09:15:00.000Z",
      },
      {
        id: "seed-action-4",
        text: "Préparer la régularisation URSSAF",
        status: "todo",
        createdAt: "2026-04-19T11:00:00.000Z",
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
    activity: "Artisanat",
    periodicity: "Trimestrielle",
    revenue: 6320,
    estimatedCharges: 1390,
    lastDeclarationDate: "2026-03-28",
    tva: "Non applicable",
    acre: "Non",
    status: "ok",
    riskScore: 30,
    riskLabel: "OK",
    nextAction: "Préparer l’échéance CFE",
    notes: [
      {
        id: "seed-note-4",
        date: "2026-04-18T16:00:00.000Z",
        createdAt: "2026-04-18T16:00:00.000Z",
        text: "RAS, dossier stable.",
      },
      {
        id: "seed-note-5",
        date: "2026-04-12T15:20:00.000Z",
        createdAt: "2026-04-12T15:20:00.000Z",
        text: "Prévoir un point CFE avant la prochaine échéance.",
      },
    ],
    actions: [
      {
        id: "seed-action-5",
        text: "Préparer le contrôle CFE",
        status: "done",
        createdAt: "2026-04-12T15:30:00.000Z",
        doneAt: "2026-04-18T16:10:00.000Z",
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
    periodicity: "Trimestrielle",
    revenue: 8970,
    estimatedCharges: 1615,
    lastDeclarationDate: "",
    tva: "Inconnue",
    acre: "Oui",
    status: "warning",
    riskScore: 55,
    riskLabel: "Alerte",
    nextAction: "Contrôler les charges estimées",
    notes: [
      {
        id: "seed-note-6",
        date: "2026-04-17T10:15:00.000Z",
        createdAt: "2026-04-17T10:15:00.000Z",
        text: "Activité mixte, points de vigilance sur le suivi.",
      },
    ],
    actions: [
      {
        id: "seed-action-6",
        text: "Ventiler les ventes et prestations du trimestre",
        status: "todo",
        createdAt: "2026-04-23T14:00:00.000Z",
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
    name: "Karim Benali",
    activity: "Profession libérale",
    periodicity: "Trimestrielle",
    revenue: 7420,
    estimatedCharges: 1632,
    lastDeclarationDate: "2026-04-03",
    tva: "Non applicable",
    acre: "Non",
    status: "ok",
    riskScore: 35,
    riskLabel: "OK",
    nextAction: "Suivi régulier à maintenir",
    notes: [
      {
        id: "seed-note-7",
        date: "2026-04-23T11:40:00.000Z",
        createdAt: "2026-04-23T11:40:00.000Z",
        text: "Consultant indépendant, suivi trimestriel sans anomalie.",
      },
    ],
    actions: [
      {
        id: "seed-action-7",
        text: "Revoir les frais professionnels déclarés",
        status: "todo",
        createdAt: "2026-04-25T09:00:00.000Z",
      },
    ],
    updatedAt: "2026-04-23T11:40:00.000Z",
    priorities: [
      "Maintenir le suivi trimestriel",
      "Vérifier les frais professionnels",
    ],
  },
];

const demoClients = seedClients;

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

function getClientChargeRate(client) {
  const manualRate = Number(client?.chargeRate);

  if (!Number.isNaN(manualRate) && manualRate > 0) {
    return manualRate / 100;
  }

  return getChargeRate(client?.activity);
}

function getEstimatedCharges(client) {
  if (typeof client?.estimatedCharges === "number") {
    return client.estimatedCharges;
  }

  return Math.round(parseRevenueValue(client?.revenue) * getClientChargeRate(client));
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

  if (revenueValue >= 8000) {
    return "warning";
  }

  return "ok";
}

function getComputedNextAction(client, status = getComputedClientStatus(client)) {
  if (status === "tva") {
    return "Vérifier le seuil TVA";
  }

  if (status === "warning") {
    return "Contrôler les charges estimées";
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
    region: formData.region?.trim() || "Non renseignée",
    clientType: formData.clientType || formData.client_type || "Standard",
    client_type: formData.clientType || formData.client_type || "Standard",
    siret: formData.siret?.trim() || "",
    regime: formData.regime || "inconnu",
    activityType: formData.activityType || "",
    tvaThresholdMode: formData.tvaThresholdMode || "auto",
    chargeRate: formData.chargeRate === "" ? "" : Number(formData.chargeRate),
    assignedTo: formData.assignedTo || "Non assigné",
    dataSource: "manual",
  };
  const estimatedCharges = Math.round(revenue * getClientChargeRate(clientDraft));
  const status = getComputedClientStatus(clientDraft);
  const nextAction = getComputedNextAction(clientDraft, status);
  const priorities = getComputedPriorities(clientDraft, status);
  const riskScore = revenue >= 12000 ? 80 : revenue >= 8000 ? 55 : 30;
  const riskLabel =
    riskScore >= 80 ? "Risque TVA" : riskScore >= 55 ? "Alerte" : "OK";
  const note = formData.note?.trim();

  return {
    ...clientDraft,
    estimatedCharges,
    status,
    riskScore,
    riskLabel,
    nextAction,
    priorities,
    notes: note || "Dossier ajouté automatiquement par l’assistant client.",
    notesList: note
      ? [
          {
            date: new Date().toISOString(),
            text: note,
          },
        ]
      : [],
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

function getClientRiskScore(client) {
  const status = getClientRisk(client).status;
  let score = 20;

  if (status === "warning") {
    score += 25;
  }

  if (status === "tva") {
    score += 35;
  }

  if (status === "late") {
    score += 50;
  }

  if (client?.acre === "Oui") {
    score += 10;
  }

  if (parseRevenueValue(client?.revenue) >= 12000) {
    score += 15;
  }

  if (!client?.lastDeclarationDate) {
    score += 10;
  }

  score = Math.min(score, 100);

  if (score <= 30) {
    return { score, level: "low", label: "Risque faible" };
  }

  if (score <= 60) {
    return { score, level: "medium", label: "Risque moyen" };
  }

  if (score <= 80) {
    return { score, level: "high", label: "Risque élevé" };
  }

  return { score, level: "critical", label: "Risque critique" };
}

function getClientPriority(client) {
  const todoActions = Array.isArray(client?.actions) ? getClientActions(client) : [];
  const hasLateTodoAction = todoActions.some(
    (action) => action.status !== "done" && isOlderThanDays(action.createdAt, 7),
  );
  const risk = getClientRisk(client);
  const riskScore = getClientRiskScore(client);
  const normalizedRiskLabel = client?.riskLabel || risk.label;
  const normalizedRiskScore = Number(client?.riskScore ?? riskScore.score);

  if (hasLateTodoAction) {
    return {
      level: "danger",
      status: "late",
      label: "Action en retard",
      message: "Une action est ouverte depuis plus de 7 jours.",
      score: 100,
      hasLateTodoAction: true,
    };
  }

  if (normalizedRiskLabel === "En retard" || risk.status === "late") {
    return {
      level: "danger",
      status: "late",
      label: "Dossier en retard",
      message: client?.nextAction || "Déclaration à vérifier ou régulariser",
      score: 90,
      hasLateTodoAction: false,
    };
  }

  if (normalizedRiskLabel === "Risque TVA" || risk.status === "tva") {
    return {
      level: "warning",
      status: "tva",
      label: "Risque TVA",
      message: "Vérifier les seuils TVA et préparer la facturation.",
      score: 80,
      hasLateTodoAction: false,
    };
  }

  if (normalizedRiskScore >= 55) {
    return {
      level: "warning",
      status: "warning",
      label: "Point de vigilance",
      message: "Contrôler le point de vigilance avant échéance.",
      score: 55,
      hasLateTodoAction: false,
    };
  }

  return {
    level: "ok",
    status: "ok",
    label: "OK",
    message: "Continuer le suivi régulier du dossier.",
    score: 20,
    hasLateTodoAction: false,
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

function getClientFileSummary(client) {
  const risk = getClientRisk(client);
  const riskScore = getClientRiskScore(client);
  const riskLabel = client?.riskLabel || risk.label;
  const actions = getClientActions(client);
  const todoActions = actions.filter((action) => action.status !== "done");
  const doneActionsCount = actions.filter((action) => action.status === "done").length;
  const notesCount = getClientNoteEntries(client).length;
  const nextAction =
    todoActions[0]?.text || client?.nextAction || "Aucune action urgente.";
  let situation = "Dossier globalement stable.";
  let vigilance = "Continuer le suivi régulier.";

  if (riskLabel === "Risque TVA" || risk.status === "tva") {
    situation = "Chiffre d’affaires à surveiller.";
    vigilance = "Vérifier les seuils TVA.";
  } else if (riskLabel === "En retard" || risk.status === "late") {
    situation = "Dossier nécessitant une action rapide.";
    vigilance = "Un retard ou une action non traitée est détecté.";
  } else if (riskLabel === "Alerte" || risk.status === "warning") {
    situation = "Dossier avec un point de vigilance.";
    vigilance = "Contrôler les éléments sensibles avant échéance.";
  }

  return [
    {
      label: "Situation actuelle",
      text: `${situation} CA suivi : ${formatRevenue(client?.revenue)}. Score ${riskScore.score}/100.`,
    },
    {
      label: "Point de vigilance",
      text: `${vigilance} ${todoActions.length} action(s) à faire, ${doneActionsCount} terminée(s), ${notesCount} note(s).`,
    },
    {
      label: "Prochaine action recommandée",
      text: nextAction,
    },
  ];
}

function normalizeClientName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function getClientRegion(client) {
  return client?.region || "Non renseignée";
}

function getClientType(client) {
  return client?.clientType || client?.client_type || "Standard";
}

function parseCsvLine(line, separator) {
  const values = [];
  let currentValue = "";
  let isQuoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && nextCharacter === '"') {
      currentValue += '"';
      index += 1;
    } else if (character === '"') {
      isQuoted = !isQuoted;
    } else if (character === separator && !isQuoted) {
      values.push(currentValue.trim());
      currentValue = "";
    } else {
      currentValue += character;
    }
  }

  values.push(currentValue.trim());
  return values;
}

function parseClientsCsv(csvText) {
  const lines = String(csvText || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return {
      validRows: [],
      invalidRows: [{ rowNumber: 1, reason: "Fichier vide." }],
      missingColumns: CSV_TEMPLATE_COLUMNS.slice(0, 3),
    };
  }

  const headerLine = lines[0];
  const separator =
    (headerLine.match(/;/g) || []).length > (headerLine.match(/,/g) || []).length
      ? ";"
      : ",";
  const headers = parseCsvLine(headerLine, separator).map((header) =>
    header.trim().toLowerCase(),
  );
  const missingColumns = ["name", "activity", "revenue"].filter(
    (column) => !headers.includes(column),
  );

  if (missingColumns.length > 0) {
    return { validRows: [], invalidRows: [], missingColumns };
  }

  const validRows = [];
  const invalidRows = [];

  lines.slice(1).forEach((line, index) => {
    const rowNumber = index + 2;
    const values = parseCsvLine(line, separator);
    const row = headers.reduce((entry, header, valueIndex) => {
      entry[header] = values[valueIndex]?.trim() || "";
      return entry;
    }, {});
    const revenue = parseRevenueValue(row.revenue);

    if (!row.name || !row.activity || !revenue || revenue <= 0) {
      invalidRows.push({
        rowNumber,
        reason: "name, activity et revenue sont requis.",
      });
      return;
    }

    validRows.push({
      rowNumber,
      name: row.name,
      activity: row.activity,
      revenue,
      region: row.region || "Non renseignée",
      clientType: row.client_type || "Standard",
      client_type: row.client_type || "Standard",
      periodicity: row.periodicity || "Inconnue",
      tva: row.tva_status || "Inconnue",
      acre: row.acre_status || "Inconnue",
      nextAction: row.next_action || "Aucune action urgente",
      riskScore: row.risk_score ? Number(row.risk_score) : null,
    });
  });

  return { validRows, invalidRows, missingColumns: [] };
}

function createClientHistoryEntry(entry) {
  const entryDate = entry.date ? new Date(entry.date) : new Date();

  return {
    id: entry.id || createUuid() || `history-${Date.now()}`,
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

function RiskScoreIndicator({ client, compact = false }) {
  const riskScore = getClientRiskScore(client);

  return (
    <div
      className={`expertRiskScore expertRiskScore--${riskScore.level}${
        compact ? " expertRiskScore--compact" : ""
      }`}
      aria-label={`${riskScore.label} : ${riskScore.score} sur 100`}
    >
      <div className="expertRiskScoreTop">
        <span>{riskScore.label}</span>
        <strong>{riskScore.score}/100</strong>
      </div>
      <div className="expertRiskScoreTrack" aria-hidden="true">
        <span style={{ width: `${riskScore.score}%` }} />
      </div>
    </div>
  );
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

function createClientAction(text, status = "todo") {
  const now = new Date().toISOString();

  return {
    id: createUuid() || `action-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text,
    status,
    createdAt: now,
    ...(status === "done" ? { doneAt: now } : {}),
  };
}

function createStableActionId(client, text, index, prefix = "computed-action") {
  const safeText = String(text || "action")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return `${prefix}-${client?.id || "client"}-${index}-${safeText || "action"}`;
}

function getClientActions(client) {
  if (!client) return [];

  if (Array.isArray(client.actions)) {
    return client.actions
      .map((action, index) => {
        if (typeof action === "string") {
          return {
            id: createStableActionId(client, action, index, "legacy-action"),
            text: action,
            status: "todo",
            createdAt: client.updatedAt || new Date().toISOString(),
          };
        }

        return {
          id:
            action.id ||
            createStableActionId(client, action.text || "", index, "legacy-action"),
          text: action.text || "",
          status: action.status === "done" ? "done" : "todo",
          createdAt: action.createdAt || new Date().toISOString(),
          doneAt: action.doneAt,
        };
      })
      .filter((action) => action.text);
  }

  const plan = getClientActionPlan(client);

  return [...plan.today, ...plan.thisWeek, ...plan.later].map((action, index) => ({
    id: createStableActionId(client, action, index),
    text: action,
    status: "todo",
    createdAt: client.updatedAt || new Date().toISOString(),
  }));
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
      id: note.id || null,
      date: note.createdAt || note.date || null,
      createdAt: note.createdAt || note.date || null,
      text: note.text || "",
    };
  }

  return {
    date: null,
    createdAt: null,
    text: String(note || ""),
  };
}

function getClientNoteEntries(client) {
  if (!client) return [];

  if (Array.isArray(client.notesList) && client.notesList.length > 0) {
    return client.notesList
      .map(normalizeNoteEntry)
      .filter((note) => note.text)
      .sort((firstNote, secondNote) => {
        const firstTime = firstNote.createdAt ? new Date(firstNote.createdAt).getTime() : 0;
        const secondTime = secondNote.createdAt ? new Date(secondNote.createdAt).getTime() : 0;

        return secondTime - firstTime;
      });
  }

  if (Array.isArray(client.notes)) {
    return client.notes
      .map(normalizeNoteEntry)
      .filter((note) => note.text)
      .sort((firstNote, secondNote) => {
        const firstTime = firstNote.createdAt ? new Date(firstNote.createdAt).getTime() : 0;
        const secondTime = secondNote.createdAt ? new Date(secondNote.createdAt).getTime() : 0;

        return secondTime - firstTime;
      });
  }

  return client.notes ? [{ date: null, text: client.notes }] : [];
}

function normalizeInvoiceEntry(invoice, index = 0) {
  if (!invoice || typeof invoice !== "object") {
    return null;
  }

  const amount = Number(invoice.amount ?? invoice.total ?? invoice.totalAmount ?? 0);
  const statusValue = invoice.status || invoice.state || "non_transmis";
  const statusLabels = {
    draft: "Brouillon",
    brouillon: "Brouillon",
    pdf_generated: "PDF généré",
    pdf: "PDF généré",
    facturx_ready: "Factur-X prêt",
    factur_x_ready: "Factur-X prêt",
    sent: "Factur-X prêt",
    not_sent: "non transmis",
    non_transmis: "non transmis",
  };
  const hasTva =
    invoice.hasTva === true ||
    invoice.tvaIncluded === true ||
    Number(invoice.tvaAmount || 0) > 0;

  return {
    id: invoice.id || `invoice-${index}`,
    clientName: invoice.clientName || invoice.client_name || "",
    date: invoice.date || invoice.invoiceDate || invoice.issuedAt || invoice.issued_at || invoice.createdAt || null,
    issuedAt: invoice.issuedAt || invoice.issued_at || invoice.date || invoice.invoiceDate || null,
    amount: Number.isNaN(amount) ? 0 : amount,
    status: statusLabels[statusValue] || statusValue || "non transmis",
    rawStatus: statusValue,
    tvaLabel: hasTva ? "TVA incluse" : "TVA non applicable",
    pdfUrl: invoice.pdfUrl || invoice.pdf_url || invoice.url || "",
    downloadUrl: invoice.downloadUrl || invoice.download_url || invoice.pdfUrl || invoice.pdf_url || "",
  };
}

function getClientInvoiceEntries(client) {
  if (!client || !Array.isArray(client.invoices)) {
    return [];
  }

  return client.invoices
    .map(normalizeInvoiceEntry)
    .filter(Boolean)
    .sort((firstInvoice, secondInvoice) => {
      const firstTime = firstInvoice.date ? new Date(firstInvoice.date).getTime() : 0;
      const secondTime = secondInvoice.date ? new Date(secondInvoice.date).getTime() : 0;

      return secondTime - firstTime;
    });
}

function formatNoteDate(dateValue) {
  if (!dateValue) return "Note existante";

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Note existante";

  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const noteDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysDifference = Math.floor(
    (todayDate.getTime() - noteDate.getTime()) / MILLISECONDS_PER_DAY,
  );

  if (daysDifference === 0) return "Aujourd’hui";
  if (daysDifference === 1) return "Hier";

  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatRevenue(revenue) {
  return formatCurrency(parseRevenueValue(revenue));
}

function isWithinLastDays(dateValue, days) {
  if (!dateValue) return false;

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;

  return Date.now() - date.getTime() <= days * MILLISECONDS_PER_DAY;
}

function isOlderThanDays(dateValue, days) {
  if (!dateValue) return false;

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;

  return Date.now() - date.getTime() > days * MILLISECONDS_PER_DAY;
}

function formatLongDateTimeFr(dateValue = new Date()) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "Date inconnue";
  }

  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function getPdfFontData() {
  if (pdfFontCache) {
    return pdfFontCache;
  }

  const [regularResponse, boldResponse] = await Promise.all([
    fetch(robotoRegularUrl),
    fetch(robotoBoldUrl),
  ]);

  if (!regularResponse.ok || !boldResponse.ok) {
    throw new Error("PDF font files could not be loaded.");
  }

  const [regularBuffer, boldBuffer] = await Promise.all([
    regularResponse.arrayBuffer(),
    boldResponse.arrayBuffer(),
  ]);

  pdfFontCache = {
    normal: arrayBufferToBase64(regularBuffer),
    bold: arrayBufferToBase64(boldBuffer),
  };

  return pdfFontCache;
}

async function configurePdfFont(doc) {
  try {
    const fontData = await getPdfFontData();

    doc.addFileToVFS(PDF_FONT_FILES.normal, fontData.normal);
    doc.addFont(PDF_FONT_FILES.normal, PDF_FONT_FAMILY, "normal");
    doc.addFileToVFS(PDF_FONT_FILES.bold, fontData.bold);
    doc.addFont(PDF_FONT_FILES.bold, PDF_FONT_FAMILY, "bold");
    doc.setFont(PDF_FONT_FAMILY, "normal");

    return PDF_FONT_FAMILY;
  } catch {
    doc.setFont("helvetica", "normal");
    return "helvetica";
  }
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
    region: getClientRegion(client),
    clientType: getClientType(client),
    note: "",
    siret: client?.siret || "",
    regime: client?.regime || "inconnu",
    activityType: client?.activityType || "",
    tvaThresholdMode: client?.tvaThresholdMode || "auto",
    chargeRate:
      client?.chargeRate === undefined || client?.chargeRate === null
        ? ""
        : String(client.chargeRate),
    assignedTo: client?.assignedTo || "Non assigné",
    dataSource: client?.dataSource || "manual",
  };
}

function getLocalStoredClients() {
  try {
    const raw =
      localStorage.getItem(EXPERT_CLIENTS_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_EXPERT_CLIENTS_STORAGE_KEY);

    if (!raw) return [];

    const parsedClients = JSON.parse(raw);
    return Array.isArray(parsedClients) ? parsedClients : [];
  } catch {
    return [];
  }
}

function getCloudClientId(clientId) {
  if (typeof clientId === "string" && UUID_PATTERN.test(clientId)) {
    return clientId;
  }

  return createUuid();
}

function createUuid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : null;
}

function toCloudClientPayload(client, cabinetId) {
  const cloudId = getCloudClientId(client.id);

  if (!cloudId || !cabinetId) {
    return null;
  }

  const risk = getClientRisk(client);

  return {
    id: cloudId,
    cabinet_id: cabinetId,
    name: client.name,
    activity: client.activity || null,
    revenue: Number(client.revenue || 0),
    estimated_charges: Number(client.charges || client.estimatedCharges || 0),
    periodicity: client.periodicity || null,
    last_declaration_date: client.lastDeclarationDate || null,
    tva_status: client.tva || client.tvaStatus || null,
    acre_status: client.acre || client.acreStatus || null,
    status: risk.status,
    next_action: client.nextAction || risk.recommendedAction || null,
    // FUTURE: persist advanced client fields after schema migration.
  };
}

function fromCloudClientRow(row) {
  const client = {
    activity: row.activity || "",
    revenue: Number(row.revenue ?? 0),
    estimatedCharges: Number(row.estimated_charges ?? 0),
    periodicity: row.periodicity || "Inconnue",
    lastDeclarationDate: row.last_declaration_date || "",
    tva: row.tva_status || "Inconnue",
    acre: row.acre_status || "Inconnue",
    region: "Non renseignée",
    clientType: "Standard",
    client_type: "Standard",
    status: row.status || "ok",
    nextAction: row.next_action || "",
    siret: "",
    regime: "inconnu",
    activityType: "",
    tvaThresholdMode: "auto",
    chargeRate: "",
    assignedTo: "Non assigné",
    dataSource: "manual",
  };
  const riskScore = getClientRiskScore(client);
  const risk = getClientRisk(client);

  return {
    id: row.id,
    name: row.name,
    ...client,
    riskScore: riskScore.score,
    riskLabel: risk.label,
    notes: [],
    notesList: [],
    actions: [],
    history: [],
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
  };
}

function fromCloudNoteRow(row) {
  return {
    id: row.id,
    text: row.content || row.text || "",
    createdAt: row.created_at || new Date().toISOString(),
  };
}

function fromCloudActionRow(row) {
  return {
    id: row.id,
    text: row.text || row.content || "",
    status: row.status === "done" ? "done" : "todo",
    createdAt: row.created_at || new Date().toISOString(),
    doneAt: row.done_at || null,
  };
}

function fromCloudHistoryRow(row) {
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    date: row.created_at || new Date().toISOString(),
  };
}

function getSupabaseErrorMessage(error) {
  const status = Number(error?.status || error?.code);
  const message = String(error?.message || "").toLowerCase();

  if (
    error instanceof TypeError ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("fetch")
  ) {
    return "Problème de connexion";
  }

  if (
    status === 401 ||
    status === 403 ||
    message.includes("permission") ||
    message.includes("not authorized") ||
    message.includes("unauthorized") ||
    message.includes("row-level security") ||
    message.includes("rls")
  ) {
    return "Accès non autorisé";
  }

  return "Une erreur est survenue";
}

export default function ExpertDashboard({
  view = "dashboard",
  onOpenClient,
  currentUser = null,
  currentCabinet = null,
}) {
  const [clients, setClients] = useState(() => {
    try {
      const raw = localStorage.getItem(EXPERT_CLIENTS_STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }

      const legacyRaw = localStorage.getItem(LEGACY_EXPERT_CLIENTS_STORAGE_KEY);
      if (legacyRaw) {
        return JSON.parse(legacyRaw);
      }

      return demoClients;
    } catch {
      return demoClients;
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
  const [detailNoteDraft, setDetailNoteDraft] = useState("");
  const [detailNoteError, setDetailNoteError] = useState("");
  const [detailActionDraft, setDetailActionDraft] = useState("");
  const [detailActionError, setDetailActionError] = useState("");
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState(DEFAULT_INVOICE_FORM);
  const [invoiceError, setInvoiceError] = useState("");
  const [showCsvImportModal, setShowCsvImportModal] = useState(false);
  const [csvImportError, setCsvImportError] = useState("");
  const [csvImportPreview, setCsvImportPreview] = useState(null);
  const [newClientForm, setNewClientForm] = useState(DEFAULT_CLIENT_FORM);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const isCloudEnabled = !!currentUser && !!currentCabinet;

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
  const selectedClientActions = useMemo(
    () => getClientActions(selectedClient),
    [selectedClient],
  );
  const selectedClientInvoices = useMemo(
    () => getClientInvoiceEntries(selectedClient),
    [selectedClient],
  );
  const selectedClientSummary = useMemo(
    () => getClientFileSummary(selectedClient),
    [selectedClient],
  );
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
  const allClientNotes = useMemo(() => {
    return clients
      .flatMap((client) =>
        getClientNoteEntries(client).map((note, index) => ({
          id: note.id || `${client.id}-note-${index}`,
          clientId: client.id,
          clientName: client.name,
          client,
          text: note.text,
          createdAt: note.createdAt || note.date || null,
        })),
      )
      .sort((firstNote, secondNote) => {
        const firstTime = firstNote.createdAt
          ? new Date(firstNote.createdAt).getTime()
          : 0;
        const secondTime = secondNote.createdAt
          ? new Date(secondNote.createdAt).getTime()
          : 0;

        return secondTime - firstTime;
      });
  }, [clients]);
  const editingClient = useMemo(
    () => clients.find((client) => client.id === editingClientId) || null,
    [clients, editingClientId],
  );

  const kpis = useMemo(() => {
    const realActions = clients.flatMap((client) =>
      Array.isArray(client.actions) ? getClientActions(client) : [],
    );
    const realNotes = clients.flatMap((client) => getClientNoteEntries(client));
    const totalClients = clients.length;
    const totalRevenue = clients.reduce(
      (total, client) => total + parseRevenueValue(client.revenue),
      0,
    );
    const totalActionsTodo = realActions.filter(
      (action) => action.status !== "done",
    ).length;
    const totalActionsDone = realActions.filter(
      (action) => action.status === "done",
    ).length;
    const actionsLate = realActions.filter(
      (action) =>
        action.status !== "done" && isOlderThanDays(action.createdAt, 7),
    ).length;
    const notesThisWeek = realNotes.filter((note) =>
      isWithinLastDays(note.createdAt || note.date, 7),
    ).length;
    const clientsSuivis = totalClients;
    const enRetard = clients.filter(
      (client) => getClientRisk(client).status === "late",
    ).length;
    const risqueTva = clients.filter(
      (client) => getClientRisk(client).status === "tva",
    ).length;
    const actionsCetteSemaine = totalActionsTodo;

    return {
      totalClients,
      totalRevenue,
      totalActionsTodo,
      totalActionsDone,
      actionsLate,
      notesThisWeek,
      clientsSuivis,
      enRetard,
      risqueTva,
      actionsCetteSemaine,
    };
  }, [clients]);
  const cabinetStats = useMemo(() => getCabinetStats(clients), [clients]);
  const priorityItems = useMemo(
    () =>
      clients.map((client) => ({
        id: client.id,
        clientName: client.name,
        client,
        priority: getClientPriority(client),
      })),
    [clients],
  );
  const dailyPriorities = useMemo(() => {
    return [...priorityItems]
      .filter((item) => item.priority.score > 20)
      .sort((firstItem, secondItem) => secondItem.priority.score - firstItem.priority.score)
      .slice(0, 4)
      .map((item) => ({
        id: item.id,
        clientName: item.clientName,
        client: item.client,
        risk: {
          status: item.priority.status,
          label: item.priority.label,
          recommendedAction: item.priority.message,
        },
        action: item.priority.message,
        priority: item.priority,
      }));
  }, [priorityItems]);
  const normalFollowUpClients = useMemo(() => {
    return priorityItems
      .filter((item) => item.priority.level === "ok")
      .slice(0, 3);
  }, [priorityItems]);
  const globalAlerts = useMemo(
    () => [
      {
        label: "Dossiers en retard",
        value: priorityItems.filter((item) => item.priority.level === "danger").length,
        helper:
          priorityItems.some((item) => item.priority.level === "danger")
            ? "Priorités à régulariser rapidement"
            : "Aucun retard identifié",
      },
      {
        label: "Risques TVA",
        value: priorityItems.filter((item) => item.priority.label === "Risque TVA").length,
        helper:
          priorityItems.some((item) => item.priority.label === "Risque TVA")
            ? "Seuils à contrôler sur les prochains dossiers"
            : "Aucun seuil critique détecté",
      },
      {
        label: "Alertes cabinet",
        value: priorityItems.filter((item) => item.priority.hasLateTodoAction).length,
        helper: "Actions ouvertes depuis plus de 7 jours",
      },
    ],
    [priorityItems],
  );
  const alertGroups = useMemo(
    () => [
      {
        key: "danger",
        title: "Danger",
        description: "Priorités à traiter en premier.",
        items: priorityItems.filter((item) => item.priority.level === "danger"),
      },
      {
        key: "warning",
        title: "Attention",
        description: "Points de vigilance à suivre.",
        items: priorityItems.filter((item) => item.priority.level === "warning"),
      },
    ],
    [priorityItems],
  );
  const cabinetSchedule = useMemo(() => getCabinetSchedule(clients), [clients]);
  const pendingScheduleActions = useMemo(() => {
    return clients
      .flatMap((client) =>
        (Array.isArray(client.actions) ? getClientActions(client) : [])
          .filter((action) => action.status !== "done")
          .map((action) => ({
            id: action.id,
            clientId: client.id,
            clientName: client.name,
            client,
            action,
            createdAt: action.createdAt,
            isLate: isOlderThanDays(action.createdAt, 7),
          })),
      )
      .sort((firstAction, secondAction) => {
        const firstTime = new Date(firstAction.createdAt || 0).getTime();
        const secondTime = new Date(secondAction.createdAt || 0).getTime();

        return firstTime - secondTime;
      });
  }, [clients]);

  const visibleClients = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return clients.filter((client) => {
      const clientType = getClientType(client);
      const matchesFilter =
        activeFilter === "all"
          ? true
          : activeFilter === "priority"
            ? clientType === "Prioritaire"
            : activeFilter === "watch"
              ? clientType === "À surveiller"
          : getClientRisk(client).status === activeFilter;
      const matchesSearch = normalizedQuery
        ? client.name.toLowerCase().includes(normalizedQuery)
        : true;

      return matchesFilter && matchesSearch;
    });
  }, [activeFilter, clients, searchQuery]);

  function handleCloudError(label, error, { notify = true } = {}) {
    if (import.meta.env.DEV) {
      console.error(label, error);
    }

    if (notify) {
      setSuccessMessage(getSupabaseErrorMessage(error));
    }
  }

  async function runSupabaseRequest(label, request, options) {
    try {
      return await request();
    } catch (error) {
      handleCloudError(label, error, options);
      return { data: null, error };
    }
  }

  async function syncLocalClientsToCloud(localClients) {
    if (!isCloudEnabled || !supabase) return;

    const cloudClients = localClients
      .map((client) => ({
        localClient: client,
        payload: toCloudClientPayload(client, currentCabinet.id),
      }))
      .filter((clientSync) => clientSync.payload);

    if (cloudClients.length === 0) return;

    const { error } = await runSupabaseRequest(
      "Client cloud upload failed:",
      () =>
        supabase.from("clients").upsert(
          cloudClients.map((clientSync) => clientSync.payload),
          {
            onConflict: "id",
            ignoreDuplicates: false,
          },
        ),
    );

    if (error) {
      handleCloudError("Client cloud upload failed:", error);
      return;
    }

    const notePayload = cloudClients.flatMap((clientSync) =>
      getClientNoteEntries(clientSync.localClient)
        .map((note) => ({
          id: UUID_PATTERN.test(String(note.id)) ? note.id : createUuid(),
          client_id: clientSync.payload.id,
          cabinet_id: currentCabinet.id,
          content: note.text,
          created_by: currentUser?.id || null,
          created_at: note.createdAt || note.date || new Date().toISOString(),
        }))
        .filter((note) => note.id),
    );
    const actionPayload = cloudClients.flatMap((clientSync) =>
      (Array.isArray(clientSync.localClient.actions)
        ? getClientActions(clientSync.localClient)
        : []
      )
        .map((action) => ({
          id: UUID_PATTERN.test(String(action.id)) ? action.id : createUuid(),
          client_id: clientSync.payload.id,
          cabinet_id: currentCabinet.id,
          text: action.text,
          status: action.status || "todo",
          done_at: action.doneAt || null,
          created_by: currentUser?.id || null,
          created_at: action.createdAt || new Date().toISOString(),
        }))
        .filter((action) => action.id),
    );
    const historyPayload = cloudClients.flatMap((clientSync) =>
      (Array.isArray(clientSync.localClient.history)
        ? clientSync.localClient.history
        : []
      )
        .map((entry) => {
          const historyEntry = createClientHistoryEntry(entry);

          return {
            id: UUID_PATTERN.test(String(historyEntry.id)) ? historyEntry.id : createUuid(),
            client_id: clientSync.payload.id,
            cabinet_id: currentCabinet.id,
            type: historyEntry.type || "update",
            label: historyEntry.label,
            created_by: currentUser?.id || null,
            created_at: historyEntry.date,
          };
        })
        .filter((entry) => entry.id),
    );

    if (notePayload.length > 0) {
      const { error: notesError } = await runSupabaseRequest(
        "Notes cloud upload failed:",
        () =>
          supabase.from("client_notes").upsert(notePayload, {
            onConflict: "id",
            ignoreDuplicates: true,
          }),
      );

      if (notesError) {
        handleCloudError("Notes cloud upload failed:", notesError);
      }
    }

    if (actionPayload.length > 0) {
      const { error: actionsError } = await runSupabaseRequest(
        "Actions cloud upload failed:",
        () =>
          supabase.from("client_actions").upsert(actionPayload, {
            onConflict: "id",
            ignoreDuplicates: true,
          }),
      );

      if (actionsError) {
        handleCloudError("Actions cloud upload failed:", actionsError);
      }
    }

    if (historyPayload.length > 0) {
      const { error: historyError } = await runSupabaseRequest(
        "History cloud upload failed:",
        () =>
          supabase.from("client_history").upsert(historyPayload, {
            onConflict: "id",
            ignoreDuplicates: true,
          }),
      );

      if (historyError) {
        handleCloudError("History cloud upload failed:", historyError);
      }
    }

    setClients((currentClients) =>
      currentClients.map((client) => {
        const syncedClient = cloudClients.find(
          (clientSync) => clientSync.localClient.id === client.id,
        );

        return syncedClient ? { ...client, id: syncedClient.payload.id } : client;
      }),
    );
  }

  async function insertClientToCloud(client) {
    if (!isCloudEnabled || !supabase) return;

    const payload = toCloudClientPayload(client, currentCabinet.id);
    if (!payload) return;

    const { error } = await runSupabaseRequest("Client cloud insert failed:", () =>
      supabase.from("clients").insert(payload),
    );

    if (error) {
      handleCloudError("Client cloud insert failed:", error);
      return false;
    }

    return true;
  }

  async function deleteClientFromCloud(client) {
    if (!isCloudEnabled || !supabase || !UUID_PATTERN.test(String(client.id))) return;

    const { error } = await runSupabaseRequest("Client cloud delete failed:", () =>
      supabase
        .from("clients")
        .delete()
        .eq("cabinet_id", currentCabinet.id)
        .eq("id", client.id),
    );

    if (error) {
      handleCloudError("Client cloud delete failed:", error);
    }
  }

  async function loadClientRelatedData(cloudClients) {
    if (!isCloudEnabled || !supabase || cloudClients.length === 0) {
      return cloudClients;
    }

    const clientIds = cloudClients.map((client) => client.id);

    const [notesResult, actionsResult, historyResult] = await Promise.all([
      runSupabaseRequest(
        "Notes cloud fetch failed:",
        () =>
          supabase
            .from("client_notes")
            .select("*")
            .in("client_id", clientIds)
            .order("created_at", { ascending: false }),
        { notify: false },
      ),
      runSupabaseRequest(
        "Actions cloud fetch failed:",
        () =>
          supabase
            .from("client_actions")
            .select("*")
            .in("client_id", clientIds)
            .order("created_at", { ascending: false }),
        { notify: false },
      ),
      runSupabaseRequest(
        "History cloud fetch failed:",
        () =>
          supabase
            .from("client_history")
            .select("*")
            .in("client_id", clientIds)
            .order("created_at", { ascending: false }),
        { notify: false },
      ),
    ]);

    if (notesResult.error) {
      handleCloudError("Notes cloud fetch failed:", notesResult.error);
    }

    if (actionsResult.error) {
      handleCloudError("Actions cloud fetch failed:", actionsResult.error);
    }

    if (historyResult.error) {
      handleCloudError("History cloud fetch failed:", historyResult.error);
    }

    const notesByClient = new Map();
    const actionsByClient = new Map();
    const historyByClient = new Map();

    (notesResult.data || []).forEach((note) => {
      const currentNotes = notesByClient.get(note.client_id) || [];
      notesByClient.set(note.client_id, [...currentNotes, fromCloudNoteRow(note)]);
    });

    (actionsResult.data || []).forEach((action) => {
      const currentActions = actionsByClient.get(action.client_id) || [];
      actionsByClient.set(action.client_id, [
        ...currentActions,
        fromCloudActionRow(action),
      ]);
    });

    (historyResult.data || []).forEach((entry) => {
      const currentHistory = historyByClient.get(entry.client_id) || [];
      historyByClient.set(entry.client_id, [
        ...currentHistory,
        fromCloudHistoryRow(entry),
      ]);
    });

    return cloudClients.map((client) => ({
      ...client,
      notes: notesByClient.get(client.id) || [],
      notesList: notesByClient.get(client.id) || [],
      actions: actionsByClient.get(client.id) || [],
      history: historyByClient.get(client.id) || [],
    }));
  }

  async function insertClientNoteToCloud(clientId, note) {
    if (!isCloudEnabled || !supabase || !UUID_PATTERN.test(String(clientId))) return;

    const payload = {
      id: UUID_PATTERN.test(String(note.id)) ? note.id : createUuid(),
      client_id: clientId,
      cabinet_id: currentCabinet.id,
      content: note.text,
      created_by: currentUser?.id || null,
      created_at: note.createdAt || new Date().toISOString(),
    };

    if (!payload.id) return;

    const { error } = await runSupabaseRequest("Note cloud insert failed:", () =>
      supabase.from("client_notes").upsert(payload, {
        onConflict: "id",
        ignoreDuplicates: true,
      }),
    );

    if (error) {
      handleCloudError("Note cloud insert failed:", error);
    }
  }

  async function deleteClientNoteFromCloud(clientId, noteId) {
    if (
      !isCloudEnabled ||
      !supabase ||
      !UUID_PATTERN.test(String(clientId)) ||
      !UUID_PATTERN.test(String(noteId))
    ) {
      return;
    }

    const { error } = await runSupabaseRequest("Note cloud delete failed:", () =>
      supabase
        .from("client_notes")
        .delete()
        .eq("cabinet_id", currentCabinet.id)
        .eq("client_id", clientId)
        .eq("id", noteId),
    );

    if (error) {
      handleCloudError("Note cloud delete failed:", error);
    }
  }

  async function insertClientActionToCloud(clientId, action) {
    if (!isCloudEnabled || !supabase || !UUID_PATTERN.test(String(clientId))) return;

    const payload = {
      id: UUID_PATTERN.test(String(action.id)) ? action.id : createUuid(),
      client_id: clientId,
      cabinet_id: currentCabinet.id,
      text: action.text,
      status: action.status || "todo",
      done_at: action.doneAt || null,
      created_by: currentUser?.id || null,
      created_at: action.createdAt || new Date().toISOString(),
    };

    if (!payload.id) return;

    const { error } = await runSupabaseRequest("Action cloud insert failed:", () =>
      supabase.from("client_actions").upsert(payload, {
        onConflict: "id",
        ignoreDuplicates: true,
      }),
    );

    if (error) {
      handleCloudError("Action cloud insert failed:", error);
    }
  }

  async function updateClientActionInCloud(clientId, action) {
    if (
      !isCloudEnabled ||
      !supabase ||
      !UUID_PATTERN.test(String(clientId)) ||
      !UUID_PATTERN.test(String(action.id))
    ) {
      return;
    }

    const { error } = await runSupabaseRequest("Action cloud update failed:", () =>
      supabase
        .from("client_actions")
        .update({
          status: action.status,
          done_at: action.doneAt || null,
        })
        .eq("cabinet_id", currentCabinet.id)
        .eq("client_id", clientId)
        .eq("id", action.id),
    );

    if (error) {
      handleCloudError("Action cloud update failed:", error);
    }
  }

  async function deleteClientActionFromCloud(clientId, actionId) {
    if (
      !isCloudEnabled ||
      !supabase ||
      !UUID_PATTERN.test(String(clientId)) ||
      !UUID_PATTERN.test(String(actionId))
    ) {
      return;
    }

    const { error } = await runSupabaseRequest("Action cloud delete failed:", () =>
      supabase
        .from("client_actions")
        .delete()
        .eq("cabinet_id", currentCabinet.id)
        .eq("client_id", clientId)
        .eq("id", actionId),
    );

    if (error) {
      handleCloudError("Action cloud delete failed:", error);
    }
  }

  async function insertClientHistoryToCloud(clientId, entry) {
    if (!isCloudEnabled || !supabase || !UUID_PATTERN.test(String(clientId))) return;

    const payload = {
      id: UUID_PATTERN.test(String(entry.id)) ? entry.id : createUuid(),
      client_id: clientId,
      cabinet_id: currentCabinet.id,
      type: entry.type || "update",
      label: entry.label,
      created_by: currentUser?.id || null,
      created_at: entry.date || new Date().toISOString(),
    };

    if (!payload.id) return;

    const { error } = await runSupabaseRequest("History cloud insert failed:", () =>
      supabase.from("client_history").upsert(payload, {
        onConflict: "id",
        ignoreDuplicates: true,
      }),
    );

    if (error) {
      handleCloudError("History cloud insert failed:", error);
    }
  }

  function getInvoiceCloudClientId(client) {
    if (client?.cloudClientId) {
      return client.cloudClientId;
    }

    return UUID_PATTERN.test(String(client?.id)) ? client.id : null;
  }

  async function ensureInvoiceClientInCloud(client) {
    if (!supabase || !currentCabinet?.id || !client) {
      return null;
    }

    const cloudClientId = getInvoiceCloudClientId(client) || createUuid();

    if (!cloudClientId) {
      return null;
    }

    const payload = {
      id: cloudClientId,
      cabinet_id: currentCabinet.id,
      name: client.name,
      activity: client.activity || null,
      revenue: Number(client.revenue || 0),
      periodicity: client.periodicity || null,
      last_declaration_date: client.lastDeclarationDate || null,
      tva_status: client.tva || client.tvaStatus || null,
      acre_status: client.acre || client.acreStatus || null,
    };

    const { error } = await runSupabaseRequest(
      "Invoice client cloud upsert failed:",
      () =>
        supabase.from("clients").upsert(payload, {
          onConflict: "id",
          ignoreDuplicates: false,
        }),
      { notify: false },
    );

    if (error) {
      handleCloudError("Invoice client cloud upsert failed:", error, { notify: false });
      return null;
    }

    setClients((currentClients) =>
      currentClients.map((currentClient) =>
        currentClient.id === client.id
          ? { ...currentClient, cloudClientId }
          : currentClient,
      ),
    );

    return cloudClientId;
  }

  async function fetchClientInvoicesFromCloud(client) {
    const cloudClientId = getInvoiceCloudClientId(client);

    if (!supabase || !currentCabinet?.id || !client?.id || !cloudClientId) {
      return;
    }

    const { data, error } = await runSupabaseRequest(
      "Invoice cloud fetch failed:",
      () =>
        supabase
          .from("invoices")
          .select("*")
          .eq("cabinet_id", currentCabinet.id)
          .eq("client_id", cloudClientId)
          .order("issued_at", { ascending: false }),
      { notify: false },
    );

    if (error) {
      handleCloudError("Invoice cloud fetch failed:", error, { notify: false });
      return;
    }

    const cloudInvoices = Array.isArray(data)
      ? data.map(normalizeInvoiceEntry).filter(Boolean)
      : [];

    if (cloudInvoices.length === 0) {
      return;
    }

    setClients((currentClients) =>
      currentClients.map((currentClient) => {
        if (currentClient.id !== client.id) {
          return currentClient;
        }

        const invoicesById = new Map(
          getClientInvoiceEntries(currentClient).map((invoice) => [invoice.id, invoice]),
        );

        cloudInvoices.forEach((invoice) => {
          invoicesById.set(invoice.id, invoice);
        });

        return {
          ...currentClient,
          invoices: Array.from(invoicesById.values()),
        };
      }),
    );
  }

  async function insertClientInvoiceToCloud(client, invoice) {
    if (!currentCabinet?.id || !client?.id) {
      return { skipped: true };
    }

    if (!supabase) {
      return {
        skipped: false,
        error: new Error("Supabase non configuré"),
      };
    }

    if (!client?.id) {
      return { skipped: true };
    }

    console.log("Cloud mode active", currentCabinet);

    const cloudClientId = await ensureInvoiceClientInCloud(client);

    if (!cloudClientId) {
      return { skipped: true };
    }

    const payload = {
      id: invoice.id,
      client_id: cloudClientId,
      cabinet_id: currentCabinet.id,
      client_name: client.name,
      amount: invoice.amount,
      status: invoice.rawStatus || "draft",
      issued_at: invoice.issuedAt || invoice.date || new Date().toISOString(),
    };

    console.log("Invoice insert payload", payload);

    const { data, error } = await runSupabaseRequest(
      "Invoice cloud insert failed:",
      () =>
        supabase
          .from("invoices")
          .insert(payload)
          .select("*"),
      { notify: false },
    );

    console.log("Invoice insert result", { data, error });

    if (error) {
      handleCloudError("Invoice cloud insert failed:", error, { notify: false });
    }

    return { data, error, skipped: false };
  }

  useEffect(() => {
    if (!isCloudEnabled || !supabase || !currentCabinet?.id) return undefined;

    let isCancelled = false;

    async function loadCloudClients() {
      setIsDashboardLoading(true);

      try {
        const { data, error } = await runSupabaseRequest(
          "Client cloud fetch failed:",
          () =>
            supabase
              .from("clients")
              .select("*")
              .eq("cabinet_id", currentCabinet.id)
              .order("created_at", { ascending: false }),
        );

        if (isCancelled) return;

        if (error) {
          handleCloudError("Client cloud fetch failed:", error);
          return;
        }

        if (Array.isArray(data) && data.length > 0) {
          const localStoredClients = getLocalStoredClients();
          const cloudClients = await loadClientRelatedData(
            data.map((row) => {
              const cloudClient = fromCloudClientRow(row);
              const localClient = localStoredClients.find(
                (client) =>
                  client.id === row.id ||
                  client.cloudClientId === row.id ||
                  normalizeClientName(client.name) === normalizeClientName(row.name),
              );
              const clientType = getClientType(localClient);

              return {
                ...cloudClient,
                region: getClientRegion(localClient),
                clientType,
                client_type: clientType,
              };
            }),
          );
          if (!isCancelled) {
            setClients(cloudClients);
          }
          return;
        }

        const localStoredClients = getLocalStoredClients();
        if (localStoredClients.length > 0) {
          await syncLocalClientsToCloud(localStoredClients);
        }
      } finally {
        if (!isCancelled) {
          setIsDashboardLoading(false);
        }
      }
    }

    loadCloudClients();

    return () => {
      isCancelled = true;
    };
  }, [isCloudEnabled, currentCabinet?.id]);

  useEffect(() => {
    if (!selectedClient) {
      return;
    }

    void fetchClientInvoicesFromCloud(selectedClient);
  }, [selectedClient?.id, selectedClient?.cloudClientId, currentCabinet?.id]);

  useEffect(() => {
    function handleClientsReplaced(event) {
      const nextClients = event.detail?.clients;

      if (!Array.isArray(nextClients)) {
        return;
      }

      setClients(nextClients);
      setSelectedClientId(null);
      setReminderClientId(null);
      setReminderMessage("");
      setShowAddClientModal(false);
      setEditingClientId(null);
      setAddClientError("");
      setNoteClientId(null);
      setNoteDraft("");
      setNoteError("");
      setNotesClientId(null);
      setInlineNoteDraft("");
      setInlineNoteError("");
      setDetailNoteDraft("");
      setDetailNoteError("");
      setDetailActionDraft("");
      setDetailActionError("");
      setShowInvoiceModal(false);
      setInvoiceForm(DEFAULT_INVOICE_FORM);
      setInvoiceError("");
      setShowCsvImportModal(false);
      setCsvImportError("");
      setCsvImportPreview(null);
      setNewClientForm(DEFAULT_CLIENT_FORM);
    }

    window.addEventListener(EXPERT_CLIENTS_REPLACED_EVENT, handleClientsReplaced);

    return () => {
      window.removeEventListener(
        EXPERT_CLIENTS_REPLACED_EVENT,
        handleClientsReplaced,
      );
    };
  }, []);

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
    setReminderMessage(
      `Bonjour ${client.name}, petit rappel concernant votre dossier : merci de vérifier votre prochaine déclaration ou action à traiter.`,
    );
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

    void insertClientHistoryToCloud(clientId, historyEntry);
  }

  async function exportClientReportPdf(client) {
    if (!client) return;

    try {
      const doc = new jsPDF();
      const pdfFontFamily = await configurePdfFont(doc);
      const risk = getClientRisk(client);
      const riskScore = getClientRiskScore(client);
      const actionPlan = getClientActionPlan(client);
      const priorities = getComputedPriorities(client, risk.status);
      const notes = getClientNoteEntries(client);
      const legacyHistory = clientHistory.filter((event) => event.clientId === client.id);
      const historyGroups = groupHistoryByDate(
        getClientHistoryEntries(client, legacyHistory),
      );
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 18;
      const maxTextWidth = pageWidth - marginX * 2;
      let y = 20;

      function ensureSpace(height = 10) {
        if (y + height <= pageHeight - 18) return;

        doc.addPage();
        y = 20;
      }

      function addTitle(text) {
        ensureSpace(16);
        doc.setFont(pdfFontFamily, "bold");
        doc.setFontSize(18);
        doc.setTextColor(15, 23, 42);
        doc.text(text, marginX, y);
        y += 12;
      }

      function addSectionTitle(text) {
        ensureSpace(14);
        y += 3;
        doc.setFont(pdfFontFamily, "bold");
        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.text(text, marginX, y);
        y += 8;
      }

      function addLine(label, value) {
        const text =
          value === "" ? String(label) : `${label} : ${value ?? "Inconnue"}`;
        const lines = doc.splitTextToSize(text, maxTextWidth);

        ensureSpace(lines.length * 6 + 2);
        doc.setFont(pdfFontFamily, "normal");
        doc.setFontSize(10);
        doc.setTextColor(51, 65, 85);
        doc.text(lines, marginX, y);
        y += lines.length * 6 + 2;
      }

      function addBullet(text) {
        const lines = doc.splitTextToSize(String(text || ""), maxTextWidth - 7);

        ensureSpace(lines.length * 6 + 2);
        doc.setFont(pdfFontFamily, "normal");
        doc.setFontSize(10);
        doc.setTextColor(51, 65, 85);
        doc.text("•", marginX, y);
        doc.text(lines, marginX + 7, y);
        y += lines.length * 6 + 2;
      }

      addTitle(`Rapport client - ${client.name}`);
      addLine("Date d’export", formatLongDateTimeFr());

      addSectionTitle("Synthèse client");
      addLine("Activité", client.activity);
      addLine("Chiffre d’affaires", formatRevenue(client.revenue));
      addLine("Charges estimées", formatCurrency(getEstimatedCharges(client)));
      addLine("Périodicité", client.periodicity || "Inconnue");
      addLine("TVA", client.tva || "Inconnue");
      addLine("ACRE", client.acre || "Inconnue");
      addLine("Statut calculé", risk.label);
      addLine("Score de risque", `${riskScore.score}/100 - ${riskScore.label}`);
      addLine("Prochaine action", getClientNextAction(client));

      addSectionTitle("Smart Priorités");
      priorities.forEach((priority) => addBullet(priority));

      addSectionTitle("Plan d’action");
      [
        ["Aujourd’hui", actionPlan.today],
        ["Cette semaine", actionPlan.thisWeek],
        ["Plus tard", actionPlan.later],
      ].forEach(([title, actions]) => {
        if (actions.length === 0) return;

        addLine(title, "");
        actions.forEach((action) => addBullet(action));
      });

      addSectionTitle("Notes expert");
      if (notes.length === 0) {
        addBullet("Aucune note pour ce client.");
      } else {
        notes.forEach((note) => {
          const noteDate = note.date
            ? formatLongDateTimeFr(note.date)
            : "Note existante";
          addBullet(`${noteDate} - ${note.text}`);
        });
      }

      addSectionTitle("Historique des actions");
      if (historyGroups.length === 0) {
        addBullet("Aucune action pour ce client.");
      } else {
        historyGroups.forEach((group) => {
          addLine(group.label, "");
          group.items.forEach((event) => {
            addBullet(`${formatLongDateTimeFr(event.date)} - ${event.label}`);
          });
        });
      }

      const safeName = String(client.name || "client")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();

      doc.save(`rapport-client-${safeName || "client"}.pdf`);
    } catch {
      window.print();
    }
  }

  async function exportCabinetReportPdf() {
    try {
      const doc = new jsPDF();
      const pdfFontFamily = await configurePdfFont(doc);
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 18;
      const maxTextWidth = pageWidth - marginX * 2;
      const sortedUrgentClients = [...dailyPriorities];
      let y = 20;

      function ensureSpace(height = 10) {
        if (y + height <= pageHeight - 18) return;

        doc.addPage();
        y = 20;
      }

      function addTitle(text) {
        ensureSpace(16);
        doc.setFont(pdfFontFamily, "bold");
        doc.setFontSize(18);
        doc.setTextColor(15, 23, 42);
        doc.text(text, marginX, y);
        y += 12;
      }

      function addSectionTitle(text) {
        ensureSpace(14);
        y += 3;
        doc.setFont(pdfFontFamily, "bold");
        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.text(text, marginX, y);
        y += 8;
      }

      function addLine(label, value) {
        const text =
          value === "" ? String(label) : `${label} : ${value ?? "Aucun"}`;
        const lines = doc.splitTextToSize(text, maxTextWidth);

        ensureSpace(lines.length * 6 + 2);
        doc.setFont(pdfFontFamily, "normal");
        doc.setFontSize(10);
        doc.setTextColor(51, 65, 85);
        doc.text(lines, marginX, y);
        y += lines.length * 6 + 2;
      }

      function addBullet(text) {
        const lines = doc.splitTextToSize(String(text || ""), maxTextWidth - 7);

        ensureSpace(lines.length * 6 + 2);
        doc.setFont(pdfFontFamily, "normal");
        doc.setFontSize(10);
        doc.setTextColor(51, 65, 85);
        doc.text("•", marginX, y);
        doc.text(lines, marginX + 7, y);
        y += lines.length * 6 + 2;
      }

      addTitle("Rapport cabinet - Microassist Expert");
      addLine("Date d’export", formatLongDateTimeFr());

      addSectionTitle("Synthèse cabinet");
      addLine("Nombre de clients suivis", kpis.clientsSuivis);
      addLine("Actions à traiter", kpis.actionsCetteSemaine);
      addLine("Dossiers en retard", kpis.enRetard);
      addLine("Risques TVA", kpis.risqueTva);
      addLine("Relances effectuées", cabinetStats.remindersCount);
      addLine("Notes ajoutées", cabinetStats.notesCount);
      addLine("Dossiers mis à jour", cabinetStats.updatesCount);

      addSectionTitle("Priorités du jour");
      if (sortedUrgentClients.length === 0) {
        addBullet("Aucune priorité urgente pour le moment.");
      } else {
        sortedUrgentClients.forEach((priority) => {
          const riskScore = getClientRiskScore(priority.client);
          addBullet(
            `${priority.clientName} - ${priority.priority.label} - ${riskScore.score}/100 (${riskScore.label}) - ${priority.priority.message}`,
          );
        });
      }

      addSectionTitle("Échéancier cabinet");
      [
        ["Aujourd’hui", cabinetSchedule.today],
        ["Cette semaine", cabinetSchedule.thisWeek],
        ["Plus tard", cabinetSchedule.later],
      ].forEach(([title, items]) => {
        addLine(title, "");

        if (items.length === 0) {
          addBullet("Aucune action planifiée.");
          return;
        }

        items.forEach((item) => {
          addBullet(`${item.clientName} - ${item.action}`);
        });
      });

      addSectionTitle("Liste clients");
      if (clients.length === 0) {
        addBullet("Aucun client suivi.");
      } else {
        clients.forEach((client) => {
          const risk = getClientRisk(client);
          const riskScore = getClientRiskScore(client);

          addBullet(
            `${client.name} - ${client.activity || "Activité inconnue"} - CA ${formatRevenue(client.revenue)} - Charges ${formatCurrency(getEstimatedCharges(client))} - ${risk.label} - ${riskScore.score}/100 (${riskScore.label}) - ${getClientNextAction(client)}`,
          );
        });
      }

      doc.save("rapport-cabinet-microassist-expert.pdf");
    } catch {
      window.print();
    }
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

  function openCsvImportModal() {
    setCsvImportError("");
    setCsvImportPreview(null);
    setShowCsvImportModal(true);
  }

  function closeCsvImportModal() {
    setCsvImportError("");
    setCsvImportPreview(null);
    setShowCsvImportModal(false);
  }

  function downloadCsvTemplate() {
    const templateRows = [
      CSV_TEMPLATE_COLUMNS.join(","),
      "Sophie Martin,Prestations de services,4850,Île-de-France,Standard,Mensuelle,Non applicable,Non,Aucune action urgente,30",
    ];
    const blob = new Blob([templateRows.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "modele-import-clients-microassist.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleCsvFileChange(event) {
    const file = event.target.files?.[0];

    setCsvImportError("");
    setCsvImportPreview(null);

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsedCsv = parseClientsCsv(text);

      if (parsedCsv.missingColumns.length > 0) {
        setCsvImportError(
          `Colonnes manquantes : ${parsedCsv.missingColumns.join(", ")}.`,
        );
        return;
      }

      const seenNames = new Set(
        clients.map((client) => normalizeClientName(client.name)),
      );
      const previewRows = parsedCsv.validRows.map((row) => {
        const normalizedName = normalizeClientName(row.name);
        const isDuplicate = seenNames.has(normalizedName);

        if (!isDuplicate) {
          seenNames.add(normalizedName);
        }

        return {
          ...row,
          isDuplicate,
        };
      });
      const importableRows = previewRows.filter((row) => !row.isDuplicate);

      setCsvImportPreview({
        ...parsedCsv,
        validRows: previewRows,
        importableRows,
        duplicateCount: previewRows.length - importableRows.length,
      });
    } catch {
      setCsvImportError("Impossible de lire le fichier CSV.");
    }
  }

  async function handleConfirmCsvImport() {
    if (!csvImportPreview) return;

    const importableRows =
      csvImportPreview.importableRows || csvImportPreview.validRows || [];
    const existingNames = new Set(clients.map((client) => normalizeClientName(client.name)));
    let skippedDuplicates = Number(csvImportPreview.duplicateCount || 0);
    const importedClients = importableRows
      .filter((row) => {
        const normalizedName = normalizeClientName(row.name);

        if (existingNames.has(normalizedName)) {
          skippedDuplicates += 1;
          return false;
        }

        existingNames.add(normalizedName);
        return true;
      })
      .map((row) => {
        const clientDraft = buildClientFromForm({
          ...DEFAULT_CLIENT_FORM,
          name: row.name,
          activity: row.activity,
          revenue: row.revenue,
          region: row.region,
          clientType: row.clientType,
          periodicity: row.periodicity,
          tva: row.tva,
          acre: row.acre,
        });
        const providedRiskScore = Number(row.riskScore);
        const riskScore =
          !Number.isNaN(providedRiskScore) && providedRiskScore > 0
            ? Math.min(100, Math.max(0, providedRiskScore))
            : clientDraft.riskScore;

        return {
          id: createUuid() || `client-${Date.now()}-${row.rowNumber}`,
          ...clientDraft,
          riskScore,
          riskLabel:
            riskScore >= 80 ? "Risque TVA" : riskScore >= 55 ? "Alerte" : "OK",
          nextAction: row.nextAction || clientDraft.nextAction || "Aucune action urgente",
          history: [
            createClientHistoryEntry({
              type: "create",
              label: "Client importé depuis CSV",
            }),
          ],
          updatedAt: new Date().toISOString(),
        };
      });

    if (importedClients.length === 0) {
      setCsvImportError("Aucun nouveau client à importer.");
      return;
    }

    setClients((currentClients) => [...importedClients, ...currentClients]);

    let cloudError = null;

    if (supabase && currentCabinet?.id) {
      const payload = importedClients
        .map((client) => toCloudClientPayload(client, currentCabinet.id))
        .filter(Boolean);

      if (payload.length > 0) {
        const { error } = await runSupabaseRequest(
          "CSV client cloud insert failed:",
          () =>
            supabase.from("clients").upsert(payload, {
              onConflict: "id",
              ignoreDuplicates: false,
            }),
          { notify: false },
        );

        cloudError = error;
      }
    }

    const duplicateMessage =
      skippedDuplicates > 0
        ? ` ${skippedDuplicates} client(s) ignoré(s) car déjà existant(s).`
        : "";

    if (cloudError) {
      setSuccessMessage(
        `Clients importés localement. Erreur cloud : ${cloudError.message}.${duplicateMessage}`,
      );
    } else {
      setSuccessMessage(`Clients importés avec succès.${duplicateMessage}`);
    }

    closeCsvImportModal();
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
                actions: client.actions,
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
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `client-${Date.now()}`,
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
    void (async () => {
      const isInserted = await insertClientToCloud(nextClient);

      if (isInserted) {
        await insertClientHistoryToCloud(nextClient.id, nextClient.history[0]);
      }
    })();
    setSuccessMessage(`Client ajouté : ${clientName}`);
    closeAddClientModal();
  }

  function handleSendReminderSimulation() {
    if (!reminderClient) return;

    addClientHistory(reminderClient.id, {
      type: "reminder",
      label: "Rappel envoyé (simulation)",
    });
    closeReminderModal();
    setSuccessMessage("Rappel envoyé au client (simulation).");
  }

  function openInvoiceModal() {
    setInvoiceForm(DEFAULT_INVOICE_FORM);
    setInvoiceError("");
    setShowInvoiceModal(true);
  }

  function closeInvoiceModal() {
    setShowInvoiceModal(false);
    setInvoiceForm(DEFAULT_INVOICE_FORM);
    setInvoiceError("");
  }

  function handleInvoiceFormChange(field, value) {
    setInvoiceForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
    setInvoiceError("");
  }

  async function handleCreateInvoice() {
    if (!selectedClient) return;

    console.log("Invoice submit currentCabinet", currentCabinet);
    console.log("Invoice submit cloud enabled", Boolean(currentCabinet?.id));

    const amount = parseRevenueValue(invoiceForm.amount);

    if (!amount || amount <= 0) {
      setInvoiceError("Le montant de la facture doit être positif.");
      return;
    }

    const issuedAt = invoiceForm.issuedAt || getTodayIsoDate();
    const nextInvoice = normalizeInvoiceEntry({
      id: createUuid() || `invoice-${Date.now()}`,
      clientName: selectedClient.name,
      amount,
      status: invoiceForm.status || "draft",
      issuedAt,
      date: issuedAt,
    });

    if (!nextInvoice) return;

    setClients((currentClients) =>
      currentClients.map((client) =>
        client.id === selectedClient.id
          ? {
              ...client,
              invoices: [nextInvoice, ...getClientInvoiceEntries(client)],
            }
          : client,
      ),
    );

    if (!currentCabinet?.id) {
      setSuccessMessage("Facture enregistrée localement. Connexion cloud non active.");
    } else {
      const insertResult = await insertClientInvoiceToCloud(selectedClient, nextInvoice);

      if (insertResult?.error) {
        setSuccessMessage(
          `Facture enregistrée localement. Erreur cloud : ${insertResult.error.message || "erreur inconnue"}`,
        );
      } else if (insertResult?.skipped) {
        setSuccessMessage("Facture enregistrée localement. Erreur cloud : insertion non exécutée");
      } else {
        setSuccessMessage(`Facture créée : ${formatCurrency(amount)}`);
      }
    }

    addClientHistory(selectedClient.id, {
      type: "create",
      label: `Facture créée : ${formatCurrency(amount)}`,
    });
    closeInvoiceModal();
  }

  function handleAddNote() {
    if (!noteClient) return;

    const trimmedNote = noteDraft.trim();

    if (!trimmedNote) {
      setNoteError("La note expert ne peut pas être vide.");
      return;
    }

    const noteCreatedAt = new Date().toISOString();
    const nextNoteEntry = {
      id: createUuid() || `note-${Date.now()}`,
      createdAt: noteCreatedAt,
      date: noteCreatedAt,
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

    void insertClientNoteToCloud(noteClient.id, nextNoteEntry);
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

    const noteCreatedAt = new Date().toISOString();
    const nextNoteEntry = {
      id: createUuid() || `note-${Date.now()}`,
      createdAt: noteCreatedAt,
      date: noteCreatedAt,
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

    void insertClientNoteToCloud(notesClient.id, nextNoteEntry);
    addClientHistory(notesClient.id, {
      type: "note",
      label: "Note ajoutée",
    });

    setInlineNoteDraft("");
    setInlineNoteError("");
    setSuccessMessage(`Note ajoutée pour ${notesClient.name}.`);
  }

  function handleAddDetailNote() {
    if (!selectedClient) return;

    const trimmedNote = detailNoteDraft.trim();

    if (!trimmedNote) {
      setDetailNoteError("La note expert ne peut pas être vide.");
      return;
    }

    const nextNote = {
      id: createUuid() || `note-${Date.now()}`,
      text: trimmedNote,
      createdAt: new Date().toISOString(),
    };

    setClients((currentClients) =>
      currentClients.map((client) =>
        client.id === selectedClient.id
          ? {
              ...client,
              notes: [nextNote, ...getClientNoteEntries(client)],
              notesList: [nextNote, ...getClientNoteEntries(client)],
            }
          : client,
      ),
    );

    void insertClientNoteToCloud(selectedClient.id, nextNote);
    addClientHistory(selectedClient.id, {
      type: "note",
      label: "Note ajoutée",
    });
    setDetailNoteDraft("");
    setDetailNoteError("");
  }

  function handleAddDetailAction() {
    if (!selectedClient) return;

    const trimmedAction = detailActionDraft.trim();

    if (!trimmedAction) {
      setDetailActionError("L’action ne peut pas être vide.");
      return;
    }

    const nextAction = createClientAction(trimmedAction);

    setClients((currentClients) =>
      currentClients.map((client) =>
        client.id === selectedClient.id
          ? {
              ...client,
              actions: [nextAction, ...getClientActions(client)],
            }
          : client,
      ),
    );

    void insertClientActionToCloud(selectedClient.id, nextAction);
    addClientHistory(selectedClient.id, {
      type: "update",
      label: `Action ajoutée : ${trimmedAction}`,
    });
    setDetailActionDraft("");
    setDetailActionError("");
  }

  function handleCompleteDetailAction(actionId) {
    if (!selectedClient) return;

    const completedAction = selectedClientActions.find((action) => action.id === actionId);
    const completedAt = new Date().toISOString();
    const nextCompletedAction = completedAction
      ? {
          ...completedAction,
          status: "done",
          doneAt: completedAt,
        }
      : null;

    setClients((currentClients) =>
      currentClients.map((client) =>
        client.id === selectedClient.id
          ? {
              ...client,
              actions: getClientActions(client).map((action) =>
                action.id === actionId
                  ? {
                      ...action,
                      status: "done",
                      doneAt: completedAt,
                    }
                  : action,
              ),
            }
          : client,
      ),
    );

    if (nextCompletedAction) {
      void updateClientActionInCloud(selectedClient.id, nextCompletedAction);
    }
    addClientHistory(selectedClient.id, {
      type: "update",
      label: `Action terminée : ${completedAction?.text || "Action"}`,
    });
  }

  function handleDeleteDetailNote(noteId, noteIndex) {
    if (!selectedClient) return;

    setClients((currentClients) =>
      currentClients.map((client) => {
        if (client.id !== selectedClient.id) {
          return client;
        }

        const nextNotes = getClientNoteEntries(client).filter((note, index) => {
          if (noteId) {
            return note.id !== noteId;
          }

          return index !== noteIndex;
        });

        return {
          ...client,
          notes: nextNotes,
          notesList: nextNotes,
        };
      }),
    );

    if (noteId) {
      void deleteClientNoteFromCloud(selectedClient.id, noteId);
    }
    addClientHistory(selectedClient.id, {
      type: "note",
      label: "Note supprimée",
    });
  }

  function handleDeleteDetailAction(actionId) {
    if (!selectedClient) return;

    setClients((currentClients) =>
      currentClients.map((client) =>
        client.id === selectedClient.id
          ? {
              ...client,
              actions: getClientActions(client).filter((action) => action.id !== actionId),
            }
          : client,
      ),
    );

    void deleteClientActionFromCloud(selectedClient.id, actionId);
    addClientHistory(selectedClient.id, {
      type: "update",
      label: "Action supprimée",
    });
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
    void deleteClientFromCloud(client);
    setClientHistory((currentHistory) =>
      currentHistory.filter((event) => event.clientId !== client.id),
    );
    setReminderClientId((currentId) => (currentId === client.id ? null : currentId));
    setNoteClientId((currentId) => (currentId === client.id ? null : currentId));
    setSelectedClientId((currentId) => (currentId === client.id ? null : currentId));
    setDetailNoteDraft("");
    setDetailNoteError("");
    setDetailActionDraft("");
    setDetailActionError("");
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
          className="expertModalCard expertModalCard--clientForm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="expert-add-client-title"
        >
          <div className="expertModalHeader">
            <div>
              <h3 id="expert-add-client-title">{modalTitle}</h3>
              <p className="expertModalSubtitle">
                Ajoutez un client en quelques secondes. Vous pourrez compléter
                les informations plus tard.
              </p>
            </div>
            <button
              type="button"
              className="btn btnGhost btnSmall"
              onClick={closeAddClientModal}
            >
              Fermer
            </button>
          </div>

          <div className="expertModalBody">
            <section className="expertDataModeBox" aria-label="Mode données">
              <div className="expertDataModeHeader">
                <span>Mode données</span>
                <small>Connexion automatique (URSSAF/API) prévue dans une prochaine version.</small>
              </div>
              <div className="expertDataModeOptions">
                <label className="expertDataModeOption expertDataModeOption--active">
                  <input
                    type="radio"
                    name="client-data-source"
                    value="manual"
                    checked={newClientForm.dataSource === "manual"}
                    onChange={() => handleNewClientChange("dataSource", "manual")}
                  />
                  Saisie manuelle (démo)
                </label>
                <label className="expertDataModeOption expertDataModeOption--disabled">
                  <input
                    type="radio"
                    name="client-data-source"
                    value="connected"
                    disabled
                  />
                  Données connectées (bientôt)
                </label>
              </div>
            </section>

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
              <label htmlFor="expert-client-activity">Activité</label>
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
              <label htmlFor="expert-client-revenue">
                Chiffre d’affaires estimé
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
              <label htmlFor="expert-client-region">Région</label>
              <input
                id="expert-client-region"
                type="text"
                className="expertModalInput"
                value={newClientForm.region}
                onChange={(event) =>
                  handleNewClientChange("region", event.target.value)
                }
                placeholder="Non renseignée"
              />
            </div>

            <div className="expertModalField">
              <label htmlFor="expert-client-type">Type client</label>
              <select
                id="expert-client-type"
                className="expertModalSelect"
                value={newClientForm.clientType}
                onChange={(event) =>
                  handleNewClientChange("clientType", event.target.value)
                }
              >
                {CLIENT_TYPE_OPTIONS.map((clientType) => (
                  <option key={clientType} value={clientType}>
                    {clientType}
                  </option>
                ))}
              </select>
            </div>

            <details className="expertAdvancedOptions">
              <summary>+ Options avancées</summary>
              <p>Ces champs ne sont pas nécessaires pour tester le prototype.</p>

              <div className="expertAdvancedGrid">
                <div className="expertModalField">
                  <label htmlFor="expert-client-siret">SIRET (optionnel)</label>
                  <input
                    id="expert-client-siret"
                    type="text"
                    className="expertModalInput"
                    value={newClientForm.siret}
                    onChange={(event) =>
                      handleNewClientChange("siret", event.target.value)
                    }
                    placeholder="Ex : 123 456 789 00012"
                  />
                </div>

                <div className="expertModalField">
                  <label htmlFor="expert-client-regime">Régime</label>
                  <select
                    id="expert-client-regime"
                    className="expertModalSelect"
                    value={newClientForm.regime}
                    onChange={(event) =>
                      handleNewClientChange("regime", event.target.value)
                    }
                  >
                    <option value="micro">Micro</option>
                    <option value="reel">Réel</option>
                    <option value="inconnu">Inconnu</option>
                  </select>
                </div>

                <div className="expertModalField">
                  <label htmlFor="expert-client-activity-type">Type d’activité</label>
                  <select
                    id="expert-client-activity-type"
                    className="expertModalSelect"
                    value={newClientForm.activityType}
                    onChange={(event) =>
                      handleNewClientChange("activityType", event.target.value)
                    }
                  >
                    <option value="">À déterminer</option>
                    <option value="prestation_services">Prestation de services</option>
                    <option value="vente_commerce">Vente-commerce</option>
                    <option value="mixte">Mixte</option>
                    <option value="profession_liberale">Profession libérale</option>
                  </select>
                </div>

                <div className="expertModalField">
                  <label htmlFor="expert-client-tva-threshold">Seuil TVA</label>
                  <select
                    id="expert-client-tva-threshold"
                    className="expertModalSelect"
                    value={newClientForm.tvaThresholdMode}
                    onChange={(event) =>
                      handleNewClientChange("tvaThresholdMode", event.target.value)
                    }
                  >
                    <option value="auto">Auto</option>
                    <option value="manual">Manuel</option>
                  </select>
                </div>

                <div className="expertModalField">
                  <label htmlFor="expert-client-charge-rate">
                    Taux de charges estimé (%)
                  </label>
                  <input
                    id="expert-client-charge-rate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    inputMode="decimal"
                    className="expertModalInput"
                    value={newClientForm.chargeRate}
                    onChange={(event) =>
                      handleNewClientChange("chargeRate", event.target.value)
                    }
                    placeholder="Auto"
                  />
                </div>

                <div className="expertModalField">
                  <label htmlFor="expert-client-assigned-to">Assignation</label>
                  <select
                    id="expert-client-assigned-to"
                    className="expertModalSelect"
                    value={newClientForm.assignedTo}
                    onChange={(event) =>
                      handleNewClientChange("assignedTo", event.target.value)
                    }
                  >
                    <option>Non assigné</option>
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
              </div>
            </details>

            <div className="expertModalField">
              <label htmlFor="expert-client-note">Note optionnelle</label>
              <textarea
                id="expert-client-note"
                className="expertModalTextarea"
                value={newClientForm.note}
                onChange={(event) =>
                  handleNewClientChange("note", event.target.value)
                }
                rows={4}
                placeholder="Ex : premier échange, point de vigilance, document attendu..."
              />
            </div>

            {addClientError && (
              <div className="expertModalError" role="alert">
                {addClientError}
              </div>
            )}
          </div>

          <div className="expertModalActions expertModalActions--sticky">
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
              {isEditingClient ? submitLabel : "Ajouter le client"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderReminderModal() {
    if (!reminderClient) {
      return null;
    }

    return (
      <div className="expertModalOverlay" role="presentation">
        <div
          className="expertModalCard"
          role="dialog"
          aria-modal="true"
          aria-labelledby="expert-reminder-title"
        >
          <div className="expertModalHeader">
            <div>
              <h3 id="expert-reminder-title">Envoyer un rappel</h3>
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
            <label htmlFor="expert-reminder-message">Message simulé</label>
            <textarea
              id="expert-reminder-message"
              className="expertModalTextarea"
              value={reminderMessage}
              onChange={(event) => setReminderMessage(event.target.value)}
              rows={6}
            />
          </div>

          <div className="expertModalActions">
            <button
              type="button"
              className="btn btnGhost btnSmall"
              onClick={closeReminderModal}
            >
              Annuler
            </button>
            <button
              type="button"
              className="btn btnPrimary btnSmall"
              onClick={handleSendReminderSimulation}
            >
              Envoyer le rappel
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderInvoiceModal() {
    if (!showInvoiceModal || !selectedClient) {
      return null;
    }

    return (
      <div className="expertModalOverlay" role="presentation">
        <div
          className="expertModalCard"
          role="dialog"
          aria-modal="true"
          aria-labelledby="expert-invoice-title"
        >
          <div className="expertModalHeader">
            <div>
              <h3 id="expert-invoice-title">Créer une facture</h3>
              <p className="expertModalSubtitle">{selectedClient.name}</p>
            </div>
            <button
              type="button"
              className="btn btnGhost btnSmall"
              onClick={closeInvoiceModal}
            >
              Fermer
            </button>
          </div>

          <div className="expertModalField">
            <label htmlFor="expert-invoice-client">Client</label>
            <input
              id="expert-invoice-client"
              type="text"
              className="expertModalInput"
              value={selectedClient.name}
              readOnly
            />
          </div>

          <div className="expertModalField">
            <label htmlFor="expert-invoice-amount">Montant</label>
            <input
              id="expert-invoice-amount"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              className="expertModalInput"
              value={invoiceForm.amount}
              onChange={(event) =>
                handleInvoiceFormChange("amount", event.target.value)
              }
            />
          </div>

          <div className="expertModalField">
            <label htmlFor="expert-invoice-status">Statut</label>
            <select
              id="expert-invoice-status"
              className="expertModalSelect"
              value={invoiceForm.status}
              onChange={(event) =>
                handleInvoiceFormChange("status", event.target.value)
              }
            >
              <option value="draft">Brouillon</option>
              <option value="pdf_generated">PDF généré</option>
              <option value="facturx_ready">Factur-X prêt</option>
              <option value="non_transmis">non transmis</option>
            </select>
          </div>

          <div className="expertModalField">
            <label htmlFor="expert-invoice-issued-at">Date d’émission</label>
            <input
              id="expert-invoice-issued-at"
              type="date"
              className="expertModalInput"
              value={invoiceForm.issuedAt}
              onChange={(event) =>
                handleInvoiceFormChange("issuedAt", event.target.value)
              }
            />
          </div>

          {invoiceError && (
            <div className="expertModalError" role="alert">
              {invoiceError}
            </div>
          )}

          <div className="expertModalActions">
            <button
              type="button"
              className="btn btnGhost btnSmall"
              onClick={closeInvoiceModal}
            >
              Annuler
            </button>
            <button
              type="button"
              className="btn btnPrimary btnSmall"
              onClick={handleCreateInvoice}
            >
              Créer la facture
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderCsvImportModal() {
    if (!showCsvImportModal) {
      return null;
    }

    return (
      <div className="expertModalOverlay" role="presentation">
        <div
          className="expertModalCard expertModalCard--clientForm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="expert-csv-import-title"
        >
          <div className="expertModalHeader">
            <div>
              <h3 id="expert-csv-import-title">Importer des clients</h3>
              <p className="expertModalSubtitle">
                Les colonnes minimales sont : name, activity, revenue.
              </p>
            </div>
            <button
              type="button"
              className="btn btnGhost btnSmall"
              onClick={closeCsvImportModal}
            >
              Fermer
            </button>
          </div>

          <div className="expertModalBody">
            <div className="expertModalField">
              <label htmlFor="expert-csv-file">Fichier CSV</label>
              <input
                id="expert-csv-file"
                type="file"
                accept=".csv,text/csv"
                className="expertModalInput"
                onChange={handleCsvFileChange}
              />
            </div>

            {csvImportError && (
              <div className="expertModalError" role="alert">
                {csvImportError}
              </div>
            )}

            {csvImportPreview && (
              <div className="expertCsvPreview">
                <h4>{csvImportPreview.validRows.length} client(s) détecté(s)</h4>
                {csvImportPreview.invalidRows.length > 0 && (
                  <p className="expertCsvWarning">
                    {csvImportPreview.invalidRows.length} ligne(s) ignorée(s)
                    car incomplète(s)
                  </p>
                )}
                {csvImportPreview.duplicateCount > 0 && (
                  <p className="expertCsvWarning">
                    {csvImportPreview.duplicateCount} client(s) ignoré(s) car déjà existant(s).
                  </p>
                )}
                <div className="expertCsvPreviewList">
                  {(csvImportPreview.importableRows || csvImportPreview.validRows)
                    .slice(0, 5)
                    .map((row) => (
                    <div
                      key={`${row.rowNumber}-${row.name}`}
                      className={row.isDuplicate ? "expertCsvDuplicateRow" : ""}
                    >
                      <strong>{row.name}</strong>
                      <span>{row.activity}</span>
                      <span>{formatCurrency(row.revenue)}</span>
                    </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          <div className="expertModalActions expertModalActions--sticky">
            <button
              type="button"
              className="btn btnGhost btnSmall"
              onClick={closeCsvImportModal}
            >
              Annuler
            </button>
            <button
              type="button"
              className="btn btnPrimary btnSmall"
              onClick={handleConfirmCsvImport}
              disabled={
                !csvImportPreview ||
                (csvImportPreview.importableRows || csvImportPreview.validRows).length === 0
              }
            >
              Importer les clients
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
            Version de démonstration — aucune donnée réelle utilisée. Test
            libre, sans inscription.
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
          <button
            type="button"
            className="btn btnPrimary btnSmall"
            onClick={exportCabinetReportPdf}
          >
            Exporter rapport cabinet PDF
          </button>
        </div>

        <section className="expertDemoGuide" aria-label="Comment tester rapidement">
          <div>
            <h3>Comment tester rapidement</h3>
            <p>
              Version de démonstration — aucune donnée réelle utilisée. Test
              libre, sans inscription.
            </p>
          </div>
          <ol>
            <li>Ouvrir une fiche client</li>
            <li>Ajouter une note</li>
            <li>Créer une action</li>
            <li>Vérifier les priorités mises à jour</li>
          </ol>
        </section>

        {isDashboardLoading && clients.length === 0 ? (
          <>
            <p className="expertHistoryEmpty">Chargement...</p>
            {renderAddClientModal()}
          </>
        ) : clients.length === 0 ? (
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
                      <RiskScoreIndicator client={priority.client} compact />
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
              <div className="expertHealthyState">
                <p className="expertOverviewEmpty">
                  Aucune priorité urgente pour le moment.
                </p>
                <p className="expertOverviewEmpty">
                  Les dossiers suivis ne présentent pas de signal critique actuellement.
                </p>
                {normalFollowUpClients.length > 0 && (
                  <div className="expertNormalFollowUp">
                    <h4>Suivi normal</h4>
                    <ul className="expertPriorityBoard expertPriorityBoard--normal">
                      {normalFollowUpClients.map((item) => (
                        <li key={`normal-follow-up-${item.id}`}>
                          <span className="expertBadge expertBadge--ok">OK</span>
                          <div>
                            <strong>{item.clientName}</strong>
                            <p>Suivi régulier à maintenir</p>
                            <RiskScoreIndicator client={item.client} compact />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
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

            {isDashboardLoading && (
              <p className="expertHistoryEmpty">Chargement...</p>
            )}

            <div className="expertKpis expertKpis--compact">
              <div className="expertKpiCard">
                <span>Clients suivis</span>
                <strong>{kpis.totalClients}</strong>
              </div>
              <div className="expertKpiCard">
                <span>Chiffre d’affaires</span>
                <strong>{formatCurrency(kpis.totalRevenue)}</strong>
              </div>
              <div className="expertKpiCard">
                <span>Actions à traiter</span>
                <strong>{kpis.totalActionsTodo}</strong>
              </div>
              <div className="expertKpiCard">
                <span>Actions terminées</span>
                <strong>{kpis.totalActionsDone}</strong>
              </div>
              <div className="expertKpiCard">
                <span>Notes cette semaine</span>
                <strong>{kpis.notesThisWeek}</strong>
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
        ) : alertGroups.every((group) => group.items.length === 0) ? (
          <div className="expertAlertEmpty">
            <p>Aucune alerte active pour le moment.</p>
            <p>Les dossiers suivis ne présentent pas de signal critique.</p>
          </div>
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
                  {group.items.length}
                </span>
              </div>

              {group.items.length > 0 ? (
                <div className="expertAlertList">
                  {group.items.map((item) => (
                    <article className="expertAlertItem" key={item.id}>
                      <div className="expertAlertItemMain">
                        <div>
                          <h4>{item.clientName}</h4>
                          <p>{item.priority.message}</p>
                          <RiskScoreIndicator client={item.client} compact />
                        </div>
                        <span
                          className={`expertBadge expertBadge--${item.priority.status}`}
                        >
                          {item.priority.label}
                        </span>
                      </div>

                      <button
                        type="button"
                        className="btn btnPrimary btnSmall"
                        onClick={() => handleOpenClientFromAlert(item.client)}
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
        key: "late",
        title: "En retard",
        badge: "En retard",
        items: pendingScheduleActions.filter((item) => item.isLate),
      },
      {
        key: "todo",
        title: "À traiter",
        badge: "À traiter",
        items: pendingScheduleActions.filter((item) => !item.isLate),
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
              Actions ouvertes à traiter sur les dossiers clients
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
                        key={`${section.key}-${item.clientId}-${item.id}-${index}`}
                      >
                        <div>
                          <h4>{item.clientName}</h4>
                          <p>{item.action.text}</p>
                          <small className="expertScheduleMeta">
                            Créée le {formatLongDateTimeFr(item.createdAt)} ·{" "}
                            {item.isLate ? "En retard" : "À traiter"}
                          </small>
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
                    Aucune action à traiter dans ce groupe.
                  </div>
                )}
              </section>
            ))}
          </div>
        ) : (
          <div className="expertEmptyState">
            Aucune action à traiter pour le moment.
          </div>
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
        ) : allClientNotes.length === 0 ? (
          <div className="expertAlertEmpty">
            Aucune note ajoutée pour le moment.
          </div>
        ) : (
          <div className="expertAlertList">
            {allClientNotes.map((note) => (
              <article className="expertAlertItem" key={note.id}>
                <div className="expertAlertItemMain">
                  <div>
                    <h4>{note.clientName}</h4>
                    <p>{note.text}</p>
                    <p className="expertRecommendedAction">
                      {note.createdAt
                        ? formatLongDateTimeFr(note.createdAt)
                        : "Note existante"}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btnPrimary btnSmall"
                  onClick={() => handleOpenClientFromAlert(note.client)}
                >
                  Voir fiche
                </button>
              </article>
            ))}
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
              className="btn btnGhost btnSmall"
              onClick={() => exportClientReportPdf(selectedClient)}
            >
              Exporter rapport PDF
            </button>
            <button
              type="button"
              className="btn btnGhost btnSmall"
              onClick={() => openReminderModal(selectedClient)}
            >
              Envoyer rappel
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
              <div className="expertDetailRisk">
                <span
                  className={`expertBadge expertBadge--${getClientRisk(selectedClient).status}`}
                >
                  {getClientRisk(selectedClient).label}
                </span>
                <RiskScoreIndicator client={selectedClient} compact />
              </div>
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
                <span>Région</span>
                <strong>{getClientRegion(selectedClient)}</strong>
              </div>
              <div className="expertInfoBlock">
                <span>Type client</span>
                <strong>{getClientType(selectedClient)}</strong>
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
              <div className="expertInfoBlock">
                <span>Score de risque</span>
                <strong>
                  {getClientRiskScore(selectedClient).score}/100 ·{" "}
                  {getClientRiskScore(selectedClient).label}
                </strong>
              </div>
            </div>

            <div className="expertPanelBlock expertFileSummary">
              <h3>Synthèse du dossier</h3>
              <ul>
                {selectedClientSummary.map((item) => (
                  <li key={item.label}>
                    <span>{item.label}</span>
                    <p>{item.text}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="expertPanelBlock">
              <div className="expertPanelHeader">
                <div>
                  <h3>Factures</h3>
                  {selectedClientInvoices.length > 0 && (
                    <span>{selectedClientInvoices.length} facture(s)</span>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btnPrimary btnSmall"
                  onClick={openInvoiceModal}
                >
                  Créer une facture
                </button>
              </div>
              <p className="expertInvoiceNote">
                Préparation Factur-X — transmission PDP prévue dans une prochaine version.
              </p>
              {selectedClientInvoices.length > 0 ? (
                <>
                  {selectedClientInvoices.reduce(
                    (total, invoice) => total + invoice.amount,
                    0,
                  ) > 12000 && (
                    <p className="expertInvoiceInsight">
                      Attention : seuil TVA à surveiller
                    </p>
                  )}
                  <div className="expertInvoiceList">
                    {selectedClientInvoices.map((invoice) => (
                      <article className="expertInvoiceItem" key={invoice.id}>
                        <div>
                          <strong>{formatCurrency(invoice.amount)}</strong>
                          <span>
                            {invoice.date
                              ? formatLongDateTimeFr(invoice.date)
                              : "Date inconnue"}
                          </span>
                          <small>{invoice.clientName || selectedClient.name}</small>
                        </div>
                        <div className="expertInvoiceMeta">
                          <span className="expertBadge expertBadge--ok">
                            {invoice.status}
                          </span>
                          <small>{invoice.tvaLabel}</small>
                        </div>
                        <div className="expertInvoiceActions">
                          <button
                            type="button"
                            className="btn btnGhost btnSmall"
                            disabled
                          >
                            Voir PDF · bientôt
                          </button>
                          <button
                            type="button"
                            className="btn btnGhost btnSmall"
                            disabled
                          >
                            Télécharger · bientôt
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <p className="expertHistoryEmpty">Aucune facture pour ce client</p>
              )}
            </div>

            <div className="expertPanelBlock">
              <h3>Notes expert</h3>
              <div className="expertDetailNoteForm">
                <textarea
                  className="expertModalTextarea"
                  value={detailNoteDraft}
                  onChange={(event) => {
                    setDetailNoteDraft(event.target.value);
                    if (detailNoteError) {
                      setDetailNoteError("");
                    }
                  }}
                  placeholder="Ajouter une note..."
                  rows={3}
                />
                <button
                  type="button"
                  className="btn btnPrimary btnSmall"
                  onClick={handleAddDetailNote}
                >
                  Ajouter
                </button>
              </div>
              {detailNoteError && (
                <div className="expertModalError" role="alert">
                  {detailNoteError}
                </div>
              )}
              {selectedClientNotes.length > 0 ? (
                <ul className="expertNotesList">
                  {selectedClientNotes.map((note, index) => (
                    <li key={note.id || `${selectedClient.id}-note-${index}`}>
                      <div>
                        <span className="expertNoteDate">
                          {formatNoteDate(note.createdAt || note.date)}
                        </span>
                        <p className="expertNoteText">{note.text}</p>
                      </div>
                      <button
                        type="button"
                        className="btn btnGhost btnSmall expertInlineDangerButton"
                        onClick={() => handleDeleteDetailNote(note.id, index)}
                      >
                        Supprimer
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="expertHistoryEmpty">Aucune note pour ce client</p>
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
              <div className="expertDetailActionForm">
                <input
                  type="text"
                  className="expertModalInput"
                  value={detailActionDraft}
                  onChange={(event) => {
                    setDetailActionDraft(event.target.value);
                    if (detailActionError) {
                      setDetailActionError("");
                    }
                  }}
                  placeholder="Ajouter une action..."
                />
                <button
                  type="button"
                  className="btn btnPrimary btnSmall"
                  onClick={handleAddDetailAction}
                >
                  Ajouter
                </button>
              </div>
              {detailActionError && (
                <div className="expertModalError" role="alert">
                  {detailActionError}
                </div>
              )}
              <div className="expertActionPlan">
                {selectedClientActions.map((action) => (
                  <article
                    className={`expertActionItem${
                      action.status === "done" ? " expertActionItem--done" : ""
                    }`}
                    key={action.id}
                  >
                    <div>
                      <strong>{action.text}</strong>
                      <span className="expertActionMeta">
                        {action.status === "done" ? "Terminée" : "À faire"} ·{" "}
                        {formatLongDateTimeFr(action.createdAt)}
                      </span>
                    </div>
                    <div className="expertActionButtons">
                      {action.status !== "done" && (
                        <button
                          type="button"
                          className="btn btnGhost btnSmall"
                          onClick={() => handleCompleteDetailAction(action.id)}
                        >
                          Marquer fait
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btnGhost btnSmall expertInlineDangerButton"
                        onClick={() => handleDeleteDetailAction(action.id)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </article>
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
        {renderReminderModal()}
        {renderInvoiceModal()}
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
          <p className="expertDashboard__subtitle expertImportHelper">
            Vous pouvez importer un fichier CSV exporté depuis Excel, Google Sheets ou un outil métier.
          </p>
        </div>
        <div className="expertHeaderActions">
          <button
            type="button"
            className="btn btnGhost btnSmall"
            onClick={downloadCsvTemplate}
          >
            Télécharger un modèle CSV
          </button>
          <button
            type="button"
            className="btn btnGhost btnSmall"
            onClick={openCsvImportModal}
          >
            Importer CSV
          </button>
          <button
            type="button"
            className="btn btnPrimary btnSmall"
            onClick={openAddClientModal}
          >
            + Ajouter client
          </button>
        </div>
      </div>

      {clients.length === 0 ? (
        renderEmptyState()
      ) : (
      <>
      {isDashboardLoading && (
        <p className="expertHistoryEmpty">Chargement...</p>
      )}
      <div className="expertKpis">
        <div className="expertKpiCard">
          <span>Clients suivis</span>
          <strong>{kpis.totalClients}</strong>
        </div>
        <div className="expertKpiCard">
          <span>Chiffre d’affaires</span>
          <strong>{formatCurrency(kpis.totalRevenue)}</strong>
        </div>
        <div className="expertKpiCard">
          <span>Actions terminées</span>
          <strong>{kpis.totalActionsDone}</strong>
        </div>
        <div className="expertKpiCard">
          <span>Actions à traiter</span>
          <strong>{kpis.totalActionsTodo}</strong>
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
                <div className="expertClientTags">
                  <span>{getClientRegion(client)}</span>
                  <span>{getClientType(client)}</span>
                </div>
              </div>
              <div className="expertCardRisk">
                <span className={`expertBadge expertBadge--${getClientRisk(client).status}`}>
                  {getClientRisk(client).label}
                </span>
                <RiskScoreIndicator client={client} compact />
              </div>
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

      {renderReminderModal()}

      {renderAddClientModal()}
      {renderCsvImportModal()}

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
