// src/utils/obligations.js

function getRate(activityType) {
  if (activityType === "services") return 0.22;
  if (activityType === "vente") return 0.123;
  if (activityType === "mixte") return 0.18;
  return 0;
}

function formatFR(date) {
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatMonthFR(date) {
  return date.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
}

function daysBetween(a, b) {
  const ms = b.getTime() - a.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addMonths(date, n) {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

function getQuarterIndex(m) {
  if (m <= 2) return 1;
  if (m <= 5) return 2;
  if (m <= 8) return 3;
  return 4;
}

function nextQuarterDeadline(today) {
  const y = today.getFullYear();
  const q = getQuarterIndex(today.getMonth());

  if (q === 1) return new Date(y, 3, 30);
  if (q === 2) return new Date(y, 6, 31);
  if (q === 3) return new Date(y, 9, 31);
  return new Date(y + 1, 0, 31);
}

function nextMonthlyDeadline(today) {
  const nextMonth = addMonths(today, 1);
  return endOfMonth(nextMonth);
}

export function computeObligations(answers = {}) {
  const ca = Number(answers.ca_month || 0);
  const baseRate = getRate(answers.activity_type);
  let rate = baseRate;
  
  // ✅ ACRE logic avec calcul de la date de fin
  let acreActive = false;
  let acreMonthsLeft = null;
  let acreEndDate = null;
  let acreHint = null;

  if (answers.acre === "yes" && baseRate > 0) {
    acreActive = true;
    rate = baseRate / 2;
    
    // ✅ Calcul de la date de fin ACRE
    if (answers.acre_start_date) {
      const startDate = new Date(answers.acre_start_date);
      const today = new Date();
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 12);
      
      const monthsSinceStart = (today.getFullYear() - startDate.getFullYear()) * 12 + 
                              (today.getMonth() - startDate.getMonth());
      acreMonthsLeft = Math.max(0, 12 - monthsSinceStart);
      acreEndDate = endDate;
      
      // Si ACRE est terminée
      if (acreMonthsLeft <= 0) {
        acreActive = false;
        rate = baseRate;
        acreHint = "⚠️ Votre période ACRE est terminée. Modifiez votre profil pour ajuster les charges.";
      } else if (acreMonthsLeft <= 3) {
        acreHint = `⏰ ACRE bientôt terminée : encore ${acreMonthsLeft} mois. Pensez à mettre à jour votre profil.`;
      } else {
        acreHint = `💡 ACRE appliquée : taux réduit de ${Math.round(baseRate * 100)}% → ${Math.round(rate * 100)}% pour la première année. Valable encore ${acreMonthsLeft} mois.`;
      }
    } else {
      // Pas de date de début renseignée
      acreHint = `💡 ACRE appliquée : taux réduit de ${Math.round(baseRate * 100)}% → ${Math.round(rate * 100)}% pour la première année.`;
    }
  } else if (answers.acre === "unknown") {
    acreHint = "💡 Si tu bénéficies de l’ACRE, tes charges peuvent être réduites de 50% la première année.";
  }

  const estimatedAmount = Math.round(ca * rate);
  const treasuryRecommended = estimatedAmount;

  const treasuryLabel =
    !answers?.activity_type
      ? "Choisis une activité"
      : treasuryRecommended
        ? `${treasuryRecommended.toLocaleString("fr-FR")} € à mettre de côté`
        : "—";

// Projection annuelle intelligente
// Si on a des données sur plusieurs mois — utiliser la moyenne réelle
// Sinon — projection simple avec avertissement
const caYtd = Number(answers.ca_ytd || 0); // CA total depuis début d'année
const monthsWithData = Number(answers.months_with_data || 1); // nombre de mois avec données

let caAnnuel;
let tvaProjectionMode; // pour afficher comment on a calculé

if (caYtd > 0 && monthsWithData > 1) {
  // Moyenne réelle sur plusieurs mois → projection fiable
  const monthlyAverage = caYtd / monthsWithData;
  caAnnuel = Math.round(monthlyAverage * 12);
  tvaProjectionMode = "moyenne";
} else {
  // Un seul mois — projection simple mais on l'indique clairement
  caAnnuel = ca * 12;
  tvaProjectionMode = "estimation";
}

  // ==================== TVA CALCULATIONS ====================
  let tvaThreshold = 0;

  if (answers.activity_type === "services") {
    tvaThreshold = 36800;
  } else if (answers.activity_type === "vente") {
    tvaThreshold = 91900;
  } else if (answers.activity_type === "mixte") {
    tvaThreshold = 36800;
  }

  let tvaStatus = "ok";

  if (tvaThreshold > 0 && ca > 0) {
    const ratio = caAnnuel / tvaThreshold;

    if (ratio >= 1) tvaStatus = "exceeded";
    else if (ratio >= 0.8) tvaStatus = "soon";
    else tvaStatus = "ok";
  }

  let tvaUrgency = null;
  if (tvaStatus === "exceeded") tvaUrgency = "late";
  else if (tvaStatus === "soon") tvaUrgency = "soon";

let tvaHint = null;

if (!answers.activity_type) {
  tvaHint = "Choisis une activité pour afficher le repère TVA.";
} else if (ca <= 0) {
  tvaHint = "Ajoute un revenu pour afficher un repère TVA basé sur ton activité.";
} else if (tvaThreshold > 0) {
  const note =
    answers.activity_type === "mixte"
      ? " (mixte : estimation simplifiée)"
      : "";

  tvaHint =
    `CA ce mois : ${ca.toLocaleString("fr-FR")} € • ` +
    `Projection annuelle : ${caAnnuel.toLocaleString("fr-FR")} € • ` +
    `Seuil TVA : ${tvaThreshold.toLocaleString("fr-FR")} €${note}`;
}

  if (tvaThreshold > 0) {
  const note = answers.activity_type === "mixte"
    ? " (mixte : estimation simplifiée)"
    : "";

  const projectionNote = tvaProjectionMode === "moyenne"
    ? `moyenne sur ${monthsWithData} mois`
    : "projection sur 1 mois — à affiner";

  tvaHint =
    `CA ce mois : ${ca.toLocaleString("fr-FR")} € • ` +
    `projection annuelle (${projectionNote}) : ${caAnnuel.toLocaleString("fr-FR")} € • ` +
    `seuil : ${tvaThreshold.toLocaleString("fr-FR")} €${note}`;
}


  // ==================== DECLARATION DEADLINES ====================
  const today = new Date();
  const freq = answers.declaration_frequency;

  let deadlineDate = null;
  let nextDeclaration = "Prochaine échéance : à définir";

  if (freq === "mensuel") {
    deadlineDate = nextMonthlyDeadline(today);
    nextDeclaration = "Déclaration mensuelle";
  } else if (freq === "trimestriel") {
    deadlineDate = nextQuarterDeadline(today);
    nextDeclaration = "Déclaration trimestrielle";
  }

  let periodLabel = null;

  if (freq === "mensuel") {
    periodLabel = `CA de ${formatMonthFR(today)}`;
  } else if (freq === "trimestriel") {
    const q = getQuarterIndex(today.getMonth());
    periodLabel = `CA du trimestre T${q} ${today.getFullYear()}`;
  }

  let daysLeft = null;
  if (deadlineDate) {
    daysLeft = daysBetween(today, deadlineDate);
  }

  let urgency = null;

  if (deadlineDate) {
    const diffMs = deadlineDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) urgency = "late";
    else if (diffDays <= 7) urgency = "soon";
  }

  // ==================== RECOMMENDATIONS ====================
  const recommendations = [];

  if (!freq || freq === "") {
    recommendations.push({
      key: "freq_unknown",
      title: "Périodicité à confirmer",
      level: "warning",
      text: "Choisis 'Mensuel' ou 'Trimestriel' pour calculer une date limite. Tu peux vérifier dans ton espace URSSAF.",
    });
  }

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
  } else if (typeof daysLeft === "number" && daysLeft > 7 && freq) {
    recommendations.push({
      key: "deadline_ok",
      title: "Tout est sous contrôle",
      level: "ok",
      text: "Garde ton CA à jour. Tu pourras déclarer sans stress à l’approche de l’échéance.",
    });
  }

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

  // ==================== FINANCIAL HEALTH ANALYSIS ====================
  const monthlyExpenses = Number(answers.monthly_expenses || 0);
  const hasExpenses = monthlyExpenses > 0;

  let financialHealth = null;
  let financialHealthMessage = null;
  let savingsRecommended = 0;
  let coverageRatio = null;

  if (hasExpenses && ca > 0) {
    coverageRatio = ca / monthlyExpenses;
    
    if (coverageRatio < 0.5) {
      financialHealth = "danger";
      financialHealthMessage = "⚠️ Revenus insuffisants pour couvrir les dépenses de base";
      savingsRecommended = Math.round(monthlyExpenses * 3);
    } else if (coverageRatio < 0.8) {
      financialHealth = "warning";
      financialHealthMessage = "⚡ Revenus fragiles, surveille tes dépenses";
      savingsRecommended = Math.round(monthlyExpenses * 2);
    } else if (coverageRatio < 1.2) {
      financialHealth = "neutral";
      financialHealthMessage = "✅ Situation stable, continue à suivre tes finances";
      savingsRecommended = Math.round(monthlyExpenses);
    } else {
      financialHealth = "ok";
      financialHealthMessage = "🎉 Bonne santé financière !";
      savingsRecommended = Math.round(monthlyExpenses * 0.5);
    }
  } else if (hasExpenses && ca === 0) {
    financialHealth = "danger";
    financialHealthMessage = "⚠️ Aucun revenu enregistré, mais des dépenses à couvrir";
    savingsRecommended = Math.round(monthlyExpenses * 3);
  } else if (!hasExpenses && ca > 0) {
    financialHealth = "ok";
    financialHealthMessage = "✅ Aucune dépense renseignée. Pense à les ajouter pour mieux évaluer ta santé financière.";
  }

  // ==================== ANNUAL CALCULATIONS ====================
  const annualRevenue = ca * 12;
  const annualCharges = estimatedAmount * 12;
  const annualNet = annualRevenue - annualCharges;

  // ==================== LABELS ====================
  const nextDeclarationLabel =
    !freq || freq === ""
      ? "Choisis une périodicité"
      : urgency === "late"
        ? `⚠️ Déclaration en retard${periodLabel ? ` — ${periodLabel}` : ""}`
        : urgency === "soon"
          ? `⏰ Échéance proche${periodLabel ? ` — ${periodLabel}` : ""}`
          : `${nextDeclaration}${periodLabel ? ` — ${periodLabel}` : ""}`;

  let amountEstimatedLabel = "—";
  if (!answers?.activity_type) {
    amountEstimatedLabel = "Choisis une activité";
  } else if (rate <= 0) {
    amountEstimatedLabel = "Choisis une activité";
  } else if (ca === 0) {
    amountEstimatedLabel = "Ajoute un revenu pour voir l'estimation";
  } else {
    amountEstimatedLabel = `${estimatedAmount.toLocaleString("fr-FR")} € (${Math.round(rate * 100)}%)`;
    if (acreActive && acreMonthsLeft > 0) {
      amountEstimatedLabel += ` • ACRE (${Math.round(baseRate * 100)}% → ${Math.round(rate * 100)}%) • reste ${acreMonthsLeft} mois`;
    } else if (acreActive && acreMonthsLeft === 0) {
      amountEstimatedLabel += ` • ACRE terminée`;
    }
  }

  const deadlineLabel =
    !deadlineDate || !freq || freq === ""
      ? "—"
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
    !answers?.activity_type
      ? "TVA à définir"
      : ca <= 0
        ? "Franchise TVA - à suivre"
        : tvaStatus === "exceeded"
          ? "🚨 Seuil TVA dépassé"
          : tvaStatus === "soon"
            ? "⚠️ Seuil TVA proche"
            : "Franchise TVA OK";

  // ==================== RETURN ====================
  return {
    // Calculs de base
    estimatedAmount,
    rate,
    baseRate,
    acreActive,
    acreMonthsLeft,
    acreEndDate,
    nextDeclaration,
    deadlineDate,
    urgency,
    periodLabel,
    daysLeft,
    caAnnuel,
    
    // TVA
    tvaThreshold,
    tvaStatus,
    tvaUrgency,
    tvaHint,
    tvaProjectionMode,

    // Recommandations
    recommendations,
    obligations: [],
    
    // Labels
    nextDeclarationLabel,
    amountEstimatedLabel,
    deadlineLabel,
    tvaStatusLabel,
    
    // Trésorerie
    treasuryRecommended,
    treasuryLabel,
    
    // ACRE
    acreHint,
    
    // Analyse financière
    monthlyExpenses,
    financialHealth,
    financialHealthMessage,
    savingsRecommended,
    coverageRatio,
    
    // Calculs annuels
    annualRevenue,
    annualCharges,
    annualNet,
  };
}

// ✅ Функция getDashValue
export function getDashValue(cardKey, answers = {}, computed = {}) {
  const map = {
    next_declaration: computed?.nextDeclarationLabel,
    estimated_amount: computed?.amountEstimatedLabel,
    deadline: computed?.deadlineLabel,
    tva: computed?.tvaStatusLabel,
    reminders: answers?.reminders_enabled ? "✅ Activé" : "⏸ Désactivé",
    treasury: computed?.treasuryLabel,
  };

  return map[cardKey] ?? "—";
}

