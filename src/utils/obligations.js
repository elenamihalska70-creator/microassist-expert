// src/utils/obligations.js

function getRate(activityType) {
  if (activityType === "services") return 0.22;
  if (activityType === "vente") return 0.123;
  if (activityType === "mixte") return 0.18;
  return 0;
}
function formatFR(date) {
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatMonthFR(date) {
  return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function daysBetween(a, b) {
  // b - a (сколько дней до дедлайна)
  const ms = b.getTime() - a.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}


// helpers
function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0); // last day of month
}
function addMonths(date, n) {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}


// квартал для "сегодня"
function getQuarterIndex(m) { // m: 0..11
  if (m <= 2) return 1;   // Q1
  if (m <= 5) return 2;   // Q2
  if (m <= 8) return 3;   // Q3
  return 4;               // Q4
}

function nextQuarterDeadline(today) {
  const y = today.getFullYear();
  const q = getQuarterIndex(today.getMonth());

  // дедлайн для текущего квартала (как на service-public)
  // Q1 -> 30 Apr, Q2 -> 31 Jul, Q3 -> 31 Oct, Q4 -> 31 Jan (next year)
  if (q === 1) return new Date(y, 3, 30);        // Apr 30
  if (q === 2) return new Date(y, 6, 31);        // Jul 31
  if (q === 3) return new Date(y, 9, 31);        // Oct 31
  return new Date(y + 1, 0, 31);                 // Jan 31 next year
}

function nextMonthlyDeadline(today) {
  // за текущий месяц дедлайн = конец следующего месяца
  const nextMonth = addMonths(today, 1);
  return endOfMonth(nextMonth);
}

export function computeObligations(answers = {}) {
  const ca = Number(answers.ca_month || 0);
  const rate = getRate(answers.activity_type);
  const estimatedAmount = Math.round(ca * rate);
  const treasuryRecommended = estimatedAmount; // MVP: минимум = charges estimées

const treasuryLabel =
  !answers?.activity_type ? "Choisis une activité"
  : treasuryRecommended
    ? `${treasuryRecommended.toLocaleString("fr-FR")} € à mettre de côté`
    : "—";// MVP: держим минимум = charges estimées
  // === TVA threshold logic (MVP) ===
  

const caAnnuel = ca * 12;

let tvaThreshold = 0;

// seuils micro-entreprise (approximation officielle)
if (answers.activity_type === "services") {
  tvaThreshold = 36800;
} else if (answers.activity_type === "vente") {
  tvaThreshold = 91900;
} else if (answers.activity_type === "mixte") {
  tvaThreshold = 36800; // MVP simplifié
}

let tvaStatus = "ok";

if (tvaThreshold > 0) {
  const ratio = caAnnuel / tvaThreshold;

  if (ratio >= 1) tvaStatus = "exceeded";
  else if (ratio >= 0.8) tvaStatus = "soon";
  else tvaStatus = "ok";
}
// ✅ TVA urgency (pour UI: orange/rouge + badge)
let tvaUrgency = null;
if (tvaStatus === "exceeded") tvaUrgency = "late";
else if (tvaStatus === "soon") tvaUrgency = "soon";


// ✅ TVA hint text (mini explication)
let tvaHint = null;
if (tvaThreshold > 0) {
  const note = answers.activity_type === "mixte" ? " (mixte : estimation simplifiée)" : "";
  tvaHint = `CA annuel estimé : ${caAnnuel.toLocaleString("fr-FR")} € / seuil : ${tvaThreshold.toLocaleString("fr-FR")} €${note}`;
}

 const today = new Date();
const freq = answers.declaration_frequency;

let deadlineDate = null;
let nextDeclaration = "Prochaine échéance : à définir";

if (freq === "monthly") {
  deadlineDate = nextMonthlyDeadline(today);
  nextDeclaration = "Déclaration mensuelle";
} else if (freq === "quarterly") {
  deadlineDate = nextQuarterDeadline(today);
  nextDeclaration = "Déclaration trimestrielle";
}
// ✅ period label (pour quel mois / trimestre)
let periodLabel = null;

if (freq === "monthly") {
  // дедлайн = конец следующего месяца => декларация за текущий месяц
  periodLabel = `CA de ${formatMonthFR(today)}`;
} else if (freq === "quarterly") {
  const q = getQuarterIndex(today.getMonth());
  periodLabel = `CA du trimestre T${q} ${today.getFullYear()}`;
}

// ✅ days left / late
let daysLeft = null;
if (deadlineDate) {
  daysLeft = daysBetween(today, deadlineDate); // >0 осталось, <=0 просрочено/сегодня
}

// ✅ urgency (si l’échéance approche / en retard)
let urgency = null;

if (deadlineDate) {
  const diffMs = deadlineDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) urgency = "late";
  else if (diffDays <= 7) urgency = "soon";
}

// ✅ recommandations (Action list)
const recommendations = [];
if (freq === "unknown") {
  recommendations.push({
    key: "freq_unknown",
    title: "Périodicité à confirmer",
    level: "warning",
    text: "Choisis 'Mensuel' ou 'Trimestriel' pour calculer une date limite. Tu peux vérifier dans ton espace URSSAF.",
  });
}

// 1) Deadline / URSSAF
if (urgency === "late") {
  recommendations.push({
    key: "deadline_late",
    title: "Déclaration URSSAF en retard",
    level: "danger",
    text: "Connecte-toi à autoentrepreneur.urssaf.fr et régularise ta déclaration dès que possible. En cas de blocage, contacte l’URSSAF.",
  });
} else if (urgency === "soon") {
  recommendations.push({
    key: "deadline_soon",
    title: "Échéance proche",
    level: "warning",
    text: "Prépare ton chiffre d’affaires et planifie 10 minutes cette semaine pour déclarer sur autoentrepreneur.urssaf.fr.",
  });
} else if (typeof daysLeft === "number" && daysLeft > 7) {
  recommendations.push({
    key: "deadline_ok",
    title: "Tout est sous contrôle",
    level: "ok",
    text: "Garde ton CA à jour. Tu pourras déclarer sans stress à l’approche de l’échéance.",
  });
}

// 2) TVA
if (tvaStatus === "exceeded") {
  recommendations.push({
    key: "tva_exceeded",
    title: "Seuil TVA dépassé",
    level: "danger",
    text: "Vérifie ton régime TVA. Tu pourrais devoir facturer la TVA et la déclarer. Si tu n’es pas sûr(e), demande confirmation à un expert-comptable.",
  });
} else if (tvaStatus === "soon") {
  recommendations.push({
    key: "tva_soon",
    title: "Seuil TVA bientôt atteint",
    level: "warning",
    text: "Surveille ton CA. Anticipe la TVA (mentions sur factures, paramétrage) pour éviter les surprises.",
  });
}

const nextDeclarationLabel =
  (!freq || freq === "unknown") ? "Choisis une périodicité"
  : urgency === "late" ? `⚠️ Déclaration en retard${periodLabel ? ` — ${periodLabel}` : ""}`
  : urgency === "soon" ? `⏰ Échéance proche${periodLabel ? ` — ${periodLabel}` : ""}`
  : `${nextDeclaration}${periodLabel ? ` — ${periodLabel}` : ""}`;


const amountEstimatedLabel =
  !answers?.activity_type ? "Choisis une activité"
  : rate <= 0 ? "Choisis une activité"
  : `${estimatedAmount.toLocaleString("fr-FR")} € (${Math.round(rate * 100)}%)`;

const deadlineLabel =
  (!deadlineDate || freq === "unknown") ? "—"
  : `${formatFR(deadlineDate)}${
      typeof daysLeft === "number"
        ? daysLeft < 0
          ? ` (en retard de ${Math.abs(daysLeft)} j)`
          : daysLeft === 0
          ? " (aujourd’hui)"
          : ` (dans ${daysLeft} j)`
        : ""
    }`;

const tvaStatusLabel =
  tvaStatus === "exceeded" ? "🚨 Seuil TVA dépassé"
  : tvaStatus === "soon" ? "⚠️ Seuil TVA proche"
  : "Franchise TVA OK";

return {
  estimatedAmount,
  rate,
  nextDeclaration,
  deadlineDate,
  urgency,
  periodLabel,
  daysLeft,
  caAnnuel,
  tvaThreshold,
  tvaStatus,
  tvaUrgency,
  tvaHint,
  recommendations,
  obligations: [],
  nextDeclarationLabel,
  amountEstimatedLabel,
  deadlineLabel,
  tvaStatusLabel,
  treasuryLabel,
};

}
export function getDashValue(cardKey, answers = {}, computed = {}) {
  const map = {
    next_declaration: computed?.nextDeclarationLabel,
    estimated_amount: computed?.amountEstimatedLabel,
    deadline: computed?.deadlineLabel,
    tva: computed?.tvaStatusLabel,
    reminders: answers?.reminders_enabled ? "✅ Activé" : "⏸ Désactivé",

    // ✅ новая карточка “трезори”
    treasury: computed?.treasuryLabel,
  };

  return map[cardKey] ?? "—";
}
