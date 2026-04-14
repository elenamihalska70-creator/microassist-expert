import { supabase } from "./lib/supabase.js";
import AuthGate from "./components/AuthGate.jsx";
import CGUModal from "./components/CGUModal.jsx";
import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useLayoutEffect,
  useCallback,
} from "react"; // ✅ Добавляем useCallback
import "./App.css";
import { FISCAL_STEPS } from "./config/steps.fiscal";
import { computeObligations } from "./utils/obligations.js";
import { showConsoleSignature } from "./consoleSignature.js";
import { useAuth } from "./context/AuthContext.jsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import InvoiceGenerator from "./components/InvoiceGenerator.jsx";
import { BETA_MODE, PRICING_LIMITS } from "./config/pricing.js";

// Добавьте после других констант:
const LS_KEY = "microassist_v1";
const LS_VERSION = 1;
const UI_KEY = "microassist_ui_sections";
const CHART_KEY = "microassist_show_chart";
const GUEST_REVENUES_KEY = "revenues_guest";
const GUEST_INVOICES_KEY = "guest_invoices";
const PREMIUM_STATUS_KEY = "microassist_is_premium";
const REMINDER_PREFS_KEY = "microassist_reminder_prefs";
const DASHBOARD_REMINDERS_DISMISSED_KEY =
  "microassist_dashboard_reminders_dismissed";
const DASHBOARD_SECTIONS_KEY = "microassist_dashboard_sections";
const DASHBOARD_TOP_NUDGE_DISMISSED_KEY =
  "microassist_dashboard_top_nudge_dismissed";
const BETA_SEEN_KEY = "beta_seen";
const FOUNDER_OFFER_LIMIT = 100;
const FREE_EXPORTS_PER_MONTH = 3;
const EMPTY_EXPORT_USAGE = {
  csv: 0,
  pdf: 0,
  total: 0,
};
const DEFAULT_VISIBLE_SECTIONS = {
  about: true,
  services: true,
  howItWorks: true,
  roadmap: true,
  security: true,
  feedback: true,
};
const PENDING_AUTH_SUCCESS_KEY = "microassist_pending_auth_success";
const DEFAULT_REMINDER_PREFS = {
  declaration: true,
  tva: true,
  cfe: true,
  acre: true,
  email: true,
  sms: false,
};
const EMPTY_REMINDER_PREFS = {
  declaration: false,
  tva: false,
  cfe: false,
  acre: false,
  email: false,
  sms: false,
};
const DEFAULT_DASHBOARD_SECTIONS = {
  reminders: false,
  revenues: false,
  invoices: false,
  chart: false,
};
const FULL_RESET_LOCAL_STORAGE_KEYS = [
  LS_KEY,
  GUEST_REVENUES_KEY,
  GUEST_INVOICES_KEY,
  REMINDER_PREFS_KEY,
  DASHBOARD_REMINDERS_DISMISSED_KEY,
  DASHBOARD_SECTIONS_KEY,
  CHART_KEY,
  UI_KEY,
  PENDING_AUTH_SUCCESS_KEY,
];
const MIN_REALISTIC_FISCAL_DATE = "2000-01-01";
// ... константы ...
function labelFromOptions(stepKey, value) {
  const configStep = FISCAL_STEPS.find((s) => s.key === stepKey);
  const opt = configStep?.options?.find((o) => o.value === value);
  return opt?.label || value || "—";
}

function track(eventName, params = {}) {
  if (window.gtag) {
    window.gtag("event", eventName, params);
  }
}

function getCurrentMonthlyExportStorageKey() {
  const now = new Date();
  return `microassist_exports_${now.getFullYear()}_${now.getMonth() + 1}`;
}

function readLocalPremiumStatus() {
  try {
    return localStorage.getItem(PREMIUM_STATUS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeLocalPremiumStatus(isPremium) {
  try {
    localStorage.setItem(PREMIUM_STATUS_KEY, isPremium ? "1" : "0");
  } catch {
    // Ignore localStorage write failures for local premium fallback.
  }
}

function readMonthlyExportUsage() {
  try {
    const saved = localStorage.getItem(getCurrentMonthlyExportStorageKey());

    if (!saved) {
      return { ...EMPTY_EXPORT_USAGE };
    }

    const parsed = JSON.parse(saved);
    return normalizeMonthlyExportUsage(parsed);
  } catch {
    try {
      const saved = localStorage.getItem(getCurrentMonthlyExportStorageKey());
      const legacyValue = saved ? Number(saved) : 0;
      return normalizeMonthlyExportUsage(legacyValue);
    } catch {
      return { ...EMPTY_EXPORT_USAGE };
    }
  }
}

function normalizeMonthlyExportUsage(rawValue) {
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    const safeTotal = Math.max(0, rawValue);
    return {
      csv: 0,
      pdf: safeTotal,
      total: safeTotal,
    };
  }

  if (!rawValue || typeof rawValue !== "object") {
    return { ...EMPTY_EXPORT_USAGE };
  }

  const csv = Math.max(0, Number(rawValue.csv) || 0);
  const pdf = Math.max(0, Number(rawValue.pdf) || 0);
  const total = Math.max(0, Number(rawValue.total) || csv + pdf);

  return { csv, pdf, total };
}

function writeMonthlyExportUsage(rawValue) {
  try {
    const normalizedUsage = normalizeMonthlyExportUsage(rawValue);
    localStorage.setItem(
      getCurrentMonthlyExportStorageKey(),
      JSON.stringify(normalizedUsage)
    );
    return normalizedUsage;
  } catch {
    return normalizeMonthlyExportUsage(rawValue);
  }
}

function normalizePremiumTrackingSource(source = "unknown") {
  const normalized = String(source || "unknown").toLowerCase();

  if (normalized.includes("export")) return "exports";
  if (normalized.includes("tva")) return "tva";
  if (normalized.includes("history") || normalized.includes("revenue")) {
    return "revenues";
  }
  if (normalized.includes("acre")) return "acre";
  if (normalized.includes("invoice") || normalized.includes("unpaid")) {
    return "invoices";
  }

  return "default";
}

function normalizePremiumConversionSource(source = "unknown") {
  const normalized = String(source || "unknown").toLowerCase();

  if (normalized.includes("export")) return "exports";
  if (normalized.includes("tva")) return "TVA";
  if (normalized.includes("score")) return "score";
  if (normalized.includes("reminder") || normalized.includes("sms")) {
    return "reminders";
  }
  if (normalized.includes("dashboard_top") || normalized.includes("founder")) {
    return "founder_banner";
  }

  return "founder_banner";
}

function trackPremiumEvent(source = "unknown", action = "modal_open") {
  const entry = {
    source: normalizePremiumConversionSource(source),
    action,
    timestamp: new Date().toISOString(),
  };

  try {
    if (typeof window !== "undefined") {
      const storageKey = "premium_conversion_events";
      const raw = window.localStorage?.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      const next = Array.isArray(parsed) ? [...parsed, entry] : [entry];
      window.localStorage?.setItem(storageKey, JSON.stringify(next));
    }
  } catch {
    // Ignore localStorage failures for MVP analytics.
  }

  console.log("[microassist:premium]", entry);
}

function trackEvent(name, payload = {}) {
  const entry = {
    name,
    timestamp: new Date().toISOString(),
    ...payload,
  };

  if (typeof window !== "undefined") {
    window.__microassistEventLog = window.__microassistEventLog || [];
    window.__microassistEventLog.push(entry);

    try {
      const storageKey = "microassist_analytics_events";
      const raw = window.localStorage?.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      const next = Array.isArray(parsed) ? [...parsed, entry] : [entry];
      window.localStorage?.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Ignore localStorage failures and keep console/in-memory logging only.
    }
  }

  console.log("[microassist:event]", entry);
}

function normalizeDateValue(value) {
  const raw = String(value || "").trim();

  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!match) return raw;

  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value) {
  const normalized = normalizeDateValue(value);

  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const [, yearRaw, monthRaw, dayRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  const date = new Date(year, month - 1, day);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function getFiscalDateErrors(sourceAnswers = {}) {
  const businessStartDate = normalizeDateValue(sourceAnswers.business_start_date);
  const acreStartDate = normalizeDateValue(sourceAnswers.acre_start_date);
  const businessDate = parseIsoDate(businessStartDate);
  const acreDate = parseIsoDate(acreStartDate);
  const today = parseIsoDate(getTodayIsoDate());
  const minRealisticDate = parseIsoDate(MIN_REALISTIC_FISCAL_DATE);
  const errors = {};

  if (businessStartDate) {
    if (!businessDate || businessDate < minRealisticDate) {
      errors.business_start_date = "Merci de saisir une date réaliste.";
    } else if (businessDate > today) {
      errors.business_start_date =
        "La date de début d’activité ne peut pas être dans le futur.";
    }
  }

  if (sourceAnswers.acre === "yes" && !acreStartDate) {
    errors.acre_start_date = "Merci d’indiquer la date de début de l’ACRE.";
  } else if (acreStartDate) {
    if (!acreDate || acreDate < minRealisticDate) {
      errors.acre_start_date = "Merci de saisir une date réaliste.";
    } else if (acreDate > today) {
      errors.acre_start_date = "La date ACRE ne peut pas être dans le futur.";
    } else if (businessDate && !errors.business_start_date && acreDate < businessDate) {
      errors.acre_start_date =
        "La date ACRE doit être postérieure ou égale au début d’activité.";
    }
  }

  if (
    !errors.acre_start_date &&
    acreDate &&
    businessDate &&
    !errors.business_start_date &&
    acreDate < businessDate
  ) {
    errors.acre_start_date =
      "La date ACRE doit être postérieure ou égale au début d’activité.";
  }

  return errors;
}

function buildSmartAlerts({
  answers = {},
  computed = {},
  revenues = [],
  invoices = [],
  reminderPrefs = {},
  estimatedCharges = 0,
  currentMonthTotal = 0,
} = {}) {
  const today = parseIsoDate(getTodayIsoDate());
  const rawAvailable = Number(currentMonthTotal || 0) - Number(estimatedCharges || 0);

  if (computed?.tvaStatus === "exceeded") {
    return [
      {
      id: "tva-threshold",
      level: "warning",
      title: "TVA à activer ce mois",
      text: "Prépare ta facturation et ta déclaration.",
      cta: "Comprendre la TVA",
      action: "tva_info",
      },
    ];
  }

  if (answers?.acre === "yes" && answers?.acre_start_date) {
    const acreStart = parseIsoDate(answers.acre_start_date);
    if (acreStart) {
      const acreEnd = new Date(acreStart);
      acreEnd.setMonth(acreEnd.getMonth() + 12);
      const daysLeft = Math.ceil((acreEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const monthsLeft = Math.max(1, Math.ceil(daysLeft / 30));

      if (daysLeft > 0 && monthsLeft <= 2) {
        return [
          {
          id: "acre-ending",
          level: "warning",
          title: "Fin ACRE bientôt",
          text: "Anticipe la hausse de cotisations liée à la fin de l’ACRE.",
          cta: "Modifier mon profil",
          action: "profile",
          },
        ];
      }
    }
  }

  if (estimatedCharges > 0 && rawAvailable < estimatedCharges) {
    return [
      {
        id: "reserve-low",
        level: "warning",
        title: "Réserve à renforcer",
        text: "La réserve actuelle couvre moins d’un cycle de charges estimées.",
        cta: "Ajouter une dépense",
        action: "profile",
      },
    ];
  }

  return [
    {
      id: "all-clear",
      level: "success",
      title: "Aucun signal critique",
      text: "Ton espace fiscal est à jour. Continue à alimenter ton suivi pour garder des repères fiables.",
      cta: "Ajouter un revenu",
      action: "add_revenue",
    },
  ];
}

function sanitizeFiscalAnswers(sourceAnswers = {}) {
  const nextAnswers = { ...sourceAnswers };
  const normalizedBusinessStartDate = normalizeDateValue(
    sourceAnswers.business_start_date,
  );
  const normalizedAcreStartDate = normalizeDateValue(sourceAnswers.acre_start_date);
  const errors = getFiscalDateErrors({
    ...sourceAnswers,
    business_start_date: normalizedBusinessStartDate,
    acre_start_date: normalizedAcreStartDate,
  });

  nextAnswers.business_start_date = errors.business_start_date
    ? null
    : normalizedBusinessStartDate || null;

  if (sourceAnswers.acre !== "yes") {
    nextAnswers.acre_start_date = null;
  } else {
    nextAnswers.acre_start_date = errors.acre_start_date
      ? null
      : normalizedAcreStartDate || null;
  }

  return nextAnswers;
}

function getCurrentStepValidationMessage(stepKey, sourceAnswers = {}) {
  const errors = getFiscalDateErrors(sourceAnswers);

  if (stepKey === "business_start_date") {
    return errors.business_start_date || errors.acre_start_date || "";
  }

  if (stepKey === "acre_start_date") {
    return errors.acre_start_date || "";
  }

  return "";
}

function buildFiscalSummary(answers = {}, computed = {}) {
  const lines = [];

  lines.push("✅ Résumé fiscal");
  lines.push(
    `• Situation : ${labelFromOptions("entry_status", answers.entry_status)}`,
  );
  lines.push(`• Statut : ${labelFromOptions("status", answers.status)}`);
  lines.push(
    `• Activité : ${labelFromOptions("activity_type", answers.activity_type)}`,
  );
  lines.push(
    `• Déclarations : ${labelFromOptions(
      "declaration_frequency",
      answers.declaration_frequency,
    )}`,
  );

  lines.push("");
  lines.push("📌 Synthèse");
  lines.push(
    `• Prochaine déclaration : ${computed.nextDeclarationLabel ?? "—"}`,
  );
  lines.push(`• Montant estimé : ${computed.amountEstimatedLabel ?? "—"}`);
  lines.push(`• Date limite : ${computed.deadlineLabel ?? "—"}`);
  lines.push(`• TVA : ${computed.tvaStatusLabel ?? "—"}`);

  if (computed.tvaHint) {
    lines.push(`• Détail TVA : ${computed.tvaHint}`);
  }

  lines.push("");
  lines.push("⚠️ Indication simplifiée. Ne remplace pas un expert-comptable.");

  return lines.join("\n");
}

function buildFiscalChecklist(computed = {}) {
  const items = [];

  items.push("🧭 Plan d’action");

  if (typeof computed?.treasuryRecommended === "number") {
    items.push(
      `• À garder de côté : ${computed.treasuryRecommended.toLocaleString("fr-FR")} € minimum.`,
    );
  }

  if (computed?.urgency === "late") {
    items.push("• Déclarer dès que possible sur autoentrepreneur.urssaf.fr.");
  } else if (computed?.urgency === "soon") {
    items.push("• Prévoir un moment pour déclarer prochainement.");
  } else {
    items.push(
      "• Continuer à enregistrer le chiffre d’affaires régulièrement.",
    );
  }

  if (computed?.tvaStatus === "exceeded") {
    items.push("• Vérifier le régime TVA et anticiper la facturation.");
  } else if (computed?.tvaStatus === "soon") {
    items.push("• Surveiller le seuil TVA.");
  } else {
    items.push("• TVA : franchise en base a priori OK.");
  }

  if (computed?.recommendations?.length) {
    items.push("");
    items.push("✅ Recommandations");
    computed.recommendations.forEach((r) => {
      items.push(`• ${r.title} — ${r.text}`);
    });
  }

  return items.join("\n");
}

function buildInitialAssistantMessages(userName = "") {
  return [
    {
      role: "bot",
      text: userName
        ? `Bonjour, ${userName} 👋 On va construire ton projet en 5 étapes. Réponds simplement.`
        : "Bonjour 👋 On va configurer ton profil fiscal. Réponds simplement.",
    },
    {
      role: "bot",
      text: `Étape 1 — ${FISCAL_STEPS[0].title}\n${FISCAL_STEPS[0].question}`,
    },
  ];
}

function getAssistantAnswersFromProfile(profile) {
  if (!profile) return {};

  return sanitizeFiscalAnswers({
    entry_status:
      profile.business_status === "micro_entreprise" ? "micro_yes" : "micro_no",
    status:
      profile.business_status === "micro_entreprise"
        ? "auto_entrepreneur"
        : null,
    activity_type: profile.activity_type || null,
    declaration_frequency: profile.declaration_frequency || null,
    acre: profile.acre || null,
    acre_start_date: profile.acre_start_date || null,
    business_start_date: profile.business_start_date || null,
  });
}

function isStepAvailable(stepConfig, sourceAnswers) {
  if (!stepConfig?.condition) {
    return true;
  }

  try {
    return stepConfig.condition(sourceAnswers);
  } catch {
    return true;
  }
}

export default function App() {
  // Основные состояния
  const [stepIndex, setStepIndex] = useState(0);
  const [assistantCollapsed, setAssistantCollapsed] = useState(false);
  const [answers, setAnswers] = useState({});
  const [input, setInput] = useState("");
  const [saveNotice, setSaveNotice] = useState(null);
  const saveNoticeTimeoutRef = useRef(null);
  const [successToast, setSuccessToast] = useState(null);
  const successToastTimeoutRef = useRef(null);
  const showSaveNotice = useCallback((notice, duration = 4000) => {
  if (saveNoticeTimeoutRef.current) {
    clearTimeout(saveNoticeTimeoutRef.current);
    saveNoticeTimeoutRef.current = null;
  }

  setSaveNotice(notice);

  if (duration > 0) {
    saveNoticeTimeoutRef.current = window.setTimeout(() => {
      setSaveNotice(null);
      saveNoticeTimeoutRef.current = null;
    }, duration);
  }
}, []);
  const showSuccessToast = useCallback((message, duration = 4000) => {
  if (successToastTimeoutRef.current) {
    clearTimeout(successToastTimeoutRef.current);
    successToastTimeoutRef.current = null;
  }

  setSuccessToast(message);

  if (duration > 0) {
    successToastTimeoutRef.current = window.setTimeout(() => {
      setSuccessToast(null);
      successToastTimeoutRef.current = null;
    }, duration);
  }
}, []);

useEffect(() => {
  return () => {
    if (saveNoticeTimeoutRef.current) {
      clearTimeout(saveNoticeTimeoutRef.current);
    }
    if (successToastTimeoutRef.current) {
      clearTimeout(successToastTimeoutRef.current);
    }
  };
}, []);
  const [invoiceNotice, setInvoiceNotice] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [restoredAt, setRestoredAt] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  // UI состояния
  const [helpOpen, setHelpOpen] = useState(false); // ✅ ДОБАВИТЬ
  const [authOpen, setAuthOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState("signup");
  const [logoutPending, setLogoutPending] = useState(false);
  const [assistantFieldError, setAssistantFieldError] = useState("");
  const [assistantEditMode, setAssistantEditMode] = useState(false);
  const [profileEditMode, setProfileEditMode] = useState("idle");
  const [selectedProfileField, setSelectedProfileField] = useState(null);
  const [profileEditDraft, setProfileEditDraft] = useState({});
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetInProgress, setResetInProgress] = useState(false);
  
  const [focusMode, setFocusMode] = useState(false); // ✅ ДОБАВИТЬ
  const { user, loading: authLoading } = useAuth();
  const [appView, setAppView] = useState("landing");
  const [userName, setUserName] = useState("");
  const [hydrated, setHydrated] = useState(false);
  // Состояния для доходов
  const [showAddRevenue, setShowAddRevenue] = useState(false);
  const [revenues, setRevenues] = useState([]);
  const [dashboardSections, setDashboardSections] = useState(() => {
    try {
      const raw = localStorage.getItem(DASHBOARD_SECTIONS_KEY);
      return raw
        ? { ...DEFAULT_DASHBOARD_SECTIONS, ...JSON.parse(raw) }
        : DEFAULT_DASHBOARD_SECTIONS;
    } catch {
      return DEFAULT_DASHBOARD_SECTIONS;
    }
  });
  const [showBetaNotice, setShowBetaNotice] = useState(() => {
    const hash = window.location.hash;

    if (hash) {
      const hashParams = new URLSearchParams(
        hash.startsWith("#") ? hash.slice(1) : hash,
      );

      if (
        hashParams.get("type") === "signup" &&
        hashParams.get("access_token")
      ) {
        return false;
      }
    }

    return !localStorage.getItem(BETA_SEEN_KEY);
  });
  const [showCGU, setShowCGU] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showInvoiceGenerator, setShowInvoiceGenerator] = useState(false);
  
  const [invoices, setInvoices] = useState([]);
  const [guestInvoices, setGuestInvoices] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(GUEST_INVOICES_KEY) || "[]");
    } catch {
      return [];
    }
  });
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [monthlyExportUsage, setMonthlyExportUsage] = useState(EMPTY_EXPORT_USAGE);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [showCFEModal, setShowCFEModal] = useState(false);
  // состояния
  const [premiumModalSource, setPremiumModalSource] = useState("unknown");
  const [premiumWaitlistEmail, setPremiumWaitlistEmail] = useState("");
  const [premiumWaitlistError, setPremiumWaitlistError] = useState("");
  const [isJoiningPremiumWaitlist, setIsJoiningPremiumWaitlist] =
    useState(false);
  const [premiumWaitlistJoined, setPremiumWaitlistJoined] = useState(false);
  const premiumCTAViewSourceRef = useRef(null);
  const [dashboardRemindersDismissed, setDashboardRemindersDismissed] =
    useState(() => {
      try {
        return (
          localStorage.getItem(DASHBOARD_REMINDERS_DISMISSED_KEY) === "1"
        );
      } catch {
        return false;
      }
    });
  const [dashboardTopNudgeDismissedType, setDashboardTopNudgeDismissedType] =
    useState(() => {
      try {
        return localStorage.getItem(DASHBOARD_TOP_NUDGE_DISMISSED_KEY) || "";
      } catch {
        return "";
      }
    });
// Modals pédagogiques
  const [showCashImpactModal, setShowCashImpactModal] = useState(false);
  const [showTVADiagnosticModal, setShowTVADiagnosticModal] = useState(false);
  const [showTVAModal, setShowTVAModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);

  const [reminderPrefs, setReminderPrefs] = useState(DEFAULT_REMINDER_PREFS);
// Plan par défaut côté invité uniquement. Les droits reconnectés viennent du profil Supabase.
  const defaultGuestPlan = BETA_MODE ? "beta_founder" : "free";

  const [revenueForm, setRevenueForm] = useState({
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    client: "",
    invoice: "",
    note: "",
  });
  const [showRevenueDetails, setShowRevenueDetails] = useState(false); // ✅ ДОБАВИТЬ

  // Состояния для отображения
  const [visibleSections, setVisibleSections] = useState(() => {
    try {
      const raw = localStorage.getItem(UI_KEY);
      return raw
        ? { ...DEFAULT_VISIBLE_SECTIONS, ...JSON.parse(raw) }
        : DEFAULT_VISIBLE_SECTIONS;
    } catch {
      return DEFAULT_VISIBLE_SECTIONS;
    }
  });

  const [showChart, setShowChart] = useState(() => {
    try {
      const saved = localStorage.getItem(CHART_KEY);
      return saved !== "false";
    } catch {
      return true;
    }
  });

  const hideChart = () => {
    setShowChart(false);
    localStorage.setItem(CHART_KEY, "false");
  };

  const openAuthModal = useCallback((mode = "signup") => {
    setAuthInitialMode(mode);
    setAuthOpen(true);
  }, []);

  const clearAuthenticatedRuntimeState = useCallback(
    ({ clearLocalSessionKeys = false } = {}) => {
      setAuthOpen(false);
      setAuthInitialMode("signup");
      setAppView("landing");
      setFocusMode(false);
      setFiscalProfile(null);
      setFiscalProfileLoaded(false);
      fiscalProfileFetchRef.current = {
        inFlight: null,
        userId: null,
        lastFetchedAt: 0,
        lastData: null,
      };
      guestMigrationRef.current = {
        inFlight: null,
        userId: null,
        completedForUserId: null,
      };
      setAnswers({});
      setStepIndex(0);
      setMessages(buildInitialAssistantMessages());
      setInput("");
      setAssistantFieldError("");
      setAssistantEditMode(false);
      setProfileEditMode("idle");
      setSelectedProfileField(null);
      setProfileEditDraft({});
      setAssistantCollapsed(false);
      setHelpOpen(false);
      setIsTyping(false);
      setUserName("");
      setRevenues([]);
      setInvoices([]);
      setGuestInvoices([]);
      setDashboardSections(DEFAULT_DASHBOARD_SECTIONS);
      setReminderPrefs(DEFAULT_REMINDER_PREFS);
      setSelectedMonth("all");
      setHasDraft(false);
      setLastSavedAt(null);
      setRestoredAt(null);
      setInvoiceNotice(null);
      setSaveNotice(null);
      setShowAddRevenue(false);
      setShowRevenueDetails(false);
      setShowInvoiceGenerator(false);
      setShowReminderModal(false);
      setShowPricingModal(false);
      setShowCashImpactModal(false);
      setShowTVADiagnosticModal(false);
      setShowTVAModal(false);
      setShowCFEModal(false);
      setPremiumWaitlistJoined(false);
      setPremiumWaitlistEmail("");
      setPremiumWaitlistError("");
      setPremiumModalSource("unknown");
      setLocalPremiumStatus(false);
      resetRevenueForm();

      if (clearLocalSessionKeys) {
        clearLocalStorageKeys([
          LS_KEY,
          REMINDER_PREFS_KEY,
          PENDING_AUTH_SUCCESS_KEY,
          PREMIUM_STATUS_KEY,
        ]);
      }
    },
    [],
  );

  const handleLogout = useCallback(async () => {
    if (logoutPending) return;

    setLogoutPending(true);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      clearAuthenticatedRuntimeState({ clearLocalSessionKeys: true });
      window.location.assign(window.location.pathname + window.location.search);
    } catch (error) {
      console.error("Logout error:", error);
      showSaveNotice("Impossible de te déconnecter pour le moment.", 4000);
      setLogoutPending(false);
    }
  }, [clearAuthenticatedRuntimeState, logoutPending, showSaveNotice]);

  const [selectedMonth, setSelectedMonth] = useState("all");
  const [fiscalProfile, setFiscalProfile] = useState(null);
  const [fiscalProfileLoaded, setFiscalProfileLoaded] = useState(false);
  const [localPremiumStatus, setLocalPremiumStatus] = useState(() =>
    readLocalPremiumStatus(),
  );
  const fiscalProfileFetchRef = useRef({
    inFlight: null,
    userId: null,
    lastFetchedAt: 0,
    lastData: null,
  });
  const guestMigrationRef = useRef({
    inFlight: null,
    userId: null,
    completedForUserId: null,
  });
  const previousUserIdRef = useRef(null);
  
  // Once authenticated, UI rights must come from Supabase only.
  const persistedPlan = fiscalProfile?.plan || null;
  const profilePremiumStatus = Boolean(fiscalProfile?.is_premium);

  // Trial is anchored to a real persisted creation date so it never restarts on login.
  const trialEndsAt = useMemo(() => {
    const anchorCandidates = [
      fiscalProfile?.created_at,
      user?.created_at,
      fiscalProfile?.trial_started_at,
    ];

    const anchor = anchorCandidates
      .map((value) => (value ? new Date(value) : null))
      .find((date) => date && !Number.isNaN(date.getTime()));

    if (!anchor) {
      return null;
    }

    const derivedEndsAt = new Date(anchor);
    derivedEndsAt.setDate(derivedEndsAt.getDate() + 90);
    return derivedEndsAt;
  }, [fiscalProfile?.created_at, fiscalProfile?.trial_started_at, user?.created_at]);

  const trialDaysLeft = useMemo(() => {
    if (!trialEndsAt) return null;

    const now = new Date();
    const diffMs = trialEndsAt.getTime() - now.getTime();
    const remaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    return Math.max(0, remaining);
  }, [trialEndsAt]);

  const isTrialActive = trialDaysLeft !== null && trialDaysLeft > 0;
  const isTrialExpired = trialDaysLeft !== null && trialDaysLeft <= 0;
  // Effective plan is the only plan used by UI limits and premium guards.
  const effectivePlan = useMemo(() => {
    if (!user) {
      return defaultGuestPlan;
    }

    if (!persistedPlan) {
      return "free";
    }

    if (persistedPlan === "beta_founder") {
      return isTrialActive ? "beta_founder" : "free";
    }

    return persistedPlan;
  }, [defaultGuestPlan, isTrialActive, persistedPlan, user]);
  const currentPlanLimits =
    PRICING_LIMITS[effectivePlan] || PRICING_LIMITS.free;
  const isLocalhostQa =
    typeof window !== "undefined" &&
    import.meta.env.DEV &&
    ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const restoredPremiumStatus = user
    ? fiscalProfileLoaded
      ? profilePremiumStatus
      : localPremiumStatus
    : localPremiumStatus;
  const isPremium = isLocalhostQa
    ? localPremiumStatus
    : restoredPremiumStatus || effectivePlan !== "free";
  const hasSmsPremiumAccess =
    effectivePlan !== "free" && effectivePlan !== "beta_founder";
  const usedExports = monthlyExportUsage.total;
  const remainingExports =
    !isPremium
      ? Math.max(0, FREE_EXPORTS_PER_MONTH - usedExports)
      : Infinity;
  const isExportLimitReached = !isPremium && remainingExports <= 0;

  function toggleLocalPremiumQa() {
    const nextValue = !localPremiumStatus;
    setLocalPremiumStatus(nextValue);
    writeLocalPremiumStatus(nextValue);
  }



  const refreshRevenues = useCallback(async () => {
    if (!user) {
      setRevenues([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("revenues")
        .select("*")
        .eq("user_id", user.id)
        .order("revenue_date", { ascending: false });

      if (error) {
        console.error("Load revenues error:", error.message);
        setRevenues([]);
        return;
      }

      const normalized = (data || []).map((item) => ({
        id: item.id,
        amount: Number(item.amount || 0),
        date: item.revenue_date,
        client: item.client || "",
        invoice: item.invoice || "",
        note: item.note || "",
        createdAt: item.created_at || null,
      }));

      setRevenues(normalized);
    } catch (error) {
      console.error("Unexpected error in refreshRevenues:", error);
      setRevenues([]);
    }
  }, [user]);

  const refreshInvoices = useCallback(async () => {
    if (!user) {
      setInvoices([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Load invoices error:", error.message);
        setInvoices([]);
        return;
      }
      setInvoices(data || []);
    } catch (error) {
      console.error("Unexpected error in refreshInvoices:", error);
      setInvoices([]);
    }
  }, [user]);

  // useCallback для refreshFiscalProfile
  const refreshFiscalProfile = useCallback(async (options = {}) => {
    const { force = false } = options;
    if (!user) {
      setFiscalProfile(null);
      setFiscalProfileLoaded(false);
      fiscalProfileFetchRef.current = {
        inFlight: null,
        userId: null,
        lastFetchedAt: 0,
        lastData: null,
      };
      return;
    }

    const fetchState = fiscalProfileFetchRef.current;
    const now = Date.now();

    if (!force && fetchState.inFlight && fetchState.userId === user.id) {
      return fetchState.inFlight;
    }

    if (
      !force &&
      fetchState.userId === user.id &&
      now - fetchState.lastFetchedAt < 500
    ) {
      return fetchState.lastData;
    }

    try {
      setFiscalProfileLoaded(false);

      const request = (async () => {
        const { data, error } = await supabase
          .from("fiscal_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

      if (error) {
        console.error("Load fiscal profile error:", error.message);
        setFiscalProfile(null);
        setFiscalProfileLoaded(true);
        setLocalPremiumStatus(readLocalPremiumStatus());
        fetchState.lastFetchedAt = Date.now();
        fetchState.lastData = null;
        return null;
      }

      setFiscalProfile(data || null);
      setFiscalProfileLoaded(true);
      if (data) {
        const nextPremiumStatus = Boolean(data.is_premium);
        setLocalPremiumStatus(nextPremiumStatus);
        writeLocalPremiumStatus(nextPremiumStatus);
      }
      fetchState.lastFetchedAt = Date.now();
      fetchState.lastData = data || null;
      return data || null;
      })();

      fetchState.userId = user.id;
      fetchState.inFlight = request;

      return await request;
    } catch (error) {
      console.error("Unexpected error in refreshFiscalProfile:", error);
      setFiscalProfile(null);
      setFiscalProfileLoaded(true);
      setLocalPremiumStatus(readLocalPremiumStatus());
      fiscalProfileFetchRef.current.lastFetchedAt = Date.now();
      fiscalProfileFetchRef.current.lastData = null;
      return null;
    } finally {
      if (fiscalProfileFetchRef.current.userId === user.id) {
        fiscalProfileFetchRef.current.inFlight = null;
      }
    }
  }, [user]);

  function calculateNextReminder(frequency) {
    const today = new Date();

    if (frequency === "mensuel") {
      const nextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0);
      nextMonth.setDate(nextMonth.getDate() - 7);
      return nextMonth.toISOString();
    }

    if (frequency === "trimestriel") {
      const month = today.getMonth();
      let endQuarter;

      if (month <= 2) endQuarter = new Date(today.getFullYear(), 3, 30);
      else if (month <= 5) endQuarter = new Date(today.getFullYear(), 6, 31);
      else if (month <= 8) endQuarter = new Date(today.getFullYear(), 9, 31);
      else endQuarter = new Date(today.getFullYear() + 1, 0, 31);

      endQuarter.setDate(endQuarter.getDate() - 7);
      return endQuarter.toISOString();
    }

    return null;
  }

  const persistPremiumStatus = useCallback(
    async (nextIsPremium, options = {}) => {
      const { refresh = true } = options;
      const normalizedValue = Boolean(nextIsPremium);

      setLocalPremiumStatus(normalizedValue);
      writeLocalPremiumStatus(normalizedValue);

      if (!user?.id) {
        return true;
      }

      const { error } = await supabase
        .from("fiscal_profiles")
        .update({ is_premium: normalizedValue })
        .eq("user_id", user.id);

      if (error) {
        const missingColumn =
          error.code === "PGRST204" ||
          error.message?.includes("is_premium") ||
          error.details?.includes?.("is_premium");

        if (missingColumn) {
          console.warn(
            "is_premium column not available yet; keeping local premium fallback only.",
          );
          return false;
        }

        console.error("Persist premium status error:", error.message);
        return false;
      }

      if (refresh) {
        await refreshFiscalProfile({ force: true });
      }

      return true;
    },
    [refreshFiscalProfile, user?.id],
  );

  const saveFiscalProfileToSupabase = useCallback(async (profileAnswers) => {
    const normalizedProfileAnswers = sanitizeFiscalAnswers(profileAnswers);
    if (!user?.id) {
      return;
    }

    if (!fiscalProfileLoaded) {
      return;
    }

    const planToPersist = persistedPlan || defaultGuestPlan;
    const nextPremiumStatus =
      Boolean(fiscalProfile?.is_premium) || planToPersist === "beta_founder";

    const payload = {
      user_id: user.id,
      plan: planToPersist,
      is_premium: nextPremiumStatus,
      business_status:
        normalizedProfileAnswers.entry_status === "micro_yes"
          ? "micro_entreprise"
          : "other",
      activity_type: normalizedProfileAnswers.activity_type,
      declaration_frequency: normalizedProfileAnswers.declaration_frequency,
      tva_mode: "franchise_en_base",
      acre: normalizedProfileAnswers.acre || null,
      acre_start_date: normalizedProfileAnswers.acre_start_date || null,
      business_start_date: normalizedProfileAnswers.business_start_date || null,
    };

    if (planToPersist === "beta_founder") {
      if (!fiscalProfile?.trial_started_at) {
        const trialStartedAt = new Date();
        const trialEndsAt = new Date(trialStartedAt);
        trialEndsAt.setDate(trialEndsAt.getDate() + 90);

        payload.trial_started_at = trialStartedAt.toISOString();
        payload.trial_ends_at = trialEndsAt.toISOString();
      } else if (!fiscalProfile?.trial_ends_at) {
        const persistedStart = new Date(fiscalProfile.trial_started_at);

        if (!Number.isNaN(persistedStart.getTime())) {
          const persistedEnd = new Date(persistedStart);
          persistedEnd.setDate(persistedEnd.getDate() + 90);
          payload.trial_ends_at = persistedEnd.toISOString();
        }
      }
    }

    let { error } = await supabase
      .from("fiscal_profiles")
      .upsert(payload, { onConflict: "user_id" });

    if (
      error &&
      (error.code === "PGRST204" ||
        error.message?.includes("is_premium") ||
        error.details?.includes?.("is_premium"))
    ) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.is_premium;

      const fallbackResponse = await supabase
        .from("fiscal_profiles")
        .upsert(fallbackPayload, { onConflict: "user_id" });
      error = fallbackResponse.error;
    }

    if (error) {
      console.error("Fiscal profile upsert error:", error.message);
      return;
    }

    setLocalPremiumStatus(nextPremiumStatus);
    writeLocalPremiumStatus(nextPremiumStatus);
    console.log("Fiscal profile saved ✅");

    const nextRemindAt = calculateNextReminder(
      normalizedProfileAnswers.declaration_frequency,
    );

    if (!nextRemindAt) {
      return;
    }

    const { error: reminderError } = await supabase.from("reminders").upsert(
      {
        user_id: user.id,
        reminder_type: "declaration",
        reminder_date: nextRemindAt.slice(0, 10),
        status: "pending",
      },
      { onConflict: "user_id,reminder_type" },
    );

    if (reminderError) {
      console.error("Reminder upsert error:", reminderError.message);
    }
  }, [
    user?.id,
    defaultGuestPlan,
    fiscalProfile?.is_premium,
    fiscalProfile?.trial_ends_at,
    fiscalProfile?.trial_started_at,
    fiscalProfileLoaded,
    persistedPlan,
  ]);

  async function saveReminderPrefsToSupabase(prefsToSave = reminderPrefs) {
    try {
      if (!user) return false;
      if (!isFiscalProfileComplete) return false;
      if (!fiscalProfile?.user_id) return false;

      const normalizedReminderPrefs = {
        ...prefsToSave,
        sms: hasSmsPremiumAccess ? prefsToSave.sms : false,
      };

      const payload = {
        reminder_declaration: normalizedReminderPrefs.declaration,
        reminder_tva: normalizedReminderPrefs.tva,
        reminder_cfe: normalizedReminderPrefs.cfe,
        reminder_acre: normalizedReminderPrefs.acre,
        reminder_email: normalizedReminderPrefs.email,
        reminder_sms: normalizedReminderPrefs.sms,
      };

      const { error } = await supabase
        .from("fiscal_profiles")
        .update(payload)
        .eq("user_id", user.id);

      if (error) {
        console.error("saveReminderPrefsToSupabase error:", error);
        return false;
      }

      await refreshFiscalProfile();
      return true;
    } catch (error) {
      console.error("Unexpected reminder prefs error:", error);
      return false;
    }
  }

  async function saveReminderPreferences() {
    track("reminder_preferences_saved", reminderPrefs);

    const normalizedReminderPrefs = {
      ...reminderPrefs,
      sms: hasSmsPremiumAccess ? reminderPrefs.sms : false,
    };

    if (!guardPremiumAccess("sms_premium", "sms_premium")) {
      return;
    }

    localStorage.setItem(
      REMINDER_PREFS_KEY,
      JSON.stringify(normalizedReminderPrefs),
    );

    const saved = await saveReminderPrefsToSupabase(normalizedReminderPrefs);

    if (saved || !user) {
      setReminderPrefs(normalizedReminderPrefs);
      setShowReminderModal(false);
      showSaveNotice("Préférences de rappels enregistrées ✅", 3000);
      showSuccessToast("✅ Rappel mis à jour.", 4000);
      return;
    }

    if (user && !isFiscalProfileComplete) {
      setReminderPrefs(normalizedReminderPrefs);
      setShowReminderModal(false);
      showSaveNotice(
        "Préférences enregistrées localement. Complète ton profil fiscal pour les synchroniser.",
        3500,
      );
      return;
    }

    showSaveNotice("Impossible d’enregistrer les préférences.", 3000);
  }

  const migrateLocalDataToSupabase = useCallback(async (options = {}) => {
    const { silent = false } = options;
    if (!user) return false;

    const migrationState = guestMigrationRef.current;

    if (migrationState.inFlight && migrationState.userId === user.id) {
      return migrationState.inFlight;
    }

    const migrationRequest = (async () => {
      let migrated = false;

      // 1. Migrer les revenus locaux
      const localRevenues = localStorage.getItem(GUEST_REVENUES_KEY);
      if (localRevenues) {
        try {
          const revenues = JSON.parse(localRevenues);
          if (Array.isArray(revenues) && revenues.length > 0) {
            const payload = revenues.map((rev) => ({
              user_id: user.id,
              amount: rev.amount,
              revenue_date: rev.date,
              client: rev.client || null,
              invoice: rev.invoice || null,
              note: rev.note || null,
            }));

            const { error } = await supabase.from("revenues").insert(payload);

            if (error) {
              throw error;
            }

            migrated = true;
            console.log("✅ Revenus locaux migrés:", revenues.length);
          }
        } catch (e) {
          console.error("Erreur migration revenus:", e);
        }
      }

      // 2. Migrer les factures invité
      const localGuestInvoices = localStorage.getItem(GUEST_INVOICES_KEY);
      if (localGuestInvoices) {
        try {
          const invoicesToMigrate = JSON.parse(localGuestInvoices);
          if (Array.isArray(invoicesToMigrate) && invoicesToMigrate.length > 0) {
            const payload = invoicesToMigrate.map((invoice) => ({
              user_id: user.id,
              invoice_number: invoice.invoice_number,
              client_name: invoice.client_name || "",
              client_address: invoice.client_address || "",
              client_email: invoice.client_email || "",
              description: invoice.description || "",
              amount: invoice.amount || 0,
              invoice_date: invoice.invoice_date,
              due_date: invoice.due_date,
              status: invoice.status || "sent",
            }));

            const { error } = await supabase.from("invoices").insert(payload);

            if (error) {
              throw error;
            }

            migrated = true;
            console.log("✅ Factures invité migrées:", invoicesToMigrate.length);
          }
        } catch (e) {
          console.error("Erreur migration factures:", e);
        }
      }

      // 3. Migrer le profil fiscal
      const localAnswers = localStorage.getItem(LS_KEY);
      if (localAnswers) {
        try {
          const data = JSON.parse(localAnswers);
          if (
            data.answers &&
            (data.answers.activity_type || data.answers.declaration_frequency)
          ) {
            await saveFiscalProfileToSupabase(data.answers);
            migrated = true;
            console.log("✅ Profil fiscal local migré");
          }
        } catch (e) {
          console.error("Erreur migration profil:", e);
        }
      }

      // 4. Migrer les préférences de rappels invité
      const localReminderPrefs = localStorage.getItem(REMINDER_PREFS_KEY);
      if (localReminderPrefs) {
        try {
          const parsedPrefs = JSON.parse(localReminderPrefs);
          const didSavePrefs = await saveReminderPrefsToSupabase(parsedPrefs);

          if (didSavePrefs) {
            migrated = true;
            console.log("✅ Préférences de rappel migrées");
          }
        } catch (e) {
          console.error("Erreur migration rappels:", e);
        }
      }

      if (migrated) {
        clearLocalStorageKeys([
          LS_KEY,
          GUEST_REVENUES_KEY,
          GUEST_INVOICES_KEY,
          REMINDER_PREFS_KEY,
        ]);
        setGuestInvoices([]);
        setHasDraft(false);
        setLastSavedAt(null);
        setRestoredAt(null);

        await Promise.all([
          refreshRevenues(),
          refreshFiscalProfile({ force: true }),
          refreshInvoices(),
        ]);

        migrationState.completedForUserId = user.id;

        if (!silent) {
          showSaveNotice(
            "📦 Vos données locales ont été sauvegardées dans votre espace !",
            3000,
          );
        }
      }

      return migrated;
    })();

    migrationState.userId = user.id;
    migrationState.inFlight = migrationRequest;

    try {
      return await migrationRequest;
    } finally {
      if (guestMigrationRef.current.userId === user.id) {
        guestMigrationRef.current.inFlight = null;
      }
    }
  }, [
    user,
    refreshRevenues,
    refreshFiscalProfile,
    refreshInvoices,
    saveFiscalProfileToSupabase,
    showSaveNotice,
  ]);

  // Эффекты с правильными зависимостями
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setFiscalProfile(null);
      return;
    }

    const timer = setTimeout(() => {
      refreshFiscalProfile();
    }, 180);

    return () => clearTimeout(timer);
  }, [authLoading, user, refreshFiscalProfile]);

  useEffect(() => {
    if (!user) {
      setRevenues([]);
      return;
    }
    refreshRevenues();
  }, [user, refreshRevenues]);

  useEffect(() => {
    if (!user) {
      setInvoices([]);
      return;
    }
    refreshInvoices();
  }, [user, refreshInvoices]);

  useEffect(() => {
    const hash = window.location.hash;

    if (!hash) return;

    const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const authType = hashParams.get("type");
    const accessToken = hashParams.get("access_token");
    const authError = hashParams.get("error");
    const authErrorCode = hashParams.get("error_code");

    if (
      authError === "access_denied" ||
      authErrorCode === "otp_expired"
    ) {
      showSaveNotice(
        "Le lien a expiré. Demande un nouveau lien ou connecte-toi avec ton mot de passe.",
        5000,
      );
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
      openAuthModal("signin");
      return;
    }

    if (!accessToken) {
      return;
    }

    if (authType === "signup") {
      localStorage.setItem(PENDING_AUTH_SUCCESS_KEY, "email_confirmed");
      localStorage.setItem(BETA_SEEN_KEY, "1");
      setShowBetaNotice(false);
      return;
    }

    if (authType === "recovery") {
      setShowBetaNotice(false);
      openAuthModal("recovery");
    }
  }, [openAuthModal, showSaveNotice]);

// sync reminder prefs depuis Supabase
useEffect(() => {
  if (!fiscalProfile) return;

  setReminderPrefs((prev) => ({
    ...prev,
    declaration: fiscalProfile.reminder_declaration ?? prev.declaration,
    tva: fiscalProfile.reminder_tva ?? prev.tva,
    cfe: fiscalProfile.reminder_cfe ?? prev.cfe,
    acre: fiscalProfile.reminder_acre ?? prev.acre,
    email: fiscalProfile.reminder_email ?? prev.email,
    sms: hasSmsPremiumAccess ? (fiscalProfile.reminder_sms ?? prev.sms) : false,
  }));
}, [fiscalProfile, hasSmsPremiumAccess]);

  const steps = FISCAL_STEPS;

  const [messages, setMessages] = useState(() => buildInitialAssistantMessages());

  const step = steps[stepIndex];

  const inputRef = useRef(null);
  const chatEndRef = useRef(null);
  const assistantRef = useRef(null);
  const securityRef = useRef(null);
  const heroRef = useRef(null);
  const servicesRef = useRef(null);
  const howItWorksRef = useRef(null);
  const feedbackRef = useRef(null);
  const fiscalRef = useRef(null);
  const chartRef = useRef(null);

  const viewLabel =
    appView === "landing"
      ? "Assistant fiscal"
      : appView === "assistant"
        ? "Profil fiscal"
        : "Espace fiscal";

  useLayoutEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    const forceTop = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    forceTop();

    const t1 = setTimeout(forceTop, 0);
    const t2 = setTimeout(forceTop, 150);
    const t3 = setTimeout(forceTop, 500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  useEffect(() => {
    showConsoleSignature();
  }, []);

  // ОПТИМИЗИРОВАННЫЙ Эффект для Realtime подписки на доходы
  useEffect(() => {
    // Если нет пользователя - не подписываемся
    if (!user) return;

    let channel;
    let isSubscribed = true;

    const setupRealtime = async () => {
      try {
        // Используем user из хука, не делаем лишний запрос
        channel = supabase
          .channel(`revenues-${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "revenues",
              filter: `user_id=eq.${user.id}`,
            },
            async (payload) => {
              console.log("Revenue change detected:", payload);
              if (isSubscribed) {
                await refreshRevenues();
              }
            },
          )
          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              console.log("Realtime subscription active for revenues");
            } else if (status === "CHANNEL_ERROR") {
              console.error("Realtime subscription error");
            }
          });
      } catch (error) {
        console.error("Error setting up realtime:", error);
      }
    };

    setupRealtime();

    // Очистка при размонтировании или смене пользователя
    return () => {
      isSubscribed = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [user]); // ДОБАВЛЯЕМ user в зависимости!

  // ОПТИМИЗИРОВАННЫЙ Эффект для Realtime подписки на профиль
  useEffect(() => {
    // Если нет пользователя - не подписываемся
    if (!user) return;

    let channel;
    let isSubscribed = true;

    const setupFiscalProfileRealtime = async () => {
      try {
        // Используем user из хука
        channel = supabase
          .channel(`fiscal-profile-${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "fiscal_profiles",
              filter: `user_id=eq.${user.id}`,
            },
            async (payload) => {
              console.log("Fiscal profile change detected:", payload);
              if (isSubscribed) {
                await refreshFiscalProfile();
              }
            },
          )
          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              console.log("Realtime subscription active for fiscal profile");
            } else if (status === "CHANNEL_ERROR") {
              console.error("Realtime subscription error for fiscal profile");
            }
          });
      } catch (error) {
        console.error("Error setting up fiscal profile realtime:", error);
      }
    };

    setupFiscalProfileRealtime();

    // Очистка при размонтировании или смене пользователя
    return () => {
      isSubscribed = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [user]); // ДОБАВЛЯЕМ user в зависимости!

  useEffect(() => {
    if (!chatEndRef.current) return;
    if (appView !== "assistant") return;

    const timer = setTimeout(() => {
      chatEndRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);

    return () => clearTimeout(timer);
  }, [messages, stepIndex, isTyping, appView]);

  function scrollToTopSection(target = "hero") {
    const refMap = {
      hero: heroRef,
      assistant: assistantRef,
      security: securityRef,
      feedback: feedbackRef,
    };

    const ref = refMap[target];
    if (!ref?.current) return;

    requestAnimationFrame(() => {
      ref.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function addMessage(role, text) {
    setMessages((prev) => [...prev, { role, text }]);
  }

  function addAssistant(text) {
    addMessage("bot", `🤖 ${text}`);
  }

  function getIndexByKey(key) {
    return FISCAL_STEPS.findIndex((s) => s.key === key);
  }

  function scrollToRef(ref) {
    requestAnimationFrame(() => {
      ref.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function scrollToSection(id) {
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function hideSection(key) {
    setVisibleSections((prev) => ({
      ...prev,
      [key]: false,
    }));
  }

  function showAllSections() {
    setVisibleSections(DEFAULT_VISIBLE_SECTIONS);
  }

  function openSecuritySection() {
    setFocusMode(false);

    setVisibleSections((prev) => ({
      ...prev,
      security: true,
    }));

    setTimeout(() => {
      securityRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 150);
  }

  function goNext(forcedNextIndex = null, sourceAnswers = answers) {
    let nextIndex = forcedNextIndex ?? stepIndex + 1;

    while (
      nextIndex < FISCAL_STEPS.length &&
      !isStepAvailable(FISCAL_STEPS[nextIndex], sourceAnswers)
    ) {
      nextIndex += 1;
    }

    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);

      if (nextIndex < FISCAL_STEPS.length) {
        setStepIndex(nextIndex);
        const nextStep = FISCAL_STEPS[nextIndex];
        addMessage(
          "bot",
          `Étape ${nextIndex + 1} — ${nextStep.title}\n${nextStep.question}`,
        );
      } else {
        addMessage("bot", "✅ Terminé.");
      }
    }, 600);
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);

      // всегда стартуем с Accueil
      setAppView("landing");
      setFocusMode(false);

      if (!raw) {
        setHydrated(true);
        return;
      }

      const data = JSON.parse(raw);

      if (!data || data.version !== LS_VERSION) {
        localStorage.removeItem(LS_KEY);
        setHydrated(true);
        return;
      }

      setHasDraft(true);

      if (data.savedAt) setLastSavedAt(data.savedAt);

      const a = data.answers || {};
      if (a && typeof a === "object") setAnswers(a);

      if (Array.isArray(data.messages) && data.messages.length > 0) {
        setMessages(data.messages);
      }

      if (typeof data.userName === "string") {
        setUserName(data.userName);
      }

      let nextIndex = 0;
      if (typeof data.stepIndex === "number") {
        nextIndex = data.stepIndex;
      }

      setStepIndex(nextIndex);
      setRestoredAt(new Date().toISOString());
    } catch (e) {
      console.warn("Restore failed:", e);
      localStorage.removeItem(LS_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(UI_KEY, JSON.stringify(visibleSections));
  }, [visibleSections]);

  useEffect(() => {
    try {
      localStorage.setItem(
        DASHBOARD_SECTIONS_KEY,
        JSON.stringify(dashboardSections),
      );
    } catch {
      // Ignore localStorage failures for dashboard UI preferences.
    }
  }, [dashboardSections]);

useEffect(() => {
  syncMonthlyExportUsage();
}, []);

useEffect(() => {
  const handleVisibilitySync = () => {
    if (document.visibilityState === "visible") {
      syncMonthlyExportUsage();
    }
  };

  window.addEventListener("focus", syncMonthlyExportUsage);
  document.addEventListener("visibilitychange", handleVisibilitySync);

  return () => {
    window.removeEventListener("focus", syncMonthlyExportUsage);
    document.removeEventListener("visibilitychange", handleVisibilitySync);
  };
}, []);

useEffect(() => {
  try {
    const saved = localStorage.getItem(REMINDER_PREFS_KEY);
    if (saved) {
      setReminderPrefs(JSON.parse(saved));
    }
  } catch (error) {
    console.error("Erreur chargement préférences rappels:", error);
  }
}, []);

  const sanitizedAnswers = useMemo(() => sanitizeFiscalAnswers(answers), [answers]);
  const fiscalDateErrors = useMemo(() => getFiscalDateErrors(answers), [answers]);
  const hasBlockingFiscalDateError =
    Boolean(fiscalDateErrors.business_start_date) ||
    Boolean(fiscalDateErrors.acre_start_date);

  useEffect(() => {
    const canSaveFiscalProfile =
      sanitizedAnswers?.entry_status &&
      sanitizedAnswers?.activity_type &&
      sanitizedAnswers?.declaration_frequency;

    if (!canSaveFiscalProfile) return;
    if (hasBlockingFiscalDateError) return;
    if (!user) return;
    if (user && !fiscalProfileLoaded) return;

    const timeoutId = setTimeout(() => {
      saveFiscalProfileToSupabase(sanitizedAnswers);

    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [
    sanitizedAnswers?.entry_status,
    sanitizedAnswers?.activity_type,
    sanitizedAnswers?.declaration_frequency,
    sanitizedAnswers?.acre,
    sanitizedAnswers?.acre_start_date,
    sanitizedAnswers?.business_start_date,
    hasBlockingFiscalDateError,
    fiscalProfileLoaded,
    saveFiscalProfileToSupabase,
    user,
    showSaveNotice,
  ]);
  useEffect(() => {
    if (!userName) return;

    setMessages((prev) => {
      if (!prev?.length) return prev;

      const next = [...prev];
      next[0] = {
        ...next[0],
        text: `Bonjour, ${userName} 👋 On va construire ton projet en 5 étapes. Réponds simplement.`,
      };
      return next;
    });
  }, [userName]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    if (step?.mode === "dashboard") return;
    inputRef.current?.focus();
  }, [stepIndex, step?.mode]);

  useEffect(() => {
    setHelpOpen(false);
  }, [stepIndex]);

  useEffect(() => {
    if (!hydrated) return;
    if (messages.length === 0) return;

    try {
      const now = new Date().toISOString();
      const payload = {
        version: LS_VERSION,
        stepIndex,
        answers,
        userName,
        messages,
        appView,
        savedAt: now,
      };
      localStorage.setItem(LS_KEY, JSON.stringify(payload));
      setLastSavedAt(now);
    } catch (e) {
      console.warn("Save failed:", e);
    }
  }, [hydrated, stepIndex, answers, messages, userName, appView]);

  useEffect(() => {
    if (revenues.length === 1) {
      setAssistantCollapsed(true);
    }
  }, [revenues.length]);

  useEffect(() => {
    const handlePopState = (event) => {
      const state = event.state;

      if (state?.appView) {
        setAppView(state.appView);

        if (state.appView === "landing") {
          setFocusMode(false);
        }

        if (state.appView === "assistant") {
          setAssistantCollapsed(false);
        }
      }
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [
    defaultGuestPlan,
    fiscalProfile?.trial_ends_at,
    fiscalProfile?.trial_started_at,
    persistedPlan,
  ]);

  useEffect(() => {
    if (!user) {
      const savedRevenues = localStorage.getItem(GUEST_REVENUES_KEY);
      if (savedRevenues) {
        try {
          setRevenues(JSON.parse(savedRevenues));
        } catch (e) {
          console.error("Failed to load guest revenues:", e);
        }
      }
    }
  }, [user]);

  useEffect(() => {
    setAssistantFieldError("");
  }, [stepIndex, appView]);

  const dashboardAnswers = useMemo(() => {
    const hasActivity =
      sanitizedAnswers?.activity_type || fiscalProfile?.activity_type;
    const hasFrequency =
      sanitizedAnswers?.declaration_frequency ||
      fiscalProfile?.declaration_frequency;

    if (!hasActivity && !hasFrequency) {
      return {
        activity_type: null,
        declaration_frequency: null,
        acre: null,
        business_start_date: sanitizedAnswers?.business_start_date || null,
        _isComplete: false,
      };
    }

    return {
      ...sanitizedAnswers,
      activity_type:
        sanitizedAnswers?.activity_type || fiscalProfile?.activity_type || null,
      declaration_frequency:
        sanitizedAnswers?.declaration_frequency ||
        fiscalProfile?.declaration_frequency ||
        null,
      acre: sanitizedAnswers?.acre || fiscalProfile?.acre || null,
      business_start_date:
        sanitizedAnswers?.business_start_date ||
        fiscalProfile?.business_start_date ||
        null,
      acre_start_date:
        sanitizedAnswers?.acre_start_date || fiscalProfile?.acre_start_date || null,
      _isComplete: !!(hasActivity && hasFrequency),
    };
  }, [sanitizedAnswers, fiscalProfile]);

  const hasProfileCore =
    Boolean(dashboardAnswers?.activity_type) &&
    Boolean(dashboardAnswers?.declaration_frequency);
  const requiresAcreStartDate = dashboardAnswers?.acre === "yes";
  const isFiscalProfileComplete =
    hasProfileCore &&
    Boolean(dashboardAnswers?.business_start_date) &&
    (!requiresAcreStartDate || Boolean(dashboardAnswers?.acre_start_date));
  const profileReady = isFiscalProfileComplete;
  const shouldShowGuestLocalMessage = !user && (
    hasProfileCore ||
    revenues.length > 0 ||
    guestInvoices.length > 0
  );

  const currentMonthTotal = useMemo(() => {
    return revenues.reduce((sum, item) => {
      return sum + Number(item.amount || 0);
    }, 0);
  }, [revenues]);

  const computed = useMemo(() => {
    if (!hasProfileCore) {
      return {
        nextDeclarationLabel: "Profil à compléter",
        amountEstimatedLabel: "—",
        deadlineLabel: "—",
        tvaStatusLabel: "—",
        tvaHint: "Renseigne ton activité et ta périodicité",
        urgency: null,
        tvaUrgency: null,
        recommendations: [],
        treasuryRecommended: null,
        rate: null,
        acreStatus: null,
        acreHint: "Ajoute les informations clés du profil pour activer les estimations.",
        cfeAlert: null,
        financialHealth: null,
        financialHealthMessage: null,
        savingsRecommended: 0,
      };
    }

    if (!isFiscalProfileComplete) {
      return {
        nextDeclarationLabel: "Profil à compléter",
        amountEstimatedLabel: "Estimation en attente",
        deadlineLabel: "Complète ton profil fiscal",
        tvaStatusLabel: "À confirmer",
        tvaHint: "Complète ton profil fiscal pour obtenir des estimations fiables.",
        urgency: null,
        tvaUrgency: null,
        recommendations: [
          {
            key: "complete-profile",
            title: "Profil à compléter",
            text: "Ajoute ton début d’activité et, si besoin, la date ACRE pour fiabiliser tes repères.",
            level: "warning",
          },
        ],
        treasuryRecommended: null,
        rate: null,
        acreStatus: null,
        acreHint: "Le statut ACRE sera fiable après complétion du profil.",
        cfeAlert: null,
        financialHealth: null,
        financialHealthMessage: null,
        savingsRecommended: 0,
      };
    }

    try {
      const currentYear = new Date().getFullYear();

      const caYtd = revenues
        .filter(
          (r) => new Date(`${r.date}T00:00:00`).getFullYear() === currentYear,
        )
        .reduce((sum, r) => sum + Number(r.amount || 0), 0);

      const monthsWithData =
        new Set(
          revenues
            .filter(
              (r) =>
                new Date(`${r.date}T00:00:00`).getFullYear() === currentYear,
            )
            .map((r) => new Date(`${r.date}T00:00:00`).getMonth()),
        ).size || 1;

      return computeObligations({
        ...dashboardAnswers,
        ca_month: currentMonthTotal,
        ca_ytd: caYtd,
        months_with_data: monthsWithData,
      });
    } catch (error) {
      console.error("Compute error:", error);
      return {
        nextDeclarationLabel: "Erreur",
        amountEstimatedLabel: "—",
        deadlineLabel: "—",
        tvaStatusLabel: "Erreur",
        tvaHint: "Une erreur est survenue",
        urgency: null,
        tvaUrgency: null,
        recommendations: [],
        treasuryRecommended: null,
      };
    }
  }, [dashboardAnswers, currentMonthTotal, revenues, hasProfileCore, isFiscalProfileComplete]);

  const activityLabel = useMemo(
    () => labelFromOptions("activity_type", dashboardAnswers.activity_type),
    [dashboardAnswers.activity_type],
  );

  const freqLabel = useMemo(
    () =>
      labelFromOptions(
        "declaration_frequency", // <- исправлено название
        dashboardAnswers.declaration_frequency,
      ),
    [dashboardAnswers.declaration_frequency],
  );
  const profileLine = useMemo(() => {
    const a = dashboardAnswers.activity_type ? activityLabel : "";
    const f = dashboardAnswers.declaration_frequency ? freqLabel : "";
    if (!a && !f) return "";
    if (a && f) return `${a} • ${f}`;
    return a || f;
  }, [
    dashboardAnswers.activity_type,
    dashboardAnswers.declaration_frequency,
    activityLabel,
    freqLabel,
  ]);
  const authGreetingName = useMemo(() => {
    const metadataFirstName =
      user?.user_metadata?.first_name?.trim() ||
      user?.user_metadata?.full_name?.trim()?.split(" ")?.[0] ||
      "";
    const emailName = user?.email?.split("@")?.[0]?.trim() || "";
    return metadataFirstName || emailName;
  }, [user]);
  const topbarGreetingLabel =
    user && authGreetingName
      ? `Bonjour ${authGreetingName} 👋`
      : "Bonjour 👋";
  const trustBadgeLabel = user
    ? "🔒 Profil, revenus et historique sécurisés dans ton espace"
    : "🖥️ Données conservées localement jusqu’à la création du compte";
  const connectedAccountLabel = user?.email?.trim() || "";
  const fiscalProfilePageMode = profileReady
    ? assistantEditMode
      ? "edit"
      : "summary"
    : "create";
  const isFiscalProfileCreateMode = fiscalProfilePageMode === "create";
  const isFiscalProfileSummaryMode = fiscalProfilePageMode === "summary";
  const isFiscalProfileEditMode = fiscalProfilePageMode === "edit";
  const showProfileTargetedStep =
    isFiscalProfileEditMode && profileEditMode === "edit_step";
  const showCreateWizard = isFiscalProfileCreateMode && !assistantCollapsed;

  const canSend = useMemo(() => input.trim().length > 0, [input]);
  const canSubmitCurrentStep = useMemo(
    () => canSend && !assistantFieldError,
    [canSend, assistantFieldError],
  );

  // ==================== CALCULS POUR DASHBOARD ====================
  const estimatedCharges = useMemo(() => {
    if (computed?.rate) {
      return Math.round(currentMonthTotal * computed.rate);
    }
    return 0;
  }, [currentMonthTotal, computed?.rate]);

  const availableAmount = useMemo(() => {
    return Math.max(0, currentMonthTotal - estimatedCharges);
  }, [currentMonthTotal, estimatedCharges]);

  // ==================== PREVIEW POUR MODALE AJOUT REVENU ====================
  const revenueAmount = useMemo(() => {
    return Number(String(revenueForm.amount || "").replace(",", "."));
  }, [revenueForm.amount]);

  // ==================== FONCTIONS DE TAUX ====================
  function getEstimatedRate(activityType) {
    switch (activityType) {
      case "vente":
        return 0.123; // 12.3% pour la vente
      case "services":
        return 0.22; // 22% pour les services
      case "mixte":
        return 0.18; // 18% pour les activités mixtes
      default:
        return 0.22; // Taux par défaut
    }
  }

  const previewCharges = useMemo(() => {
    if (!Number.isFinite(revenueAmount) || revenueAmount <= 0) return 0;
    if (computed?.rate) {
      return Math.round(revenueAmount * computed.rate);
    }
    return Math.round(
      revenueAmount * getEstimatedRate(dashboardAnswers.activity_type),
    );
  }, [revenueAmount, computed?.rate, dashboardAnswers.activity_type]);

  const previewAvailable = useMemo(() => {
    if (!Number.isFinite(revenueAmount) || revenueAmount <= 0) return 0;
    return Math.max(0, revenueAmount - previewCharges);
  }, [revenueAmount, previewCharges]);

  const previewRateLabel = useMemo(() => {
    if (computed?.rate) {
      return `${Math.round(computed.rate * 1000) / 10} %`;
    }
    return `${Math.round(getEstimatedRate(dashboardAnswers.activity_type) * 1000) / 10} %`;
  }, [computed?.rate, dashboardAnswers.activity_type]);

  const previewAdvice = useMemo(() => {
    if (!Number.isFinite(revenueAmount) || revenueAmount <= 0) return "";
    if (previewCharges === 0) {
      return "Ajoute un montant pour voir une estimation.";
    }
    if (previewCharges <= 50) {
      return "Petit revenu : garde ce repère simple pour éviter les oublis.";
    }
    if (previewCharges <= 300) {
      return "Pense à mettre ce montant de côté dès maintenant.";
    }
    return "Bon réflexe : sépare cette somme tout de suite pour éviter les surprises.";
  }, [revenueAmount, previewCharges]);

  const monthlyHistory = useMemo(() => {
    const map = {};

    revenues.forEach((item) => {
      if (!item?.date) return;

      const d = new Date(`${item.date}T00:00:00`);
      if (Number.isNaN(d.getTime())) return;

      const key = `${d.getFullYear()}-${d.getMonth()}`;

      if (!map[key]) {
        map[key] = {
          year: d.getFullYear(),
          month: d.getMonth(),
          total: 0,
        };
      }

      map[key].total += Number(item.amount || 0);
    });

    return Object.values(map).sort((a, b) => {
      const da = new Date(a.year, a.month, 1);
      const db = new Date(b.year, b.month, 1);
      return db - da;
    });
  }, [revenues]);

  const monthOptions = useMemo(() => {
    return monthlyHistory.map((m) => {
      const date = new Date(m.year, m.month);
      return {
        value: `${m.year}-${m.month}`,
        label: date.toLocaleDateString("fr-FR", {
          month: "long",
          year: "numeric",
        }),
      };
    });
  }, [monthlyHistory]);

  const filteredRevenues = useMemo(() => {
    if (selectedMonth === "all") return revenues;

    return revenues.filter((item) => {
      if (!item?.date) return false;

      const d = new Date(`${item.date}T00:00:00`);
      if (Number.isNaN(d.getTime())) return false;

      return `${d.getFullYear()}-${d.getMonth()}` === selectedMonth;
    });
  }, [revenues, selectedMonth]);

  const revenueChartData = useMemo(() => {
    return monthlyHistory.slice().reverse().slice(-6);
  }, [monthlyHistory]);

  const maxRevenueValue = useMemo(() => {
    if (revenueChartData.length === 0) return 1;
    return Math.max(...revenueChartData.map((item) => item.total), 1);
  }, [revenueChartData]);

  const revenueStats = useMemo(() => {
    const count = revenues.length;

    const lastRevenue = count > 0 ? Number(revenues[0]?.amount || 0) : 0;

    const monthlyAverage =
      monthlyHistory.length > 0
        ? Math.round(
            monthlyHistory.reduce((sum, item) => sum + item.total, 0) /
              monthlyHistory.length,
          )
        : 0;

    return {
      count,
      lastRevenue,
      monthlyAverage,
    };
  }, [revenues, monthlyHistory]);

  const fiscalTimeline = useMemo(() => {
    return [
      {
        key: "declaration",
        icon: "📅",
        label: "Échéance",
        value: computed?.nextDeclarationLabel || "À définir",
        hint: computed?.deadlineLabel || "Choisis ta périodicité.",
      },
      {
        key: "charges",
        icon: "💰",
        label: "À prévoir",
        value: isFiscalProfileComplete
          ? `${estimatedCharges.toLocaleString("fr-FR")} €`
          : "Profil à compléter",
        hint:
          isFiscalProfileComplete
            ? revenues.length > 0
              ? "Montant à mettre de côté"
              : "Ajoute un revenu"
            : "Complète ton profil pour débloquer ce repère",
      },
    ];
  }, [computed, revenues.length, estimatedCharges, isFiscalProfileComplete]);

  const visibleInvoices = user ? invoices : guestInvoices;
  const smartAlerts = useMemo(
    () =>
      buildSmartAlerts({
        answers: dashboardAnswers,
        computed,
        revenues,
        invoices: visibleInvoices,
        reminderPrefs,
        estimatedCharges,
        currentMonthTotal,
      }),
    [
      dashboardAnswers,
      computed,
      revenues,
      visibleInvoices,
      reminderPrefs,
      estimatedCharges,
      currentMonthTotal,
    ],
  );
  const smartTipsZoneClass = smartAlerts.some(
    (alert) => alert.level === "danger" || alert.level === "warning",
  )
    ? "dashboardSectionZone dashboardSectionZoneAmber"
    : "dashboardSectionZone dashboardSectionZoneSuccess";
  const savingsGoal = useMemo(() => {
    // Objectif d'épargne recommandé: 3 mois de charges
    return Math.max(estimatedCharges * 3, 500);
  }, [estimatedCharges]);

  const savingsProgress = useMemo(() => {
    // Épargne actuelle = disponible estimé
    return availableAmount;
  }, [availableAmount]);
  const fiscalCoachingCard = useMemo(() => {
    const smartAlertIds = new Set(smartAlerts.map((alert) => alert.id));
    const sortedRevenueDates = revenues
      .map((item) => parseIsoDate(item?.date))
      .filter(Boolean)
      .sort((a, b) => b.getTime() - a.getTime());
    const latestRevenueDate = sortedRevenueDates[0] || null;
    const previousRevenueDate = sortedRevenueDates[1] || null;

    if (latestRevenueDate && previousRevenueDate) {
      const gapDays = Math.ceil(
        (latestRevenueDate.getTime() - previousRevenueDate.getTime()) /
          (1000 * 60 * 60 * 24),
      );

      if (revenues.length >= 2 && gapDays >= 45) {
        return {
          text:
            "Tes encaissements sont irréguliers. Un suivi plus régulier rend tes repères fiscaux plus fiables.",
          cta: "Ajouter un revenu",
          onClick: handleOpenRevenuePopup,
        };
      }
    }

    if (
      !smartAlertIds.has("tva-threshold") &&
      (computed?.tvaStatus === "soon" || computed?.tvaStatus === "exceeded")
    ) {
      return {
        text:
          "Le passage à la TVA approche. Vérifie dès maintenant le paramétrage de ta facturation.",
        cta: "Comprendre la TVA",
        onClick: () => setShowTVAModal(true),
      };
    }

    if (
      isFiscalProfileComplete &&
      revenues.length > 0 &&
      Number(computed?.monthlyExpenses || 0) === 0
    ) {
      return {
        text:
          "Aucune dépense personnelle n’est renseignée. L’analyse de couverture reste donc partielle.",
      };
    }

    if (
      !smartAlertIds.has("declaration-deadline") &&
      (computed?.urgency === "late" || computed?.urgency === "soon")
    ) {
        return {
          text:
            "La prochaine déclaration URSSAF mérite d’être préparée maintenant. Prévois le montant à déclarer avant l’échéance.",
          cta: "Gérer mes rappels",
          onClick: () => openReminderManager("coaching_deadline"),
        };
      }

    if (
      !smartAlertIds.has("reserve-low") &&
      savingsGoal > 0 &&
      savingsProgress < savingsGoal * 0.35
    ) {
      return {
        text:
          "Ta réserve reste courte au regard de l’objectif calculé. Sécurise une part des prochains encaissements.",
      };
    }

    if (
      !smartAlertIds.has("acre-ending") &&
      dashboardAnswers?.acre === "yes" &&
      dashboardAnswers?.acre_start_date
    ) {
      const acreStart = parseIsoDate(dashboardAnswers.acre_start_date);

      if (acreStart) {
        const acreEnd = new Date(acreStart);
        acreEnd.setMonth(acreEnd.getMonth() + 12);
        const daysLeft = Math.ceil(
          (acreEnd.getTime() - parseIsoDate(getTodayIsoDate()).getTime()) /
            (1000 * 60 * 60 * 24),
        );

        if (daysLeft > 0 && daysLeft <= 90) {
          return {
            text:
              "La fin de l’ACRE approche. Anticipe l’évolution de tes cotisations sur les prochains mois.",
          };
        }
      }
    }

    if (!user && revenues.length >= 3) {
      return {
        text:
          "Ton historique devient utile pour le suivi fiscal. Créer ton compte permet de le conserver dans la durée.",
        cta: "Créer mon compte",
        onClick: () => openAuthModal("signup"),
      };
    }

    if (revenues.length > 0 && visibleInvoices.length === 0) {
      return {
        text:
          "Tu as déjà de l’activité enregistrée. Formaliser une première facture aide à structurer le suivi client et encaissement.",
        cta: "Créer une facture",
        onClick: handleOpenInvoiceGenerator,
      };
    }

    return null;
  }, [
    smartAlerts,
    revenues,
    computed,
    isFiscalProfileComplete,
    savingsGoal,
    savingsProgress,
    dashboardAnswers,
    user,
    visibleInvoices.length,
    handleOpenRevenuePopup,
    handleOpenInvoiceGenerator,
    openAuthModal,
  ]);
  const guestConversionEligible =
    !user &&
    (profileReady ||
      revenues.length > 0 ||
      guestInvoices.length > 0 ||
      (computed?.deadlineLabel &&
        computed.deadlineLabel !== "—" &&
        computed.deadlineLabel !== "Profil à compléter"));
  const activeReminderItems = useMemo(() => {
    const items = [];
    const reminderChannel =
      reminderPrefs.sms && hasSmsPremiumAccess
        ? "Email + SMS"
        : reminderPrefs.email
          ? "Email"
          : "Canal à activer";

    if (
      reminderPrefs.declaration &&
      computed?.deadlineLabel &&
      computed.deadlineLabel !== "—" &&
      computed.deadlineLabel !== "Profil à compléter" &&
      computed.deadlineLabel !== "Complète ton profil fiscal"
    ) {
      items.push({
        key: "declaration",
        title: "Déclaration URSSAF",
        text: computed.deadlineLabel,
        urgent: computed?.urgency === "late" || computed?.urgency === "soon",
        channel: reminderChannel,
        actions: [
          {
            label: "Déclarer",
            kind: "link",
            href: "https://autoentrepreneur.urssaf.fr",
          },
          {
            label: "Gérer",
            kind: "button",
            onClick: () => openReminderManager("reminder_declaration"),
          },
        ],
      });
    }

    if (
      reminderPrefs.tva &&
      (computed?.tvaStatus === "soon" || computed?.tvaStatus === "exceeded")
    ) {
      items.push({
        key: "tva",
        title: "TVA",
        text:
          computed?.tvaStatus === "exceeded"
            ? "Seuil TVA dépassé"
            : "Seuil TVA à surveiller",
        urgent: true,
        channel: reminderChannel,
        actions: [
          {
            label: "Voir le diagnostic",
            kind: "button",
            onClick: () => setShowTVADiagnosticModal(true),
          },
        ],
      });
    }

    if (reminderPrefs.cfe && computed?.cfeAlert?.show) {
      items.push({
        key: "cfe",
        title: "CFE",
        text: "🏛️ Rappel CFE actif",
        urgent: true,
        channel: reminderChannel,
        actions: [
          {
            label: "Comprendre",
            kind: "button",
            onClick: () => setShowCFEModal(true),
          },
          {
            label: "Gérer",
            kind: "button",
            onClick: () => openReminderManager("reminder_cfe"),
          },
        ],
      });
    }

    if (reminderPrefs.cfe && !computed?.cfeAlert?.show) {
      items.push({
        key: "cfe",
        title: "CFE",
        text: "🏛️ Rappel CFE actif",
        urgent: false,
        channel: reminderChannel,
        actions: [
          {
            label: "Comprendre",
            kind: "button",
            onClick: () => setShowCFEModal(true),
          },
          {
            label: "Gérer",
            kind: "button",
            onClick: () => openReminderManager("reminder_cfe"),
          },
        ],
      });
    }

    if (reminderPrefs.acre && dashboardAnswers?.acre === "yes" && dashboardAnswers?.acre_start_date) {
      const acreStart = parseIsoDate(dashboardAnswers.acre_start_date);
      if (acreStart) {
        const acreEnd = new Date(acreStart);
        acreEnd.setMonth(acreEnd.getMonth() + 12);
        const daysLeft = Math.ceil(
          (acreEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        );

        if (daysLeft > 0 && daysLeft <= 90) {
          const monthsLeft = Math.max(1, Math.ceil(daysLeft / 30));
          items.push({
            key: "acre",
            title: "Fin ACRE",
            text: `Fin estimée dans ${monthsLeft} mois.`,
            urgent: true,
            channel: reminderChannel,
            actions: [
              {
                label: "Modifier mon profil",
                kind: "button",
                onClick: () => handleEditProfile(),
              },
              {
                label: "Gérer",
                kind: "button",
                onClick: () => openReminderManager("reminder_acre"),
              },
            ],
          });
        } else if (daysLeft > 90) {
          const monthsLeft = Math.max(1, Math.ceil(daysLeft / 30));
          items.push({
            key: "acre-active",
            title: "ACRE active",
            text: `Fin estimée dans ${monthsLeft} mois.`,
            urgent: false,
            channel: reminderChannel,
            actions: [
              {
                label: "Modifier mon profil",
                kind: "button",
                onClick: () => handleEditProfile(),
              },
            ],
          });
        }
      }
    }

    if (reminderPrefs.email || (reminderPrefs.sms && hasSmsPremiumAccess)) {
      items.push({
        key: "channel",
        title: "Canal",
        text: reminderChannel,
        urgent: false,
        channel: reminderChannel,
        actions: [
          {
            label: "Gérer",
            kind: "button",
            onClick: () => openReminderManager("reminder_channel"),
          },
        ],
      });
    }

    return items;
  }, [
    computed,
    dashboardAnswers,
    handleEditProfile,
    hasSmsPremiumAccess,
    openReminderManager,
    reminderPrefs,
  ]);
  const urgentReminderSignature = useMemo(
    () =>
      activeReminderItems
        .filter((item) => item.urgent)
        .map((item) => `${item.key}:${item.text}`)
        .join("|"),
    [activeReminderItems],
  );
  const primarySmartAlertId = smartAlerts[0]?.id || null;
  const invoiceSectionSummary = useMemo(() => {
    const unpaidCount = visibleInvoices.filter(
      (invoice) => invoice?.status && invoice.status !== "paid",
    ).length;

    return {
      count: visibleInvoices.length,
      unpaidCount,
    };
  }, [visibleInvoices]);
  const fiscalRecommendationCard = useMemo(() => {
    if (
      primarySmartAlertId !== "tva-threshold" &&
      computed?.tvaStatus === "exceeded" &&
      visibleInvoices.length === 0
    ) {
      return "💡 Astuce : crée tes factures pour mieux suivre la TVA collectée.";
    }

    if (
      Number(computed?.monthlyExpenses || 0) === 0 &&
      revenues.length > 0
    ) {
      return "💡 Astuce : ajoute tes dépenses pour piloter ta marge réelle.";
    }

    if (
      primarySmartAlertId !== "acre-ending" &&
      dashboardAnswers?.acre === "yes" &&
      dashboardAnswers?.acre_start_date
    ) {
      const acreStart = parseIsoDate(dashboardAnswers.acre_start_date);

      if (acreStart) {
        const acreEnd = new Date(acreStart);
        acreEnd.setMonth(acreEnd.getMonth() + 12);
        const daysLeft = Math.ceil(
          (acreEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        );
        const monthsLeft = daysLeft > 0 ? Math.max(1, Math.ceil(daysLeft / 30)) : 0;

        if (monthsLeft > 0 && monthsLeft <= 2) {
          return "💡 Astuce : anticipe la hausse des cotisations après l’ACRE.";
        }
      }
    }

    if (invoiceSectionSummary.unpaidCount > 0) {
      return "💡 Astuce : relance les paiements en retard pour sécuriser ta trésorerie.";
    }

    return null;
  }, [
    computed?.monthlyExpenses,
    computed?.tvaStatus,
    dashboardAnswers?.acre,
    dashboardAnswers?.acre_start_date,
    invoiceSectionSummary.unpaidCount,
    primarySmartAlertId,
    revenues.length,
    visibleInvoices.length,
  ]);
  const fiscalScore = useMemo(() => {
    let score = 0;

    if (revenues.length >= 3) score += 20;
    if (visibleInvoices.length > 0) score += 20;
    if (Number(computed?.monthlyExpenses || 0) > 0) score += 20;
    if (computed?.tvaStatus !== "exceeded") score += 20;
    if (activeReminderItems.length >= 3) score += 20;

    const interpretation =
      score >= 80
        ? "Ton espace est très bien piloté."
        : score >= 60
          ? "Ton suivi est bon, encore quelques optimisations."
          : "Ton espace a besoin de plus de suivi.";

    return { value: score, interpretation };
  }, [
    activeReminderItems.length,
    computed?.monthlyExpenses,
    computed?.tvaStatus,
    revenues.length,
    visibleInvoices.length,
  ]);
  const premiumTopMessage = useMemo(() => {
    if (!user) {
      return "90 jours offerts après création du compte • Puis 5 €/mois";
    }

    if (isTrialActive && trialDaysLeft !== null) {
      return `J-${trialDaysLeft} avant Premium • Puis 5 €/mois`;
    }

    return "Premium disponible • 5 €/mois";
  }, [isTrialActive, trialDaysLeft, user]);
  const premiumBannerContent = useMemo(() => {
    if (isPremium) {
      return {
        line1: "⭐ Offre fondateur activée",
        line2: "Premium offert pendant 3 mois",
        line3:
          "Tu bénéficies déjà des exports illimités et de l’historique complet.",
      };
    }

    if (trialDaysLeft !== null) {
      return premiumWaitlistJoined
        ? {
            line1: `🎁 Offre active : J-${trialDaysLeft}`,
            line2: "Ton accès Premium fondateur est déjà réservé",
            line3: "Puis 5 €/mois",
          }
        : {
            line1: `🎁 Offre fondateur : J-${trialDaysLeft}`,
            line2: `3 mois offerts pour les ${FOUNDER_OFFER_LIMIT} premiers utilisateurs`,
            line3: "Puis 5 €/mois",
          };
    }

    return {
      line1: premiumWaitlistJoined ? "🎁 Offre active" : premiumTopMessage,
      line2: premiumWaitlistJoined
        ? "Ton accès Premium fondateur est déjà réservé"
        : `3 mois offerts pour les ${FOUNDER_OFFER_LIMIT} premiers utilisateurs`,
      line3: "Puis 5 €/mois",
    };
  }, [isPremium, premiumTopMessage, premiumWaitlistJoined, trialDaysLeft]);
  const premiumModalContent = useMemo(() => {
    const normalizedSource = String(premiumModalSource || "unknown");

    if (normalizedSource.includes("export")) {
      return {
        title: "Premium pour exporter sans limite",
        intro:
          "Débloque les exports PDF et CSV illimités pour garder un suivi propre et partageable à tout moment.",
        heroTitle: "Exports illimités",
        heroText:
          "Un historique prêt pour ton comptable, avec archivage automatique et exports disponibles quand tu en as besoin.",
        firstBenefit: "✔ Exports PDF et CSV illimités",
      };
    }

    if (normalizedSource.includes("tva")) {
      return {
        title: "Premium pour anticiper la TVA",
        intro:
          "Reçois des alertes TVA plus visibles et des rappels SMS pour préparer ta facturation au bon moment.",
        heroTitle: "Alerte TVA prioritaire",
        heroText:
          "Un suivi plus direct pour anticiper l’activation TVA sans manquer une étape clé.",
        firstBenefit: "✔ Alertes TVA + rappels SMS automatiques",
      };
    }

    if (normalizedSource.includes("history") || normalizedSource.includes("revenue")) {
      return {
        title: "Premium pour piloter ton historique",
        intro:
          "Conserve un historique complet de ton activité et automatise tes exports quand ton suivi devient plus dense.",
        heroTitle: "Historique sans limite",
        heroText:
          "Retrouve tes données sur la durée et exporte-les plus facilement pour ton pilotage.",
        firstBenefit: "✔ Historique illimité de tes revenus",
      };
    }

    if (normalizedSource.includes("acre")) {
      return {
        title: "Premium pour anticiper la fin ACRE",
        intro:
          "Prépare la sortie ACRE avec des alertes plus ciblées avant l’évolution de tes cotisations.",
        heroTitle: "Alerte ACRE personnalisée",
        heroText:
          "Des rappels plus précis pour anticiper la transition et ajuster ton suivi fiscal à temps.",
        firstBenefit: "✔ Alertes personnalisées avant la fin ACRE",
      };
    }

    if (normalizedSource.includes("invoice") || normalizedSource.includes("unpaid")) {
      return {
        title: "Premium pour suivre les factures en attente",
        intro:
          "Repère plus vite les factures à surveiller et structure ton suivi d’encaissement dans le temps.",
        heroTitle: "Suivi facture renforcé",
        heroText:
          "Une meilleure visibilité sur les relances et les paiements à surveiller.",
        firstBenefit: "✔ Suivi des factures impayées",
      };
    }

    return {
      title: "Premium arrive bientôt ✨",
      intro:
        "La version Premium est en cours de finalisation. Laisse simplement ton email pour recevoir l’accès en avant-première.",
      heroTitle: "Ouverture prochaine",
      heroText: "Aucun compte n’est nécessaire pour rejoindre la liste Premium.",
      firstBenefit: "✔ Historique complet de tes revenus",
    };
  }, [premiumModalSource]);
  const revenueSectionTotal = useMemo(
    () =>
      filteredRevenues.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [filteredRevenues],
  );
  const premiumContextualCTA = useMemo(() => {
    const acreStart = dashboardAnswers?.acre_start_date
      ? parseIsoDate(dashboardAnswers.acre_start_date)
      : null;
    let acreMonthsLeft = null;

    if (dashboardAnswers?.acre === "yes" && acreStart) {
      const acreEnd = new Date(acreStart);
      acreEnd.setMonth(acreEnd.getMonth() + 12);
      const daysLeft = Math.ceil(
        (acreEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );

      if (daysLeft > 0) {
        acreMonthsLeft = Math.max(1, Math.ceil(daysLeft / 30));
      }
    }

    const candidates = [
      {
        visible:
          computed?.tvaStatus === "soon" || computed?.tvaStatus === "exceeded",
        blockedBy: "tva-threshold",
        text: "Passe à Premium pour recevoir les alertes TVA et SMS automatiques",
        source: "premium_tva_context",
      },
      {
        visible: revenues.length >= 5,
        blockedBy: null,
        text: "Historique illimité + exports automatiques en Premium",
        source: "premium_history_context",
      },
      {
        visible: acreMonthsLeft !== null && acreMonthsLeft <= 2,
        blockedBy: "acre-ending",
        text: "Anticipe la fin ACRE avec alertes personnalisées Premium",
        source: "premium_acre_context",
      },
      {
        visible: invoiceSectionSummary.unpaidCount > 0,
        blockedBy: null,
        text: "Suivi des factures impayées en Premium",
        source: "premium_unpaid_context",
      },
    ];

    return (
      candidates.find(
        (candidate) =>
          candidate.visible &&
          (!candidate.blockedBy || candidate.blockedBy !== primarySmartAlertId),
      ) || null
    );
  }, [
    dashboardAnswers?.acre,
    dashboardAnswers?.acre_start_date,
    computed?.tvaStatus,
    revenues.length,
    invoiceSectionSummary.unpaidCount,
    primarySmartAlertId,
  ]);
  const premiumTrackingSource = normalizePremiumTrackingSource(
    premiumContextualCTA?.source || "default",
  );
  const dashboardTopNudge = useMemo(() => {
    const latestRevenueDate = revenues
      .map((item) => parseIsoDate(item?.date))
      .filter(Boolean)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    if (latestRevenueDate) {
      const daysSinceLastRevenue = Math.floor(
        (Date.now() - latestRevenueDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysSinceLastRevenue >= 7) {
        return {
          type: "revenue_recency",
          text: "👋 Pense à ajouter ton revenu du mois pour garder tes prévisions à jour.",
        };
      }
    }

    if (
      primarySmartAlertId !== "tva-threshold" &&
      (computed?.tvaStatus === "soon" || computed?.tvaStatus === "exceeded")
    ) {
      return {
        type: "tva_watch",
        text: "⚠️ Ton seuil TVA évolue vite. Vérifie ton diagnostic cette semaine.",
      };
    }

    if (
      primarySmartAlertId !== "invoice_opportunity" &&
      visibleInvoices.length === 0 &&
      revenues.length >= 3
    ) {
      return {
        type: "invoice_first",
        text: "🧾 Crée ta première facture pour suivre tes paiements.",
      };
    }

    if (
      primarySmartAlertId !== "acre-ending" &&
      dashboardAnswers?.acre === "yes" &&
      dashboardAnswers?.acre_start_date
    ) {
      const acreStart = parseIsoDate(dashboardAnswers.acre_start_date);

      if (acreStart) {
        const acreEnd = new Date(acreStart);
        acreEnd.setMonth(acreEnd.getMonth() + 12);
        const daysLeft = Math.ceil(
          (acreEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        );
        const monthsLeft = daysLeft > 0 ? Math.max(1, Math.ceil(daysLeft / 30)) : 0;

        if (monthsLeft > 0 && monthsLeft <= 2) {
          return {
            type: "acre_ending",
            text: "⏳ Prépare la fin ACRE dès maintenant pour éviter le choc de charges.",
          };
        }
      }
    }

    return null;
  }, [
    computed?.tvaStatus,
    dashboardAnswers?.acre,
    dashboardAnswers?.acre_start_date,
    primarySmartAlertId,
    revenues,
    visibleInvoices.length,
  ]);
  const shouldShowDashboardTopNudge =
    dashboardTopNudge &&
    dashboardTopNudge.type !== dashboardTopNudgeDismissedType;
  const feedbackContextSnapshot = useMemo(() => {
    let acreMonthsRemaining = null;

    if (dashboardAnswers?.acre === "yes" && dashboardAnswers?.acre_start_date) {
      const acreStart = parseIsoDate(dashboardAnswers.acre_start_date);

      if (acreStart) {
        const acreEnd = new Date(acreStart);
        acreEnd.setMonth(acreEnd.getMonth() + 12);
        const daysLeft = Math.ceil(
          (acreEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        );

        if (daysLeft > 0) {
          acreMonthsRemaining = Math.max(1, Math.ceil(daysLeft / 30));
        } else {
          acreMonthsRemaining = 0;
        }
      }
    }

    return {
      totalRevenues: currentMonthTotal || 0,
      revenuesCount: revenues.length || 0,
      invoicesCount: visibleInvoices.length || 0,
      activePriorityType: primarySmartAlertId || null,
      premiumSource: premiumTrackingSource || "default",
      remindersCount: activeReminderItems.length || 0,
      projectedAnnual:
        typeof computed?.annualRevenue === "number" ? computed.annualRevenue : null,
      tvaThresholdState: computed?.tvaStatus || null,
      acreMonthsRemaining,
    };
  }, [
    dashboardAnswers?.acre,
    dashboardAnswers?.acre_start_date,
    currentMonthTotal,
    revenues.length,
    visibleInvoices.length,
    primarySmartAlertId,
    premiumTrackingSource,
    activeReminderItems.length,
    computed?.annualRevenue,
    computed?.tvaStatus,
  ]);

  const invoicesThisMonth = useMemo(() => {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  return visibleInvoices.filter((invoice) => {
    if (!invoice.invoice_date) return false;
    const d = new Date(`${invoice.invoice_date}T00:00:00`);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).length;
}, [visibleInvoices]);

useEffect(() => {
  if (appView !== "dashboard") return;
  if (premiumCTAViewSourceRef.current === premiumTrackingSource) return;

  trackEvent("premium_cta_view", { source: premiumTrackingSource });
  premiumCTAViewSourceRef.current = premiumTrackingSource;
}, [appView, premiumTrackingSource]);

const goToView = useCallback((nextView, options = {}) => {
  const { push = true, focus = false } = options;
  if (push) window.history.pushState({ appView: nextView }, "");
  setAppView(nextView);
  setFocusMode(focus);
  if (nextView === "assistant") setAssistantCollapsed(false);
}, []);

  const goToDashboard = useCallback((options = {}) => {
    const { scroll = true } = options;
    goToView("dashboard", { push: true, focus: true });

    if (!scroll) return;

    setTimeout(() => {
      fiscalRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  }, [goToView]);

  useEffect(() => {
  const pendingAuthSuccess = localStorage.getItem(PENDING_AUTH_SUCCESS_KEY);

  if (authLoading || !pendingAuthSuccess || !user) return;

  let cancelled = false;

  async function finalizeAuthSuccess() {
    const migrated = await migrateLocalDataToSupabase({ silent: true });

    await Promise.all([
      refreshRevenues(),
      refreshFiscalProfile(),
      refreshInvoices(),
    ]);

    if (cancelled) return;

    localStorage.removeItem(PENDING_AUTH_SUCCESS_KEY);
    localStorage.setItem(BETA_SEEN_KEY, "1");
    setShowBetaNotice(false);

    if (window.location.hash) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }

    goToDashboard({ scroll: false });

    showSaveNotice(
      pendingAuthSuccess === "email_confirmed"
        ? "Bienvenue ✅ Ton espace fiscal est prêt."
        : migrated
          ? "Connexion réussie ✅ Tes données ont été importées et ton espace fiscal est prêt."
          : "Connexion réussie ✅ Ton espace fiscal est prêt.",
      5000,
    );
  }

  finalizeAuthSuccess();

  return () => {
    cancelled = true;
  };
}, [
  user,
  authLoading,
  migrateLocalDataToSupabase,
  refreshRevenues,
  refreshFiscalProfile,
  refreshInvoices,
  goToDashboard,
  showSaveNotice,
]);

  const handleResumeDraft = useCallback(() => {
    setAppView("assistant");
    setFocusMode(true);
    setTimeout(() => {
      assistantRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  }, []);

  const toggleDashboardSection = useCallback((sectionKey) => {
    setDashboardSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  }, []);

  useEffect(() => {
    if (!urgentReminderSignature) return;

    setDashboardRemindersDismissed(false);

    try {
      localStorage.removeItem(DASHBOARD_REMINDERS_DISMISSED_KEY);
    } catch {
      // Ignore localStorage failures in dashboard UI state.
    }
  }, [urgentReminderSignature]);

function handleReminderToggle(key) {
  setReminderPrefs((prev) => {
    if (key === "sms" && !hasSmsPremiumAccess) {
      handleOpenSaveModal("sms_premium");
      return {
        ...prev,
        sms: false,
      };
    }

    const next = {
      ...prev,
      [key]: !prev[key],
    };

    localStorage.setItem(REMINDER_PREFS_KEY, JSON.stringify(next));
    return next;
  });
}

  // Centralizes UI gating for monetized features.
  function guardPremiumAccess(feature, source = "unknown") {
    const featureChecks = {
      revenue_limit: () => revenues.length >= currentPlanLimits.revenues,
      invoice_limit: () =>
        invoicesThisMonth >= currentPlanLimits.invoicesPerMonth,
      pdf_export_limit: () => isExportLimitReached,
      sms_premium: () => reminderPrefs.sms && !hasSmsPremiumAccess,
    };

    const isBlocked = featureChecks[feature]?.() ?? false;

    if (isBlocked) {
      handleOpenSaveModal(source || feature);
      return false;
    }

    return true;
  }

  function resetRevenueForm() {
    setRevenueForm({
      amount: "",
      date: new Date().toISOString().slice(0, 10),
      client: "",
      invoice: "",
      note: "",
    });
    setShowRevenueDetails(false);
  }

function handleOpenRevenuePopup() {
  if (!guardPremiumAccess("revenue_limit", "revenue_limit")) {
    return;
  }

  setShowAddRevenue(true);
}

  function handleCloseRevenuePopup() {
    setShowAddRevenue(false);
    resetRevenueForm();
  }

function handleOpenInvoiceGenerator() {
  if (!guardPremiumAccess("invoice_limit", "invoice_limit")) {
    return;
  }

  // Keep every invoice entry point behind the same premium gate.
  setShowInvoiceGenerator(true);
}

function openReminderManager(source = "default") {
  trackEvent("reminder_manage", {
    source,
    totalRevenues: revenues.length,
    invoiceCount: visibleInvoices.length,
  });
  setShowReminderModal(true);
}

  // ==================== ФУНКЦИИ УДАЛЕНИЯ И СБРОСА ====================
  const handleDeleteRevenue = useCallback(
    async (id) => {
      if (!user) {
        const nextRevenues = revenues.filter((item) => item.id !== id);
        setRevenues(nextRevenues);
        localStorage.setItem(GUEST_REVENUES_KEY, JSON.stringify(nextRevenues));
        return;
      }

      const ok = await deleteRevenueFromSupabase(id);
      if (!ok) {
        alert("Impossible de supprimer ce revenu.");
        return;
      }
      await refreshRevenues();
    },
    [deleteRevenueFromSupabase, refreshRevenues, revenues, user],
  );

  function resetAssistantSession(message = "Bonjour 👋 On recommence. Réponds simplement.") {
    setStepIndex(0);
    setAnswers({});
    setInput("");
    setUserName("");
    setHelpOpen(false);
    setAssistantFieldError("");
    setIsTyping(false);
    setFocusMode(false);
    setHasDraft(false);
    setLastSavedAt(null);
    setRestoredAt(null);
    setAssistantCollapsed(false);
    setAssistantEditMode(false);
    setProfileEditMode("idle");
    setSelectedProfileField(null);
    setProfileEditDraft({});

    const [firstMessage, ...rest] = buildInitialAssistantMessages();
    setMessages([
      {
        ...firstMessage,
        text: message,
      },
      ...rest,
    ]);
  }

  function resetDashboardState() {
    setSelectedMonth("all");
    setShowChart(true);
    setShowAddRevenue(false);
    setShowRevenueDetails(false);
    setShowInvoiceGenerator(false);
    setShowReminderModal(false);
    setShowPricingModal(false);
    setShowTVAModal(false);
    setShowCFEModal(false);
    setInvoiceNotice(null);
    setSaveNotice(null);
    resetRevenueForm();
  }

  function clearLocalStorageKeys(keys) {
    keys.forEach((key) => {
      localStorage.removeItem(key);
    });
  }

  useEffect(() => {
    if (authLoading) return;

    const currentUserId = user?.id ?? null;
    const previousUserId = previousUserIdRef.current;

    if (previousUserId === currentUserId) {
      return;
    }

    previousUserIdRef.current = currentUserId;

    setAuthOpen(false);
    setFiscalProfile(null);
    setFiscalProfileLoaded(false);
    fiscalProfileFetchRef.current = {
      inFlight: null,
      userId: null,
      lastFetchedAt: 0,
      lastData: null,
    };
    guestMigrationRef.current = {
      inFlight: null,
      userId: null,
      completedForUserId: null,
    };
    setRevenues([]);
    setInvoices([]);
    if (currentUserId) {
      setGuestInvoices([]);
    } else {
      try {
        setGuestInvoices(
          JSON.parse(localStorage.getItem(GUEST_INVOICES_KEY) || "[]"),
        );
      } catch {
        setGuestInvoices([]);
      }
    }
    setReminderPrefs(DEFAULT_REMINDER_PREFS);
    setSelectedMonth("all");
    setAnswers({});
    setStepIndex(0);
    setMessages(buildInitialAssistantMessages());
    setInput("");
    setAssistantFieldError("");
    setHasDraft(false);
    setLastSavedAt(null);
    setRestoredAt(null);
    setShowAddRevenue(false);
    setShowRevenueDetails(false);
    setShowInvoiceGenerator(false);
    setShowReminderModal(false);
    setInvoiceNotice(null);
    setSaveNotice(null);
    setUserName("");
    setAssistantEditMode(false);
    setProfileEditMode("idle");
    setSelectedProfileField(null);
    setProfileEditDraft({});
  }, [authLoading, user?.id]);

  async function resetFiscalProfileData() {
    if (!user) return true;

    const { error } = await supabase
      .from("fiscal_profiles")
      .delete()
      .eq("user_id", user.id);

    if (error) {
      console.error("Fiscal profile reset error:", error.message);
      return false;
    }

    return true;
  }

  async function deleteUserRecords(table) {
    if (!user) return true;

    const { error } = await supabase.from(table).delete().eq("user_id", user.id);

    if (error) {
      console.error(`Delete ${table} error:`, error.message);
      return false;
    }

    return true;
  }

  async function handleProfileOnlyReset() {
    if (resetInProgress) return;

    setResetInProgress(true);

    try {
      if (user) {
        const didResetProfile = await resetFiscalProfileData();

        if (!didResetProfile) {
          showSaveNotice("Impossible de réinitialiser le profil fiscal.", 4000);
          return;
        }
      }

      localStorage.removeItem(LS_KEY);
      resetAssistantSession();
      setAppView("assistant");
      await refreshFiscalProfile();

      showSaveNotice(
        "Profil fiscal réinitialisé ✅ Tes revenus, factures et rappels sont conservés.",
        4500,
      );
      setShowResetModal(false);

      setTimeout(() => {
        assistantRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 120);
    } finally {
      setResetInProgress(false);
    }
  }

  async function handleFullReset() {
    if (resetInProgress) return;

    setResetInProgress(true);

    try {
      if (user) {
        const results = await Promise.all([
          resetFiscalProfileData(),
          deleteUserRecords("revenues"),
          deleteUserRecords("invoices"),
          deleteUserRecords("reminders"),
        ]);

        if (results.some((result) => result === false)) {
          showSaveNotice("Impossible de réinitialiser tout l’espace.", 4000);
          return;
        }
      }

      clearLocalStorageKeys(FULL_RESET_LOCAL_STORAGE_KEYS);
      setRevenues([]);
      setInvoices([]);
      setGuestInvoices([]);
      setReminderPrefs(EMPTY_REMINDER_PREFS);
      setFiscalProfile(null);
      setFiscalProfileLoaded(Boolean(user));
      resetDashboardState();
      resetAssistantSession();
      setAppView("assistant");
      setVisibleSections(DEFAULT_VISIBLE_SECTIONS);

      if (!user) {
        setHydrated(true);
      } else {
        await Promise.all([
          refreshRevenues(),
          refreshInvoices(),
          refreshFiscalProfile(),
        ]);
      }

      showSaveNotice("Espace fiscal réinitialisé ✅ Aucun ancien calcul n’est conservé.", 5000);
      setShowResetModal(false);

      setTimeout(() => {
        assistantRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 120);
    } finally {
      setResetInProgress(false);
    }
  }

  function handleReset() {
    setShowResetModal(true);
  }

  // Оставьте только goToView и используйте везде
  const goToAssistant = useCallback(() => {
    if (user && fiscalProfile) {
      setAnswers(getAssistantAnswersFromProfile(fiscalProfile));
      setStepIndex(0);
      setInput("");
      setHelpOpen(false);
      setAssistantFieldError("");
    }
    setAssistantEditMode(false);

    goToView("assistant", { push: true, focus: true });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        assistantRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    });
  }, [user, fiscalProfile, goToView]);

  // А в handleTipAction используйте goToAssistant
  // Вместо текущей неполной функции, вставьте эту:
  function handleTipAction(action) {
    if (action === "add") {
      handleOpenRevenuePopup();
      return;
    }
    if (action === "profile") {
      goToAssistant();
      return;
    }
    if (action === "deadline") {
      fiscalRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function handleSmartAlertAction(action) {
    if (action === "add_revenue") {
      handleOpenRevenuePopup();
      return;
    }

    if (action === "cash_impact") {
      setShowCashImpactModal(true);
      return;
    }

    if (action === "tva") {
      setShowTVADiagnosticModal(true);
      return;
    }

    if (action === "tva_info") {
      setShowTVAModal(true);
      return;
    }

    if (action === "reminders") {
      openReminderManager("smart_priority");
      return;
    }

    if (action === "invoices") {
      document
        .getElementById("invoices-section")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    handleTipAction(action);
  }

  function handleRevenueFieldChange(field, value) {
    setRevenueForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function deleteRevenueFromSupabase(id) {
    const { error } = await supabase.from("revenues").delete().eq("id", id);

    if (error) {
      console.error("Revenue delete error:", error.message);
      return false;
    }

    return true;
  }

  async function saveRevenueToSupabase(revenue) {
    if (!user?.id) {
      console.error("User not authenticated.");
      return null;
    }

    const payload = {
      user_id: user.id,
      amount: Number(revenue.amount),
      revenue_date: revenue.date,
      client: revenue.client || null,
      invoice: revenue.invoice || null,
      note: revenue.note || null,
    };

    const { data, error } = await supabase
      .from("revenues")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error("Revenue insert error:", error.message);
      return null;
    }

    console.log("Revenue saved ✅");
    return data;
  }

  async function saveRevenueEntry() {
    const amount = Number(String(revenueForm.amount).replace(",", "."));

    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Merci d’indiquer un montant valide.");
      return;
    }

    const entry = {
      amount,
      date: revenueForm.date || new Date().toISOString().slice(0, 10),
      client: revenueForm.client.trim(),
      invoice: revenueForm.invoice.trim(),
      note: revenueForm.note.trim(),
    };

    const savedEntry = await saveRevenueToSupabase(entry);

    if (!savedEntry) {
      alert("Impossible d’enregistrer ce revenu.");
      return;
    }

    await refreshRevenues();
    trackEvent("revenue_add", {
      source: user ? "authenticated" : "guest",
      totalRevenues: revenues.length + 1,
      invoiceCount: visibleInvoices.length,
    });
    showSuccessToast("✅ Revenu ajouté. Tes projections sont à jour.", 4000);

    const rate =
      computed?.rate || getEstimatedRate(dashboardAnswers.activity_type);
    const charges = Math.round(amount * rate);
    const disponible = Math.max(0, amount - charges);

    showSaveNotice(
      `Revenu enregistré • charges estimées : ${charges.toLocaleString("fr-FR")} € • disponible estimé : ${disponible.toLocaleString("fr-FR")} €`,
      2500,
    );

    setShowAddRevenue(false);
    resetRevenueForm();

    setTimeout(() => {
      fiscalRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 200);
  }

  async function handleSaveRevenue() {
    if (!user) {
      // Сохраняем в localStorage для неавторизованных
      const newRevenue = {
        id: Date.now(),
        amount: revenueAmount,
        date: revenueForm.date,
        client: revenueForm.client,
        invoice: revenueForm.invoice,
        note: revenueForm.note,
      };

      const updatedRevenues = [newRevenue, ...revenues];
      setRevenues(updatedRevenues);
      localStorage.setItem(GUEST_REVENUES_KEY, JSON.stringify(updatedRevenues));

      setShowAddRevenue(false);
      resetRevenueForm();
      trackEvent("revenue_add", {
        source: "guest",
        totalRevenues: updatedRevenues.length,
        invoiceCount: visibleInvoices.length,
      });
      showSuccessToast("✅ Revenu ajouté. Tes projections sont à jour.", 4000);

      showSaveNotice(
        `Revenu enregistré localement • ${revenueAmount.toLocaleString("fr-FR")} €`,
        2500,
      );

      return;
    }

    await saveRevenueEntry();
  }

  function formatRevenueDate(dateStr) {
    if (!dateStr) return "";

    const d = new Date(`${dateStr}T00:00:00`);

    if (Number.isNaN(d.getTime())) return "";

    return d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

function handleExportCSV() {
  const currentUsage = syncMonthlyExportUsage();
  const currentRemainingExports = isPremium
    ? Infinity
    : Math.max(0, FREE_EXPORTS_PER_MONTH - currentUsage.total);

  if (filteredRevenues.length === 0 || isExportingCsv) return;
  if (!isPremium && currentRemainingExports <= 0) {
    handleExportLimitHit(currentUsage);
    return;
  }

  setIsExportingCsv(true);

  try {
    const headers = ["Date", "Montant", "Client", "Facture", "Note"];

    const rows = filteredRevenues.map((item) => [
      item.date || "",
      item.amount || "",
      item.client || "",
      item.invoice || "",
      item.note || "",
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.join(";"))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;

    const fileName =
      selectedMonth === "all"
        ? "revenus_microassist.csv"
        : `revenus_${selectedMonth}.csv`;

    link.setAttribute("download", fileName);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    incrementMonthlyExportUsage("csv");
    trackEvent("export_csv", {
      source: "revenues",
      totalRevenues: filteredRevenues.length,
      invoiceCount: visibleInvoices.length,
    });
    showSuccessToast("✅ Export prêt. Ton suivi est sauvegardé.", 4000);
  } finally {
    setIsExportingCsv(false);
  }
}

function incrementMonthlyExportUsage(type) {
  const usageType = type === "pdf" ? "pdf" : "csv";
  const currentUsage = readMonthlyExportUsage();
  const nextUsage = normalizeMonthlyExportUsage({
    ...currentUsage,
    [usageType]: currentUsage[usageType] + 1,
    total: currentUsage.total + 1,
  });

  setMonthlyExportUsage(nextUsage);
  writeMonthlyExportUsage(nextUsage);
}

function syncMonthlyExportUsage() {
  const normalizedUsage = readMonthlyExportUsage();
  setMonthlyExportUsage(normalizedUsage);
  writeMonthlyExportUsage(normalizedUsage);
  return normalizedUsage;
}

function handleExportLimitHit(currentUsage = monthlyExportUsage) {
  const remaining = Math.max(
    0,
    FREE_EXPORTS_PER_MONTH - Number(currentUsage?.total || 0)
  );

  trackEvent("export_limit_hit", {
    source: "exports_limit",
    usedExports: Number(currentUsage?.total || 0),
    remainingExports: remaining,
    totalRevenues: filteredRevenues.length,
    invoiceCount: visibleInvoices.length,
  });
  openPremiumModal("exports_limit");
}

const handleExportPDF = useCallback(async () => {
  try {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 16;
    let y = 22;

    // Palette sérieuse
    const navy = [30, 41, 59];        // slate-800
    const dark = [17, 24, 39];        // gray-900
    const muted = [75, 85, 99];       // gray-600
    const border = [229, 231, 235];   // gray-200
    const soft = [249, 250, 251];     // gray-50
    const softBlue = [241, 245, 249]; // slate-100

    const cleanPdfText = (text) =>
      String(text || "")
        .replace(/[^\x00-\x7F]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const ensureSpace = (needed = 24) => {
      if (y + needed > pageHeight - 20) {
        doc.addPage();
        y = 20;
      }
    };

    const drawTitle = (title) => {
      ensureSpace(12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...dark);
      doc.text(title, margin, y);
      y += 8;
    };

    const drawLine = (label, value) => {
      ensureSpace(8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...dark);
      doc.text(`${label} :`, margin, y);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(...muted);

      const text = cleanPdfText(value || "—");
      const wrapped = doc.splitTextToSize(text, pageWidth - margin * 2 - 38);
      doc.text(wrapped, margin + 34, y);
      y += Math.max(7, wrapped.length * 5.5);
    };

    const drawBox = (title, lines = [], fill = soft) => {
      const lineHeight = 6;
      const wrappedLines = lines.map((line) =>
        doc.splitTextToSize(cleanPdfText(line), pageWidth - margin * 2 - 14)
      );
      const contentHeight =
        wrappedLines.reduce((sum, arr) => sum + arr.length * lineHeight, 0) + 18;

      ensureSpace(contentHeight + 8);

      doc.setFillColor(...fill);
      doc.setDrawColor(...border);
      doc.roundedRect(
        margin,
        y,
        pageWidth - margin * 2,
        contentHeight,
        3,
        3,
        "FD"
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...dark);
      doc.text(title, margin + 6, y + 8);

      let innerY = y + 16;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...muted);

      wrappedLines.forEach((arr) => {
        doc.text(arr, margin + 6, innerY);
        innerY += arr.length * lineHeight;
      });

      y += contentHeight + 8;
    };

  // HEADER
  doc.setFillColor(...navy);
  doc.rect(0, 0, pageWidth, 28, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  doc.text("MICROASSIST", margin, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Rapport fiscal simplifie", margin, 21);

  doc.setFontSize(8.5);
  doc.text(
    `Genere le ${new Date().toLocaleDateString("fr-FR")}`,
    pageWidth - margin - 28,
    21
  );

  y = 38;

  // PROFIL
  drawTitle("1. Profil");
  drawLine("Activite", activityLabel || "Non renseignee");
  drawLine("Periodicite", freqLabel || "Non renseignee");
  drawLine(
    "ACRE",
    dashboardAnswers?.acre === "yes"
      ? "Oui"
      : dashboardAnswers?.acre === "no"
        ? "Non"
        : "Non renseignee"
  );

  // RESUME
  y += 2;
  drawTitle("2. Resume du mois");

  const tvaLine = cleanPdfText(
    computed?.tvaStatusLabel || computed?.tvaHint || "Non renseigne"
  );

  const cfeLine = computed?.cfeAlert?.show
    ? computed?.cfeAlert?.estimatedAmount
      ? `${cleanPdfText(computed.cfeAlert.message)} • estimation : ${computed.cfeAlert.estimatedAmount} €`
      : cleanPdfText(computed.cfeAlert.message)
    : computed?.isFirstYear
      ? "Exonere la premiere annee"
      : "A confirmer selon la date de debut d activite";

  drawBox(
    "Vue d ensemble",
    [
      `Revenus cumulés : ${currentMonthTotal.toLocaleString("fr-FR")} €`,
      `Charges estimees : ${estimatedCharges.toLocaleString("fr-FR")} €`,
      `Disponible estime : ${availableAmount.toLocaleString("fr-FR")} €`,
      `Moyenne mensuelle : ${revenueStats.monthlyAverage.toLocaleString("fr-FR")} €`,
      `Nombre d entrees : ${revenueStats.count}`,
    ],
    soft
  );

  drawBox(
    "Reperes fiscaux",
    [
      `Prochaine declaration : ${cleanPdfText(computed?.nextDeclarationLabel || "—")}`,
      `Date limite : ${cleanPdfText(computed?.deadlineLabel || "—")}`,
      `TVA : ${tvaLine}`,
      `CFE : ${cfeLine}`,
    ],
    softBlue
  );

  // ANALYSE
  drawTitle("3. Analyse");
  drawBox(
    "Projection",
    [
      `Projection annuelle : ${computed?.annualNet?.toLocaleString("fr-FR") || "—"} €`,
      `Taux estime : ${computed?.rate ? Math.round(computed.rate * 100) : 0}%`,
      `Objectif d epargne : ${
        typeof savingsGoal !== "undefined" && savingsGoal > 0
          ? `${Math.round((savingsProgress / savingsGoal) * 100 || 0)}%`
          : "—"
      }`,
    ],
    soft
  );

  // ACTIONS
  drawTitle("4. Actions recommandees");

  const actionLines = [
    `Mettre de cote environ ${estimatedCharges.toLocaleString("fr-FR")} € pour eviter les surprises.`,
    `Verifier la prochaine echeance : ${cleanPdfText(computed?.deadlineLabel || "—")}.`,
  ];

  if (computed?.tvaStatus === "soon" || computed?.tvaStatus === "exceeded") {
    actionLines.push("Surveiller le seuil TVA et anticiper la facturation.");
  }

  if (computed?.cfeAlert?.show) {
    actionLines.push("Prevoir la CFE pour eviter une charge tardive en fin d annee.");
  }

  if (computed?.acreHint) {
    actionLines.push(cleanPdfText(computed.acreHint));
  }

  drawBox("A faire maintenant", actionLines, softBlue);

  // DISCLAIMER
  ensureSpace(18);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(...muted);
  const disclaimer = doc.splitTextToSize(
    "Document simplifie fourni a titre indicatif. Microassist ne remplace pas un expert-comptable.",
    pageWidth - margin * 2
  );
  doc.text(disclaimer, margin, y);
  y += disclaimer.length * 5 + 6;

  // FOOTER SIGNATURE
  doc.setDrawColor(...border);
  doc.line(margin, pageHeight - 16, pageWidth - margin, pageHeight - 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text(
    "Microassist • Rapport fiscal premium • France micro-entreprise",
    margin,
    pageHeight - 10
  );

  // PAGE 2 - HISTORIQUE
  if (revenues.length > 0) {
    doc.addPage();

    doc.setFillColor(...navy);
    doc.rect(0, 0, pageWidth, 22, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text("Historique des revenus", margin, 14);

    const tableData = revenues.slice(0, 30).map((r) => [
      formatRevenueDate(r.date),
      `${Number(r.amount).toLocaleString("fr-FR")} €`,
      r.client || "-",
      r.invoice || "-",
    ]);

    autoTable(doc, {
      startY: 30,
      head: [["Date", "Montant", "Client", "Facture"]],
      body: tableData,
      theme: "grid",
      headStyles: {
        fillColor: navy,
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      bodyStyles: {
        textColor: dark,
        fontSize: 9,
      },
      alternateRowStyles: {
        fillColor: soft,
      },
      styles: {
        lineColor: border,
        lineWidth: 0.1,
      },
      margin: { left: margin, right: margin },
    });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(
      "Microassist • Historique des revenus",
      margin,
      pageHeight - 10
    );
  }

    doc.save(
      `rapport_microassist_${new Date().toISOString().split("T")[0]}.pdf`
    );
    return true;
  } catch (error) {
    console.error("Erreur export PDF:", error);
    return false;
  }
}, [
  activityLabel,
  freqLabel,
  dashboardAnswers,
  currentMonthTotal,
  revenueStats,
  estimatedCharges,
  availableAmount,
  computed,
  revenues,
  formatRevenueDate,
  savingsGoal,
  savingsProgress,
]);

async function handleExportPDFWithLimit() {
  const currentUsage = syncMonthlyExportUsage();
  const currentRemainingExports = isPremium
    ? Infinity
    : Math.max(0, FREE_EXPORTS_PER_MONTH - currentUsage.total);

  if (isExportingPdf) {
    return;
  }
  if (!isPremium && currentRemainingExports <= 0) {
    handleExportLimitHit(currentUsage);
    return;
  }

  setIsExportingPdf(true);
  try {
    const exportCompleted = await handleExportPDF();

    if (exportCompleted) {
      incrementMonthlyExportUsage("pdf");
      trackEvent("export_pdf", {
        source: "revenues",
        totalRevenues: revenues.length,
        invoiceCount: visibleInvoices.length,
      });
      showSuccessToast("✅ Export prêt. Ton suivi est sauvegardé.", 4000);
    }
  } finally {
    setIsExportingPdf(false);
  }
}
  

  function handleSend() {
    if (!canSend || isTyping) return;

    const key = step?.key;
    const normalizedValue =
      key === "business_start_date" || key === "acre_start_date"
        ? normalizeDateValue(input)
        : input.trim();
    const nextAnswers = key
      ? { ...answers, [key]: normalizedValue }
      : { ...answers };
    const validationMessage = getCurrentStepValidationMessage(key, nextAnswers);

    if (validationMessage) {
      setAssistantFieldError(validationMessage);
      return;
    }

    setAssistantFieldError("");
    setInput("");

    submitAnswer({ chatText: normalizedValue, value: normalizedValue });
  }

  function submitAnswer({ chatText, value }) {
    addMessage("user", chatText);

    const key = step?.key;
    let updatedAnswers = key ? { ...answers, [key]: value } : { ...answers };
    let forcedNextIndex = null;

    if (key === "entry_status" && value === "micro_no") {
      setAnswers(updatedAnswers);

      addAssistant(
        "Pour l’instant, Microassist couvre surtout la micro-entreprise (URSSAF). " +
          "Une version SAS/EI/EURL est en préparation. " +
          "Tu peux laisser ton besoin dans la section “Prochainement”.",
      );

      scrollToSection("prochainement");
      return;
    }

    if (key === "entry_status" && value === "micro_yes") {
      updatedAnswers = { ...updatedAnswers, status: "auto_entrepreneur" };
    }

    if (key === "acre" && value !== "yes") {
      updatedAnswers = {
        ...updatedAnswers,
        acre_start_date: null,
      };
    }

    setAnswers(updatedAnswers);

    if (key === "declaration_frequency") {
      const dashIndex = getIndexByKey("fiscal_dashboard");
      if (dashIndex !== -1) {
        forcedNextIndex = dashIndex;
      }
    }

    // В submitAnswer, после setAnswers(updatedAnswers)
    if (key === "acre") {
      console.log("🔍 ACRE selected:", value);
      console.log("🔍 Answers after ACRE:", updatedAnswers);
    }

    setTimeout(() => {
      goNext(forcedNextIndex, updatedAnswers);
    }, 250);
  }

  function handleSelectOption(opt) {
    if (isTyping) return;
    setAssistantFieldError("");
    submitAnswer({ chatText: opt.label, value: opt.value });
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  }

  function handleDownloadTxt() {
    const content =
      buildFiscalSummary(answers, computed) +
      "\n\n" +
      buildFiscalChecklist(computed);

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "plan-action-mvp.txt";
    a.click();

    URL.revokeObjectURL(url);
  }

  function handleNewSession() {
    handleReset();
    setTimeout(() => {
      scrollToTopSection("assistant");
    }, 120);
  }

  const goToLandingSection = useCallback((section) => {
    const sectionKeyMap = {
      home: null,
      howItWorks: "howItWorks",
      services: "services",
      contact: "feedback",
    };

    const visibleKey = sectionKeyMap[section];

    if (visibleKey) {
      setVisibleSections((prev) => ({
        ...prev,
        [visibleKey]: true,
      }));
    }

    setAppView("landing");
    setFocusMode(false);

    setTimeout(() => {
      const refs = {
        home: heroRef,
        howItWorks: howItWorksRef,
        services: servicesRef,
        contact: feedbackRef,
      };

      refs[section]?.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);
  }, []);

async function handleOpenSaveModal(source = "unknown", options = {}) {
  const { inlineStatusOnly = false } = options;
  const trackingSource = normalizePremiumTrackingSource(source);
  trackEvent("premium_cta_click", { source: trackingSource });
  trackPremiumEvent(source, "modal_open");
  track("pricing_modal_opened", { source });
  setPremiumModalSource(source);
  setPremiumWaitlistEmail(user?.email?.trim().toLowerCase() ?? "");
  setPremiumWaitlistError("");

  if (user?.email?.trim()) {
    await joinPremiumWaitlist({
      email: user.email,
      source,
      isAuthenticatedEmail: true,
      inlineStatusOnly,
    });
    return;
  }

  trackEvent("premium_modal_open", { source: trackingSource });
  setShowPricingModal(true);
}

const closePremiumModal = useCallback((sourceOverride) => {
  const source = normalizePremiumTrackingSource(
    sourceOverride || premiumModalSource || "unknown",
  );
  trackEvent("premium_modal_close", { source });
  trackPremiumEvent(sourceOverride || premiumModalSource || "unknown", "dismiss");
  setShowPricingModal(false);
}, [premiumModalSource]);

function openPremiumModal(source = "unknown") {
  const trackingSource = normalizePremiumTrackingSource(source);
  trackEvent("premium_cta_click", { source: trackingSource });
  trackPremiumEvent(source, "modal_open");
  track("pricing_modal_opened", { source });
  trackEvent("premium_modal_open", { source: trackingSource });
  setPremiumModalSource(source);
  setPremiumWaitlistEmail(user?.email?.trim().toLowerCase() ?? "");
  setPremiumWaitlistError("");
  setShowPricingModal(true);
}


const joinPremiumWaitlist = useCallback(
  async ({ email, source, isAuthenticatedEmail = false, inlineStatusOnly = false }) => {
    const normalizedEmail = email.trim().toLowerCase();
    const trackingSource = normalizePremiumTrackingSource(source);

    if (!normalizedEmail) {
      setPremiumWaitlistError("Merci d’indiquer ton email.");
      trackEvent("premium_waitlist_submit", {
        source: trackingSource,
        success: false,
        reason: "missing_email",
      });
      return false;
    }

    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
    if (!isValidEmail) {
      setPremiumWaitlistError("Merci d’indiquer un email valide.");
      trackEvent("premium_waitlist_submit", {
        source: trackingSource,
        success: false,
        reason: "invalid_email",
      });
      return false;
    }

    try {
      setIsJoiningPremiumWaitlist(true);
      setPremiumWaitlistError("");

      const { data, error } = await supabase.rpc("join_premium_waitlist", {
        p_email: normalizedEmail,
        p_user_id: user?.id ?? null,
        p_source: source,
      });

      if (error) {
        console.error("Premium waitlist RPC error:", error.message);
        showSaveNotice("Impossible de rejoindre la liste Premium.", 4000);
        trackEvent("premium_waitlist_submit", {
          source: trackingSource,
          success: false,
          reason: "rpc_error",
        });
        return false;
      }

      const status = Array.isArray(data) ? data[0]?.status : data?.status;
      const grantsPremiumAccess = [
        "approved",
        "activated",
        "active",
        "premium_active",
        "founder_granted",
      ].includes(String(status || "").toLowerCase());

      trackEvent("premium_waitlist_submit", {
        source: trackingSource,
        success: true,
        status: status || "submitted",
      });
      trackPremiumEvent(source, "waitlist_submit");

      if (showPricingModal) {
        closePremiumModal(source);
      } else {
        setShowPricingModal(false);
      }
      setPremiumWaitlistEmail("");
      setPremiumWaitlistError("");

      if (status === "already_exists") {
        setPremiumWaitlistJoined(true);
        if (!inlineStatusOnly) {
          showSaveNotice(
            isAuthenticatedEmail
              ? "Ton email connecté est déjà sur la liste Premium."
              : "✨ Tu es déjà sur la liste Premium.",
            8000,
          );
        }
      } else {
        setPremiumWaitlistJoined(true);
        if (!inlineStatusOnly) {
          showSaveNotice(
            isAuthenticatedEmail
              ? "Ton email connecté a bien été ajouté à la liste Premium."
              : "✨ Tu es bien sur la liste Premium. Nous te préviendrons au lancement.",
            8000,
          );
        }
      }

      if (grantsPremiumAccess) {
        await persistPremiumStatus(true);
      }

      if (!inlineStatusOnly) {
        window.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      }

      return true;
    } catch (error) {
      console.error("Unexpected premium waitlist error:", error);
      showSaveNotice("Impossible de rejoindre la liste Premium.", 4000);
      trackEvent("premium_waitlist_submit", {
        source: trackingSource,
        success: false,
        reason: "unexpected_error",
      });
      return false;
    } finally {
      setIsJoiningPremiumWaitlist(false);
    }
  },
  [closePremiumModal, persistPremiumStatus, showPricingModal, showSaveNotice, user],
);

const handlePremiumWaitlistCTA = useCallback(async (sourceOverride) => {
  const source =
    sourceOverride ||
    premiumModalSource ||
    (isTrialExpired ? "premium_after_trial" : "pricing_modal");

  track("signup_cta_clicked", { source });
  await joinPremiumWaitlist({
    email: premiumWaitlistEmail,
    source,
  });
}, [
  isTrialExpired,
  joinPremiumWaitlist,
  premiumModalSource,
  premiumWaitlistEmail,
]);

  const activityOptions =
    FISCAL_STEPS.find((candidate) => candidate.key === "activity_type")?.options || [];
  const acreOptions =
    FISCAL_STEPS.find((candidate) => candidate.key === "acre")?.options || [];
  const declarationOptions =
    FISCAL_STEPS.find((candidate) => candidate.key === "declaration_frequency")?.options || [];

  function updateProfileEditDraft(nextValues) {
    setProfileEditDraft((prev) => ({
      ...prev,
      ...nextValues,
    }));
  }

  function handleProfileEditChoice(field, value) {
    if (field === "acre") {
      updateProfileEditDraft({
        acre: value,
        acre_start_date: value === "yes" ? profileEditDraft.acre_start_date || "" : "",
      });
      return;
    }

    updateProfileEditDraft({ [field]: value });
  }

  function handleProfileEditDateChange(field, value) {
    updateProfileEditDraft({
      [field]: normalizeDateValue(value),
    });
  }

  function handleProfileEditCancel() {
    setProfileEditMode("pick_field");
    setAssistantFieldError("");
    setInput("");
    setProfileEditDraft({});
  }

  function handleCloseProfileEdit() {
    setAssistantEditMode(false);
    setProfileEditMode("idle");
    setSelectedProfileField(null);
    setAssistantFieldError("");
    setInput("");
    setProfileEditDraft({});
  }

  function handleSaveProfileFieldEdit() {
    const nextAnswers = sanitizeFiscalAnswers({
      ...answers,
      activity_type:
        selectedProfileField === "activity_type"
          ? profileEditDraft.activity_type
          : answers.activity_type,
      acre:
        selectedProfileField === "acre"
          ? profileEditDraft.acre
          : answers.acre,
      business_start_date:
        selectedProfileField === "dates"
          ? profileEditDraft.business_start_date
          : answers.business_start_date,
      acre_start_date:
        selectedProfileField === "acre"
          ? profileEditDraft.acre === "yes"
            ? profileEditDraft.acre_start_date
            : null
          : selectedProfileField === "dates"
            ? answers.acre === "yes"
              ? profileEditDraft.acre_start_date
              : null
            : answers.acre_start_date,
      declaration_frequency:
        selectedProfileField === "declaration_frequency"
          ? profileEditDraft.declaration_frequency
          : answers.declaration_frequency,
    });

    const targetKeys =
      selectedProfileField === "activity_type"
        ? ["activity_type"]
        : selectedProfileField === "acre"
          ? ["acre", "acre_start_date"]
          : selectedProfileField === "dates"
            ? ["business_start_date", "acre_start_date"]
            : selectedProfileField === "declaration_frequency"
              ? ["declaration_frequency"]
              : [];

    const firstError = targetKeys
      .map((key) => getCurrentStepValidationMessage(key, nextAnswers))
      .find(Boolean);

    if (firstError) {
      setAssistantFieldError(firstError);
      return;
    }

    setAssistantFieldError("");
    setAnswers(nextAnswers);
    showSaveNotice(
      "Profil mis à jour. Les estimations ont été recalculées.",
      3000,
    );
    finishSelectiveEdit();
  }

  function handleEditProfile() {
    setAppView("assistant");
    setAssistantEditMode(true);
    setAssistantCollapsed(false);
    setProfileEditMode("pick_field");
    setSelectedProfileField(null);
    setProfileEditDraft({});
    setStepIndex(0);
    setHelpOpen(false);
    setInput("");
    setAssistantFieldError("");

    setAnswers(
      user && fiscalProfile
        ? getAssistantAnswersFromProfile(fiscalProfile)
        : sanitizeFiscalAnswers({
            entry_status: dashboardAnswers.entry_status || "micro_yes",
            status: dashboardAnswers.status || "auto_entrepreneur",
            activity_type: dashboardAnswers.activity_type,
            declaration_frequency: dashboardAnswers.declaration_frequency,
            acre: dashboardAnswers.acre,
            acre_start_date: dashboardAnswers.acre_start_date,
            business_start_date: dashboardAnswers.business_start_date,
          }),
    );

    setMessages([
      {
        role: "bot",
        text: user && fiscalProfile
          ? "Profil chargé ✅ Tu peux mettre à jour un champ ciblé."
          : "Bonjour 👋 On va mettre à jour ton profil fiscal. Réponds simplement.",
      },
    ]);

    setTimeout(() => {
      assistantRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);
  }

  function openSelectiveEditStep(stepKey) {
    const firstStepKey =
      stepKey === "dates" ? "business_start_date" : stepKey;
    const targetStepIndex = getIndexByKey(firstStepKey);

    if (targetStepIndex === -1) {
      return;
    }

    setAssistantEditMode(true);
    setProfileEditMode("edit_step");
    setSelectedProfileField(stepKey);
    setProfileEditDraft({
      activity_type: answers?.activity_type || "",
      acre: answers?.acre || "",
      business_start_date: normalizeDateValue(answers?.business_start_date || ""),
      acre_start_date: normalizeDateValue(answers?.acre_start_date || ""),
      declaration_frequency: answers?.declaration_frequency || "",
    });
    setAssistantCollapsed(false);
    setHelpOpen(false);
    setAssistantFieldError("");
    setStepIndex(targetStepIndex);
    setInput(
      firstStepKey === "business_start_date" || firstStepKey === "acre_start_date"
        ? normalizeDateValue(answers?.[firstStepKey] || "")
        : "",
    );

    setTimeout(() => {
      assistantRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);
  }

  function finishSelectiveEdit() {
    setAssistantEditMode(false);
    setProfileEditMode("idle");
    setSelectedProfileField(null);
    setProfileEditDraft({});
    setInput("");
    setHelpOpen(false);
    setAssistantFieldError("");
    setMessages([
      {
        role: "bot",
        text: "Profil chargé ✅ Le champ a été mis à jour.",
      },
    ]);
  }

  return (
    <>
      {showBetaNotice && (
        <div className="modalOverlay">
          <div className="modalCard">
            <h3>🚧 Version bêta</h3>
            <p style={{ marginBottom: "12px" }}>
              Cet outil est actuellement en phase de test.
            </p>
            <ul style={{ paddingLeft: "18px", marginBottom: "12px" }}>
              <li>Ajouter vos revenus</li>
              <li>Estimation des charges</li>
              <li>Comprendre vos obligations</li>
            </ul>
            <p style={{ fontSize: "13px", opacity: 0.8 }}>
              Certaines fonctionnalités sont limitées.
            </p>
            <p style={{ marginTop: "10px", fontSize: "13px" }}>
              🙏 Merci pour votre retour — il nous aidera à améliorer le
              produit.
            </p>
            <button
              className="btn btnPrimary"
              style={{ marginTop: "12px" }}
              onClick={() => {
                localStorage.setItem(BETA_SEEN_KEY, "1");
                setShowBetaNotice(false);
              }}
            >
              Commencer
            </button>
          </div>
        </div>
      )}

      <div className="page">
        <header className="topbar">
          <div className="appStatusBar">
            <span className="appStatusBadge">{viewLabel}</span>
          </div>
          <div className="topbarLeft">
            <div className="brand">Entrepreneurs Assistant</div>
            <div className="topbarMeta">
              <div className="greetingBadge">{topbarGreetingLabel}</div>
              {profileLine && <div className="profileMini">{profileLine}</div>}
              {connectedAccountLabel && (
                <div className="profileMini">Connectée : {connectedAccountLabel}</div>
              )}
            </div>
          </div>

          <div className="topbarRight">
            <nav className="nav">
              <button
                type="button"
                className="navLink"
                onClick={() => goToLandingSection("home")}
              >
                Accueil
              </button>
              <button
                type="button"
                className="navLink"
                onClick={() => goToLandingSection("howItWorks")}
              >
                Services
              </button>
              <button type="button" className="navLink" onClick={goToAssistant}>
                Assistant
              </button>
              {profileReady && (
                <button
                  type="button"
                  className="navLink"
                  onClick={goToDashboard}
                >
                  Mon espace fiscal
                </button>
              )}
              <button
                type="button"
                className="navLink"
                onClick={() => {
                  setAppView("dashboard");
                  setTimeout(() => {
                    document
                      .getElementById("invoices-section")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 150);
                }}
              >
                Factures
              </button>

              <button
                type="button"
                className="navLink"
                onClick={() => goToLandingSection("contact")}
              >
                Contact
              </button>
            </nav>

            {isLocalhostQa && (
              <button
                type="button"
                className="btn btnGhost btnSmall"
                onClick={toggleLocalPremiumQa}
                style={{
                  paddingInline: "0.8rem",
                  borderRadius: 999,
                  background: localPremiumStatus
                    ? "rgba(255, 244, 214, 0.88)"
                    : "rgba(241, 245, 249, 0.92)",
                  border: localPremiumStatus
                    ? "1px solid rgba(217, 168, 41, 0.24)"
                    : "1px solid rgba(148, 163, 184, 0.22)",
                  color: localPremiumStatus ? "#7c5a10" : "#475569",
                  fontWeight: 700,
                }}
                title="Basculer le mode Premium QA en local"
              >
                🧪 Premium QA
              </button>
            )}

            {user && (
              <button
                type="button"
                className="btn btnGhost btnSmall"
                onClick={handleLogout}
                disabled={logoutPending}
              >
                {logoutPending ? "Déconnexion..." : "Déconnexion"}
              </button>
            )}
          </div>
        </header>

        <main className={`container ${focusMode ? "focusMode" : ""}`}>
        {saveNotice && (
  <div
    role="status"
    aria-live="polite"
    style={{
      position: "fixed",
      top: 88,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 3000,
      width: "min(720px, calc(100vw - 24px))",
      padding: "14px 16px",
      borderRadius: 14,
      background: "#f0fdf4",
      border: "1px solid #86efac",
      color: "#166534",
      boxShadow: "0 16px 40px rgba(22, 101, 52, 0.14)",
    }}
  >
    {typeof saveNotice === "string" ? (
      <div style={{ fontWeight: 600 }}>{saveNotice}</div>
    ) : (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>{saveNotice.title}</div>
        <div>{saveNotice.body}</div>
        {saveNotice.cta === "auth" && (
          <div>
            <button
              className="btn btnGhost btnSmall"
              type="button"
              onClick={() => openAuthModal("signup")}
            >
              Créer mon compte
            </button>
          </div>
        )}
      </div>
    )}
  </div>
)}
        {successToast && (
  <div
    role="status"
    aria-live="polite"
    style={{
      position: "fixed",
      top: 88,
      right: 16,
      zIndex: 3001,
      width: "min(360px, calc(100vw - 24px))",
      padding: "12px 14px",
      borderRadius: 14,
      background: "#f3fbf6",
      border: "1px solid #bfe7c8",
      color: "#166534",
      boxShadow: "0 16px 36px rgba(22, 101, 52, 0.12)",
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    }}
  >
    <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.45 }}>
      {successToast}
    </div>
    <button
      className="iconBtn"
      type="button"
      aria-label="Masquer la notification"
      onClick={() => {
        if (successToastTimeoutRef.current) {
          clearTimeout(successToastTimeoutRef.current);
          successToastTimeoutRef.current = null;
        }
        setSuccessToast(null);
      }}
      style={{ padding: "4px 8px", minWidth: "auto" }}
    >
      ✕
    </button>
  </div>
)}
          {appView === "landing" && (
            <section id="home" ref={heroRef} className="card hero heroSaaS">
              <div className="heroGrid">
                <div className="heroLeft">
                  <div className="heroBadge">🟣 MVP en test</div>

                  <h1>Assistant fiscal pour micro-entrepreneurs</h1>

                  <div className="heroLead">
                    <p>Tu ne sais pas combien payer ni quand déclarer ?</p>
                    <p>
                      Microassist te guide simplement pour estimer tes charges,
                      anticiper tes échéances et éviter les oublis.
                    </p>
                  </div>

                  <ul className="heroBullets">
                    <li>✅ Montant à mettre de côté</li>
                    <li>✅ Prochaine déclaration claire</li>
                    <li>✅ Alerte TVA simple</li>
                    <li>✅ Action à faire maintenant</li>
                  </ul>

                  <p className="assistantIntro">
                    Sans inscription • Simple • En 2 minutes
                  </p>

                  <div className="heroActions">
                    <button
                      className="btn btnPrimary"
                      onClick={() => {
                        track("click_tester_simulateur");
                        goToView("assistant", { push: true, focus: true });

                        setTimeout(() => {
                          scrollToRef(assistantRef);
                        }, 80);
                      }}
                      type="button"
                    >
                      Commencer gratuitement
                    </button>

                    <button
                      className="btn btnGhost"
                      onClick={() => {
                        track("landing_auth_cta_clicked", { source: "hero" });
                        openAuthModal("signup");
                      }}
                      type="button"
                    >
                      S'inscrire / Connexion
                    </button>

                    <button
                      className="btn btnGhost"
                      onClick={openSecuritySection}
                      type="button"
                    >
                      Sécurité
                    </button>
                  </div>
                </div>

                <div className="heroRight">
                  <div className="heroPanel">
                    <div className="heroPanelTitle">Ce que tu obtiens</div>

                    <div className="heroKpis">
                      <div className="kpi">
                        <div className="kpiLabel">Échéance</div>
                        <div className="kpiValue">
                          Mensuelle / Trimestrielle
                        </div>
                      </div>

                      <div className="kpi">
                        <div className="kpiLabel">À prévoir</div>
                        <div className="kpiValue">Montant estimé</div>
                      </div>

                      <div className="kpi">
                        <div className="kpiLabel">TVA</div>
                        <div className="kpiValue">OK / Vigilance</div>
                      </div>

<div className="kpi">
  <div className="kpiLabel">ACRE</div>
  <div className="kpiValue">
    Taux réduit automatique selon la date
  </div>
</div>

<div className="kpi">
  <div className="kpiLabel">CFE</div>
  <div className="kpiValue">
    Prévision dès la 2e année
  </div>
</div>

                      <div className="kpi">
                        <div className="kpiLabel">Action</div>
                        <div className="kpiValue">Étape suivante claire</div>
                      </div>
                    </div>

                    <div className="heroTrust">
                      <span>🔒 Sécurisé</span>
                      <span>🧠 Clair</span>
                      <span>⚡ Rapide</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {!focusMode && appView === "landing" && (
            <section className="card pricingAccessSection">
              <div className="sectionHead" style={{ marginBottom: 14 }}>
                <div>
                  <h2>Tarifs & accès</h2>
                  <p className="muted" style={{ margin: "6px 0 0" }}>
                    Choisis le niveau d’accompagnement qui te convient, sans te compliquer la vie.
                  </p>
                </div>
              </div>

              <div className="pricingAccessGrid">
                <div className="pricingAccessCard">
                  <div className="pricingAccessTop">
                    <div className="pricingAccessTitle">Gratuit</div>
                    <div className="pricingAccessPrice">Sans compte</div>
                  </div>
                  <ul className="pricingAccessList">
                    <li>Assistant fiscal</li>
                    <li>Estimation des charges</li>
                    <li>Création PDF facture</li>
                    <li>Historique local navigateur</li>
                  </ul>
                </div>

                <div className="pricingAccessCard">
                  <div className="pricingAccessTop">
                    <div className="pricingAccessTitle">Compte gratuit</div>
                    <div className="pricingAccessPrice">0€ / mois</div>
                  </div>
                  <ul className="pricingAccessList">
                    <li>Historique sécurisé</li>
                    <li>Synchronisation multi-appareils</li>
                    <li>Récupération après refresh</li>
                    <li>Mon espace fiscal personnel</li>
                  </ul>
                  <button
                    className="btn btnGhost"
                    type="button"
                    onClick={() => openAuthModal("signup")}
                  >
                    Créer mon compte
                  </button>
                </div>

                <div className="pricingAccessCard pricingAccessCardPremium">
                  <div className="pricingAccessBadge">Le plus complet</div>
                  <div className="pricingAccessTop">
                    <div className="pricingAccessTitle">Premium</div>
                    <div className="pricingAccessPrice">5€ / mois</div>
                  </div>
                  <ul className="pricingAccessList">
                    <li>Alertes SMS</li>
                    <li>Rappels URSSAF</li>
                    <li>Alerte TVA / ACRE / CFE</li>
                    <li>Historique illimité</li>
                    <li>Exports avancés</li>
                    <li>Assistant proactif</li>
                  </ul>
                  <button
                    className="btn btnPrimary"
                    type="button"
                    onClick={() => handleOpenSaveModal("pricing_access_block")}
                  >
                    Être informé du lancement Premium
                  </button>
                </div>
              </div>
            </section>
          )}

          {!focusMode && (
            <div className="sectionTools">
              <button
                className="btn btnGhost btnSmall"
                type="button"
                onClick={showAllSections}
              >
                Afficher toutes les sections
              </button>
            </div>
          )}

          {!focusMode && visibleSections.about && (
            <section className="card">
              <div className="sectionHead">
                <h2>À propos de Microassist</h2>
                <button
                  className="iconBtn"
                  type="button"
                  onClick={() => hideSection("about")}
                  aria-label="Masquer cette section"
                >
                  ✕
                </button>
              </div>

              <p>
                Microassist aide les micro-entrepreneurs débutants à comprendre
                plus simplement leurs charges, leurs échéances et leurs repères
                fiscaux.
              </p>

              <p>
                L’objectif est simple : savoir quoi faire, quand le faire, et
                éviter les oublis.
              </p>

              <p>Conçu par une entrepreneuse, pour les entrepreneurs.</p>
            </section>
          )}

          {!focusMode && appView === "landing" && visibleSections.services && (
            <section id="services" className="card">
              <div className="sectionHead">
                <h2>Ce que tu peux faire</h2>
                <button
                  className="iconBtn"
                  type="button"
                  onClick={() => hideSection("services")}
                  aria-label="Masquer cette section"
                >
                  ✕
                </button>
              </div>

              <ul className="roadmaplist">
                <li>💰 Savoir combien mettre de côté chaque mois</li>
                <li>📅 Ne plus rater une échéance URSSAF</li>
                <li>👀 Comprendre ta situation fiscale en un coup d’œil</li>
                <li>⚠️ Anticiper la TVA sans surprise</li>
                <li>🧭 Savoir quoi faire à chaque étape</li>
              </ul>
            </section>
          )}

          {!focusMode && visibleSections.howItWorks && (
            <section ref={howItWorksRef} className="card">
              <div className="sectionHead">
                <h2>Comment ça marche</h2>
                <button
                  className="iconBtn"
                  type="button"
                  onClick={() => hideSection("howItWorks")}
                  aria-label="Masquer cette section"
                >
                  ✕
                </button>
              </div>

              <div className="steps">
                <div className="step">
                  <strong>1. Tu réponds à quelques questions</strong>
                  <p>
                    Ton activité et ton rythme de déclaration sont pris en
                    compte.
                  </p>
                </div>

                <div className="step">
                  <strong>2. Tu obtiens ton repère fiscal</strong>
                  <p>Charges, TVA et échéances — tout devient plus clair.</p>
                </div>

                <div className="step">
                  <strong>3. Tu suis ton activité simplement</strong>
                  <p>
                    Ajoute tes revenus et garde une vue claire mois après mois.
                  </p>
                </div>
              </div>
            </section>
          )}

          {!focusMode && visibleSections.roadmap && (
            <section id="prochainement" className="card">
              <div className="sectionHead">
                <h2>Pour qui & Prochainement</h2>
                <button
                  className="iconBtn"
                  type="button"
                  onClick={() => hideSection("roadmap")}
                  aria-label="Masquer cette section"
                >
                  ✕
                </button>
              </div>

              <p className="muted">
                Microassist est un MVP en cours d’évolution, pensé pour aider
                les micro-entrepreneurs à garder un repère fiscal simple, clair
                et rassurant.
              </p>

              <h3 style={{ marginTop: 12 }}>✅ Pour qui ?</h3>
              <ul className="targetList">
                <li>- Tu viens de créer ta micro-entreprise</li>
                <li>- Tu ne sais pas toujours combien mettre de côté</li>
                <li>- Tu as déjà raté (ou failli rater) une déclaration</li>
                <li>
                  - Tu veux un outil simple, pas un logiciel comptable complet
                </li>
              </ul>

              <h3 style={{ marginTop: 12 }}>🚧 Prochainement</h3>
              <ul className="roadmaplist">
                <li>📅 Rappels automatiques avant chaque échéance</li>
                <li>📄 Rapports plus complets (PDF, CSV)</li>
                <li>📊 Historique enrichi et alertes plus intelligentes</li>
                <li>🧠 Conseils plus personnalisés selon ton profil</li>
              </ul>
            </section>
          )}

          {focusMode && appView !== "assistant" && (
            <div className="focusBar">
              <div className="focusLeft">
                <strong>Mode démo</strong>
              </div>

              <div className="focusLinks">
                <button
                  className="btn btnGhost btnSmall"
                  onClick={openSecuritySection}
                >
                  🔒 Sécurité
                </button>

                <button
                  className="btn btnGhost btnSmall"
                  onClick={() => scrollToRef(feedbackRef)}
                >
                  ⭐ Avis
                </button>

                <button
                  className="btn btnGhost btnSmall"
                  onClick={() => {
                    setFocusMode(false);
                    setAppView("landing");
                  }}
                >
                  Page complète
                </button>
              </div>
            </div>
          )}

          {appView === "assistant" && (
            <section id="assistant" ref={assistantRef} className="card">
              <div className="assistantHeader">
                <div>
                  <div className="assistantTitleRow">
                    <h2>
                      {isFiscalProfileCreateMode
                        ? "Créer mon profil fiscal"
                        : isFiscalProfileEditMode
                          ? "Modifier mon profil fiscal"
                          : "Mon profil fiscal"}
                    </h2>

                    <div className="profileStatus">
                      {isFiscalProfileEditMode ? (
                        <span className="statusOk">🟢 Mode édition</span>
                      ) : isFiscalProfileSummaryMode ? (
                        <span className="statusOk">
                          🟢 Profil configuré
                        </span>
                      ) : (
                        <span className="statusWarn">
                          🟡 Profil à compléter
                        </span>
                      )}
                    </div>

                    {isFiscalProfileCreateMode && revenues.length > 0 && (
                      <button
                        className="btn btnGhost btnSmall"
                        onClick={() => setAssistantCollapsed((v) => !v)}
                        type="button"
                      >
                        {assistantCollapsed ? "Afficher" : "Réduire"}
                      </button>
                    )}
                  </div>

                  <div className="topActions">
                  
                   
                    {isFiscalProfileEditMode && (
                      <button
                        className="btn btnGhost btnSmall"
                        onClick={handleCloseProfileEdit}
                        type="button"
                      >
                        Retour au résumé
                      </button>
                    )}
                    {hasDraft && isFiscalProfileCreateMode && (
                      <button
                        className="btn btnGhost btnSmall"
                        onClick={handleResumeDraft}
                        type="button"
                      >
                        Reprendre
                      </button>
                    )}
                  </div>


                  {isFiscalProfileCreateMode && (
                    <ul className="assistantBenefits">
                      <li>une estimation simple de tes charges</li>
                      <li>un repère sur ta prochaine échéance</li>
                      <li>une vision claire de ta TVA</li>
                      <li>
                        un accès à ton espace fiscal pour suivre tes revenus
                      </li>
                    </ul>
                  )}

                </div>

                {isFiscalProfileCreateMode && (
                  <div className="progress">
                    <div className="progressBar">
                      <div
                        className="progressFill"
                        style={{
                          width: `${((stepIndex + 1) / FISCAL_STEPS.length) * 100}%`,
                        }}
                      />
                    </div>

                    {(hasDraft || lastSavedAt) && (
                      <div className="savedHint">
                        💾{" "}
                        {lastSavedAt
                          ? `Sauvegardé à ${new Date(
                              lastSavedAt,
                            ).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}`
                          : "Sauvegarde trouvée"}
                        {restoredAt && " — restauré ✅"}
                        <div className="savedActions">
                          <button
                            className="btn btnGhost"
                            onClick={handleNewSession}
                            type="button"
                          >
                            Recommencer
                          </button>
                        </div>
                      </div>
                    )}

                    <div>
                      Étape{" "}
                      <strong>
                        {Math.min(stepIndex + 1, FISCAL_STEPS.length)}
                      </strong>{" "}
                      / {FISCAL_STEPS.length}
                    </div>
                  </div>
                )}
              </div>

              {isFiscalProfileSummaryMode ? (
                <>
                  <div className="assistantCompletionBanner">
                    <div className="assistantCompletionTitle">
                      Ton espace fiscal est prêt ✅
                    </div>
                    <p className="muted assistantIntro">
                      Retrouve ici tes revenus, factures et repères fiscaux.
                    </p>
                    <div className="miniActions" style={{ marginTop: 16 }}>
                      <button
                        className="btn btnPrimary"
                        type="button"
                        onClick={goToDashboard}
                      >
                        Accéder à mon espace fiscal
                      </button>
                      <button
                        className="btn btnGhost"
                        type="button"
                        onClick={handleEditProfile}
                      >
                        Modifier mon profil
                      </button>
                    </div>
                  </div>

                  <div className="dashboardZone">
                    <div className="assistantSummaryBox">
                      <h3>Ton profil</h3>

                      <ul className="assistantSummaryList">
                        <li>
                          <strong>Activité :</strong>{" "}
                          {labelFromOptions(
                            "activity_type",
                            answers.activity_type || dashboardAnswers.activity_type,
                          ) || "—"}
                        </li>
                        <li>
                          <strong>Déclaration :</strong>{" "}
                          {labelFromOptions(
                            "declaration_frequency",
                            answers.declaration_frequency || dashboardAnswers.declaration_frequency,
                          ) || "—"}
                        </li>
                        <li>
                          <strong>ACRE :</strong>{" "}
                          {labelFromOptions(
                            "acre",
                            answers.acre || dashboardAnswers.acre,
                          ) || "—"}
                        </li>
                      </ul>
                    </div>

                    <div className="assistantNextStep">
                      <div className="assistantNextStepTitle">
                        Voilà ta situation
                      </div>

                      <ul className="assistantSummaryList" style={{ marginTop: 12 }}>
                        <li>
                          <strong>💰 À mettre de côté :</strong>{" "}
                          {isFiscalProfileComplete
                            ? `${computed?.estimatedAmount?.toLocaleString("fr-FR") ?? "—"} €`
                            : "Profil à compléter"}
                        </li>
                        <li>
                          <strong>📅 Prochaine déclaration :</strong>{" "}
                          {isFiscalProfileComplete
                            ? computed?.deadlineLabel || "—"
                            : "Complète ton profil fiscal"}
                        </li>
                        <li>
                          <strong>⚠️ TVA :</strong>{" "}
                          {!isFiscalProfileComplete
                            ? "à confirmer"
                            : computed?.tvaStatus === "exceeded"
                              ? "seuil dépassé"
                              : computed?.tvaStatus === "soon"
                                ? "vigilance"
                                : "aucun risque immédiat"}
                        </li>
                        <li>
                          <strong>🧾 ACRE :</strong>{" "}
                          {!isFiscalProfileComplete
                            ? "à confirmer"
                            : computed?.acreStatus === "active"
                              ? "taux réduit actif"
                              : computed?.acreStatus === "expired"
                                ? "terminée"
                                : "non renseignée"}
                        </li>
                      </ul>
                    </div>
                  </div>
                </>
              ) : isFiscalProfileEditMode ? (
                <>
                  <div className="assistantSummaryBox">
                    <h3>Profil actuel</h3>
                    <ul className="assistantSummaryList">
                      <li>
                        <strong>Activité :</strong>{" "}
                        {labelFromOptions(
                          "activity_type",
                          answers.activity_type || dashboardAnswers.activity_type,
                        ) || "—"}
                      </li>
                      <li>
                        <strong>Déclaration :</strong>{" "}
                        {labelFromOptions(
                          "declaration_frequency",
                          answers.declaration_frequency || dashboardAnswers.declaration_frequency,
                        ) || "—"}
                      </li>
                      <li>
                        <strong>ACRE :</strong>{" "}
                        {labelFromOptions(
                          "acre",
                          answers.acre || dashboardAnswers.acre,
                        ) || "—"}
                      </li>
                      <li>
                        <strong>Début activité :</strong>{" "}
                        {answers.business_start_date || dashboardAnswers.business_start_date || "—"}
                      </li>
                      {answers.acre === "yes" && (answers.acre_start_date || dashboardAnswers.acre_start_date) && (
                        <li>
                          <strong>Début ACRE :</strong>{" "}
                          {answers.acre_start_date || dashboardAnswers.acre_start_date}
                        </li>
                      )}
                    </ul>
                  </div>

                  <div className="assistantSummaryBox assistantEditSelector">
                    <h3>Que veux-tu modifier ?</h3>
                    <p className="muted" style={{ marginTop: 6 }}>
                      Choisis un bloc à ajuster. L’éditeur s’ouvre juste dessous.
                    </p>
                    <div className="choiceRow" style={{ marginTop: 12 }}>
                      <button
                        className="btn btnChoice"
                        type="button"
                        onClick={() => openSelectiveEditStep("activity_type")}
                      >
                        Activité
                      </button>
                      <button
                        className="btn btnChoice"
                        type="button"
                        onClick={() => openSelectiveEditStep("acre")}
                      >
                        ACRE
                      </button>
                      <button
                        className="btn btnChoice"
                        type="button"
                        onClick={() => openSelectiveEditStep("dates")}
                      >
                        Dates
                      </button>
                      <button
                        className="btn btnChoice"
                        type="button"
                        onClick={() => openSelectiveEditStep("declaration_frequency")}
                      >
                        Déclaration
                      </button>
                    </div>
                  </div>

                  {showProfileTargetedStep && (
                    <div className="assistantSummaryBox assistantEditSelector">
                      <h3>
                        {selectedProfileField === "activity_type"
                          ? "Modifier ton activité"
                          : selectedProfileField === "acre"
                            ? "Mettre à jour l’ACRE"
                            : selectedProfileField === "dates"
                              ? "Mettre à jour les dates"
                              : "Mettre à jour la déclaration"}
                      </h3>
                      <p className="muted" style={{ marginTop: 6 }}>
                        {selectedProfileField === "activity_type"
                          ? "Choisis simplement l’activité qui correspond à ton profil actuel."
                          : selectedProfileField === "acre"
                            ? "Ajuste ton statut ACRE et sa date si elle s’applique."
                            : selectedProfileField === "dates"
                              ? "Mets à jour les dates utiles pour recalculer tes estimations."
                              : "Choisis le rythme de déclaration qui te correspond."}
                      </p>

                      {selectedProfileField === "activity_type" && (
                        <div className="choiceRow" style={{ marginTop: 12 }}>
                          {activityOptions.map((opt) => (
                            <button
                              key={opt.value}
                              className="btn btnChoice"
                              type="button"
                              onClick={() => handleProfileEditChoice("activity_type", opt.value)}
                              aria-pressed={profileEditDraft.activity_type === opt.value}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}

                      {selectedProfileField === "acre" && (
                        <>
                          <div className="choiceRow" style={{ marginTop: 12 }}>
                            {acreOptions.map((opt) => (
                              <button
                                key={opt.value}
                                className="btn btnChoice"
                                type="button"
                                onClick={() => handleProfileEditChoice("acre", opt.value)}
                                aria-pressed={profileEditDraft.acre === opt.value}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>

                          {profileEditDraft.acre === "yes" && (
                            <div className="chatInput" style={{ marginTop: 12 }}>
                              <input
                                ref={inputRef}
                                value={profileEditDraft.acre_start_date || ""}
                                onChange={(e) =>
                                  handleProfileEditDateChange("acre_start_date", e.target.value)
                                }
                                aria-label="Date ACRE"
                                type="date"
                                max={getTodayIsoDate()}
                              />
                            </div>
                          )}
                        </>
                      )}

                      {selectedProfileField === "dates" && (
                        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                          <div className="chatInput">
                            <input
                              ref={inputRef}
                              value={profileEditDraft.business_start_date || ""}
                              onChange={(e) =>
                                handleProfileEditDateChange("business_start_date", e.target.value)
                              }
                              aria-label="Date début activité"
                              type="date"
                              max={getTodayIsoDate()}
                            />
                          </div>

                          {(answers.acre === "yes" || profileEditDraft.acre === "yes") && (
                            <div className="chatInput">
                              <input
                                value={profileEditDraft.acre_start_date || ""}
                                onChange={(e) =>
                                  handleProfileEditDateChange("acre_start_date", e.target.value)
                                }
                                aria-label="Date ACRE"
                                type="date"
                                max={getTodayIsoDate()}
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {selectedProfileField === "declaration_frequency" && (
                        <div className="choiceRow" style={{ marginTop: 12 }}>
                          {declarationOptions.map((opt) => (
                            <button
                              key={opt.value}
                              className="btn btnChoice"
                              type="button"
                              onClick={() =>
                                handleProfileEditChoice("declaration_frequency", opt.value)
                              }
                              aria-pressed={profileEditDraft.declaration_frequency === opt.value}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}

                      {assistantFieldError && (
                        <div
                          role="alert"
                          style={{
                            marginTop: 8,
                            padding: "10px 12px",
                            borderRadius: 10,
                            background: "#fff1f2",
                            border: "1px solid #fecdd3",
                            color: "#be123c",
                            fontSize: 13,
                          }}
                        >
                          {assistantFieldError}
                        </div>
                      )}

                      <div className="miniActions" style={{ marginTop: 16 }}>
                        <button
                          className="btn btnGhost"
                          type="button"
                          onClick={handleProfileEditCancel}
                        >
                          Annuler
                        </button>
                        <button
                          className="btn btnPrimary"
                          type="button"
                          onClick={handleSaveProfileFieldEdit}
                        >
                          Enregistrer
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : assistantCollapsed ? (
                <div className="assistantCollapsedBox">
                  <p className="muted">Ton repère est prêt.</p>

                  <button
                    className="btn btnPrimary"
                    onClick={() => setAssistantCollapsed(false)}
                    type="button"
                  >
                    Afficher
                  </button>
                </div>
              ) : showCreateWizard ? (
                <div className="chat">
                  {step?.mode === "choice" ? (
                    <div className="choiceZone">
                      <div className="stepMiniHeader">
                        <span className="stepMiniBadge">
                          Étape {stepIndex + 1}
                        </span>
                        <span className="stepMiniTitle">{step?.title}</span>
                      </div>

                      <div className="choiceRow">
                        {step.options?.map((opt) =>
                          opt.value === "unknown" ? null : (
                            <button
                              key={opt.value}
                              className="btn btnChoice"
                              onClick={() => handleSelectOption(opt)}
                              disabled={isTyping}
                              type="button"
                            >
                              {opt.label}
                            </button>
                          ),
                        )}
                      </div>

                      {helpOpen && step.help && (
                        <div className="helpBox" role="note">
                          {step.help}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="chatInput">
                        <input
                          ref={inputRef}
                          value={input}
                          onChange={(e) => {
                            const nextValue = e.target.value;
                            const key = step?.key;
                            const normalizedValue =
                              key === "business_start_date" ||
                              key === "acre_start_date"
                                ? normalizeDateValue(nextValue)
                                : nextValue;

                            setInput(nextValue);

                            const validationMessage =
                              getCurrentStepValidationMessage(key, {
                                ...answers,
                                [key]: normalizedValue,
                              });

                            setAssistantFieldError(validationMessage);
                          }}
                          onKeyDown={handleKeyDown}
                          placeholder={step?.placeholder || "Écris ici…"}
                          aria-label="Message"
                          disabled={isTyping}
                          type={
                            step?.key === "business_start_date" ||
                            step?.key === "acre_start_date"
                              ? "date"
                              : "text"
                          }
                          max={
                            step?.key === "business_start_date" ||
                            step?.key === "acre_start_date"
                              ? getTodayIsoDate()
                              : undefined
                          }
                        />
                        <button
                          className="btn"
                          onClick={handleSend}
                          disabled={!canSubmitCurrentStep || isTyping}
                          type="button"
                        >
                          Envoyer
                        </button>
                      </div>

                      {assistantFieldError && (
                        <div
                          role="alert"
                          style={{
                            marginTop: 8,
                            padding: "10px 12px",
                            borderRadius: 10,
                            background: "#fff1f2",
                            border: "1px solid #fecdd3",
                            color: "#be123c",
                            fontSize: 13,
                          }}
                        >
                          {assistantFieldError}
                        </div>
                      )}

                      <div className="autoSaveHint" aria-live="polite">
                        {user
                          ? "✅ Ton espace est lié à ton compte."
                          : "💾 Tes données restent locales tant que tu n’as pas créé ton compte."}
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </section>
          )}

          {appView === "dashboard" && (
            <section ref={fiscalRef} className="card">
              {shouldShowDashboardTopNudge && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: "12px 14px",
                    borderRadius: 14,
                    background: "#f8fafc",
                    border: "1px solid #dbe4ee",
                    color: "#334155",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    boxShadow: "0 8px 18px rgba(15, 23, 42, 0.04)",
                  }}
                >
                  <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                    {dashboardTopNudge.text}
                  </div>
                  <button
                    className="iconBtn"
                    type="button"
                    aria-label="Masquer cette suggestion"
                    onClick={() => {
                      const dismissedType = dashboardTopNudge?.type || "";
                      setDashboardTopNudgeDismissedType(dismissedType);
                      try {
                        localStorage.setItem(
                          DASHBOARD_TOP_NUDGE_DISMISSED_KEY,
                          dismissedType,
                        );
                      } catch {
                        // Ignore localStorage failures for dashboard UI state.
                      }
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}
              <div className="sectionHead">
                <div>
                  <h2>Mon espace fiscal</h2>
                  <p className="muted" style={{ marginTop: 6 }}>
                    Garde une vue claire sur tes revenus, tes charges et tes
                    échéances.
                  </p>
                  <div
                    style={{
                      marginTop: 12,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                      padding: "10px 14px",
                      borderRadius: 14,
                      background: "#f5f3ff",
                      border: "1px solid #ddd6fe",
                      color: "#6d28d9",
                    }}
                  >
                    <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800 }}>
                        {premiumBannerContent.line1}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>
                        {premiumBannerContent.line2}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.9 }}>
                        {premiumBannerContent.line3}
                      </div>
                    </div>
                    {premiumWaitlistJoined && (
                      <div style={{ fontSize: 12, fontWeight: 600 }}>
                        ✔️ Accès prioritaire activé
                      </div>
                    )}
                    <button
                      className="btn btnGhost btnSmall"
                      type="button"
                      onClick={() =>
                        openPremiumModal(
                          premiumContextualCTA?.source || "dashboard_top",
                        )
                      }
                    >
                      {premiumContextualCTA ? "Voir les avantages Premium" : "Voir les avantages"}
                    </button>
                  </div>
                </div>

                <div className="sectionHeadActions">
                  {!showChart && monthlyHistory.length > 0 && (
                    <button
                      className="btn btnGhost btnSmall"
                      type="button"
                      onClick={() => {
                        setShowChart(true);
                        localStorage.setItem(CHART_KEY, "true");
                        setTimeout(() => {
                          chartRef.current?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                        }, 120);
                      }}
                    >
                      Afficher le graphique
                    </button>
                  )}

                  <button
                    className="btn btnGhost btnSmall"
                    type="button"
                    onClick={handleEditProfile}
                  >
                    Modifier mon profil
                  </button>

                  <button
                    className="btn btnPrimary btnSmall"
                    type="button"
                    onClick={handleOpenRevenuePopup}
                  >
                    + Ajouter revenu
                  </button>
               <button
  className="btn btnGhost btnSmall"
  type="button"
  onClick={handleOpenInvoiceGenerator}
>
  🧾 Créer une facture
</button>

<button
  className="btn btnGhost btnSmall"
  type="button"
  onClick={() => openReminderManager("dashboard_top")}
>
  🔔 Gérer mes rappels
</button>

<span className="muted" style={{ fontSize: 12 }}>
  {invoicesThisMonth}/{currentPlanLimits.invoicesPerMonth === Infinity ? "∞" : currentPlanLimits.invoicesPerMonth}
</span>

                </div>
              </div>

              {!user && shouldShowGuestLocalMessage && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: "#fff7ed",
                    border: "1px solid #fdba74",
                    color: "#9a3412",
                    fontSize: 14,
                  }}
                >
                  Tes données restent locales tant que tu n’as pas créé ton compte.
                </div>
              )}

              {user && !isFiscalProfileComplete && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: 16,
                    borderRadius: 14,
                    background: "#fffaf1",
                    border: "1px solid #fcd34d",
                  }}
                >
                  <div style={{ fontWeight: 800, color: "#92400e" }}>
                    Profil à compléter
                  </div>
                  <p style={{ marginTop: 8, marginBottom: 12, color: "#92400e" }}>
                    Complète ton profil fiscal pour obtenir des estimations fiables.
                  </p>
                  <button
                    className="btn btnPrimary"
                    type="button"
                    onClick={handleEditProfile}
                  >
                    Créer mon profil fiscal
                  </button>
                </div>
              )}

              {guestConversionEligible && (
                <div
                  style={{
                    marginBottom: 18,
                    padding: 18,
                    borderRadius: 16,
                    background: "linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)",
                    border: "1px solid #bfdbfe",
                    boxShadow: "0 12px 30px rgba(59, 130, 246, 0.08)",
                  }}
                >
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
                    🔒 Sauvegarde ton espace fiscal
                  </div>
                  <p
                    style={{
                      marginTop: 8,
                      marginBottom: 14,
                      color: "#334155",
                      lineHeight: 1.6,
                    }}
                  >
                    Pour conserver ton profil, tes revenus et tes calculs.
                  </p>
                  <p
                    style={{
                      marginTop: -4,
                      marginBottom: 14,
                      color: "#475569",
                      lineHeight: 1.5,
                      fontSize: 14,
                    }}
                  >
                    Tes données restent locales tant que tu n’as pas créé ton compte.
                  </p>
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <button
                      className="btn btnPrimary"
                      type="button"
                      onClick={() => openAuthModal("signup")}
                    >
                      Créer mon compte gratuitement
                    </button>
                  </div>
                </div>
              )}

              {revenues.length === 0 && (
                <div
                  style={{
                    marginBottom: 18,
                    padding: 18,
                    borderRadius: 16,
                    background: "#f8fafc",
                    border: "1px solid #cbd5e1",
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
                    Action recommandée
                  </div>
                  <p
                    style={{
                      marginTop: 8,
                      marginBottom: 14,
                      color: "#475569",
                      lineHeight: 1.6,
                    }}
                  >
                    Ajoute ton premier revenu pour débloquer un suivi fiscal concret et des repères plus utiles.
                  </p>
                  <button
                    className="btn btnPrimary"
                    type="button"
                    onClick={handleOpenRevenuePopup}
                  >
                    Ajouter mon premier revenu
                  </button>
                </div>
              )}

              {!dashboardRemindersDismissed && activeReminderItems.length > 0 && (
                <div
                  className="dashboardSectionZone dashboardSectionZoneLavender"
                  style={{
                    marginBottom: 18,
                  }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, color: "#0f172a" }}>
                          Mes rappels actifs
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            color: "#64748b",
                            fontSize: 13,
                          }}
                        >
                          {activeReminderItems.length} rappel
                          {activeReminderItems.length > 1 ? "s" : ""}
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <button
                          className="btn btnGhost btnSmall"
                          type="button"
                          onClick={() => toggleDashboardSection("reminders")}
                        >
                          {dashboardSections.reminders ? "Voir tout" : "Réduire"}
                        </button>
                        <button
                          className="iconBtn"
                          type="button"
                          aria-label="Masquer les rappels actifs"
                          onClick={() => {
                            setDashboardRemindersDismissed(true);
                            try {
                              localStorage.setItem(
                                DASHBOARD_REMINDERS_DISMISSED_KEY,
                                "1",
                              );
                            } catch {
                              // Ignore localStorage failures in dashboard UI state.
                            }
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                  {!dashboardSections.reminders && (
                    <div
                      style={{
                        display: "grid",
                        gap: 8,
                        marginTop: 12,
                      }}
                    >
                      {activeReminderItems.map((item) => (
                        <div
                          key={item.key}
                          style={{
                            padding: "12px 14px",
                            borderRadius: 12,
                            background: "#ffffff",
                            border: "1px solid #e5ddf6",
                            boxShadow: "0 6px 18px rgba(109, 40, 217, 0.05)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 12,
                              alignItems: "flex-start",
                              flexWrap: "wrap",
                            }}
                          >
                            <div style={{ color: "#334155", fontSize: 14, flex: 1 }}>
                              <div style={{ fontWeight: 700, color: "#0f172a" }}>
                                {item.urgent ? "⚠️ " : "🔔 "}
                                {item.title}
                              </div>
                              <div style={{ marginTop: 4 }}>{item.text}</div>
                            </div>

                            {item.actions?.length > 0 && (
                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  flexWrap: "wrap",
                                }}
                              >
                                {item.actions.map((action) =>
                                  action.kind === "link" ? (
                                    <a
                                      key={action.label}
                                      href={action.href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="btn btnGhost btnSmall"
                                    >
                                      {action.label}
                                    </a>
                                  ) : (
                                    <button
                                      key={action.label}
                                      className="btn btnGhost btnSmall"
                                      type="button"
                                      onClick={action.onClick}
                                    >
                                      {action.label}
                                    </button>
                                  ),
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 👇 NOUVELLE PODKAZKA - AJOUTER ICI */}
              {!isFiscalProfileComplete && (
                <div
                  style={{
                    marginBottom: 18,
                    padding: 16,
                    borderRadius: 14,
                    background: "#f8fafc",
                    border: "1px solid #cbd5e1",
                    color: "#334155",
                  }}
                >
                  Les revenus et l’historique restent visibles, mais les conclusions fiscales
                  finales restent limitées tant que le profil n’est pas complété.
                </div>
              )}

              {/* Cartes principales */}
              <div className="fiscalDashboard">
                <div className="fiscalCard">
                  <div className="fiscalLabel">Revenus cumulés</div>
                  <div className="fiscalValue">
                    {currentMonthTotal.toLocaleString("fr-FR")} €
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    Revenus enregistrés
                  </div>
                </div>

                <div className="fiscalCard">
                  <div className="fiscalLabel">Charges</div>
                  <div className="fiscalValue">
                    {isFiscalProfileComplete
                      ? `${estimatedCharges.toLocaleString("fr-FR")} €`
                      : "Profil à compléter"}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    {isFiscalProfileComplete
                      ? "Estimation selon ton activité"
                      : "Complète le profil pour afficher une estimation fiable"}
                  </div>
                </div>

                <div className="fiscalCard">
                  <div className="fiscalLabel">Disponible</div>
                  <div className="fiscalValue">
                    {isFiscalProfileComplete
                      ? `${availableAmount.toLocaleString("fr-FR")} €`
                      : "En attente"}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    {isFiscalProfileComplete
                      ? "Après estimation des charges"
                      : "Le disponible fiable apparaîtra après complétion du profil"}
                  </div>
                </div>
              </div>

              {/* Mini stats */}
              <div className="miniStatsGrid">
                <div className="miniStatCard">
                  <div className="miniStatLabel">Moyenne mensuelle</div>
                  <div className="miniStatValue">
                    {revenueStats.monthlyAverage.toLocaleString("fr-FR")} €
                  </div>
                </div>
                <div className="miniStatCard">
                  <div className="miniStatLabel">Dernier revenu</div>
                  <div className="miniStatValue">
                    {revenueStats.lastRevenue.toLocaleString("fr-FR")} €
                  </div>
                </div>
                <div className="miniStatCard">
                  <div className="miniStatLabel">Entrées</div>
                  <div className="miniStatValue">{revenueStats.count}</div>
                </div>
              </div>

              <div className={smartTipsZoneClass}>
              <div className="smartTips" style={{ marginTop: 0 }}>
                <h3>Smart Priorités</h3>
                <div className="smartTipsList">
                  {smartAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={[
                        "smartTipCard",
                        alert.level === "danger" ? "tipDanger" : "",
                        alert.level === "warning" ? "tipWarning" : "",
                        alert.level === "success" ? "tipOk" : "",
                      ]
                        .join(" ")
                        .trim()}
                    >
                      <div className="smartTipTitle">{alert.title}</div>
                      <div className="smartTipText">{alert.text}</div>
                      {alert.cta && (
                        <div className="smartTipActions">
                          <button
                            className="btn btnGhost btnSmall"
                            type="button"
                            onClick={() => {
                              trackEvent("priority_cta_click", {
                                source: "smart_priorites",
                                priorityType: alert.id,
                                totalRevenues: revenues.length,
                                invoiceCount: visibleInvoices.length,
                              });
                              handleSmartAlertAction(alert.action);
                            }}
                          >
                            {alert.cta}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              </div>

              {fiscalCoachingCard && (
                <div className="fiscalCoachCard">
                  <div className="fiscalCoachTitle">💡 Conseil fiscal du moment</div>
                  <div className="fiscalCoachText">{fiscalCoachingCard.text}</div>
                  {fiscalCoachingCard.cta && fiscalCoachingCard.onClick && (
                    <div className="fiscalCoachActions">
                      <button
                        className="btn btnGhost btnSmall"
                        type="button"
                        onClick={fiscalCoachingCard.onClick}
                      >
                        {fiscalCoachingCard.cta}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {fiscalRecommendationCard && (
                <div className="fiscalRecommendationCard">
                  <div className="fiscalRecommendationText">
                    {fiscalRecommendationCard}
                  </div>
                </div>
              )}

              {showCashImpactModal && (
                <div
                  className="modalOverlay"
                  onClick={() => setShowCashImpactModal(false)}
                >
                  <div
                    className="modalCard"
                    style={{ maxWidth: "520px" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="sectionHead">
                      <h3>📊 Impact sur ta trésorerie</h3>
                      <button
                        className="iconBtn"
                        onClick={() => setShowCashImpactModal(false)}
                      >
                        ✕
                      </button>
                    </div>
                    <div style={{ marginTop: 20, display: "grid", gap: 12 }}>
                      <div
                        style={{
                          background: "#f8fafc",
                          padding: 16,
                          borderRadius: 12,
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>
                          Réserve recommandée
                        </div>
                        <p style={{ marginTop: 8, fontSize: 14, color: "#334155" }}>
                          {typeof computed?.treasuryRecommended === "number"
                            ? `${computed.treasuryRecommended.toLocaleString("fr-FR")} € à garder de côté au minimum.`
                            : `${estimatedCharges.toLocaleString("fr-FR")} € de charges estimées à sécuriser.`}
                        </p>
                      </div>

                      <div
                        style={{
                          background: "#ffffff",
                          padding: 16,
                          borderRadius: 12,
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>
                          Risque TVA
                        </div>
                        <p style={{ marginTop: 8, fontSize: 14, color: "#334155" }}>
                          {computed?.tvaStatusLabel || "TVA à confirmer"}
                        </p>
                        <p style={{ marginTop: 6, fontSize: 13, color: "#475569" }}>
                          {computed?.tvaHint ||
                            "Le seuil TVA dépend de ton activité et de ton chiffre d’affaires cumulé."}
                        </p>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gap: 12,
                          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                        }}
                      >
                        <div
                          style={{
                            background: "#ffffff",
                            padding: 16,
                            borderRadius: 12,
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          <div style={{ fontSize: 13, color: "#64748b" }}>
                            Charges estimées
                          </div>
                          <div style={{ marginTop: 6, fontWeight: 700, color: "#0f172a" }}>
                            {estimatedCharges.toLocaleString("fr-FR")} €
                          </div>
                        </div>
                        <div
                          style={{
                            background: "#ffffff",
                            padding: 16,
                            borderRadius: 12,
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          <div style={{ fontSize: 13, color: "#64748b" }}>
                            Disponible ajusté
                          </div>
                          <div style={{ marginTop: 6, fontWeight: 700, color: "#0f172a" }}>
                            {Math.max(
                              0,
                              availableAmount -
                                Math.max(
                                  estimatedCharges,
                                  Number(computed?.treasuryRecommended || 0),
                                ),
                            ).toLocaleString("fr-FR")} €
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 12,
                          flexWrap: "wrap",
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          className="btn btnGhost"
                          type="button"
                          onClick={() => {
                            setShowCashImpactModal(false);
                            setShowTVADiagnosticModal(true);
                          }}
                        >
                          Vérifier la TVA
                        </button>
                        <button
                          className="btn btnPrimary"
                          type="button"
                          onClick={() => setShowCashImpactModal(false)}
                        >
                          Fermer
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {showTVADiagnosticModal && (
                <div
                  className="modalOverlay"
                  onClick={() => setShowTVADiagnosticModal(false)}
                >
                  <div
                    className="modalCard"
                    style={{ maxWidth: "520px" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="sectionHead">
                      <h3>📌 Diagnostic TVA</h3>
                      <button
                        className="iconBtn"
                        onClick={() => setShowTVADiagnosticModal(false)}
                      >
                        ✕
                      </button>
                    </div>
                    <div style={{ marginTop: 20, display: "grid", gap: 12 }}>
                      <div
                        style={{
                          background: "#f8fafc",
                          padding: 16,
                          borderRadius: 12,
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>
                          Situation actuelle
                        </div>
                        <p style={{ marginTop: 8, fontSize: 14, color: "#334155" }}>
                          {computed?.tvaStatusLabel || "TVA à confirmer"}
                        </p>
                        <p style={{ marginTop: 6, fontSize: 13, color: "#475569" }}>
                          {computed?.tvaHint ||
                            "Le seuil TVA mérite une vérification avec ton activité actuelle."}
                        </p>
                      </div>

                      <div
                        style={{
                          background: "#ffffff",
                          padding: 16,
                          borderRadius: 12,
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>
                          Projection
                        </div>
                        <p style={{ marginTop: 8, fontSize: 14, color: "#334155" }}>
                          {computed?.annualRevenue !== undefined
                            ? `Projection annuelle : ${computed.annualRevenue.toLocaleString("fr-FR")} €`
                            : `CA enregistré : ${currentMonthTotal.toLocaleString("fr-FR")} €`}
                        </p>
                      </div>

                      <div
                        style={{
                          background:
                            computed?.tvaStatus === "exceeded"
                              ? "#fff7ed"
                              : "#f8fafc",
                          padding: 16,
                          borderRadius: 12,
                          border:
                            computed?.tvaStatus === "exceeded"
                              ? "1px solid #fdba74"
                              : "1px solid #e2e8f0",
                        }}
                      >
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>
                          Action immédiate
                        </div>
                        <p style={{ marginTop: 8, fontSize: 14, color: "#334155" }}>
                          {computed?.tvaStatus === "exceeded"
                            ? "Prépare l’activation de la TVA, la facturation adaptée et la déclaration."
                            : computed?.tvaStatus === "soon"
                              ? "Surveille ton seuil et anticipe le passage à la TVA si ton activité continue d’accélérer."
                              : "Aucune action immédiate, garde simplement un œil sur ton chiffre d’affaires cumulé."}
                        </p>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 12,
                          flexWrap: "wrap",
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          className="btn btnGhost"
                          type="button"
                          onClick={() => {
                            setShowTVADiagnosticModal(false);
                            setShowTVAModal(true);
                          }}
                        >
                          Comprendre la TVA
                        </button>
                        <button
                          className="btn btnPrimary"
                          type="button"
                          onClick={() => setShowTVADiagnosticModal(false)}
                        >
                          J’ai compris
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Repères fiscaux */}
              <div className="fiscalTimeline">
                <h3>Repères fiscaux</h3>
                <div className="timelineList">
                  {fiscalTimeline.map((item) => (
                    <div key={item.key} className="timelineItem">
                      <div className="timelineTop">
                        <span className="timelineIcon">{item.icon}</span>
                        <span className="timelineLabel">{item.label}</span>
                      </div>
                      <div className="timelineValue">{item.value}</div>
                      <div className="timelineHint">{item.hint}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Analyse financière */}
              {isFiscalProfileComplete && computed.monthlyExpenses !== undefined && (
                <div className="financialAnalysis dashboardSectionZone dashboardSectionZoneMint">
                  <h3>📊 Analyse financière</h3>
                  <div className="fiscalDashboard" style={{ marginTop: 12 }}>
                    {computed.annualRevenue !== undefined && (
                      <div className="fiscalCard">
                        <div className="fiscalLabel">Projection annuelle</div>
                        <div className="fiscalValue">
                          {computed.annualNet?.toLocaleString("fr-FR") || "—"} €
                        </div>
                        <div
                          className="muted"
                          style={{ fontSize: 12, marginTop: 6 }}
                        >
                          Après charges et cotisations
                        </div>
                      </div>
                    )}
                    {computed.monthlyExpenses > 0 && (
                      <div className="fiscalCard">
                        <div className="fiscalLabel">Dépenses mensuelles</div>
                        <div className="fiscalValue">
                          {computed.monthlyExpenses?.toLocaleString("fr-FR") ||
                            "—"}{" "}
                          €
                        </div>
                        <div
                          className="muted"
                          style={{ fontSize: 12, marginTop: 6 }}
                        >
                          Tes charges personnelles
                        </div>
                      </div>
                    )}
                    {computed.coverageRatio && (
                      <div className="fiscalCard">
                        <div className="fiscalLabel">
                          Couverture des dépenses
                        </div>
                        <div className="fiscalValue">
                          {Math.round(computed.coverageRatio * 100)}%
                        </div>
                        <div
                          className="muted"
                          style={{ fontSize: 12, marginTop: 6 }}
                        >
                          Revenus / Dépenses
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="fiscalScoreCard">
                <div className="fiscalScoreHeader">
                  <h3>🎯 Score fiscal</h3>
                </div>
                <div className="fiscalScoreValue">
                  {fiscalScore.value} <span>/ 100</span>
                </div>
                <div className="fiscalScoreText">
                  {fiscalScore.interpretation}
                </div>
                <div className="fiscalScoreBar">
                  <div
                    className="fiscalScoreBarFill"
                    style={{ width: `${fiscalScore.value}%` }}
                  />
                </div>
              </div>

              {/* Добавьте после fiscalDashboard */}
              {isFiscalProfileComplete && currentMonthTotal > 0 && (
                <div
                  className="progressIndicators"
                >
                  <div className="progressItem">
                    <div className="progressItemHeader">
                      <span>💰 Objectif d'épargne</span>
                      <span>
                        {Math.min(
                          100,
                          Math.round((savingsProgress / savingsGoal) * 100),
                        )}
                        %
                      </span>
                    </div>
                    <div className="progressBar progressBarPremium">
                      <div
                        className="progressFill"
                        style={{
                          width: `${Math.min(100, Math.round((savingsProgress / savingsGoal) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ACRE Expiration Warning */}
              {/* Santé financière */}
              {isFiscalProfileComplete && computed.financialHealth && computed.financialHealthMessage && (
                <div
                  className={`financialHealthBox health-${computed.financialHealth}`}
                  style={{
                    marginTop: 16,
                    padding: 16,
                    borderRadius: 12,
                    background:
                      computed.financialHealth === "danger"
                        ? "#fff5f5"
                        : computed.financialHealth === "warning"
                          ? "#fffaf1"
                          : computed.financialHealth === "neutral"
                            ? "#f8f9fb"
                            : computed.financialHealth === "ok"
                              ? "#f4fbf6"
                              : "#f8f9fb",
                    border: `1px solid ${computed.financialHealth === "danger" ? "#f1c9c9" : computed.financialHealth === "warning" ? "#f0deae" : computed.financialHealth === "ok" ? "#cfe8cf" : "#e2e8f0"}`,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      marginBottom: 8,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span>📊</span> Santé financière
                  </div>
                  <div
                    style={{ fontSize: 14, marginBottom: 8, lineHeight: 1.4 }}
                  >
                    {computed.financialHealthMessage}
                  </div>
                  {computed.savingsRecommended > 0 && (
                    <div
                      style={{
                        fontSize: 13,
                        color: "#555",
                        marginTop: 8,
                        paddingTop: 8,
                        borderTop: "1px solid rgba(0,0,0,0.05)",
                      }}
                    >
                      💰 Objectif d'épargne recommandé :{" "}
                      <strong>
                        {computed.savingsRecommended.toLocaleString("fr-FR")} €
                      </strong>
                    </div>
                  )}
                </div>
              )}

              {/* Modal TVA - En savoir plus */}
              {showTVAModal && (
                <div
                  className="modalOverlay"
                  onClick={() => setShowTVAModal(false)}
                >
                  <div
                    className="modalCard"
                    style={{ maxWidth: "500px" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="sectionHead">
                      <h3>📌 La TVA pour micro-entrepreneur</h3>
                      <button
                        className="iconBtn"
                        onClick={() => setShowTVAModal(false)}
                      >
                        ✕
                      </button>
                    </div>
                    <div style={{ marginTop: 20 }}>
                      <div
                        style={{
                          background: "#f3f4f6",
                          padding: 16,
                          borderRadius: 12,
                          marginBottom: 20,
                        }}
                      >
                        <strong>🔍 Qu’est-ce que la TVA ?</strong>
                        <p style={{ marginTop: 8, fontSize: 13 }}>
                          En franchise de TVA, vous ne facturez pas la TVA et ne
                          la déclarez pas. Dès que votre chiffre d’affaires
                          dépasse les seuils, vous devez :
                        </p>
                        <ul style={{ fontSize: 13, marginTop: 8 }}>
                          <li>
                            Obtenir un numéro de TVA (via votre espace
                            impots.gouv.fr)
                          </li>
                          <li>
                            Facturer la TVA à vos clients (20% en général)
                          </li>
                          <li>
                            Déposer des déclarations de TVA (mensuelles ou
                            trimestrielles)
                          </li>
                        </ul>
                      </div>
                      <a
                        href="https://www.impots.gouv.fr"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btnGhost"
                        style={{
                          textAlign: "center",
                          display: "block",
                          marginBottom: 12,
                        }}
                      >
                        🔗 En savoir plus sur impots.gouv.fr
                      </a>
                      <button
                        className="btn btnPrimary"
                        onClick={() => setShowTVAModal(false)}
                        style={{ width: "100%" }}
                      >
                        J'ai compris
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Alerte CFE avec date de début d'activité */}
              {user && computed?.cfeAlert?.show && (
                <div
                  className="cfeWarning"
                  style={{
                    marginTop: 16,
                    marginBottom: 16,
                    padding: "12px 16px",
                    background: "#fff5f0",
                    borderLeft: "4px solid #f97316",
                    borderRadius: 8,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 12,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <strong>
                        ⚠️ Attention CFE {new Date().getFullYear()}
                      </strong>
                      <p style={{ margin: "4px 0 0", fontSize: 13 }}>
                        {computed?.cfeAlert?.message}
                        {computed?.businessYear === 2 &&
                          " (2ème année d'activité)"}
                        {!computed?.businessYear &&
                          computed?.cfeAlert?.estimatedAmount === null && (
                            <span
                              style={{
                                display: "block",
                                fontSize: 12,
                                marginTop: 4,
                              }}
                            >
                              💡 Renseigne ta date de début d'activité dans ton
                              profil pour une estimation précise.
                            </span>
                          )}
                      </p>
                    </div>
                    <button
                      onClick={() => setShowCFEModal(true)}
                      className="btn btnGhost btnSmall"
                      style={{ fontSize: 12, padding: "4px 12px" }}
                    >
                      📖 En savoir plus
                    </button>
                  </div>
                </div>
              )}
              <div className="dashboardSectionZone dashboardSectionZoneCoolNeutral">
              {/* Journal des revenus */}
              <div className="journalHeader">
                <div>
                  <h3>Mes revenus ({filteredRevenues.length})</h3>
                  <p className="muted" style={{ marginTop: 4 }}>
                    Total : {revenueSectionTotal.toLocaleString("fr-FR")} €
                  </p>
                </div>
                <div className="journalFilters">
                  <button
                    className="btn btnGhost btnSmall"
                    type="button"
                    onClick={() => toggleDashboardSection("revenues")}
                  >
                    {dashboardSections.revenues ? "Voir tout" : "Réduire"}
                  </button>
                  <button
                    className="btn btnGhost btnSmall"
                    type="button"
                    onClick={handleExportCSV}
                    disabled={
                      filteredRevenues.length === 0 ||
                      isExportingCsv ||
                      isExportLimitReached
                    }
                    title="Exporter les revenus affichés"
                    style={{
                      opacity:
                        filteredRevenues.length === 0 ||
                        isExportingCsv ||
                        isExportLimitReached
                          ? 0.5
                          : 1,
                      cursor:
                        filteredRevenues.length === 0 ||
                        isExportingCsv ||
                        isExportLimitReached
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    {isExportingCsv ? "Export CSV..." : "Export CSV"}
                  </button>

                  <button
                    className="btn btnGhost btnSmall"
                    type="button"
                    onClick={handleExportPDFWithLimit}
                    disabled={
                      revenues.length === 0 ||
                      isExportingPdf ||
                      isExportLimitReached
                    }
                    style={{
                      opacity:
                        revenues.length === 0 ||
                        isExportingPdf ||
                        isExportLimitReached
                          ? 0.5
                          : 1,
                      cursor:
                        revenues.length === 0 ||
                        isExportingPdf ||
                        isExportLimitReached
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    {isExportingPdf ? "Export PDF..." : "📄 Export PDF"}
                  </button>

                  {isPremium && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "0.35rem 0.7rem",
                        borderRadius: 999,
                        background: "rgba(255, 244, 214, 0.8)",
                        border: "1px solid rgba(217, 168, 41, 0.22)",
                        color: "#7c5a10",
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: "0.01em",
                        whiteSpace: "nowrap",
                      }}
                    >
                      ⭐ Premium actif
                    </span>
                  )}

                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="monthFilter"
                  >
                    <option value="all">Tous les mois</option>
                    {monthOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div
                className="muted"
                style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}
              >
                {isPremium
                  ? "PDF + CSV illimités • historique complet"
                  : remainingExports <= 0
                    ? "Limite atteinte • Passe Premium pour continuer"
                    : remainingExports <= 1
                    ? "Dernier export gratuit ce mois-ci"
                    : `Il te reste ${remainingExports} exports gratuits ce mois-ci`}
              </div>

              {filteredRevenues.length === 0 ? (
                <div className="emptyRevenueState">
                  <div className="emptyRevenueIcon">🧾</div>
                  <div className="emptyRevenueTitle">Aucun revenu</div>
                  <p className="muted">
                    {selectedMonth === "all"
                      ? "Ajoute ton premier revenu pour commencer ton suivi."
                      : "Aucun revenu pour ce mois."}
                  </p>
                  <button
                    className="btn btnPrimary btnSmall"
                    type="button"
                    onClick={handleOpenRevenuePopup}
                  >
                    Ajouter un revenu
                  </button>
                </div>
              ) : dashboardSections.revenues ? (
                <div
                  style={{
                    padding: 16,
                    borderRadius: 14,
                    border: "1px solid #e2e8f0",
                    background: "#ffffff",
                    color: "#475569",
                    marginTop: 12,
                  }}
                >
                  Historique replié • {filteredRevenues.length} revenu
                  {filteredRevenues.length > 1 ? "s" : ""} • Total{" "}
                  {revenueSectionTotal.toLocaleString("fr-FR")} €
                </div>
              ) : (
                <div className="revenuesList">
                  {filteredRevenues.map((item) => (
                    <div key={item.id} className="revenueItem">
                      <div className="revenueMain">
                        <div className="revenueAmount">
                          {Number(item.amount).toLocaleString("fr-FR")} €
                        </div>
                        <div className="revenueDate">
                          {formatRevenueDate(item.date)}
                        </div>
                      </div>
                      <div className="revenueMeta">
                        {item.client && (
                          <div>
                            <strong>Client :</strong> {item.client}
                          </div>
                        )}
                        {item.invoice && (
                          <div>
                            <strong>Facture :</strong> {item.invoice}
                          </div>
                        )}
                        {item.note && (
                          <div>
                            <strong>Note :</strong> {item.note}
                          </div>
                        )}
                      </div>
                      <div className="revenueActions">
                        <button
                          className="btn btnGhost btnSmall btnSubtleDanger"
                          onClick={() => handleDeleteRevenue(item.id)}
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Historique mensuel */}
              {monthlyHistory.length > 0 && (
                <div className="monthlyHistory">
                  <div className="journalHeader">
                    <div>
                      <h3>Historique mensuel</h3>
                      <p className="muted" style={{ marginTop: 4 }}>
                        {monthlyHistory.length} mois suivis
                      </p>
                    </div>
                    <div className="journalFilters">
                      <button
                        className="btn btnGhost btnSmall"
                        type="button"
                        onClick={() => toggleDashboardSection("chart")}
                      >
                        {dashboardSections.chart ? "Voir tout" : "Réduire"}
                      </button>
                    </div>
                  </div>

                  {!dashboardSections.chart && (
                    <>
                      {showChart && revenueChartData.length > 0 && (
                        <div ref={chartRef} className="revenueChartCard">
                          <div className="chartHeader">
                            <div>
                              <h3>Évolution</h3>
                              <span className="muted">6 derniers mois</span>
                            </div>
                            <button
                              className="iconBtn"
                              onClick={hideChart}
                              aria-label="Masquer le graphique"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="revenueChart">
                            {revenueChartData.map((item) => {
                              const date = new Date(item.year, item.month);
                              const label = date.toLocaleDateString("fr-FR", {
                                month: "short",
                              });
                              const height = Math.max(
                                12,
                                (item.total / maxRevenueValue) * 140,
                              );
                              return (
                                <div
                                  key={`${item.year}-${item.month}`}
                                  className="chartCol"
                                >
                                  <div
                                    className="chartBar"
                                    style={{ height: `${height}px` }}
                                    title={`${item.total.toLocaleString("fr-FR")} €`}
                                  />
                                  <div className="chartValue">
                                    {item.total.toLocaleString("fr-FR")} €
                                  </div>
                                  <div className="chartLabel">{label}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <div className="historyList">
                        {monthlyHistory.map((m) => {
                          const date = new Date(m.year, m.month);
                          const label = date.toLocaleDateString("fr-FR", {
                            month: "long",
                            year: "numeric",
                          });
                          return (
                            <div
                              key={`${m.year}-${m.month}`}
                              className="historyItem"
                            >
                              <span className="historyMonth">{label}</span>
                              <strong className="historyTotal">
                                {m.total.toLocaleString("fr-FR")} €
                              </strong>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {dashboardSections.chart && (
                    <div
                      style={{
                        padding: 16,
                        borderRadius: 14,
                        border: "1px solid #e2e8f0",
                        background: "#ffffff",
                        color: "#475569",
                        marginTop: 12,
                      }}
                    >
                      Le graphique et l’historique mensuel sont repliés.
                    </div>
                  )}
                </div>
              )}

              </div>

              {/* ===== MES FACTURES ===== */}
              <div
                id="invoices-section"
                className="dashboardSectionZone dashboardSectionZoneSoftNeutral"
                style={{ marginTop: 24 }}
              >
                <div className="journalHeader">
                  <div>
                    <h3>Mes factures ({invoiceSectionSummary.count})</h3>
                    <p className="muted" style={{ marginTop: 4 }}>
                      {invoiceSectionSummary.unpaidCount > 0
                        ? `${invoiceSectionSummary.unpaidCount} impayée${invoiceSectionSummary.unpaidCount > 1 ? "s" : ""}`
                        : "Aucun impayé"}
                    </p>
                  </div>
                  <div className="journalFilters">
                    <button
                      className="btn btnGhost btnSmall"
                      type="button"
                      onClick={() => toggleDashboardSection("invoices")}
                    >
                      {dashboardSections.invoices ? "Voir tout" : "Réduire"}
                    </button>
                    <button
                      className="btn btnPrimary btnSmall"
                      type="button"
                      onClick={handleOpenInvoiceGenerator}
                    >
                      + Nouvelle facture
                    </button>
                  </div>
                </div>

                {invoiceNotice && (
                  <div className="saveNotice" style={{ marginTop: 16, width: "100%" }}>
                    {typeof invoiceNotice === "string" ? (
                      <>✅ {invoiceNotice}</>
                    ) : (
                      <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ fontWeight: 700 }}>{invoiceNotice.title}</div>
                        <div>{invoiceNotice.body}</div>
                        {invoiceNotice.cta === "auth" && (
                          <div>
                            <button
                              className="btn btnGhost btnSmall"
                              type="button"
                              onClick={() => openAuthModal("signup")}
                            >
                              Créer mon compte pour garder cette facture
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {visibleInvoices.length === 0 ? (
                  <div className="emptyRevenueState emptyRevenueStateCompact">
                    <div className="emptyRevenueIcon">🧾</div>
                    <div className="emptyRevenueTitle">Aucune facture</div>
                    <p className="muted">
                      Crée ta première facture pour commencer le suivi.
                    </p>
                    <button
                      className="btn btnPrimary btnSmall"
                      type="button"
                      onClick={handleOpenInvoiceGenerator}
                    >
                      Créer une facture
                    </button>
                  </div>
                ) : dashboardSections.invoices ? (
                  <div
                    style={{
                      padding: 16,
                      borderRadius: 14,
                      border: "1px solid #e2e8f0",
                      background: "#ffffff",
                      color: "#475569",
                      marginTop: 12,
                    }}
                  >
                    Historique replié • {invoiceSectionSummary.count} facture
                    {invoiceSectionSummary.count > 1 ? "s" : ""}
                    {invoiceSectionSummary.unpaidCount > 0 &&
                      ` • ${invoiceSectionSummary.unpaidCount} impayée${invoiceSectionSummary.unpaidCount > 1 ? "s" : ""}`}
                  </div>
                ) : (
                  <div className="revenuesList">
                    {visibleInvoices.map((invoice) => (
                      <div key={invoice.id} className="revenueItem">
                        <div className="revenueMain">
                          <div className="revenueAmount">
                            {Number(invoice.amount).toLocaleString("fr-FR")} €
                          </div>
                          <div className="revenueDate">
                            {invoice.invoice_number}
                          </div>
                        </div>
                        <div className="revenueMeta">
                          {invoice.client_name && (
                            <div>
                              <strong>Client :</strong> {invoice.client_name}
                            </div>
                          )}
                          {invoice.description && (
                            <div>
                              <strong>Prestation :</strong>{" "}
                              {invoice.description}
                            </div>
                          )}
                          {invoice.invoice_date && (
                            <div>
                              <strong>Date :</strong>{" "}
                              {new Date(
                                `${invoice.invoice_date}T00:00:00`,
                              ).toLocaleDateString("fr-FR", {
                                day: "2-digit",
                                month: "long",
                                year: "numeric",
                              })}
                            </div>
                          )}
                        </div>
                        <div className="revenueActions">
                          <span
                            className={`badge ${
                              invoice.localOnly
                                ? "badgeGray"
                                : invoice.status === "sent"
                                  ? "badgeGreen"
                                  : "badgeGray"
                            }`}
                          >
                            {invoice.localOnly
                              ? "Locale • non enregistrée"
                              : invoice.status === "sent"
                                ? "✅ Envoyée"
                                : "📝 Brouillon"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="dataTrustLine">
                {trustBadgeLabel}
              </div>
            </section>
          )}

          {!focusMode && visibleSections.security && (
            <section ref={securityRef} className="card">
              <div className="sectionHead">
                <h2>🔒 Sécurité & confidentialité</h2>
                <button
                  className="iconBtn"
                  type="button"
                  onClick={() => hideSection("security")}
                  aria-label="Masquer cette section"
                >
                  ✕
                </button>
              </div>

              <div className="securityGrid">
                <div className="securityItem">
                  <strong>🔐 Accès sécurisé</strong>
                  <p className="muted">
                    Connexion sécurisée par email et mot de passe.
                  </p>
                </div>

                <div className="securityItem">
                  <strong>🛡️ Données protégées</strong>
                  <p className="muted">
                    Les informations sont enregistrées dans un espace personnel
                    sécurisé.
                  </p>
                </div>

                <div className="securityItem">
                  <strong>💳 Aucune donnée bancaire</strong>
                  <p className="muted">
                    Aucune carte bancaire ni IBAN ne sont demandés.
                  </p>
                </div>

                <div className="securityItem">
                  <strong>
                    🚫 Pas d’accès direct aux services administratifs
                  </strong>
                  <p className="muted">
                    Microassist ne se connecte pas automatiquement à l’URSSAF ni
                    aux impôts.
                  </p>
                </div>
              </div>

              <div className="securityNoteBox">
                <p>
                  Microassist fournit des repères pratiques et un espace de
                  suivi. Il ne remplace pas un expert-comptable.
                </p>
              </div>
            </section>
          )}

          {visibleSections.feedback && (
            <section
              id="feedback"
              ref={feedbackRef}
              className="card feedbackCta"
            >
              <div className="sectionHead">
                <h2>⭐ Partagez votre avis</h2>
                <button
                  className="iconBtn"
                  type="button"
                  onClick={() => hideSection("feedback")}
                  aria-label="Masquer cette section"
                >
                  ✕
                </button>
              </div>

              <p className="muted">
                Tu utilises Microassist ? Dis-moi ce qui manque, ce qui est
                utile, ce qui peut être amélioré. Ça prend 30 secondes et ça
                compte vraiment.
              </p>

              <a
                className="btn btnPrimary"
                href="https://docs.google.com/forms/d/e/1FAIpQLSfFLqWZajP6Dy0Zm5-bS9cnE5-joWecfCgfyIhzGRMbsk-jqA/viewform"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  trackEvent("feedback_open", feedbackContextSnapshot)
                }
              >
                Ouvrir le formulaire
              </a>

              <p className="muted" style={{ marginTop: 10 }}>
                Le formulaire s’ouvre dans un nouvel onglet.
              </p>
            </section>
          )}
        </main>

        {showAddRevenue && (
          <div className="modalOverlay" onClick={handleCloseRevenuePopup}>
            <div
              className="modalCard"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-revenue-title"
            >
              <div className="sectionHead">
                <h3 id="add-revenue-title">Ajouter revenu</h3>

                <button
                  className="iconBtn"
                  type="button"
                  onClick={handleCloseRevenuePopup}
                  aria-label="Fermer"
                >
                  ✕
                </button>
              </div>

              <div className="formGrid">
                <label className="field">
                  <span>Montant (€)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={revenueForm.amount}
                    onChange={(e) =>
                      handleRevenueFieldChange("amount", e.target.value)
                    }
                    placeholder="Ex : 200"
                  />
                </label>

                <label className="field">
                  <span>Date</span>
                  <input
                    type="date"
                    value={revenueForm.date}
                    onChange={(e) =>
                      handleRevenueFieldChange("date", e.target.value)
                    }
                  />
                </label>
              </div>

              <button
                className="btn btnGhost btnSmall"
                type="button"
                onClick={() => setShowRevenueDetails((v) => !v)}
                style={{ marginTop: 12 }}
              >
                {showRevenueDetails
                  ? "Masquer les détails"
                  : "+ Ajouter détails"}
              </button>

              {showRevenueDetails && (
                <div className="formGrid" style={{ marginTop: 12 }}>
                  <label className="field">
                    <span>Client</span>
                    <input
                      type="text"
                      value={revenueForm.client}
                      onChange={(e) =>
                        handleRevenueFieldChange("client", e.target.value)
                      }
                      placeholder="Optionnel"
                    />
                  </label>

                  <label className="field">
                    <span>Facture</span>
                    <input
                      type="text"
                      value={revenueForm.invoice}
                      onChange={(e) =>
                        handleRevenueFieldChange("invoice", e.target.value)
                      }
                      placeholder="Optionnel"
                    />
                  </label>

                  <label className="field fieldFull">
                    <span>Note</span>
                    <input
                      type="text"
                      value={revenueForm.note}
                      onChange={(e) =>
                        handleRevenueFieldChange("note", e.target.value)
                      }
                      placeholder="Optionnel"
                    />
                  </label>
                </div>
              )}

              {revenueAmount > 0 && (
                <div className="revenuePreview">
                  <div className="previewTitle">Estimation rapide</div>

                  <div className="previewRow">
                    <span>Taux estimé</span>
                    <strong>{previewRateLabel}</strong>
                  </div>

                  <div className="previewRow">
                    <span>Charges estimées</span>
                    <strong>{previewCharges.toLocaleString("fr-FR")} €</strong>
                  </div>

                  <div className="previewRow">
                    <span>Net estimé</span>
                    <strong>
                      {previewAvailable.toLocaleString("fr-FR")} €
                    </strong>
                  </div>

                  <div className="previewAdvice">💡 {previewAdvice}</div>
                </div>
              )}

              <div className="miniActions" style={{ marginTop: 16 }}>
                <button
                  className="btn btnGhost"
                  type="button"
                  onClick={handleCloseRevenuePopup}
                >
                  Annuler
                </button>

                <button
                  className="btn btnPrimary"
                  type="button"
                  onClick={handleSaveRevenue}
                >
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        )}

        <footer
          className="footer"
          style={{
            marginTop: "40px",
            padding: "24px 20px",
            background: "#ffffff",
            borderTop: "1px solid #e2e8f0",
          }}
        >
          <div
            style={{
              maxWidth: "1200px",
              margin: "0 auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
            }}
          >
            {/* Première ligne : liens */}
            <div
              style={{
                display: "flex",
                gap: "28px",
                flexWrap: "wrap",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <button
                onClick={() => setShowCGU(true)}
                className="footerLink"
                style={{
                  background: "none",
                  border: "none",
                  color: "#6b7280",
                  cursor: "pointer",
                  fontSize: "13px",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.target.style.color = "#7c3aed";
                  e.target.style.backgroundColor = "#f5f3ff";
                }}
                onMouseLeave={(e) => {
                  e.target.style.color = "#6b7280";
                  e.target.style.backgroundColor = "transparent";
                }}
              >
                Mentions légales
              </button>

              <span style={{ color: "#e2e8f0", fontSize: "14px" }}>|</span>

              <button
                onClick={() => setShowPrivacy(true)}
                className="footerLink"
                style={{
                  background: "none",
                  border: "none",
                  color: "#6b7280",
                  cursor: "pointer",
                  fontSize: "13px",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.target.style.color = "#7c3aed";
                  e.target.style.backgroundColor = "#f5f3ff";
                }}
                onMouseLeave={(e) => {
                  e.target.style.color = "#6b7280";
                  e.target.style.backgroundColor = "transparent";
                }}
              >
                Confidentialité
              </button>

              <span style={{ color: "#e2e8f0", fontSize: "14px" }}>|</span>

              <a
                href="mailto:support@microassist.fr"
                className="footerLink"
                style={{
                  color: "#6b7280",
                  textDecoration: "none",
                  fontSize: "13px",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.target.style.color = "#7c3aed";
                  e.target.style.backgroundColor = "#f5f3ff";
                }}
                onMouseLeave={(e) => {
                  e.target.style.color = "#6b7280";
                  e.target.style.backgroundColor = "transparent";
                }}
              >
                Contact
              </a>
            </div>

            {/* Deuxième ligne : copyright et informations */}
            <div
              style={{
                fontSize: "12px",
                color: "#9ca3af",
                display: "flex",
                alignItems: "center",
                gap: "16px",
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <span>© {new Date().getFullYear()} Microassist</span>
              <span style={{ color: "#e2e8f0" }}>•</span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  color: "#475569",
                  fontWeight: 600,
                }}
              >
                {trustBadgeLabel}
              </span>
              <span style={{ color: "#e2e8f0" }}>•</span>
              <span>
                Fait avec ❤️ par{" "}
                <a
                  href="https://elenamihalska70-creator.github.io/Portfolio/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="footerLink"
                >
                  O.M.
                </a>
              </span>
            </div>

            {/* Troisième ligne : crédits (optionnel, maintenant intégré dans la ligne du dessus) */}
            {/* <div style={{ 
      fontSize: '11px', 
      color: '#cbd5e1',
      textAlign: 'center'
    }}>
      Prototype développé par Olena Mykhalska
    </div> */}
          </div>
        </footer>

        {showCGU && (
          <CGUModal isOpen={showCGU} onClose={() => setShowCGU(false)} />
        )}
        {showPrivacy && (
          <CGUModal
            isOpen={showPrivacy}
            onClose={() => setShowPrivacy(false)}
            initialTab="privacy"
          />
        )}

        {/* Modal d'authentification */}
        {authOpen && (
          <AuthGate
            initialMode={authInitialMode}
            isAuthenticated={Boolean(user)}
            onClose={() => setAuthOpen(false)}
            onLogout={handleLogout}
            onGoToDashboard={() => {
              setAuthOpen(false);
              goToDashboard({ scroll: false });
            }}
            onSuccess={() => {
              localStorage.setItem(PENDING_AUTH_SUCCESS_KEY, "manual_auth");
              setAuthOpen(false);
            }}
          />
        )}

        {showResetModal && (
          <div className="modalOverlay" onClick={() => !resetInProgress && setShowResetModal(false)}>
            <div
              className="modalCard"
              style={{ maxWidth: "560px" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sectionHead">
                <h3>Réinitialiser ton espace</h3>
                <button
                  className="iconBtn"
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  disabled={resetInProgress}
                >
                  ✕
                </button>
              </div>

              <p style={{ marginTop: 16, lineHeight: 1.6 }}>
                Choisis le niveau de réinitialisation. L’objectif est d’éviter tout
                mélange entre ancien profil et nouveaux calculs.
              </p>

              <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
                <div
                  style={{
                    border: "1px solid #dbeafe",
                    background: "#f8fbff",
                    borderRadius: 16,
                    padding: 16,
                  }}
                >
                  <div style={{ fontWeight: 800, color: "#0f172a" }}>
                    Recommencer le profil fiscal
                  </div>
                  <p style={{ marginTop: 8, marginBottom: 12, color: "#334155", lineHeight: 1.6 }}>
                    Réinitialise seulement le profil fiscal et les étapes de l’assistant.
                    Tes revenus, factures et rappels restent disponibles.
                  </p>
                  <button
                    className="btn btnGhost"
                    type="button"
                    onClick={handleProfileOnlyReset}
                    disabled={resetInProgress}
                  >
                    Réinitialiser le profil
                  </button>
                </div>

                <div
                  style={{
                    border: "1px solid #fecaca",
                    background: "#fff7f7",
                    borderRadius: 16,
                    padding: 16,
                  }}
                >
                  <div style={{ fontWeight: 800, color: "#7f1d1d" }}>
                    Réinitialiser tout mon espace
                  </div>
                  <p style={{ marginTop: 8, marginBottom: 12, color: "#7f1d1d", lineHeight: 1.6 }}>
                    Supprime le profil, les revenus, les factures, les rappels et remet
                    l’interface à zéro pour repartir sans aucune donnée résiduelle.
                  </p>
                  <button
                    className="btn btnPrimary"
                    type="button"
                    onClick={handleFullReset}
                    disabled={resetInProgress}
                    style={{ background: "#b91c1c", borderColor: "#b91c1c" }}
                  >
                    {resetInProgress ? "Réinitialisation..." : "Tout réinitialiser"}
                  </button>
                </div>
              </div>

              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  borderRadius: 12,
                  background: "#f8fafc",
                  color: "#475569",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                Clés locales concernées par la réinitialisation complète :
                <code style={{ marginLeft: 6 }}>
                  {FULL_RESET_LOCAL_STORAGE_KEYS.join(", ")}
                </code>
              </div>
            </div>
          </div>
        )}

 
                {/* 
          Ancienne version du modal Premium orientée paiement direct.
          Conservée comme base pour future version annuelle
          ou plans avancés (Pilotage / Finance Pro).

          🎁 Ce qui reste gratuit
          ✅ Calcul des charges URSSAF
          ✅ ACRE intégrée (réduction 50%)
          ✅ Alerte TVA et seuils
          ✅ Suivi des revenus et dépenses
          ✅ 3 premières factures par mois

          ✨ Premium : 5€/mois ou 49€/an
          ✅ Factures illimitées
          ✅ Export PDF de ton rapport fiscal
          ✅ Rappels email avant chaque échéance
          ✅ Historique illimité
          ✅ Support prioritaire
        */}

        {/* Modal Enregistrement / Offre 5€ */}
        {showPricingModal && (
          <div
            className="modalOverlay"
            onClick={() => closePremiumModal(premiumModalSource)}
          >
            <div
              className="modalCard"
              style={{ maxWidth: "520px" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sectionHead">
                <h3>{premiumModalContent.title}</h3>
                <button
                  className="iconBtn"
                  onClick={() => closePremiumModal(premiumModalSource)}
                  type="button"
                >
                  ✕
                </button>
              </div>

  <div style={{ marginTop: 20 }}>
  <p style={{ fontSize: 14, lineHeight: 1.6, marginTop: 0, marginBottom: 0 }}>
  {premiumModalContent.intro}
</p>

  {premiumWaitlistJoined && (
    <div
      style={{
        marginTop: 12,
        padding: "10px 12px",
        borderRadius: 10,
        background: "#eff6ff",
        border: "1px solid #bfdbfe",
        color: "#1d4ed8",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      ✔️ Accès prioritaire activé
    </div>
  )}

  <div
    style={{
      background: "#fef3c7",
      padding: 18,
      borderRadius: 12,
      marginTop: 16,
      marginBottom: 20,
    }}
  >
  <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2, marginBottom: 6 }}>
  {premiumModalContent.heroTitle}
  </div>
  <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>
    {premiumModalContent.heroText}
  </p>
  </div>

  <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
    <label
      htmlFor="premium-waitlist-email"
      style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}
    >
      Ton email
    </label>
    <input
      id="premium-waitlist-email"
      type="email"
      value={premiumWaitlistEmail}
      onChange={(e) => {
        setPremiumWaitlistEmail(e.target.value);
        if (premiumWaitlistError) {
          setPremiumWaitlistError("");
        }
      }}
      placeholder="prenom@email.com"
      autoComplete="email"
      disabled={isJoiningPremiumWaitlist}
      style={{
        width: "100%",
        padding: "12px 14px",
        borderRadius: 12,
        border: premiumWaitlistError
          ? "1px solid #fca5a5"
          : "1px solid #d1d5db",
        fontSize: 14,
      }}
    />
    {premiumWaitlistError && (
      <div style={{ fontSize: 12, color: "#b91c1c" }}>
        {premiumWaitlistError}
      </div>
    )}
  </div>

  <div
    style={{
      background: "#f5f3ff",
      padding: 16,
      borderRadius: 12,
      marginBottom: 20,
    }}
  >
    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
      Ce que Premium t’apporte
    </div>

    <ul
      style={{
        margin: 0,
        paddingLeft: 20,
        fontSize: 13,
        lineHeight: 1.7,
      }}
    >
      <li>{premiumModalContent.firstBenefit}</li>
      <li>✔ Alertes SMS urgentes avant échéance</li>
      <li>✔ Export PDF / CSV illimité</li>
      <li>✔ Suivi TVA + ACRE + CFE intelligent</li>
      <li>✔ Recommandations personnalisées selon ton profil</li>
      <li>✔ Accès prioritaire aux nouvelles fonctionnalités</li>
    </ul>
  </div>

  <div
    style={{
      display: "flex",
      gap: 12,
      flexWrap: "wrap",
    }}
  >
<button
  className="btn btnPrimary"
  type="button"
  onClick={() => handlePremiumWaitlistCTA(premiumModalSource)}
  disabled={isJoiningPremiumWaitlist}
  style={{ flex: 1 }}
>
  {isJoiningPremiumWaitlist
    ? "Inscription en cours..."
    : "Recevoir l’accès en avant-première"}
</button>

    <button
      className="btn btnGhost"
      type="button"
      onClick={() => {
        trackPremiumEvent(premiumModalSource || "unknown", "continue_free");
        setShowPricingModal(false);
      }}
      style={{ flex: 1 }}
    >
      Continuer en gratuit
    </button>
  </div>

  <p
    style={{
      fontSize: 11,
      color: "#9ca3af",
      textAlign: "center",
      marginTop: 14,
      marginBottom: 0,
    }}
  >
    Aucun paiement maintenant • email d’information uniquement
  </p>
</div>
            </div>
          </div>
        )}

        {/* Modal CFE - En savoir plus (s'ouvre en premier) */}
        {showCFEModal && (
          <div className="modalOverlay" onClick={() => setShowCFEModal(false)}>
            <div
              className="modalCard"
              style={{ maxWidth: "500px" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sectionHead">
                <h3>La CFE en bref</h3>
                <button
                  className="iconBtn"
                  onClick={() => setShowCFEModal(false)}
                >
                  ✕
                </button>
              </div>

              <div style={{ marginTop: 20 }}>
                <div
                  style={{
                    background: "#f3f4f6",
                    padding: 16,
                    borderRadius: 12,
                    marginBottom: 20,
                  }}
                >
                  <div
                    style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}
                  >
                    📌 Qu'est-ce que la CFE ?
                  </div>
                  <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0 }}>
                    La Cotisation Foncière des Entreprises (CFE) est un impôt
                    local dû par tout professionnel, y compris les
                    micro-entrepreneurs, à partir de la 2ème année d'activité.
                  </p>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <div
                    style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}
                  >
                    💰 Combien ça coûte ?
                  </div>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: 20,
                      fontSize: 13,
                      lineHeight: 1.6,
                    }}
                  >
                    <li>
                      <strong>CA &lt; 5 000€</strong> →{" "}
                      <span style={{ color: "#10b981" }}>Exonéré (0€)</span>
                    </li>
                    <li>
                      <strong>CA entre 5 000€ et 10 000€</strong> → Tarif réduit
                      (50-100€)
                    </li>
                    <li>
                      <strong>CA &gt; 10 000€</strong> → Tarif normal (200-600€
                      selon commune)
                    </li>
                  </ul>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <div
                    style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}
                  >
                    📅 Quand payer ?
                  </div>
                  <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0 }}>
                    La première année est exonérée. Tu paieras en
                    décembre/janvier de la 2ème année.
                  </p>
                </div>

                <div
                  style={{
                    background: "#fef3c7",
                    padding: 12,
                    borderRadius: 12,
                    marginBottom: 20,
                  }}
                >
                  <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0 }}>
                    💡 <strong>Conseil :</strong> Anticipe cette dépense dès
                    maintenant en mettant
                    <strong>
                      {computed?.cfeAlert?.estimatedAmount
                        ? ` ${Math.ceil(computed.cfeAlert.estimatedAmount / 12)}€ `
                        : " 30€ "}
                    </strong>
                    de côté chaque mois.
                  </p>
                </div>

                {/* Lien vers le site officiel (DANS le popup) */}
                <a
                  href="https://www.impots.gouv.fr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btnGhost"
                  style={{
                    textAlign: "center",
                    textDecoration: "none",
                    display: "block",
                    marginBottom: 12,
                  }}
                >
                  🔗 En savoir plus sur impots.gouv.fr →
                </a>

                <button
                  className="btn btnPrimary"
                  onClick={() => setShowCFEModal(false)}
                  style={{ width: "100%" }}
                >
                  J'ai compris
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {showInvoiceGenerator && (
        <InvoiceGenerator
          user={user}
          fiscalProfile={fiscalProfile}
          onClose={() => setShowInvoiceGenerator(false)}
          onSaved={({ savedToSupabase, message, invoice } = {}) => {
            setShowInvoiceGenerator(false);
            if (savedToSupabase) {
              trackEvent("invoice_create", {
                source: "authenticated",
                totalRevenues: revenues.length,
                invoiceCount: visibleInvoices.length + 1,
              });
              showSuccessToast(
                "✅ Facture créée. Tu peux maintenant suivre les paiements.",
                4000,
              );
              refreshInvoices();
              setInvoiceNotice(message || "Facture enregistrée ✅");
            } else if (invoice) {
              trackEvent("invoice_create", {
                source: "guest",
                totalRevenues: revenues.length,
                invoiceCount: visibleInvoices.length + 1,
              });
              showSuccessToast(
                "✅ Facture créée. Tu peux maintenant suivre les paiements.",
                4000,
              );
              setGuestInvoices((prev) => {
                const next = [invoice, ...prev];
                localStorage.setItem(GUEST_INVOICES_KEY, JSON.stringify(next));
                return next;
              });
              setInvoiceNotice({
                title: "Facture téléchargée ✅",
                body: "Connecte-toi pour la retrouver dans ton historique.",
                cta: "auth",
              });
            }
            setTimeout(() => setInvoiceNotice(null), savedToSupabase ? 2500 : 5000);
          }}
        />
      )}

      {showReminderModal && (
  <div
    className="modalOverlay"
    onClick={() => setShowReminderModal(false)}
  >
    <div
      className="modalCard"
      style={{ maxWidth: "520px" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sectionHead">
        <h3>🔔 Gérer mes rappels</h3>
        <button
          className="iconBtn"
          onClick={() => setShowReminderModal(false)}
          type="button"
        >
          ✕
        </button>
      </div>

      <div style={{ marginTop: 20 }}>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginTop: 0 }}>
          Choisis les rappels que tu souhaites recevoir pour mieux anticiper
          tes échéances fiscales.
        </p>

        <div
          style={{
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
            Rappels activés
          </div>

          <label style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={reminderPrefs.declaration}
              onChange={() => handleReminderToggle("declaration")}
            />
            <span>Déclaration URSSAF</span>
          </label>

          <label style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={reminderPrefs.tva}
              onChange={() => handleReminderToggle("tva")}
            />
            <span>Alerte TVA</span>
          </label>

          <label style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={reminderPrefs.cfe}
              onChange={() => handleReminderToggle("cfe")}
            />
            <span>CFE annuelle</span>
          </label>

          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={reminderPrefs.acre}
              onChange={() => handleReminderToggle("acre")}
            />
            <span>Fin ACRE</span>
          </label>
        </div>

        <div
          style={{
            background: "#f5f3ff",
            border: "1px solid #ddd6fe",
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
            Canal de notification
          </div>

          <label style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={reminderPrefs.email}
              onChange={() => handleReminderToggle("email")}
            />
            <span>Email</span>
          </label>

          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={reminderPrefs.sms}
              onChange={() => handleReminderToggle("sms")}
            />
            <span>SMS urgent (premium)</span>
          </label>
        </div>

        <div
          style={{
            background: "#fefce8",
            border: "1px solid #fde68a",
            borderRadius: 12,
            padding: 14,
            marginBottom: 20,
            fontSize: 13,
            lineHeight: 1.6,
            color: "#854d0e",
          }}
        >
          Les rappels SMS urgents feront partie de l’offre premium.
          Les rappels email restent inclus dans ton espace Microassist.
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <button
            className="btn btnPrimary"
            type="button"
            onClick={saveReminderPreferences}
            style={{ flex: 1 }}
          >
            Enregistrer mes préférences
          </button>

          <button
            className="btn btnGhost"
            type="button"
            onClick={() => setShowReminderModal(false)}
            style={{ flex: 1 }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  </div>
)}

    </>
  );
}
