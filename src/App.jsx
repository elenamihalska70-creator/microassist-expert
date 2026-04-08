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
const DEFAULT_VISIBLE_SECTIONS = {
  about: true,
  services: true,
  howItWorks: true,
  roadmap: true,
  security: true,
  feedback: true,
};

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

export default function App() {
  // Основные состояния
  const [stepIndex, setStepIndex] = useState(0);
  const [assistantCollapsed, setAssistantCollapsed] = useState(false);
  const [answers, setAnswers] = useState({});
  const [input, setInput] = useState("");
  const [saveNotice, setSaveNotice] = useState(null);
  const [invoiceNotice, setInvoiceNotice] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [restoredAt, setRestoredAt] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  // UI состояния
  const [helpOpen, setHelpOpen] = useState(false); // ✅ ДОБАВИТЬ
  const [authOpen, setAuthOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false); // ✅ ДОБАВИТЬ
  const { user } = useAuth();
  const [appView, setAppView] = useState("landing");
  const [userName, setUserName] = useState("");
  const [hydrated, setHydrated] = useState(false);
  // Состояния для доходов
  const [showAddRevenue, setShowAddRevenue] = useState(false);
  const [revenues, setRevenues] = useState([]);
  const [showBetaNotice, setShowBetaNotice] = useState(() => {
    return !localStorage.getItem("beta_seen");
  });
  const [showCGU, setShowCGU] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showInvoiceGenerator, setShowInvoiceGenerator] = useState(false);
  
  const [invoices, setInvoices] = useState([]);
  const [guestInvoices, setGuestInvoices] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("guest_invoices") || "[]");
    } catch {
      return [];
    }
  });
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [pdfExportCount, setPdfExportCount] = useState(0);
  const [showCFEModal, setShowCFEModal] = useState(false);
  // состояния
// Modals pédagogiques
  const [showTVAModal, setShowTVAModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);

  const [reminderPrefs, setReminderPrefs] = useState({
  declaration: true,
  tva: true,
  cfe: true,
  acre: true,
  email: true,
  sms: false,
});
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

  const [selectedMonth, setSelectedMonth] = useState("all");
  const [fiscalProfile, setFiscalProfile] = useState(null);
  const [fiscalProfileLoaded, setFiscalProfileLoaded] = useState(false);
  
  // Once authenticated, UI rights must come from Supabase only.
  const persistedPlan = fiscalProfile?.plan || null;

  // Trial starts the first time we persist a beta founder profile.
  const trialDaysLeft = useMemo(() => {
    if (!fiscalProfile?.trial_started_at) return null;

    const startedAt = new Date(fiscalProfile.trial_started_at);
    if (Number.isNaN(startedAt.getTime())) return null;

    const now = new Date();
    const diffMs = now.getTime() - startedAt.getTime();
    const elapsedDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const remaining = 90 - elapsedDays;

    return Math.max(0, remaining);
  }, [fiscalProfile?.trial_started_at]);

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
  const hasSmsPremiumAccess =
    effectivePlan !== "free" && effectivePlan !== "beta_founder";



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
  const refreshFiscalProfile = useCallback(async () => {
    if (!user) {
      setFiscalProfile(null);
      setFiscalProfileLoaded(false);
      return;
    }

    try {
      setFiscalProfileLoaded(false);

      const { data, error } = await supabase
        .from("fiscal_profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          setFiscalProfile(null);
          setFiscalProfileLoaded(true);
          return;
        }
        console.error("Load fiscal profile error:", error.message);
        setFiscalProfile(null);
        setFiscalProfileLoaded(true);
        return;
      }

      setFiscalProfile(data);
      setFiscalProfileLoaded(true);
    } catch (error) {
      console.error("Unexpected error in refreshFiscalProfile:", error);
      setFiscalProfile(null);
      setFiscalProfileLoaded(true);
    }
  }, [user]);

  const migrateLocalDataToSupabase = useCallback(async () => {
    if (!user) return false;

    let migrated = false;

    // 1. Migrer les revenus locaux
    const localRevenues = localStorage.getItem("revenues_guest");
    if (localRevenues) {
      try {
        const revenues = JSON.parse(localRevenues);
        for (const rev of revenues) {
          await supabase.from("revenues").insert({
            user_id: user.id,
            amount: rev.amount,
            revenue_date: rev.date,
            client: rev.client || null,
            invoice: rev.invoice || null,
            note: rev.note || null,
          });
        }
        localStorage.removeItem("revenues_guest");
        migrated = true;
        console.log("✅ Revenus locaux migrés:", revenues.length);
      } catch (e) {
        console.error("Erreur migration revenus:", e);
      }
    }

    // 2. Migrer le profil fiscal
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

    if (migrated) {
      // Rafraîchir les données
      await refreshRevenues();
      await refreshFiscalProfile();
      setSaveNotice(
        "📦 Vos données locales ont été sauvegardées dans votre espace !",
      );
      setTimeout(() => setSaveNotice(null), 3000);
    }

    return migrated;
  }, [user, refreshRevenues, refreshFiscalProfile]);

  // Эффекты с правильными зависимостями
  useEffect(() => {
    if (!user) {
      setFiscalProfile(null);
      return;
    }
    refreshFiscalProfile();
  }, [user, refreshFiscalProfile]);

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

  const [messages, setMessages] = useState([
    {
      role: "bot",
      text: "Bonjour 👋 On va configurer ton profil fiscal. Réponds simplement.",
    },
    {
      role: "bot",
      text: `Étape 1 — ${steps[0].title}\n${steps[0].question}`,
    },
  ]);

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

  function goNext(forcedNextIndex = null) {
    const nextIndex = forcedNextIndex ?? stepIndex + 1;

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
  const key = `microassist_pdf_exports_${new Date().getFullYear()}_${new Date().getMonth() + 1}`;
  const saved = localStorage.getItem(key);
  setPdfExportCount(saved ? Number(saved) : 0);
}, []);

useEffect(() => {
  try {
    const saved = localStorage.getItem("microassist_reminder_prefs");
    if (saved) {
      setReminderPrefs(JSON.parse(saved));
    }
  } catch (error) {
    console.error("Erreur chargement préférences rappels:", error);
  }
}, []);

  useEffect(() => {
    const canSaveFiscalProfile =
      answers?.entry_status &&
      answers?.activity_type &&
      answers?.declaration_frequency;

    if (!canSaveFiscalProfile) return;
    if (!user) return;
    if (user && !fiscalProfileLoaded) return;

    // Добавляем debounce
    const timeoutId = setTimeout(() => {
      saveFiscalProfileToSupabase(answers);
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [
    answers?.entry_status,
    answers?.activity_type,
    answers?.declaration_frequency,
    answers?.acre,
    answers?.acre_start_date,
    answers?.business_start_date,
    fiscalProfileLoaded,
    user,
  ]); // Убираем answers из зависимостей
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
  }, [defaultGuestPlan, fiscalProfile?.trial_started_at, persistedPlan]);

  useEffect(() => {
    if (!user) {
      const savedRevenues = localStorage.getItem("revenues_guest");
      if (savedRevenues) {
        try {
          setRevenues(JSON.parse(savedRevenues));
        } catch (e) {
          console.error("Failed to load guest revenues:", e);
        }
      }
    }
  }, [user]);

  const dashboardAnswers = useMemo(() => {
    const hasActivity = answers?.activity_type || fiscalProfile?.activity_type;
    const hasFrequency =
      answers?.declaration_frequency || fiscalProfile?.declaration_frequency;

    if (!hasActivity && !hasFrequency) {
      return {
        activity_type: null,
        declaration_frequency: null,
        acre: null,
        business_start_date: answers?.business_start_date || null, // ✅ AJOUTER
        _isComplete: false,
      };
    }

    return {
      ...answers,
      activity_type:
        answers?.activity_type || fiscalProfile?.activity_type || null,
      declaration_frequency:
        answers?.declaration_frequency ||
        fiscalProfile?.declaration_frequency ||
        null,
      acre: answers?.acre || fiscalProfile?.acre || null,
      business_start_date:
        answers?.business_start_date ||
        fiscalProfile?.business_start_date ||
        null, // ✅ AJOUTER
      _isComplete: !!(hasActivity && hasFrequency),
    };
  }, [answers, fiscalProfile]);

  const currentMonthTotal = useMemo(() => {
    return revenues.reduce((sum, item) => {
      return sum + Number(item.amount || 0);
    }, 0);
  }, [revenues]);

  const computed = useMemo(() => {
    if (
      !dashboardAnswers?.activity_type ||
      !dashboardAnswers?.declaration_frequency
    ) {
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
  }, [dashboardAnswers, currentMonthTotal, revenues]);

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

  const canSend = useMemo(() => input.trim().length > 0, [input]);

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

  const profileReady =
    dashboardAnswers?.activity_type && dashboardAnswers?.declaration_frequency;

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
        value: `${estimatedCharges.toLocaleString("fr-FR")} €`,
        hint:
          revenues.length > 0 ? "Montant à mettre de côté" : "Ajoute un revenu",
      },
      {
        key: "tva",
        icon: "🧾",
        label: "TVA",
        value: computed?.tvaStatusLabel || "À vérifier",
        hint: computed?.tvaHint || "Repère TVA",
      },
      
    ];
  }, [computed, revenues.length, estimatedCharges]);

  const smartTips = useMemo(() => {
    const tips = [];

    if (currentMonthTotal > 0) {
      tips.push({
        key: "reserve",
        title: "Montant à mettre de côté",
        text: `Prévois environ ${estimatedCharges.toLocaleString("fr-FR")} € pour éviter les surprises.`,
        level: "ok",
        cta: null,
        action: null,
      });
    }

    if (computed?.urgency === "late") {
      tips.push({
        key: "declare-late",
        title: "Déclaration à faire maintenant",
        text: "Ta déclaration semble en retard. Vérifie rapidement ton échéance URSSAF.",
        level: "danger",
        cta: "Voir mes échéances",
        action: "deadline",
      });
    } else if (computed?.urgency === "soon") {
      tips.push({
        key: "declare-soon",
        title: "Déclaration à préparer",
        text: "Une échéance approche. Prévois un moment pour déclarer ton chiffre d’affaires.",
        level: "warning",
        cta: "Voir mes échéances",
        action: "deadline",
      });
    }

    if (computed?.tvaUrgency === "late") {
      tips.push({
        key: "tva-late",
        title: "TVA à traiter",
        text: computed?.tvaHint || "Le seuil TVA demande une action rapide.",
        level: "danger",
        cta: "Modifier mon profil",
        action: "profile",
      });
    } else if (computed?.tvaUrgency === "soon") {
      tips.push({
        key: "tva-soon",
        title: "TVA à surveiller",
        text: computed?.tvaHint || "Ton activité approche du seuil TVA.",
        level: "warning",
        cta: "Modifier mon profil",
        action: "profile",
      });
    }

    if (revenues.length === 0) {
      tips.push({
        key: "first-revenue",
        title: "Premier revenu",
        text: "Ajoute un revenu pour commencer ton suivi réel.",
        level: "neutral",
        cta: null,
        action: null,
      });
    }

    return tips.slice(0, 3);
  }, [currentMonthTotal, estimatedCharges, computed, revenues.length]);

  const mainAction = useMemo(() => {
    if (revenues.length === 0) {
      return {
        title: "Commence ton suivi",
        text: "Ajoute ton premier revenu pour voir tes charges et ton disponible en temps réel.",
        cta: "Ajouter un revenu",
        action: "add",
        level: "neutral",
      };
    }

    if (!dashboardAnswers?.declaration_frequency) {
      return {
        title: "Profil à compléter",
        text: "Renseigne ta périodicité pour afficher des repères plus précis.",
        cta: "Modifier mon profil",
        action: "profile",
        level: "warning",
      };
    }

    if (computed?.urgency === "late") {
      return {
        title: "Déclaration urgente",
        text: "Ta déclaration semble en retard. Vérifie ton échéance dès maintenant.",
        cta: "Voir mes échéances",
        action: "deadline",
        level: "danger",
      };
    }

    if (computed?.urgency === "soon") {
      return {
        title: "À faire bientôt",
        text: "Une déclaration approche. Prévois un moment pour la préparer.",
        cta: "Voir mes échéances",
        action: "deadline",
        level: "warning",
      };
    }

    return {
      title: "Situation stable",
      text: "Ton suivi est à jour. Continue à enregistrer tes revenus régulièrement.",
      cta: null,
      action: null,
      level: "ok",
    };
  }, [revenues.length, dashboardAnswers?.declaration_frequency, computed]);

  const visibleInvoices = user ? invoices : guestInvoices;

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



  // ==================== PROGRESS INDICATORS ====================

  const savingsGoal = useMemo(() => {
    // Objectif d'épargne recommandé: 3 mois de charges
    return Math.max(estimatedCharges * 3, 500);
  }, [estimatedCharges]);

  const savingsProgress = useMemo(() => {
    // Épargne actuelle = disponible estimé
    return availableAmount;
  }, [availableAmount]);

  // ==================== ACRE EXPIRATION CHECK ====================
const acreExpiration = useMemo(() => {
  if (!dashboardAnswers?.acre || dashboardAnswers.acre !== "yes") return null;

  const startDate = dashboardAnswers.acre_start_date
    ? new Date(dashboardAnswers.acre_start_date)
    : null;

  if (!startDate) {
    return {
      hasDate: false,
      message: "💡 L'ACRE réduit tes charges pendant 12 mois. Pense à vérifier quand elle se termine.",
      warning: false,
    };
  }

  const today = new Date();
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 12);

  const daysLeft = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
  const monthsLeft = Math.floor(daysLeft / 30);

  if (daysLeft <= 0) {
    return {
      hasDate: true,
      expired: true,
      daysLeft: 0,
      message: "⚠️ Ta période ACRE est terminée. Pense à mettre à jour ton profil pour ajuster tes charges.",
      warning: true,
    };
  }

  if (daysLeft <= 30) {
    const daysOnly = daysLeft > 0 ? daysLeft : 0;
    return {
      hasDate: true,
      expired: false,
      daysLeft,
      monthsLeft,
      message: `⚠️ Ton ACRE se termine dans ${daysOnly} jour${daysOnly > 1 ? 's' : ''}. Pense à modifier ton profil.`,
      warning: true,
    };
  }

  if (daysLeft <= 90) {
    return {
      hasDate: true,
      expired: false,
      daysLeft,
      monthsLeft,
      message: `⏰ Ton ACRE se termine dans ${daysLeft} jours. Anticipe la modification de ton profil.`,
      warning: true,
    };
  }

  return null;
}, [dashboardAnswers?.acre, dashboardAnswers?.acre_start_date, revenues]); // ✅ revenues добавлена

const goToView = useCallback((nextView, options = {}) => {
  const { push = true, focus = false } = options;
  if (push) window.history.pushState({ appView: nextView }, "");
  setAppView(nextView);
  setFocusMode(focus);
  if (nextView === "assistant") setAssistantCollapsed(false);
}, []);

  const goToDashboard = useCallback(() => {
    goToView("dashboard", { push: true, focus: true });

    setTimeout(() => {
      fiscalRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  }, [goToView]);


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

    localStorage.setItem("microassist_reminder_prefs", JSON.stringify(next));
    return next;
  });
}

  // Centralizes UI gating for monetized features.
  function guardPremiumAccess(feature, source = "unknown") {
    const featureChecks = {
      revenue_limit: () => revenues.length >= currentPlanLimits.revenues,
      invoice_limit: () =>
        invoicesThisMonth >= currentPlanLimits.invoicesPerMonth,
      pdf_export_limit: () =>
        pdfExportCount >= currentPlanLimits.pdfExportsPerMonth,
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

  // ==================== ФУНКЦИИ УДАЛЕНИЯ И СБРОСА ====================
  const handleDeleteRevenue = useCallback(
    async (id) => {
      const ok = await deleteRevenueFromSupabase(id);
      if (!ok) {
        alert("Impossible de supprimer ce revenu.");
        return;
      }
      await refreshRevenues();
    },
    [deleteRevenueFromSupabase, refreshRevenues],
  );

  function handleReset() {
    localStorage.removeItem(LS_KEY);

    setAppView("landing");
    setStepIndex(0);
    setAnswers({});
    setInput("");
    setUserName("");
    setHelpOpen(false);
    setIsTyping(false);
    setFocusMode(false);
    setHasDraft(false);
    setLastSavedAt(null);
    setRestoredAt(null);

    setMessages([
      {
        role: "bot",
        text: "Bonjour 👋 On recommence. Réponds simplement.",
      },
      {
        role: "bot",
        text: `Étape 1 — ${FISCAL_STEPS[0].title}\n${FISCAL_STEPS[0].question}`,
      },
    ]);

    setTimeout(() => {
      scrollToTopSection("hero");
    }, 120);
  }

  // Оставьте только goToView и используйте везде
  const goToAssistant = useCallback(() => {
    goToView("assistant", { push: true, focus: true });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        assistantRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    });
  }, [goToView]);

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

  function handleRevenueFieldChange(field, value) {
    setRevenueForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function calculateNextReminder(frequency) {
    const today = new Date();

    if (frequency === "mensuel") {
      // За 7 дней до конца следующего месяца
      const nextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0);
      nextMonth.setDate(nextMonth.getDate() - 7);
      return nextMonth.toISOString();
    }

    if (frequency === "trimestriel") {
      // За 7 дней до конца квартала
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

  const saveFiscalProfileToSupabase = useCallback(async (profileAnswers) => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      if (userError && userError.message !== "Auth session missing") {
        console.error("User not found:", userError?.message);
      }
      return;
    }

    if (!fiscalProfileLoaded) {
      return;
    }

    const planToPersist = persistedPlan || defaultGuestPlan;

    const payload = {
      user_id: user.id,
      plan: planToPersist,
      business_status:
        profileAnswers.entry_status === "micro_yes"
          ? "micro_entreprise"
          : "other",
      activity_type: profileAnswers.activity_type,
      declaration_frequency: profileAnswers.declaration_frequency,
      tva_mode: "franchise_en_base",
      acre: profileAnswers.acre || null,
      acre_start_date: profileAnswers.acre_start_date || null,
      business_start_date: profileAnswers.business_start_date || null, // ✅ AJOUTER
    };

    if (planToPersist === "beta_founder" && !fiscalProfile?.trial_started_at) {
      payload.trial_started_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("fiscal_profiles")
      .upsert(payload, { onConflict: "user_id" });

    if (error) {
      console.error("Fiscal profile upsert error:", error.message);
    } else {
      console.log("Fiscal profile saved ✅");

      const nextRemindAt = calculateNextReminder(
        profileAnswers.declaration_frequency,
      );

      if (nextRemindAt) {
        await supabase.from("reminders").upsert(
          {
            user_id: user.id,
            reminder_type: "declaration",
            reminder_date: nextRemindAt.slice(0, 10),
            status: "pending",
          },
          { onConflict: "user_id" },
        );
      }
    }
  }, [
    defaultGuestPlan,
    fiscalProfile?.trial_started_at,
    fiscalProfileLoaded,
    persistedPlan,
  ]);

  async function deleteRevenueFromSupabase(id) {
    const { error } = await supabase.from("revenues").delete().eq("id", id);

    if (error) {
      console.error("Revenue delete error:", error.message);
      return false;
    }

    return true;
  }

  async function saveRevenueToSupabase(revenue) {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("User not authenticated:", userError?.message);
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

async function saveReminderPrefsToSupabase() {
  try {
    if (!user) return false;
    const normalizedReminderPrefs = {
      ...reminderPrefs,
      sms: hasSmsPremiumAccess ? reminderPrefs.sms : false,
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
      console.error("Reminder prefs update error:", error.message);
      return false;
    }

    await refreshFiscalProfile();
    return true;
  } catch (error) {
    console.error("Unexpected reminder prefs error:", error);
    return false;
  }
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

    const rate =
      computed?.rate || getEstimatedRate(dashboardAnswers.activity_type);
    const charges = Math.round(amount * rate);
    const disponible = Math.max(0, amount - charges);

    setSaveNotice(
      `Revenu enregistré • charges estimées : ${charges.toLocaleString("fr-FR")} € • disponible estimé : ${disponible.toLocaleString("fr-FR")} €`,
    );

    setShowAddRevenue(false);
    resetRevenueForm();

    setTimeout(() => {
      setSaveNotice(null);
    }, 2500);

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
      localStorage.setItem("revenues_guest", JSON.stringify(updatedRevenues));

      setShowAddRevenue(false);
      resetRevenueForm();

      setSaveNotice(
        `Revenu enregistré localement • ${revenueAmount.toLocaleString("fr-FR")} €`,
      );
      setTimeout(() => setSaveNotice(null), 2500);

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
    if (filteredRevenues.length === 0) return;

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
  }

function incrementPdfExportCount() {
  const nextCount = pdfExportCount + 1;
  setPdfExportCount(nextCount);

  const key = `microassist_pdf_exports_${new Date().getFullYear()}_${new Date().getMonth() + 1}`;
  localStorage.setItem(key, String(nextCount));
}

const handleExportPDF = useCallback(async () => {
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
      `Chiffre d affaires du mois : ${currentMonthTotal.toLocaleString("fr-FR")} €`,
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

function handleExportPDFWithLimit() {
  if (!guardPremiumAccess("pdf_export_limit", "pdf_export_limit")) {
    return;
  }

  handleExportPDF();
  incrementPdfExportCount();
}
  

  function handleSend() {
    if (!canSend || isTyping) return;

    const userText = input.trim();
    setInput("");

    submitAnswer({ chatText: userText, value: userText });
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
      goNext(forcedNextIndex);
    }, 250);
  }

  function handleSelectOption(opt) {
    if (isTyping) return;
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

function handleOpenSaveModal(source = "unknown") {
  track("pricing_modal_opened", { source });
  setShowPricingModal(true);
}

const handlePremiumWaitlistCTA = useCallback(() => {
  track("signup_cta_clicked", {
    source: isTrialExpired ? "premium_after_trial" : "pricing_modal",
  });
  setShowPricingModal(false);
  if (!user) {
    setAuthOpen(true);
    return;
  }
  setAuthOpen(true);
}, [isTrialExpired, user]);

  function handleEditProfile() {
    setAppView("assistant");
    setAssistantCollapsed(false);
    setStepIndex(0);
    setHelpOpen(false);

    setAnswers({
      activity_type: dashboardAnswers.activity_type,
      declaration_frequency: dashboardAnswers.declaration_frequency,
      acre: dashboardAnswers.acre,
      acre_start_date: dashboardAnswers.acre_start_date,
      business_start_date: dashboardAnswers.business_start_date,
      monthly_expenses: dashboardAnswers.monthly_expenses,
      // другие поля, если есть
    });

    setMessages([
      {
        role: "bot",
        text: "Bonjour 👋 On va mettre à jour ton profil fiscal. Réponds simplement.",
      },
      {
        role: "bot",
        text: `Étape 1 — ${FISCAL_STEPS[0].title}\n${FISCAL_STEPS[0].question}`,
      },
    ]);

    setTimeout(() => {
      assistantRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);
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
                localStorage.setItem("beta_seen", "1");
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

            <input
              className="nameInput"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Ton prénom"
              aria-label="Ton prénom"
            />

            {userName && (
              <div className="helloMini">Bonjour, {userName} 👋</div>
            )}
            {profileLine && <div className="profileMini">{profileLine}</div>}
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
          </div>
        </header>

        <main className={`container ${focusMode ? "focusMode" : ""}`}>
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
                        setAuthOpen(true);
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
                    onClick={() => setAuthOpen(true)}
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

          {focusMode && (
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
                    <h2>Créer mon profil fiscal</h2>

                    <div className="profileStatus">
                      {profileReady ? (
                        <span className="statusOk">
                          🟢 Profil fiscal configuré
                        </span>
                      ) : (
                        <span className="statusWarn">
                          🟡 Profil à compléter
                        </span>
                      )}
                    </div>

                    {revenues.length > 0 && (
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
                    {profileReady && (
                      <button
                        className="btn btnPrimary btnSmall"
                        onClick={goToDashboard}
                        type="button"
                      >
                        Accéder à mon espace fiscal
                      </button>
                    )}
                    {hasDraft && (
                      <button
                        className="btn btnGhost btnSmall"
                        onClick={handleResumeDraft}
                        type="button"
                      >
                        Reprendre
                      </button>
                    )}
                  </div>

                  <p className="muted assistantIntro">
                    Configure ton profil en quelques étapes pour obtenir un
                    repère fiscal clair.
                  </p>

                  <ul className="assistantBenefits">
                    <li>une estimation simple de tes charges</li>
                    <li>un repère sur ta prochaine échéance</li>
                    <li>une vision claire de ta TVA</li>
                    <li>
                      un accès à ton espace fiscal pour suivre tes revenus
                    </li>
                  </ul>
                </div>

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
              </div>

              {assistantCollapsed ? (
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
              ) : (
                <div className="chat">
                  <div className="chatLog">
                    {messages.map((m, idx) => (
                      <div key={idx} className={`msg ${m.role}`}>
                        {m.text.split("\n").map((line, i) => (
                          <div key={i}>{line}</div>
                        ))}
                      </div>
                    ))}

                    {isTyping && (
                      <div className="msg bot typing">
                        <span className="typingDots">
                          <span className="dot" />
                          <span className="dot" />
                          <span className="dot" />
                        </span>
                        <span className="typingText">L’assistant écrit…</span>
                      </div>
                    )}

                    <div ref={chatEndRef} />
                  </div>

                  {step?.mode === "choice" ? (
                    <div className="choiceZone">
                      <div className="stepMiniHeader">
                        <span className="stepMiniBadge">
                          Étape {stepIndex + 1}
                        </span>
                        <span className="stepMiniTitle">{step?.title}</span>
                      </div>

                      <div className="choiceRow">
                        {step.options?.map((opt) => (
                          <button
                            key={opt.value}
                            className="btn btnChoice"
                            onClick={() => handleSelectOption(opt)}
                            disabled={isTyping}
                            type="button"
                          >
                            {opt.label}
                          </button>
                        ))}

                        {step.help && (
                          <button
                            className="btn btnGhost btnHelp"
                            onClick={() => setHelpOpen((v) => !v)}
                            type="button"
                          >
                            ❓
                          </button>
                        )}
                      </div>

                      {helpOpen && step.help && (
                        <div className="helpBox" role="note">
                          {step.help}
                        </div>
                      )}
                    </div>
                  ) : step?.mode === "dashboard" ? (
                    <div className="dashboardZone">
                      <div className="assistantSummaryBox">
                        <h3>Ton profil</h3>

                        <ul className="assistantSummaryList">
                          <li>
                            <strong>Activité :</strong>{" "}
                            {labelFromOptions(
                              "activity_type",
                              answers.activity_type,
                            ) || "—"}
                          </li>
                          <li>
                            <strong>Déclaration :</strong>{" "}
                            {labelFromOptions(
                              "declaration_frequency",
                              answers.declaration_frequency,
                            ) || "—"}
                          </li>
                        </ul>
                      </div>

                      {computed?.recommendations?.length > 0 && (
                        <div className="dashRecs">
                          <div className="dashRecsTitle">À retenir</div>

                          <div className="dashRecsList">
                            {computed.recommendations.map((r) => (
                              <div
                                key={r.key}
                                className={[
                                  "dashRecItem",
                                  r.level === "danger" ? "recDanger" : "",
                                  r.level === "warning" ? "recWarning" : "",
                                  r.level === "ok" ? "recOk" : "",
                                ]
                                  .join(" ")
                                  .trim()}
                              >
                                <div className="dashRecTitle">{r.title}</div>
                                <div className="dashRecText">{r.text}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {computed?.acreHint && (
                        <div className="tvaWarning">{computed.acreHint}</div>
                      )}

                      <div className="assistantNextStep">
                        <div className="assistantNextStepTitle">
                          Voilà ta situation
                        </div>

                        <ul
                          className="assistantSummaryList"
                          style={{ marginTop: 12 }}
                        >
                          <li>
                            <strong>💰 À mettre de côté :</strong>{" "}
                            {computed?.estimatedAmount?.toLocaleString(
                              "fr-FR",
                            ) ?? "—"}{" "}
                            €
                          </li>
                          <li>
                            <strong>📅 Prochaine déclaration :</strong>{" "}
                            {computed?.deadlineLabel || "—"}
                          </li>
                          <li>
                            <strong>⚠️ TVA :</strong>{" "}
                            {computed?.tvaStatus === "exceeded"
                              ? "seuil dépassé"
                              : computed?.tvaStatus === "soon"
                                ? "vigilance"
                                : "aucun risque immédiat"}
                          </li>
                         <li>
  <strong>🧾 ACRE :</strong>{" "}
  {computed?.acreStatus === "active"
    ? "taux réduit actif"
    : computed?.acreStatus === "expired"
    ? "terminée"
    : "non renseignée"}
</li>
<div style={{ marginTop: 12 }}>
  <a
    href="https://autoentrepreneur.urssaf.fr"
    target="_blank"
    rel="noopener noreferrer"
    className="btn btnGhost btnSmall"
  >
    📅 Déclarer mon CA sur URSSAF →
  </a>
</div>
                        </ul>

                        
                        {/* Dans assistant, après la ligne TVA */}

                        {computed?.cfeAlert?.show && (
                          <div style={{ marginTop: 8 }}>
                            <span>🏛️ CFE :</span>
                            <strong>
                              {computed.cfeAlert.estimatedAmount
                                ? ` environ ${computed.cfeAlert.estimatedAmount}€`
                                : ` ${computed.cfeAlert.message}`}
                              {computed.businessYear === 2 && " (2ème année)"}
                            </strong>
                          </div>
                        )}

                        <div
                          className="mainActionBox ok"
                          style={{ marginTop: 16 }}
                        >
                          <div className="mainActionTitle">
                            Ce que tu dois faire maintenant
                          </div>
                          <div className="mainActionText">
                            Mets de côté environ{" "}
                            {computed?.estimatedAmount?.toLocaleString(
                              "fr-FR",
                            ) ?? "—"}{" "}
                            € et pense à vérifier ta situation avant ta
                            prochaine déclaration.
                          </div>
                        </div>


                        <div className="miniActions" style={{ marginTop: 12 }}>
                          <button
                            className="btn btnPrimary"
                            type="button"
                            onClick={() => {
                              setAppView("dashboard");
                              setTimeout(() => {
                                fiscalRef.current?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "start",
                                });
                              }, 100);
                            }}
                          >
                            Accéder à mon espace fiscal
                          </button>
<button
  className="btn btnGhost"
  type="button"
  onClick={() => {
    if (!user) {
      handleOpenSaveModal("save_followup_button");
    } else {
      setSaveNotice(
        "Ton profil fiscal, tes revenus et ton historique sont déjà liés à ton espace personnel sécurisé."
      );
      setTimeout(() => setSaveNotice(null), 3500);
    }
  }}
>
  Sauvegarder mon suivi
</button>

                          <button
                            className="btn btnGhost"
                            type="button"
                            onClick={handleDownloadTxt}
                          >
                            Télécharger mon résumé
                          </button>
                        </div>
                      </div>

                      {saveNotice && (
  <div
    style={{
      marginTop: 12,
      padding: "10px 12px",
      borderRadius: 10,
      background: "#f0fdf4",
      border: "1px solid #bbf7d0",
      color: "#166534",
      fontSize: 14,
    }}
  >
    {typeof saveNotice === "string" ? (
      <div style={{ fontWeight: 500 }}>{saveNotice}</div>
    ) : (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>{saveNotice.title}</div>
        <div>{saveNotice.body}</div>
        {saveNotice.cta === "auth" && (
          <div>
            <button
              className="btn btnGhost btnSmall"
              type="button"
              onClick={() => setAuthOpen(true)}
            >
              Créer mon compte
            </button>
          </div>
        )}
      </div>
    )}
  </div>
)}

                      <div className="disclaimer">
                        ⚠️ Indication simplifiée. Ne remplace pas un
                        expert-comptable.
                      </div>

                      <div className="miniActions">
                        <button
                          className="btn btnGhost"
                          type="button"
                          onClick={handleReset}
                        >
                          Recommencer
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="chatInput">
                        <input
                          ref={inputRef}
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder={step?.placeholder || "Écris ici…"}
                          aria-label="Message"
                          disabled={isTyping}
                        />
                        <button
                          className="btn"
                          onClick={handleSend}
                          disabled={!canSend || isTyping}
                          type="button"
                        >
                          Envoyer
                        </button>
                      </div>

                      <div className="autoSaveHint" aria-live="polite">
                        💾 Sauvegarde locale dans ton navigateur.
                      </div>
                    </>
                  )}

                  {(step?.mode === "dashboard" ||
                    stepIndex >= FISCAL_STEPS.length) && (
                    <div className="miniActions">
                      <button
                        className="btn btnGhost"
                        onClick={handleDownloadTxt}
                        type="button"
                      >
                        Télécharger
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {appView === "dashboard" && (
            <section ref={fiscalRef} className="card">
              <div className="sectionHead">
                <div>
                  <h2>Mon espace fiscal</h2>
                  <p className="muted" style={{ marginTop: 6 }}>
                    Garde une vue claire sur tes revenus, tes charges et tes
                    échéances.
                  </p>
                </div>

                {effectivePlan === "beta_founder" && isTrialActive && (
  <div
    style={{
      marginTop: 10,
      display: "inline-flex",
      flexDirection: "column",
      gap: 2,
      padding: "10px 14px",
      borderRadius: 14,
      background: "#f5f3ff",
      border: "1px solid #ddd6fe",
      color: "#6d28d9",
    }}
  >
    <div style={{ fontSize: 13, fontWeight: 700 }}>
      🎁 Founder Beta actif
    </div>
    <div style={{ fontSize: 12, color: "#7c3aed" }}>
      {trialDaysLeft !== null
  ? `Accès privilégié • ${trialDaysLeft} jours restants`
  : "Accès privilégié pendant la phase de test"}
    </div>
  </div>
)}

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
  onClick={() => setShowReminderModal(true)}
>
  🔔 Gérer mes rappels
</button>

<span className="muted" style={{ fontSize: 12 }}>
  {invoicesThisMonth}/{currentPlanLimits.invoicesPerMonth === Infinity ? "∞" : currentPlanLimits.invoicesPerMonth}
</span>

                </div>
              </div>

              {saveNotice && (
                <div className="saveNotice">
                  {typeof saveNotice === "string" ? (
                    <>✅ {saveNotice}</>
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      <div style={{ fontWeight: 700 }}>{saveNotice.title}</div>
                      <div>{saveNotice.body}</div>
                      {saveNotice.cta === "auth" && (
                        <div>
                          <button
                            className="btn btnGhost btnSmall"
                            type="button"
                            onClick={() => setAuthOpen(true)}
                          >
                            Créer mon compte
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="monthActionCard">
                <div className="monthActionHeader">
                  <h3>Ce mois-ci</h3>
                  <p className="muted">
                    Voici l’essentiel à retenir pour avancer sans stress.
                  </p>
                </div>

                <div className="monthActionGrid">
                  <div className="monthActionItem">
                    <span>💰 À mettre de côté</span>
                    <strong>
                      {estimatedCharges.toLocaleString("fr-FR")} €
                    </strong>
                  </div>

                  <div className="monthActionItem">
                    <span>📅 Prochaine déclaration</span>
                    <strong>
                      {computed?.nextDeadlineLabel ||
                        fiscalTimeline?.[0]?.value ||
                        "—"}
                    </strong>
                  </div>

                  

                  <div className="monthActionItem">
                    <span>⚠️ TVA</span>
                    <strong>
                      {computed?.tvaStatus === "exceeded"
                        ? "seuil dépassé"
                        : computed?.tvaStatus === "soon"
                          ? "vigilance"
                          : "aucun risque immédiat"}
                    </strong>
                  </div>

                  <div className="timelineItem">
                    <div className="timelineTop">
                      <span className="timelineIcon">🧾</span>
                      <span className="timelineLabel">TVA</span>
                    </div>
                    <div className="timelineValue">
                      {computed?.tvaStatusLabel || "À vérifier"}
                    </div>
                    <div className="timelineHint">
                      {computed?.tvaHint || "Repère TVA"}
                      {computed?.tvaStatus === "exceeded" && (
                        <button
                          onClick={() => setShowTVAModal(true)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#f97316",
                            cursor: "pointer",
                            fontSize: 12,
                            marginLeft: 8,
                          }}
                        >
                          En savoir plus →
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div
                  className={[
                    "mainActionBox",
                    mainAction.level === "danger" ? "danger" : "",
                    mainAction.level === "warning" ? "warning" : "",
                    mainAction.level === "ok" ? "ok" : "",
                  ]
                    .join(" ")
                    .trim()}
                  style={{ marginTop: 16 }}
                >
                  <div className="mainActionTitle">Action recommandée</div>
                  <div className="mainActionText">{mainAction.text}</div>

<div style={{ marginTop: 12 }}>
  <a
    href="https://autoentrepreneur.urssaf.fr"
    target="_blank"
    rel="noopener noreferrer"
    className="btn btnGhost btnSmall"
  >
    📅 Déclarer mon CA sur URSSAF →
  </a>
</div>

                  {mainAction.cta && (
                    <button
                      className="btn btnPrimary"
                      type="button"
                      onClick={() => handleTipAction(mainAction.action)}
                    >
                      {mainAction.cta}
                    </button>
                  )}
                </div>
              </div>

              {/* Анонс Premium */}
{effectivePlan === "beta_founder" && isTrialActive ? (
  <div className="premiumBanner">
    <span>
      🎁{" "}
      {trialDaysLeft !== null
        ? `${trialDaysLeft} jours gratuits restants`
        : "3 premiers mois gratuits"}{" "}
      ! Ensuite 5€/mois. Sans engagement.
    </span>

    <button
      className="btn btnGhost btnSmall"
      type="button"
      onClick={() => handleOpenSaveModal("founder_banner")}
    >
      En savoir plus
    </button>
  </div>
) : (
  <div className="premiumBanner">
    <span>✨ Passe à Premium pour conserver ton historique et tes alertes.</span>

    <button
      className="btn btnGhost btnSmall"
      type="button"
      onClick={() => handleOpenSaveModal("premium_after_trial")}
    >
      Découvrir l’offre
    </button>
  </div>
)}

              {/* 👇 NOUVELLE PODKAZKA - AJOUTER ICI */}
              {currentMonthTotal === 0 && dashboardAnswers?.activity_type && (
                <div
                  className="assistantNextStep"
                  style={{
                    marginBottom: 18,
                    background: "#fef9e3",
                    border: "1px solid #fde68a",
                  }}
                >
                  <div className="assistantNextStepTitle">
                    💡 Commence ton suivi
                  </div>
                  <p className="muted" style={{ marginTop: 4 }}>
                    Ton profil est configuré. Ajoute ton premier revenu pour
                    voir tes charges estimées, ton disponible et tes repères
                    fiscaux personnalisés.
                  </p>
                  <div className="miniActions" style={{ marginTop: 12 }}>
                    <button
                      className="btn btnPrimary"
                      type="button"
                      onClick={handleOpenRevenuePopup}
                    >
                      + Ajouter mon premier revenu
                    </button>
                  </div>
                </div>
              )}

              {/* Cartes principales */}
              <div className="fiscalDashboard">
                <div className="fiscalCard">
                  <div className="fiscalLabel">Revenus</div>
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
                    {estimatedCharges.toLocaleString("fr-FR")} €
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    Estimation selon ton activité
                  </div>
                </div>

                <div className="fiscalCard">
                  <div className="fiscalLabel">Disponible</div>
                  <div className="fiscalValue">
                    {availableAmount.toLocaleString("fr-FR")} €
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    Après estimation des charges
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

              <section className="card">
  <div className="sectionHead">
  <h2>🔔 Mes rappels actifs</h2>
  <button
    className="btn btnGhost btnSmall"
    type="button"
    onClick={() => setShowReminderModal(true)}
  >
    Gérer
  </button>
</div>

<p className="muted" style={{ marginTop: 0 }}>
  Voici les rappels actuellement activés dans ton espace.
</p>

<div
  style={{
    display: "grid",
    gap: 12,
    marginTop: 14,
  }}
>
  {reminderPrefs.declaration && (
    <div className="kpi">
      <div className="kpiLabel">Déclaration URSSAF</div>
      <div className="kpiValue">
        {computed?.deadlineLabel || "Prochaine échéance à venir"}
      </div>

      <button
        className="btn btnGhost btnSmall"
        type="button"
        onClick={() =>
          window.open("https://www.autoentrepreneur.urssaf.fr", "_blank")
        }
        style={{ marginTop: 8 }}
      >
        Déclarer
      </button>
    </div>
  )}

  {reminderPrefs.tva && (
    <div className="kpi">
      <div className="kpiLabel">TVA</div>
      <div className="kpiValue">
        {computed?.tvaStatusLabel || "Alerte TVA activée"}
      </div>

      <button
        className="btn btnGhost btnSmall"
        type="button"
        onClick={() => setShowTVAModal(true)}
        style={{ marginTop: 8 }}
      >
        Voir seuil
      </button>
    </div>
  )}

  {reminderPrefs.cfe && (
    <div className="kpi">
      <div className="kpiLabel">CFE</div>
      <div className="kpiValue">
        {computed?.cfeAlert?.show
          ? computed?.cfeAlert?.message
          : "Rappel CFE activé"}
      </div>

      <button
        className="btn btnGhost btnSmall"
        type="button"
        onClick={() => setShowCFEModal(true)}
        style={{ marginTop: 8 }}
      >
        Comprendre
      </button>
    </div>
  )}

  {reminderPrefs.acre && (
    <div className="kpi">
      <div className="kpiLabel">Fin ACRE</div>
      <div className="kpiValue">
        {computed?.acreHint || "Rappel fin ACRE activé"}
      </div>

      <button
        className="btn btnGhost btnSmall"
        type="button"
        onClick={handleEditProfile}
        style={{ marginTop: 8 }}
      >
        Modifier profil
      </button>
    </div>
  )}

  <div className="kpi">
    <div className="kpiLabel">Canal</div>
    <div className="kpiValue">
      {[
        reminderPrefs.email ? "Email" : null,
        reminderPrefs.sms ? "SMS urgent" : null,
      ]
        .filter(Boolean)
        .join(" • ") || "Aucun"}
    </div>
  </div>
</div>
</section>

              {/* Analyse financière */}
              {computed.monthlyExpenses !== undefined && (
                <div className="financialAnalysis" style={{ marginTop: 24 }}>
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

              {/* Добавьте после fiscalDashboard */}
              {currentMonthTotal > 0 && (
                <div
                  className="progressIndicators"
                  style={{ marginTop: 20, display: "grid", gap: 12 }}
                >
                  <div className="progressItem">
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 4,
                      }}
                    >
                      <span>💰 Objectif d'épargne</span>
                      <span>
                        {Math.min(
                          100,
                          Math.round((savingsProgress / savingsGoal) * 100),
                        )}
                        %
                      </span>
                    </div>
                    <div
                      className="progressBar"
                      style={{
                        height: 8,
                        background: "#e5e7eb",
                        borderRadius: 4,
                      }}
                    >
                      <div
                        className="progressFill"
                        style={{
                          width: `${Math.min(100, Math.round((savingsProgress / savingsGoal) * 100))}%`,
                          background:
                            savingsProgress >= savingsGoal
                              ? "#10b981"
                              : "#f59e0b",
                          borderRadius: 4,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ACRE Expiration Warning */}
{acreExpiration && !acreExpiration.expired && computed?.acreStatus !== "expired" && (
  <div className="acreExpirationWarning"
                  style={{
                    marginTop: 16,
                    padding: "14px 16px",
                    borderRadius: 12,
                    background: acreExpiration.warning ? "#fff5f0" : "#f0f9ff",
                    borderLeft: `4px solid ${acreExpiration.warning ? "#f97316" : "#3b82f6"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flex: 1,
                    }}
                  >
                    <span style={{ fontSize: 20 }}>
                      {acreExpiration.warning ? "⚠️" : "💡"}
                    </span>
                    <span style={{ fontSize: 14, color: "#374151" }}>
                      {acreExpiration.message}
                    </span>
                  </div>
                  <button
                    onClick={handleEditProfile}
                    className="btn btnGhost btnSmall"
                    style={{ whiteSpace: "nowrap" }}
                  >
                    Modifier mon profil
                  </button>
                </div>
              )}

              {/* Main action */}

              {/* Santé financière */}
              {computed.financialHealth && computed.financialHealthMessage && (
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

              {/* Smart tips */}
              {smartTips.length > 0 && (
                <div className="smartTips">
                  <h3>Recommandations</h3>
                  <div className="smartTipsList">
                    {smartTips.map((tip) => (
                      <div
                        key={tip.key}
                        className={[
                          "smartTipCard",
                          tip.level === "danger" ? "tipDanger" : "",
                          tip.level === "warning" ? "tipWarning" : "",
                          tip.level === "ok" ? "tipOk" : "",
                        ]
                          .join(" ")
                          .trim()}
                      >
                        <div className="smartTipTitle">{tip.title}</div>
                        <div className="smartTipText">{tip.text}</div>
                        {tip.cta && (
                          <div className="smartTipActions">
                            <button
                              className="btn btnGhost btnSmall"
                              type="button"
                              onClick={() => handleTipAction(tip.action)}
                            >
                              {tip.cta}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
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
              {/* Journal des revenus */}
              <div className="journalHeader">
                <div>
                  <h3>Mes revenus</h3>
                  <p className="muted" style={{ marginTop: 4 }}>
                    Retrouve ton historique et télécharge ton suivi si besoin.
                  </p>
                </div>
                <div className="journalFilters">
                  <button
                    className="btn btnGhost btnSmall"
                    type="button"
                    onClick={handleExportCSV}
                    disabled={filteredRevenues.length === 0}
                    title="Exporter les revenus affichés"
                  >
                    Export CSV
                  </button>

                  <button
                    className="btn btnGhost btnSmall"
                    type="button"
                    onClick={handleExportPDFWithLimit}
                    disabled={revenues.length === 0}
                  >
                    📄 Export PDF
                  </button>

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
                          className="btn btnGhost btnSmall"
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
                  <h3>Historique mensuel</h3>
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
                </div>
              )}

              {/* ===== MES FACTURES ===== */}
              <div id="invoices-section" style={{ marginTop: 32 }}>
                <div className="journalHeader">
                  <h3>Mes factures</h3>
                  <button
                    className="btn btnPrimary btnSmall"
                    type="button"
                    onClick={handleOpenInvoiceGenerator}
                  >
                    + Nouvelle facture
                  </button>
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
                              onClick={() => setAuthOpen(true)}
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
                  <div className="emptyRevenueState">
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
                🔒 Ton profil fiscal, tes revenus et ton historique sont liés à
                ton espace personnel sécurisé.
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
                    Connexion par lien magique envoyé par email.
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
              <span>Assistant fiscal pour micro-entrepreneurs</span>
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
            onClose={() => setAuthOpen(false)}
            onSuccess={async () => {
              track("signup_success", { source: "auth_gate" });
              setAuthOpen(false);
              // Attendre que l'utilisateur soit chargé
              setTimeout(async () => {
                await migrateLocalDataToSupabase();
                await refreshRevenues();
                await refreshFiscalProfile();
                setSaveNotice(
                  "Connexion réussie ✅ Ton profil fiscal, tes revenus et ton historique sont maintenant enregistrés dans ton espace personnel sécurisé.",
                );
                setTimeout(() => setSaveNotice(null), 3000);
              }, 500);
            }}
          />
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
            onClick={() => setShowPricingModal(false)}
          >
            <div
              className="modalCard"
              style={{ maxWidth: "520px" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sectionHead">
                <h3>Premium arrive bientôt ✨</h3>
                <button
                  className="iconBtn"
                  onClick={() => setShowPricingModal(false)}
                  type="button"
                >
                  ✕
                </button>
              </div>

  <div style={{ marginTop: 20 }}>
  <p style={{ fontSize: 14, lineHeight: 1.6, marginTop: 0, marginBottom: 0 }}>
  La version Premium est en cours de finalisation.
  <br />
  Laisse ton email pour être informé(e) dès l’ouverture.
</p>

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
  Ouverture prochaine
  </div>
  <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>
    Tu peux déjà laisser ton email pour recevoir l’accès en avant-première.
  </p>
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
      <li>✔ Historique complet de tes revenus</li>
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
  onClick={handlePremiumWaitlistCTA}
  style={{ flex: 1 }}
>
  Recevoir l’accès en avant-première
</button>

    <button
      className="btn btnGhost"
      type="button"
      onClick={() => setShowPricingModal(false)}
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
                <h3>🏛️ La CFE en bref</h3>
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
              refreshInvoices();
              setInvoiceNotice(message || "Facture enregistrée ✅");
            } else if (invoice) {
              setGuestInvoices((prev) => {
                const next = [invoice, ...prev];
                localStorage.setItem("guest_invoices", JSON.stringify(next));
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
            onClick={async () => {
  track("reminder_preferences_saved", reminderPrefs);
  const normalizedReminderPrefs = {
    ...reminderPrefs,
    sms: hasSmsPremiumAccess ? reminderPrefs.sms : false,
  };

  // SMS = premium après période beta
  if (!guardPremiumAccess("sms_premium", "sms_premium")) {
    return;
  }

  // localStorage backup
  localStorage.setItem(
    "microassist_reminder_prefs",
    JSON.stringify(normalizedReminderPrefs),
  );

  // sauvegarde Supabase si connecté
  const saved = await saveReminderPrefsToSupabase();

  if (saved || !user) {
    setShowReminderModal(false);
    setSaveNotice("Préférences de rappels enregistrées ✅");
    setTimeout(() => setSaveNotice(null), 3000);
  } else {
    setSaveNotice("Impossible d’enregistrer les préférences.");
    setTimeout(() => setSaveNotice(null), 3000);
  }
}}
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
