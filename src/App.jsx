import { useState, useEffect, useMemo, useRef, useLayoutEffect } from "react";
import "./App.css";
import { FISCAL_STEPS as STEPS } from "./config/steps.fiscal";
import { computeObligations, getDashValue } from "./utils/obligations";
import { showConsoleSignature } from "./consoleSignature";

const LS_KEY = "microassist_v1";
const LS_VERSION = 1;
const REVENUES_KEY = "microassist_revenues_v1";
const UI_KEY = "microassist_ui_sections";

const DEFAULT_VISIBLE_SECTIONS = {
  about: true,
  services: true,
  howItWorks: true,
  roadmap: true,
  security: true,
  feedback: true,
};

function labelFromOptions(stepKey, value) {
  const step = STEPS.find((s) => s.key === stepKey);
  const opt = step?.options?.find((o) => o.value === value);
  return opt?.label || value || "—";
}

function track(eventName, params = {}) {
  if (window.gtag) window.gtag("event", eventName, params);
}

function buildFiscalSummary(answers = {}, computed = {}) {
  const lines = [];

  lines.push("✅ Résumé fiscal (MVP)");
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
  lines.push("⚠️ Note : estimation MVP — ne remplace pas un expert-comptable.");

  return lines.join("\n");
}

function buildFiscalChecklist(answers, computed) {
  const items = [];

  items.push("🧭 Plan d’action (simple)");

  if (typeof computed?.treasuryRecommended === "number") {
    items.push(
      `0) 💰 À garder de côté : ${computed.treasuryRecommended.toLocaleString("fr-FR")} € minimum.`,
    );
  }

  if (computed?.urgency === "late") {
    items.push(
      "1) Déclarer sur autoentrepreneur.urssaf.fr dès que possible (retard).",
    );
  } else if (computed?.urgency === "soon") {
    items.push(
      "1) Bloquer 10 minutes cette semaine pour déclarer sur autoentrepreneur.urssaf.fr.",
    );
  } else {
    items.push(
      "1) Garder ton CA à jour, puis déclarer à l’approche de l’échéance.",
    );
  }

  if (computed?.tvaStatus === "exceeded") {
    items.push(
      "2) TVA : vérifier ton régime (seuil dépassé) et anticiper facturation/déclaration.",
    );
  } else if (computed?.tvaStatus === "soon") {
    items.push(
      "2) TVA : surveiller ton CA (seuil proche) et préparer les mentions/paramétrages.",
    );
  } else {
    items.push("2) TVA : OK (franchise). Continuer à suivre ton CA.");
  }

  items.push(
    `3) Rappels : ${
      answers?.reminders_enabled ? "activés ✅" : "désactivés ⏸"
    } (recommandé : 48h avant).`,
  );

  if (computed?.recommendations?.length) {
    items.push("");
    items.push("✅ Recommandations");
    computed.recommendations.forEach((r, idx) => {
      items.push(`${idx + 1}) ${r.title} — ${r.text}`);
    });
  }

  return items.join("\n");
}

export default function App() {
  const [stepIndex, setStepIndex] = useState(0);
  const [assistantCollapsed, setAssistantCollapsed] = useState(false);
  const [answers, setAnswers] = useState({});
  const [input, setInput] = useState("");
  const [saveNotice, setSaveNotice] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [restoredAt, setRestoredAt] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [appView, setAppView] = useState("landing");
  const [userName, setUserName] = useState("");
  const [simulatedCA, setSimulatedCA] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [showAddRevenue, setShowAddRevenue] = useState(false);
  const [revenues, setRevenues] = useState([]);
  const [revenuesHydrated, setRevenuesHydrated] = useState(false);
  const [revenueForm, setRevenueForm] = useState({
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    client: "",
    invoice: "",
    note: "",
  });
  const [showRevenueDetails, setShowRevenueDetails] = useState(false);
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

  const [messages, setMessages] = useState([
    {
      role: "bot",
      text: "Bonjour 👋 On va construire ton projet en 5 étapes. Réponds simplement.",
    },
    {
      role: "bot",
      text: `Étape 1 — ${STEPS[0].title}\n${STEPS[0].question}`,
    },
  ]);

  const inputRef = useRef(null);
  const chatEndRef = useRef(null);
  const assistantRef = useRef(null);
  const securityRef = useRef(null);
  const feedbackRef = useRef(null);
  const heroRef = useRef(null);
  const fiscalRef = useRef(null);

  useLayoutEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    // если вдруг в URL остался hash, убираем его
    if (window.location.hash) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
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
  useEffect(() => {
    try {
      const raw = localStorage.getItem(REVENUES_KEY);

      if (raw) {
        const parsed = JSON.parse(raw);

        if (Array.isArray(parsed)) {
          const normalized = parsed.map((item) => ({
            ...item,
            amount: Number(String(item.amount || 0).replace(",", ".")),
            date: item.date || new Date().toISOString().slice(0, 10),
          }));

          setRevenues(normalized);
        }
      }
    } catch (e) {
      console.warn("Revenues restore failed:", e);
    } finally {
      setRevenuesHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!revenuesHydrated) return;

    try {
      localStorage.setItem(REVENUES_KEY, JSON.stringify(revenues));
    } catch (e) {
      console.warn("Revenues save failed:", e);
    }
  }, [revenues, revenuesHydrated]);

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

  const step = STEPS[stepIndex];

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
    return STEPS.findIndex((s) => s.key === key);
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
    setVisibleSections((prev) => ({
      ...prev,
      security: true,
    }));

    setTimeout(() => {
      securityRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  }

  function goNext(forcedNextIndex = null) {
    const nextIndex = forcedNextIndex ?? stepIndex + 1;

    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);

      if (nextIndex < STEPS.length) {
        setStepIndex(nextIndex);
        const nextStep = STEPS[nextIndex];
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

      setHasDraft(true);

      const data = JSON.parse(raw);
      if (!data || data.version !== LS_VERSION) {
        setHydrated(true);
        return;
      }

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
      if (typeof data.stepIndex === "number") nextIndex = data.stepIndex;

      const hasProfile = !!a.activity_type && !!a.declaration_frequency;

      if (hasProfile) {
        if (typeof a.ca_month === "number" && a.ca_month > 0) {
          const dashIndex = getIndexByKey("fiscal_dashboard");
          if (dashIndex !== -1) nextIndex = dashIndex;
        } else {
          const caIndex = getIndexByKey("ca_preset");
          if (caIndex !== -1) nextIndex = caIndex;
        }
      }

      setStepIndex(nextIndex);
      setRestoredAt(new Date().toISOString());
    } catch (e) {
      console.warn("Restore failed:", e);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(REVENUES_KEY);

      if (raw) {
        const parsed = JSON.parse(raw);

        if (Array.isArray(parsed)) {
          const normalized = parsed.map((item) => ({
            ...item,
            amount: Number(String(item.amount || 0).replace(",", ".")),
            date: item.date || new Date().toISOString().slice(0, 10),
          }));

          setRevenues(normalized);
        }
      }
    } catch (e) {
      console.warn("Revenues restore failed:", e);
    } finally {
      setRevenuesHydrated(true);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(UI_KEY, JSON.stringify(visibleSections));
  }, [visibleSections]);

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
        savedAt: now,
      };
      localStorage.setItem(LS_KEY, JSON.stringify(payload));
      setLastSavedAt(now);
    } catch (e) {
      console.warn("Save failed:", e);
    }
  }, [hydrated, stepIndex, answers, messages, userName]);

  useEffect(() => {
    if (!revenuesHydrated) return;

    try {
      localStorage.setItem(REVENUES_KEY, JSON.stringify(revenues));
    } catch (e) {
      console.warn("Revenues save failed:", e);
    }
  }, [revenues, revenuesHydrated]);

  useEffect(() => {
    if (revenues.length === 1) {
      setAssistantCollapsed(true);
    }
  }, [revenues.length]);

  const computed = useMemo(() => {
    if (simulatedCA !== null) {
      return computeObligations({ ...answers, ca_month: simulatedCA });
    }
    return computeObligations(answers);
  }, [answers, simulatedCA]);

  const activityLabel = useMemo(
    () => labelFromOptions("activity_type", answers.activity_type),
    [answers.activity_type],
  );

  const freqLabel = useMemo(
    () =>
      labelFromOptions("declaration_frequency", answers.declaration_frequency),
    [answers.declaration_frequency],
  );

  const profileLine = useMemo(() => {
    const a = answers.activity_type ? activityLabel : "";
    const f = answers.declaration_frequency ? freqLabel : "";
    if (!a && !f) return "";
    if (a && f) return `${a} • ${f}`;
    return a || f;
  }, [
    answers.activity_type,
    answers.declaration_frequency,
    activityLabel,
    freqLabel,
  ]);

  const canSend = useMemo(() => input.trim().length > 0, [input]);

  const currentMonthTotal = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    return revenues.reduce((sum, item) => {
      if (!item?.date) return sum;

      const d = new Date(`${item.date}T00:00:00`);
      if (Number.isNaN(d.getTime())) return sum;

      if (d.getFullYear() === year && d.getMonth() === month) {
        return sum + Number(item.amount || 0);
      }

      return sum;
    }, 0);
  }, [revenues]);

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

  const fiscalTimeline = useMemo(() => {
    return [
      {
        key: "declaration",
        icon: "📅",
        label: "Prochaine déclaration",
        value: computed?.nextDeclarationLabel || "À définir",
        hint: computed?.deadlineLabel || "Sélectionne ta périodicité.",
      },
      {
        key: "charges",
        icon: "💰",
        label: "Charges estimées",
        value: `${Math.round(currentMonthTotal * 0.22).toLocaleString("fr-FR")} €`,
        hint:
          revenues.length > 0
            ? "Montant estimatif à mettre de côté"
            : "Ajoute un revenu pour voir une estimation",
      },
      {
        key: "tva",
        icon: "🧾",
        label: "TVA",
        value: computed?.tvaStatusLabel || "Non définie",
        hint: computed?.tvaHint || "Le suivi TVA apparaîtra ici",
      },
    ];
  }, [computed, currentMonthTotal, revenues.length]);

  const fiscalAlert = useMemo(() => {
    if (revenues.length === 0) {
      return {
        level: "neutral",
        title: "Aucune alerte pour le moment",
        text: "Ajoute un revenu pour commencer le suivi fiscal.",
      };
    }

    if (!answers?.declaration_frequency) {
      return {
        level: "warning",
        title: "Périodicité à compléter",
        text: "Choisis ta périodicité pour voir ta prochaine déclaration URSSAF.",
      };
    }

    if (computed?.urgency === "late") {
      return {
        level: "danger",
        title: "Déclaration en retard",
        text: "Vérifie rapidement ton échéance URSSAF et prépare ta déclaration.",
      };
    }

    if (computed?.urgency === "soon") {
      return {
        level: "warning",
        title: "Déclaration proche",
        text: "Prépare ta déclaration URSSAF dans les prochains jours.",
      };
    }

    if (computed?.tvaUrgency === "late") {
      return {
        level: "danger",
        title: "Seuil TVA dépassé",
        text: computed?.tvaHint || "Vérifie ton régime de TVA dès maintenant.",
      };
    }

    if (computed?.tvaUrgency === "soon") {
      return {
        level: "warning",
        title: "Seuil TVA proche",
        text:
          computed?.tvaHint ||
          "Surveille ton chiffre d’affaires pour anticiper la TVA.",
      };
    }

    return {
      level: "ok",
      title: "Situation stable",
      text: "Aucune action urgente pour le moment.",
    };
  }, [revenues, computed, answers?.declaration_frequency]);

  const revenueAmount = Number(
    String(revenueForm.amount || "").replace(",", "."),
  );

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

  function handleRevenueFieldChange(field, value) {
    setRevenueForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function handleSaveRevenue() {
    const amount = Number(String(revenueForm.amount).replace(",", "."));

    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Merci d’indiquer un montant valide.");
      return;
    }

    const entry = {
      id: Date.now().toString(),
      amount,
      date: revenueForm.date || new Date().toISOString().slice(0, 10),
      client: revenueForm.client.trim(),
      invoice: revenueForm.invoice.trim(),
      note: revenueForm.note.trim(),
      createdAt: new Date().toISOString(),
    };

    setRevenues((prev) => [entry, ...prev]);

    setSaveNotice(
      `Revenu enregistré • charges estimées : ${Math.round(amount * 0.22).toLocaleString("fr-FR")} € • disponible estimé : ${Math.round(amount * 0.78).toLocaleString("fr-FR")} €`,
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
  function handleDeleteRevenue(id) {
    setRevenues((prev) => prev.filter((item) => item.id !== id));
  }

  function formatRevenueDate(dateStr) {
    try {
      return new Date(dateStr).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
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

    if (key === "ca_preset") {
      if (value !== "other") {
        updatedAnswers = { ...updatedAnswers, ca_month: Number(value) || 0 };
        const dashIndex = getIndexByKey("fiscal_dashboard");
        if (dashIndex !== -1) forcedNextIndex = dashIndex;
      }
    }

    if (key === "ca_month") {
      const cleaned = String(value)
        .replace(/[^\d.,]/g, "")
        .replace(",", ".");
      const num = Number(cleaned);
      updatedAnswers = {
        ...updatedAnswers,
        ca_month: Number.isFinite(num) ? num : 0,
      };

      const dashIndex = getIndexByKey("fiscal_dashboard");
      if (dashIndex !== -1) forcedNextIndex = dashIndex;
    }

    setAnswers(updatedAnswers);

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
      buildFiscalChecklist(answers, computed);

    navigator.clipboard.writeText(summary);
    alert("Résumé copié dans le presse-papiers ✅");
  }

  function handleDownloadTxt() {
    const content =
      buildFiscalSummary(answers, computed) +
      "\n\n" +
      buildFiscalChecklist(answers, computed);

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "plan-action-mvp.txt";
    a.click();

    URL.revokeObjectURL(url);
  }

  function handleReset() {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(REVENUES_KEY);

    setRevenues([]);
    setStepIndex(0);
    setAnswers({});
    setInput("");
    setUserName("");
    setSimulatedCA(null);
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
        text: `Étape 1 — ${STEPS[0].title}\n${STEPS[0].question}`,
      },
    ]);

    setTimeout(() => {
      scrollToTopSection("assistant");
    }, 120);
  }

  function handleNewSession() {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(REVENUES_KEY);

    setRevenues([]);

    setHasDraft(false);
    setLastSavedAt(null);
    setRestoredAt(null);

    handleReset();
  }
  return (
    <div className="page">
      <header className="topbar">
        <div className="topbarLeft">
          <div className="brand">Entrepreneurs Assistant</div>

          <input
            className="nameInput"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="Ton prénom"
            aria-label="Ton prénom"
          />

          {userName && <div className="helloMini">Bonjour, {userName} 👋</div>}
          {profileLine && <div className="profileMini">{profileLine}</div>}
        </div>

        <div className="topbarRight">
          <nav className="nav">
            <a href="#home">Accueil</a>
            <a href="#services">Services</a>
            <a href="#assistant">Assistant</a>
            <a href="#feedback">Contact</a>
          </nav>

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

            <button
              className="btn btnGhost btnSmall"
              onClick={handleNewSession}
              type="button"
            >
              Nouveau
            </button>
          </div>
        </div>
      </header>

      <main className={`container ${focusMode ? "focusMode" : ""}`}>
        <section id="home" ref={heroRef} className="card hero heroSaaS">
          <div className="heroGrid">
            <div className="heroLeft">
              <div className="heroBadge">
                🟣 MVP en test — version bêta gratuite
              </div>
              <h1>Assistant fiscal pour micro-entrepreneurs</h1>

              <div className="heroLead">
                <p>Micro-entrepreneur ?</p>
                <p>Tu ne sais jamais combien déclarer ni quand ?</p>
                <p>
                  En 1 minute, cet assistant te donne une réponse claire :
                  <strong>
                    {" "}
                    quoi déclarer, quand, et combien garder de côté.
                  </strong>
                </p>
              </div>

              <ul className="heroBullets">
                <li>✅ Prochaine action concrète (URSSAF)</li>
                <li>✅ Montant estimé + date limite</li>
                <li>✅ Alertes : échéance proche / seuil TVA</li>
                <li>✅ Export : résumé + plan d’action</li>
              </ul>
              <p className="assistantIntro">
Réponds simplement aux questions ci-dessous.
Cela prend moins d'une minute.
</p>

              <div className="heroActions">
                <button
                  className="btn btnPrimary"
                  onClick={() => {
                    track("click_tester_demo");
                    setAppView("assistant");
                    setFocusMode(true);

                    setTimeout(() => {
                      scrollToRef(assistantRef);
                    }, 80);
                  }}
                  type="button"
                >
                  Tester la démo
                </button>

                <button
                  className="btn btnGhost"
                  onClick={openSecuritySection}
                  type="button"
                >
                  Sécurité & confidentialité
                </button>

                <button
                  className="btn btnGhost"
                  onClick={handleReset}
                  type="button"
                >
                  Réinitialiser
                </button>
              </div>

              <p className="heroFineprint">
                ⚠️ Estimation MVP : repères pratiques — ne remplace pas un
                expert-comptable.
              </p>
            </div>

            <div className="heroRight">
              <div className="heroPanel">
                <div className="heroPanelTitle">
                  Aperçu (ce que tu vas obtenir)
                </div>

                <div className="heroKpis">
                  <div className="kpi">
                    <div className="kpiLabel">Prochaine déclaration</div>
                    <div className="kpiValue">Mensuelle / Trimestrielle</div>
                  </div>
                  <div className="kpi">
                    <div className="kpiLabel">Date limite</div>
                    <div className="kpiValue">Dans X jours</div>
                  </div>
                  <div className="kpi">
                    <div className="kpiLabel">TVA</div>
                    <div className="kpiValue">OK / Bientôt / Dépassé</div>
                  </div>
                  <div className="kpi">
                    <div className="kpiLabel">Plan d’action</div>
                    <div className="kpiValue">1–3 actions claires</div>
                  </div>
                </div>

                <div className="heroTrust">
                  <span>🔒 Sans compte</span>
                  <span>🧠 Simple</span>
                  <span>⚡ Rapide</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {!focusMode && appView === "landing" && (
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

        {!focusMode && appView === "landing" && visibleSections.services && (
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
              Microassist est un outil conçu pour aider les micro-entrepreneurs
              à comprendre simplement leurs obligations fiscales.
            </p>

            <p>
              L’objectif est de réduire le temps et le stress liés aux démarches
              administratives : déclarations, charges, TVA et échéances.
            </p>

            <p>
              En quelques étapes, l’assistant donne une vision claire de ce
              qu’il faut déclarer, quand le faire et combien mettre de côté.
            </p>

            <p>
              L’entrepreneur peut ainsi se concentrer sur l’essentiel :
              développer son activité et ses clients.
            </p>
          </section>
        )}

        {!focusMode && appView === "landing" && visibleSections.howItWorks && (
          <section id="services" className="card">
            <div className="sectionHead">
              <h2>Services</h2>
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
              <li>Idée → MVP : étapes simples</li>
              <li>Organisation : checklists & priorités</li>
              <li>Modèles : pitch, email, Notion</li>
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
                <strong>1. Réponds à quelques questions</strong>
                <p>L’assistant comprend ta situation de micro-entrepreneur.</p>
              </div>

              <div className="step">
                <strong>2. Analyse automatique</strong>
                <p>Calcul simple des échéances et estimations.</p>
              </div>

              <div className="step">
                <strong>3. Tableau clair</strong>
                <p>Tu vois quoi déclarer, quand, et combien garder de côté.</p>
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
              Microassist est une démo en cours de test, conçue aujourd’hui pour
              la micro-entreprise (URSSAF).
            </p>

            <h3 style={{ marginTop: 12 }}>✅ Pour qui ?</h3>
            <ul className="targetList">
              <li>Micro-entrepreneurs</li>
              <li>Freelances</li>
              <li>Créateurs d’activité</li>
              <li>Indépendants qui veulent clarifier leurs obligations</li>
            </ul>

            <h3 style={{ marginTop: 12 }}>
              🚧 Prochainement (feuille de route)
            </h3>
            <ul className="roadmaplist">
              <li>📌 Compte + historique des déclarations</li>
              <li>📅 Rappels automatiques (email) avant l’échéance</li>
              <li>📄 Export PDF du plan d’action</li>
            </ul>

            <div
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: "1px solid rgba(0,0,0,0.08)",
              }}
            >
              <p>
                <strong>Tu n’es pas en micro-entreprise</strong> (SAS/SARL/EI) ?
                Une version dédiée est en préparation.
              </p>
              <p className="muted" style={{ marginTop: 6 }}>
                Laisse ton besoin → ça m’aide à prioriser les prochaines
                versions.
              </p>

              <a
                className="btn btnPrimary"
                href="https://docs.google.com/forms/d/e/1FAIpQLSfFLqWZajP6Dy0Zm5-bS9cnE5-joWecfCgfyIhzGRMbsk-jqA/viewform"
                target="_blank"
                rel="noreferrer"
              >
                Ouvrir le formulaire
              </a>
            </div>
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

        <section id="assistant" ref={assistantRef} className="card">
          <div className="assistantHeader">
            <div>
              <div className="assistantTitleRow">
                <h2>Créer mon profil fiscal</h2>

                {revenues.length > 0 && (
                  <button
                    className="btn btnGhost btnSmall"
                    onClick={() => setAssistantCollapsed((v) => !v)}
                    type="button"
                  >
                    {assistantCollapsed ? "Afficher l’assistant" : "Réduire"}
                  </button>
                )}
              </div>

              <p className="muted assistantIntro">
                Configure ton profil micro-entrepreneur en quelques questions
                simples.
              </p>

              <p>
                Microassist t’aide à comprendre ta situation fiscale et à
                organiser ton activité.
              </p>

              <p>En répondant à quelques questions, tu obtiens :</p>

              <ul className="assistantBenefits">
                <li>une estimation claire de tes charges</li>
                <li>tes prochaines obligations (URSSAF, TVA)</li>
                <li>un espace fiscal personnalisé pour suivre tes revenus</li>
              </ul>
            </div>

            <div className="progress">
              <div className="progressBar">
                <div
                  className="progressFill"
                  style={{
                    width: `${((stepIndex + 1) / STEPS.length) * 100}%`,
                  }}
                />
              </div>

              {(hasDraft || lastSavedAt) && (
                <div className="savedHint">
                  💾{" "}
                  {lastSavedAt
                    ? `Sauvegardé à ${new Date(lastSavedAt).toLocaleTimeString(
                        [],
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}`
                    : "Sauvegarde trouvée"}
                  {restoredAt && " — restauré ✅"}
                  <div className="savedActions">
                    <button
                      className="btn btnGhost"
                      onClick={handleNewSession}
                      type="button"
                    >
                      Nouveau
                    </button>
                  </div>
                </div>
              )}

              <div>
                Étape <strong>{Math.min(stepIndex + 1, STEPS.length)}</strong> /{" "}
                {STEPS.length}
              </div>
            </div>
          </div>

          {assistantCollapsed ? (
            <div className="assistantCollapsedBox">
              <p className="muted">
                Ton profil fiscal est déjà configuré. Tu peux rouvrir
                l’assistant à tout moment.
              </p>

              <button
                className="btn btnPrimary"
                onClick={() => setAssistantCollapsed(false)}
                type="button"
              >
                Afficher l’assistant
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
                  <div className="simulatorBox">
                    <div className="simulatorTitle">📊 Simulation rapide</div>

                    <p className="muted" style={{ marginBottom: 12 }}>
                      Teste rapidement un autre montant de chiffre d’affaires
                      pour voir l’impact estimé sur tes charges et tes
                      prochaines obligations.
                    </p>

                    <div className="simulatorControls">
                      <input
                        type="number"
                        placeholder="Ex: 4000"
                        value={simulatedCA ?? ""}
                        onChange={(e) =>
                          setSimulatedCA(
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="simInput"
                      />

                      {simulatedCA !== null && (
                        <button
                          className="btn btnGhost btnSmall"
                          onClick={() => setSimulatedCA(null)}
                          type="button"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="assistantSummaryBox">
                    <h3>Résumé de configuration</h3>

                    <ul className="assistantSummaryList">
                      <li>
                        <strong>Activité :</strong>{" "}
                        {labelFromOptions(
                          "activity_type",
                          answers.activity_type,
                        ) || "—"}
                      </li>
                      <li>
                        <strong>Déclarations :</strong>{" "}
                        {labelFromOptions(
                          "declaration_frequency",
                          answers.declaration_frequency,
                        ) || "—"}
                      </li>
                      <li>
                        <strong>CA saisi :</strong>{" "}
                        {Number(answers?.ca_month || 0).toLocaleString("fr-FR")}{" "}
                        €
                      </li>
                    </ul>
                  </div>

                  {computed?.recommendations?.length > 0 && (
                    <div className="dashRecs">
                      <div className="dashRecsTitle">✅ Recommandations</div>

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
                    <div className="assistantNextStepTitle">
                      Profil fiscal configuré ✅
                    </div>
                    <p className="muted">
                      Ton espace fiscal est prêt. Tu peux maintenant suivre tes
                      revenus, visualiser tes charges estimées et consulter tes
                      prochaines étapes fiscales.
                    </p>

                    <button
                      className="btn btnPrimary"
                      type="button"
                      onClick={() => {
                        setAppView("dashboard");
                        fiscalRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }}
                    >
                      Voir mon espace fiscal
                    </button>
                  </div>

                  <div className="disclaimer">
                    ⚠️ Estimation MVP : ce tableau donne des repères
                    (charges/TVA/échéances) et ne remplace pas un
                    expert-comptable.
                  </div>

                  <div className="miniActions">
                    <button
                      className="btn btnGhost"
                      type="button"
                      onClick={() => setStepIndex(0)}
                    >
                      ← Retour
                    </button>
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
                    💾 Tes réponses sont sauvegardées automatiquement dans ton
                    navigateur.
                  </div>
                </>
              )}

              {(step?.mode === "dashboard" || stepIndex >= STEPS.length) && (
                <div className="miniActions">
                  <button
                    className="btn btnGhost"
                    onClick={handleCopySummary}
                    type="button"
                  >
                    Copier le résumé
                  </button>

                  <button
                    className="btn btnGhost"
                    onClick={handleDownloadTxt}
                    type="button"
                  >
                    Télécharger le plan (.txt)
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {appView === "dashboard" && (
        <section ref={fiscalRef} className="card">
          <div className="sectionHead">
            <h2>Mon espace fiscal</h2>

            <div className="sectionHeadActions">
              <button
                className="btn btnGhost btnSmall"
                type="button"
                onClick={() => {
                  setAppView("assistant");
                  setAssistantCollapsed(false);
                  assistantRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }}
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

          <div className="fiscalDashboard">
            <div className="fiscalCard">
              <div className="fiscalLabel">Total du mois</div>
              <div className="fiscalValue">
                {currentMonthTotal.toLocaleString("fr-FR")} €
              </div>
            </div>

            <div className="fiscalCard">
              <div className="fiscalLabel">Charges estimées</div>
              <div className="fiscalValue">
                {Math.round(currentMonthTotal * 0.22).toLocaleString("fr-FR")} €
              </div>
            </div>

            <div className="fiscalCard">
              <div className="fiscalLabel">Disponible estimé</div>
              <div className="fiscalValue">
                {Math.round(currentMonthTotal * 0.78).toLocaleString("fr-FR")} €
              </div>
            </div>
          </div>

          <div className="fiscalTimeline">
            <h3>Prochaines étapes fiscales</h3>

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
              "fiscalAlert",
              fiscalAlert.level === "danger" ? "alertDanger" : "",
              fiscalAlert.level === "warning" ? "alertWarning" : "",
              fiscalAlert.level === "ok" ? "alertOk" : "",
            ]
              .join(" ")
              .trim()}
          >
            <div className="fiscalAlertTitle">{fiscalAlert.title}</div>
            <div className="fiscalAlertText">{fiscalAlert.text}</div>
          </div>

          <div className="monthStatus">
            {revenues.length === 0 ? (
              <span>⚠ Aucun revenu enregistré ce mois</span>
            ) : (
              <span>✔ Suivi du mois en cours</span>
            )}
          </div>

          <div className="journalHeader">
            <h3>Journal des revenus</h3>
          </div>

          {revenues.length === 0 ? (
            <p className="muted" style={{ marginTop: 10 }}>
              Aucun revenu enregistré pour le moment.
            </p>
          ) : (
            <div className="revenuesList">
              {revenues.map((item) => (
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
                      type="button"
                      onClick={() => handleDeleteRevenue(item.id)}
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {monthlyHistory.length > 0 && (
            <div className="monthlyHistory">
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
            🔒 Données locales uniquement — aucun compte requis pour tester.
          </div>
          
        </section>
        )}

        {visibleSections.security && (
          <section id="security" ref={securityRef} className="card security">
            <div className="sectionHead">
              <h2>🔒 Sécurité & confidentialité (démo)</h2>

              <button
                className="iconBtn"
                type="button"
                onClick={() => hideSection("security")}
                aria-label="Masquer cette section"
              >
                ✕
              </button>
            </div>

            <ul className="securityList">
              <li>✔ Aucun téléchargement ni installation</li>
              <li>✔ Aucune création de compte</li>
              <li>✔ Aucune donnée bancaire demandée</li>
              <li>
                ✔ Les données restent dans votre navigateur (localStorage)
              </li>
              <li>✔ Aucun accès à votre compte URSSAF ou impôts</li>
            </ul>

            <p className="securityNote">
              Cet assistant fonctionne 100% côté navigateur. Aucune donnée n’est
              envoyée vers un serveur.
            </p>
          </section>
        )}

        {visibleSections.feedback && (
          <section id="feedback" ref={feedbackRef} className="card feedbackCta">
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
              {showRevenueDetails ? "Masquer les détails" : "+ Ajouter détails"}
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
                  <span>Charges estimées</span>
                  <strong>
                    {Math.round(revenueAmount * 0.22).toLocaleString("fr-FR")} €
                  </strong>
                </div>

                <div className="previewRow">
                  <span>Disponible estimé</span>
                  <strong>
                    {Math.round(revenueAmount * 0.78).toLocaleString("fr-FR")} €
                  </strong>
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
    </div>
  );
}
