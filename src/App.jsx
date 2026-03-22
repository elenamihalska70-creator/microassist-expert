import { supabase } from "./lib/supabase.js";
/*import AuthGate from "./components/AuthGate.jsx";*/
import { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from "react"; // ✅ Добавляем useCallback
import "./App.css";
import { FISCAL_STEPS } from "./config/steps.fiscal";
import { computeObligations } from "./utils/obligations.js";
import { showConsoleSignature } from "./consoleSignature.js";
import { useAuth } from "./context/AuthContext.jsx";

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

function buildFiscalChecklist( computed = {}) {
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
    items.push("• Continuer à enregistrer le chiffre d’affaires régulièrement.");
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
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [restoredAt, setRestoredAt] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  // UI состояния
  const [helpOpen, setHelpOpen] = useState(false);        // ✅ ДОБАВИТЬ
  /*const [authOpen, setAuthOpen] = useState(false);*/
  const [focusMode, setFocusMode] = useState(false);      // ✅ ДОБАВИТЬ
  const { user } = useAuth();
  const [appView, setAppView] = useState("landing");
  const [userName, setUserName] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [showSignupHint, setShowSignupHint] = useState(false);
  // Состояния для доходов
  const [showAddRevenue, setShowAddRevenue] = useState(false);
  const [revenues, setRevenues] = useState([]);
  const [showBetaNotice, setShowBetaNotice] = useState(() => {
  return !localStorage.getItem("beta_seen");
});
  const [resumeSaveAfterAuth, setResumeSaveAfterAuth] = useState(false); // ✅ ДОБАВИТЬ
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

  // useCallback для refreshFiscalProfile
  const refreshFiscalProfile = useCallback(async () => {
    if (!user) {
      setFiscalProfile(null);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("fiscal_profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          setFiscalProfile(null);
          return;
        }
        console.error("Load fiscal profile error:", error.message);
        setFiscalProfile(null);
        return;
      }

      setFiscalProfile(data);
    } catch (error) {
      console.error("Unexpected error in refreshFiscalProfile:", error);
      setFiscalProfile(null);
    }
  }, [user]);

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




const viewLabel =
  appView === "landing"
    ? "Assistant fiscal"
    : appView === "assistant"
      ? "Profil fiscal"
      : "Espace fiscal";

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
  const feedbackRef = useRef(null);
  const heroRef = useRef(null);
  const fiscalRef = useRef(null);
  const chartRef = useRef(null);
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
          if (status === 'SUBSCRIBED') {
            console.log('Realtime subscription active for revenues');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('Realtime subscription error');
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
          if (status === 'SUBSCRIBED') {
            console.log('Realtime subscription active for fiscal profile');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('Realtime subscription error for fiscal profile');
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

    const hasProfile = !!a.activity_type && !!a.declaration_frequency;

    if (hasProfile) {
      setAppView("dashboard");
      const dashIndex = getIndexByKey("fiscal_dashboard");
      if (dashIndex !== -1) nextIndex = dashIndex;
    } else {
      setAppView("assistant");
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
  const canSaveFiscalProfile =
    answers?.entry_status &&
    answers?.activity_type &&
    answers?.declaration_frequency;

  if (!canSaveFiscalProfile) return;

  // Добавляем debounce
  const timeoutId = setTimeout(() => {
    saveFiscalProfileToSupabase(answers);
  }, 2000);

  return () => clearTimeout(timeoutId);
}, [
  answers?.entry_status,
  answers?.activity_type,
  answers?.declaration_frequency,
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
}, []);

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

useEffect(() => {
  if (!user || !resumeSaveAfterAuth) return;

  async function resumePendingSave() {
    setResumeSaveAfterAuth(false);
    await saveRevenueEntry();
  }

  resumePendingSave();
}, [user, resumeSaveAfterAuth]);

const dashboardAnswers = useMemo(() => {
  // Проверяем наличие данных
  const hasActivity = answers?.activity_type || fiscalProfile?.activity_type;
  const hasFrequency = answers?.declaration_frequency || fiscalProfile?.declaration_frequency;
  
  // Если нет критических данных - возвращаем минимальный объект
  if (!hasActivity && !hasFrequency) {
    return {
      activity_type: null,
      declaration_frequency: null,
      _isComplete: false,
    };
  }
  
  return {
    ...answers,
    activity_type: answers?.activity_type || fiscalProfile?.activity_type || null,
    declaration_frequency: answers?.declaration_frequency || fiscalProfile?.declaration_frequency || null,
    _isComplete: !!(hasActivity && hasFrequency),
  };
}, [answers, fiscalProfile]);

  const currentMonthTotal = useMemo(() => {
    return revenues.reduce((sum, item) => {
      return sum + Number(item.amount || 0);
    }, 0);
  }, [revenues]);

const computed = useMemo(() => {
  // Проверяем, что профиль полный
  if (!dashboardAnswers?.activity_type || !dashboardAnswers?.declaration_frequency) {
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
    return computeObligations({
      ...dashboardAnswers,
      ca_month: currentMonthTotal,
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
}, [dashboardAnswers, currentMonthTotal]);

const activityLabel = useMemo(
  () => labelFromOptions("activity_type", dashboardAnswers.activity_type),
  [dashboardAnswers.activity_type]
);

const freqLabel = useMemo(
  () => labelFromOptions(
    "declaration_frequency",  // <- исправлено название
    dashboardAnswers.declaration_frequency
  ),
  [dashboardAnswers.declaration_frequency]
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



  const revenueAmount = Number(
  String(revenueForm.amount || "").replace(",", ".")
);

  function getEstimatedRate(activityType) {
    switch (activityType) {
      case "vente":
        return 0.123;
      case "services":
        return 0.22;
      case "mixte":
        return 0.18;
      default:
        return 0.22;
    }
  }

  const estimatedRate = useMemo(() => {
    return getEstimatedRate(dashboardAnswers.activity_type);
  }, [dashboardAnswers.activity_type]);

  const estimatedCharges = useMemo(() => {
    return Math.round(currentMonthTotal * estimatedRate);
  }, [currentMonthTotal, estimatedRate]);

  const availableAmount = useMemo(() => {
    return Math.max(0, currentMonthTotal - estimatedCharges);
  }, [currentMonthTotal, estimatedCharges]);

  const tvaWarning = useMemo(() => {
    const limit = 36800; // seuil TVA services
    const warningLevel = 0.8;

    if (!currentMonthTotal) return null;

    if (currentMonthTotal >= limit) {
      return "⚠️ Vous dépassez le seuil de TVA. La facturation de la TVA devient obligatoire.";
    }

    if (currentMonthTotal >= limit * warningLevel) {
      return "ℹ️ Attention : vous approchez du seuil de TVA.";
    }

    return null;
  }, [currentMonthTotal]);

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
        revenues.length > 0
          ? "Montant à mettre de côté"
          : "Ajoute un revenu",
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


function goToView(nextView, options = {}) {
  const { push = true, focus = false } = options;

  if (push) {
    window.history.pushState({ appView: nextView }, "");
  }

  setAppView(nextView);
  setFocusMode(focus);

  if (nextView === "assistant") {
    setAssistantCollapsed(false);
  }
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
    resetRevenueForm();
    setShowAddRevenue(true);
  }

  function handleCloseRevenuePopup() {
    setShowAddRevenue(false);
    resetRevenueForm();
  }

    // ==================== ФУНКЦИИ УДАЛЕНИЯ И СБРОСА ====================
  const handleDeleteRevenue = useCallback(async (id) => {
    const ok = await deleteRevenueFromSupabase(id);
    if (!ok) {
      alert("Impossible de supprimer ce revenu.");
      return;
    }
    await refreshRevenues();
  }, [deleteRevenueFromSupabase, refreshRevenues]);

  const handleReset = useCallback(() => {
    localStorage.removeItem(LS_KEY);
    setAppView("assistant");
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
        text: "Bonjour 👋 On recommence. Réponds simplement." 
      },
      { 
        role: "bot", 
        text: `Étape 1 — ${FISCAL_STEPS[0].title}\n${FISCAL_STEPS[0].question}` 
      },
    ]);
    setTimeout(() => scrollToTopSection("assistant"), 120);
  }, []);

// Оставьте только goToView и используйте везде
const goToAssistant = useCallback(() => {
  goToView("assistant", { push: true, focus: false });
  setTimeout(() => {
    assistantRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 100);
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

    async function deleteRevenueFromSupabase(id) {
    const { error } = await supabase.from("revenues").delete().eq("id", id);

    if (error) {
      console.error("Revenue delete error:", error.message);
      return false;
    }

    return true;
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

  const charges = Math.round(amount * estimatedRate);
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
    
    setShowSignupHint(true);
    setShowAddRevenue(false);
    resetRevenueForm();
    
    setSaveNotice(`Revenu enregistré localement • ${revenueAmount.toLocaleString("fr-FR")} €`);
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

  function handleCopySummary() {
    const summary =
      buildFiscalSummary(answers, computed) +
      "\n\n" +
      buildFiscalChecklist(computed);

    navigator.clipboard.writeText(summary);
    alert("Résumé copié dans le presse-papiers ✅");
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


async function saveFiscalProfileToSupabase(profileAnswers) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error("User not found:", userError?.message);
    return;
  }

  const payload = {
    user_id: user.id,
    business_status:
      profileAnswers.entry_status === "micro_yes"
        ? "micro_entreprise"
        : "other",
    activity_type: profileAnswers.activity_type,
    declaration_frequency: profileAnswers.declaration_frequency,
    tva_mode: "franchise_en_base",
  };

  const { error } = await supabase
    .from("fiscal_profiles")
    .upsert(payload, { onConflict: "user_id" });

  if (error) {
    console.error("Fiscal profile upsert error:", error.message);
  } else {
    console.log("Fiscal profile saved ✅");
  }
}

function handleNewSession() {
  handleReset();
  setTimeout(() => {
    scrollToTopSection("assistant");
  }, 120);
}

function goToLandingSection(sectionId = "home") {
  goToView("landing", { push: true, focus: false });

  setTimeout(() => {
    if (sectionId === "home") {
      heroRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      return;
    }

    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, 120);
}

function goToFeedback() {
  setAppView("landing");
  setFocusMode(false);

  setTimeout(() => {
    feedbackRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, 120);
}

function handleEditProfile() {
  setAppView("assistant");
  setAssistantCollapsed(false);
  setStepIndex(0);
  setHelpOpen(false);

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


const previewCharges = useMemo(() => {
  if (!Number.isFinite(revenueAmount) || revenueAmount <= 0) return 0;
  return Math.round(revenueAmount * estimatedRate);
}, [revenueAmount, estimatedRate]);

const previewAvailable = useMemo(() => {
  if (!Number.isFinite(revenueAmount) || revenueAmount <= 0) return 0;
  return Math.max(0, revenueAmount - previewCharges);
}, [revenueAmount, previewCharges]);

const previewRateLabel = useMemo(() => {
  return `${Math.round(estimatedRate * 1000) / 10} %`;
}, [estimatedRate]);

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
            🙏 Merci pour votre retour — il nous aidera à améliorer le produit.
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
  <button type="button" className="navLink" onClick={() => goToLandingSection("home")}>
    Accueil
  </button>
  <button type="button" className="navLink" onClick={() => goToLandingSection("services")}>
    Services
  </button>
  <button type="button" className="navLink" onClick={goToAssistant}>
    Assistant
  </button>
  <button type="button" className="navLink" onClick={goToFeedback}>
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
          <p>Combien prévoir ? Quand déclarer ?</p>
          <p>Obtiens un repère clair en quelques clics.</p>
        </div>

        <ul className="heroBullets">
          <li>✅ Charges estimées</li>
          <li>✅ Prochaine échéance</li>
          <li>✅ Alerte TVA</li>
          <li>✅ Plan d’action simple</li>
        </ul>

        <p className="assistantIntro">
          Réponds à quelques questions. C’est rapide.
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
            Commencer
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
          <div className="heroPanelTitle">
            Ce que tu obtiens
          </div>

          <div className="heroKpis">
            <div className="kpi">
              <div className="kpiLabel">Échéance</div>
              <div className="kpiValue">Mensuelle / Trimestrielle</div>
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

{!focusMode && appView === "landing" && visibleSections.about && (
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
      Microassist aide les micro-entrepreneurs à mieux comprendre leurs obligations
      fiscales et à suivre leur activité plus sereinement.
    </p>

    <p>
      L’objectif est simple : gagner du temps, réduire le stress administratif et
      rendre les échéances plus lisibles.
    </p>

    <p>
      En quelques étapes, l’outil fournit un repère clair sur les charges,
      les obligations à venir et le suivi du chiffre d’affaires.
    </p>
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
      <li>📊 Estimer rapidement tes charges selon ton activité</li>
      <li>💰 Suivre tes revenus et ton disponible estimé</li>
      <li>📅 Visualiser ta prochaine échéance</li>
      <li>🧾 Identifier les seuils et alertes TVA</li>
      <li>🧠 Garder un repère simple pour éviter les oublis</li>
    </ul>
  </section>
)}

{!focusMode && visibleSections.howItWorks && (
<section className="card">
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
      <strong>1. Tu configures ton profil</strong>
      <p>Tu indiques ton activité et ton rythme de déclaration.</p>
    </div>

    <div className="step">
      <strong>2. Tu accèdes à ton espace fiscal</strong>
      <p>Tu obtiens un repère clair sur tes charges estimées, ta TVA et tes échéances.</p>
    </div>

    <div className="step">
      <strong>3. Tu ajoutes tes revenus</strong>
      <p>Tu suis ton activité, ton disponible estimé et ton historique mensuel.</p>
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
      Microassist est un MVP en cours d’évolution, pensé pour aider les micro-entrepreneurs à garder un repère fiscal simple, clair et rassurant.
    </p>

    <h3 style={{ marginTop: 12 }}>✅ Pour qui ?</h3>
    <ul className="targetList">
      <li>Micro-entrepreneurs</li>
      <li>Freelances et indépendants</li>
      <li>Créateurs d’activité</li>
      <li>Profils qui veulent mieux anticiper leurs charges et échéances</li>
    </ul>

    <h3 style={{ marginTop: 12 }}>🚧 Prochainement</h3>
    <ul className="roadmaplist">
      <li>📌 Historique plus détaillé</li>
      <li>📅 Rappels et repères automatiques</li>
      <li>📄 Exports plus complets</li>
      <li>🧠 Conseils plus personnalisés selon le profil</li>
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
    <span className="statusOk">🟢 Profil fiscal configuré</span>
  ) : (
    <span className="statusWarn">🟡 Profil à compléter</span>
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
        {hasDraft && (
          <button
            className="btn btnGhost btnSmall"
            onClick={() => scrollToRef(assistantRef)}
            type="button"
          >
            Reprendre
          </button>
        )}
      </div>

     <p className="muted assistantIntro">
  Configure ton profil en quelques étapes pour obtenir un repère fiscal clair.
</p>

<ul className="assistantBenefits">
  <li>une estimation simple de tes charges</li>
  <li>un repère sur ta prochaine échéance</li>
  <li>une vision claire de ta TVA</li>
  <li>un accès à ton espace fiscal pour suivre tes revenus</li>
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
            ? `Sauvegardé à ${new Date(lastSavedAt).toLocaleTimeString([], {
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
        Étape <strong>{Math.min(stepIndex + 1, FISCAL_STEPS.length)}</strong> /{" "}
        {FISCAL_STEPS.length}
      </div>
    </div>
  </div>

  {assistantCollapsed ? (
    <div className="assistantCollapsedBox">
      <p className="muted">
        Ton repère est prêt.
      </p>

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
            <span className="stepMiniBadge">Étape {stepIndex + 1}</span>
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
        {labelFromOptions("activity_type", answers.activity_type) || "—"}
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

  {tvaWarning && <div className="tvaWarning">{tvaWarning}</div>}

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

  <div className="assistantNextStep">
    <div className="assistantNextStepTitle">Ton profil est prêt</div>

    <p className="muted">
      Accède à ton espace fiscal pour suivre tes revenus et tes charges.
    </p>

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
          goToView("dashboard", { push: true, focus: false });
          setTimeout(() => {
            fiscalRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
            setAuthOpen(true);
          }, 100);
        }}
      >
        Enregistrer mon suivi
      </button>
    </div>
  </div>

  <div className="disclaimer">
    ⚠️ Indication simplifiée. Ne remplace pas un expert-comptable.
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

      {(step?.mode === "dashboard" || stepIndex >= FISCAL_STEPS.length) && (
        <div className="miniActions">
          <button
            className="btn btnGhost"
            onClick={handleCopySummary}
            type="button"
          >
            Copier
          </button>

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
          Garde une vue claire sur tes revenus, tes charges et tes échéances.
        </p>
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
      </div>
    </div>

    {saveNotice && <div className="saveNotice">✅ {saveNotice}</div>}


   {!user && revenues.length > 0 && (
      <div className="assistantNextStep" style={{ marginBottom: 18 }}>
        <div className="assistantNextStepTitle">Enregistrer mon suivi</div>

        <p className="muted">
          Retrouve tes revenus, ton historique et tes repères à tout moment.
        </p>

        <div className="miniActions" style={{ marginTop: 12 }}>
          <button
            className="btn btnPrimary"
            type="button"
            onClick={() => setAuthOpen(true)}
          >
            Enregistrer
          </button>

          <button
            className="btn btnGhost"
            type="button"
            onClick={() => scrollToRef(assistantRef)}
          >
            Continuer sans enregistrer
          </button>
        </div>
      </div>
    )}

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

    <div
      className={[
        "mainActionBox",
        mainAction.level === "danger" ? "danger" : "",
        mainAction.level === "warning" ? "warning" : "",
        mainAction.level === "ok" ? "ok" : "",
      ]
        .join(" ")
        .trim()}
    >
      <div className="mainActionTitle">{mainAction.title}</div>
      <div className="mainActionText">{mainAction.text}</div>

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

    <div className="journalHeader">
      <h3>Mes revenus</h3>

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

              <div className="revenueDate">{formatRevenueDate(item.date)}</div>
            </div>
          <div className="revenueMeta">
  {item.client && <div><strong>Client :</strong> {item.client}</div>}
  {item.invoice && <div><strong>Facture :</strong> {item.invoice}</div>}
  {item.note && <div><strong>Note :</strong> {item.note}</div>}
</div>

{!user && showSignupHint && (
  <div className="saveNotice">
    💾 Sauvegarde ton espace pour ne rien perdre
    <div style={{ marginTop: 8 }}>
      <button className="btn btnPrimary" onClick={() => setAuthOpen(true)}>
        Créer mon espace
      </button>
    </div>
  </div>
)}

<div className="revenueActions">
  <button className="btn btnGhost btnSmall" onClick={() => handleDeleteRevenue(item.id)}>
    Supprimer
  </button>
</div>

          </div>
        ))}
      </div>
    )}

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
                  <div key={`${item.year}-${item.month}`} className="chartCol">
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
              <div key={`${m.year}-${m.month}`} className="historyItem">
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

    <div className="dataTrustLine">
      🔒 Les données enregistrées sont liées à votre espace personnel sécurisé.
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
      Les informations sont enregistrées dans un espace personnel sécurisé.
    </p>
  </div>

  <div className="securityItem">
    <strong>💳 Aucune donnée bancaire</strong>
    <p className="muted">
      Aucune carte bancaire ni IBAN ne sont demandés.
    </p>
  </div>

  <div className="securityItem">
    <strong>🚫 Pas d’accès direct aux services administratifs</strong>
    <p className="muted">
      Microassist ne se connecte pas automatiquement à l’URSSAF ni aux impôts.
    </p>
  </div>
</div>

<div className="securityNoteBox">
  <p>
    Microassist fournit des repères pratiques et un espace de suivi. Il ne
    remplace pas un expert-comptable.
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
                Ton retour m’aide à améliorer l’assistant. Le formulaire prend
                moins de 30 secondes.
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
      <strong>{previewAvailable.toLocaleString("fr-FR")} €</strong>
    </div>

    <div className="previewAdvice">
      💡 {previewAdvice}
    </div>
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

            <footer className="footer">
          © {new Date().getFullYear()} Microassist
        </footer>
{/*
{authOpen && (
  <AuthGate
    onClose={() => setAuthOpen(false)}
    onSuccess={() => setAuthOpen(false)}
  />
)}
*/}
      </div>
      </>
    );
}