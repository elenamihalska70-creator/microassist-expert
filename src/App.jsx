import React, { useEffect, useState } from "react";
import "./App.css";
import ExpertDashboard, {
  EXPERT_CLIENTS_REPLACED_EVENT,
  EXPERT_CLIENTS_STORAGE_KEY,
  EXPERT_HISTORY_STORAGE_KEY,
  LEGACY_EXPERT_CLIENTS_STORAGE_KEY,
  seedClients,
} from "./components/ExpertDashboard";
import AuthModal from "./components/AuthModal";
import {
  ensureExpertCabinet,
  getCurrentSession,
  signOutExpert,
} from "./lib/authService";
import { supabase } from "./lib/supabase";

const CABINET_SETTINGS_STORAGE_KEY = "microassist_expert_cabinet_settings";

const sections = [
  { id: "dashboard", label: "Dashboard" },
  { id: "clients", label: "Clients" },
  { id: "echeancier", label: "Échéancier" },
  { id: "alertes", label: "Alertes" },
  { id: "notes", label: "Notes" },
  { id: "parametres", label: "Paramètres" },
];

const defaultCabinetSettings = {
  name: "Cabinet Microassist",
  email: "contact@cabinet.fr",
  structureType: "Expert-comptable",
  maxClients: "50",
};

const isDevelopment = import.meta.env.DEV;

function createUuid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : null;
}

function logDevError(...details) {
  if (import.meta.env.DEV) {
    console.error(...details);
  }
}

function parseDemoNumber(value) {
  if (typeof value === "number") {
    return value;
  }

  const parsedValue = Number(
    String(value || "")
      .replace(/\s/g, "")
      .replace("€", "")
      .replace(",", "."),
  );

  return Number.isNaN(parsedValue) ? 0 : parsedValue;
}

function normalizeDemoClient(client) {
  const revenue = parseDemoNumber(client.revenue);
  const estimatedCharges = parseDemoNumber(
    client.estimatedCharges ?? client.charges,
  );

  return {
    ...client,
    name: client.name || "Client démonstration",
    activity: client.activity || "Activité non renseignée",
    revenue,
    estimatedCharges,
    periodicity: client.periodicity || "Inconnue",
    riskScore: Number(client.riskScore ?? 30),
    riskLabel: client.riskLabel || "OK",
    nextAction: client.nextAction || "Suivi régulier à maintenir",
    notes: Array.isArray(client.notes) ? client.notes : [],
    notesList: Array.isArray(client.notesList)
      ? client.notesList
      : Array.isArray(client.notes)
        ? client.notes
        : [],
    actions: Array.isArray(client.actions) ? client.actions : [],
    history: Array.isArray(client.history) ? client.history : [],
  };
}

function mergeReturnedCloudClient(cleanClient, returnedClient) {
  if (!returnedClient) {
    return normalizeDemoClient(cleanClient);
  }

  return normalizeDemoClient({
    ...cleanClient,
    id: returnedClient.id || cleanClient.id,
    name: returnedClient.name || cleanClient.name,
    activity: returnedClient.activity || cleanClient.activity,
    revenue: returnedClient.revenue ?? cleanClient.revenue,
    estimatedCharges:
      returnedClient.estimated_charges ?? cleanClient.estimatedCharges,
    periodicity: returnedClient.periodicity || cleanClient.periodicity,
    lastDeclarationDate:
      returnedClient.last_declaration_date || cleanClient.lastDeclarationDate,
    tva: returnedClient.tva_status || cleanClient.tva,
    acre: returnedClient.acre_status || cleanClient.acre,
    status: returnedClient.status || cleanClient.status,
    nextAction: returnedClient.next_action || cleanClient.nextAction,
    updatedAt: returnedClient.updated_at || returnedClient.created_at || cleanClient.updatedAt,
  });
}

function replaceStoredDemoClients(cleanClients) {
  const normalizedClients = cleanClients.map(normalizeDemoClient);

  localStorage.removeItem(EXPERT_CLIENTS_STORAGE_KEY);
  localStorage.removeItem(LEGACY_EXPERT_CLIENTS_STORAGE_KEY);
  localStorage.setItem(
    EXPERT_CLIENTS_STORAGE_KEY,
    JSON.stringify(normalizedClients),
  );
  localStorage.setItem(EXPERT_HISTORY_STORAGE_KEY, JSON.stringify([]));
  window.dispatchEvent(
    new CustomEvent(EXPERT_CLIENTS_REPLACED_EVENT, {
      detail: { clients: normalizedClients },
    }),
  );
}

function App() {
  const [activeSection, setActiveSection] = useState("dashboard");
  const [cabinetSettings, setCabinetSettings] = useState(() => {
    try {
      const raw = localStorage.getItem(CABINET_SETTINGS_STORAGE_KEY);
      return raw ? { ...defaultCabinetSettings, ...JSON.parse(raw) } : defaultCabinetSettings;
    } catch {
      return defaultCabinetSettings;
    }
  });
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [devDataMessage, setDevDataMessage] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentCabinet, setCurrentCabinet] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authToast, setAuthToast] = useState("");
  const activeLabel =
    sections.find((section) => section.id === activeSection)?.label ||
    "Dashboard";

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      const { data } = await getCurrentSession();
      const user = data?.session?.user || null;

      if (!isMounted) return;

      setCurrentUser(user ? { id: user.id, email: user.email } : null);

      if (user) {
        try {
          const cabinet = await ensureExpertCabinet(user);

          if (isMounted && cabinet) {
            setCurrentCabinet(cabinet);
          }
        } catch {
          if (isMounted) {
            setAuthToast("Session connectée, cabinet à configurer");
          }
        }
      }

      setAuthLoading(false);
    }

    loadSession();

    return () => {
      isMounted = false;
    };
  }, []);

  function updateCabinetSetting(field, value) {
    setCabinetSettings((currentSettings) => ({
      ...currentSettings,
      [field]: value,
    }));
    setSettingsSaved(false);
  }

  function saveCabinetSettings() {
    try {
      localStorage.setItem(
        CABINET_SETTINGS_STORAGE_KEY,
        JSON.stringify(cabinetSettings),
      );
      setSettingsSaved(true);
    } catch {
      setSettingsSaved(false);
    }
  }

  function loadSeedClients() {
    try {
      replaceStoredDemoClients(seedClients);
      setDevDataMessage("Données démo chargées.");
    } catch {
      setDevDataMessage("Impossible de charger les données démo.");
    }
  }

  function resetLocalData() {
    try {
      localStorage.removeItem(EXPERT_CLIENTS_STORAGE_KEY);
      localStorage.removeItem(EXPERT_HISTORY_STORAGE_KEY);
      localStorage.removeItem(CABINET_SETTINGS_STORAGE_KEY);
      replaceStoredDemoClients(seedClients);
      setCabinetSettings(defaultCabinetSettings);
      setSettingsSaved(false);
      setDevDataMessage("Données locales réinitialisées.");
    } catch {
      setDevDataMessage("Impossible de réinitialiser les données locales.");
    }
  }

  function resetDemoClientData() {
    const shouldReset = window.confirm(
      "Réinitialiser les données locales de démonstration ?",
    );

    if (!shouldReset) {
      return;
    }

    try {
      replaceStoredDemoClients(seedClients);
      setDevDataMessage("Données locales de démonstration réinitialisées.");
    } catch {
      setDevDataMessage("Impossible de réinitialiser les données locales.");
    }
  }

  async function resetCloudDemoData() {
    if (!supabase || !currentCabinet?.id) {
      setDevDataMessage("Mode cloud indisponible.");
      return;
    }

    const shouldReset = window.confirm(
      "Cette action supprimera les clients, notes, actions et historiques de démonstration de ce cabinet. Continuer ?",
    );

    if (!shouldReset) {
      return;
    }

    try {
      const cleanClients = seedClients.map((seedClient) => {
        const client = normalizeDemoClient(seedClient);
        const nextClientId = createUuid();

        if (!nextClientId) {
          throw new Error("UUID unavailable");
        }

        const cleanNotes = Array.isArray(client.notes)
          ? client.notes.map((note) => ({
              ...note,
              id: createUuid() || note.id,
            }))
          : [];

        return {
          ...client,
          id: nextClientId,
          notes: cleanNotes,
          notesList: cleanNotes,
          actions: Array.isArray(client.actions)
            ? client.actions.map((action) => ({
                ...action,
                id: createUuid() || action.id,
              }))
            : [],
          history: [
            {
              id: createUuid() || `history-${nextClientId}`,
              type: "create",
              label: "Client ajouté au portefeuille",
              date: client.updatedAt || new Date().toISOString(),
            },
          ],
        };
      });

      for (const tableName of [
        "client_history",
        "client_notes",
        "client_actions",
        "clients",
      ]) {
        const { error } = await supabase
          .from(tableName)
          .delete()
          .eq("cabinet_id", currentCabinet.id);

        if (error) {
          throw error;
        }
      }

      const clientPayload = cleanClients.map((client) => ({
        id: client.id,
        cabinet_id: currentCabinet.id,
        name: client.name,
        activity: client.activity || null,
        revenue: parseDemoNumber(client.revenue),
        estimated_charges: parseDemoNumber(client.estimatedCharges),
        periodicity: client.periodicity || null,
        last_declaration_date: client.lastDeclarationDate || null,
        tva_status: client.tva || null,
        acre_status: client.acre || null,
        status: client.status || null,
        next_action: client.nextAction || null,
        created_at: client.updatedAt || new Date().toISOString(),
      }));

      const { data: insertedClients, error: clientsError } = await supabase
        .from("clients")
        .insert(clientPayload)
        .select("*");

      if (clientsError) {
        throw clientsError;
      }

      const insertedClientRowsById = new Map(
        (Array.isArray(insertedClients) ? insertedClients : []).map((client) => [
          client.id,
          client,
        ]),
      );
      const persistedClients = cleanClients.map((client) => {
        const insertedClient = insertedClientRowsById.get(client.id);

        return mergeReturnedCloudClient(client, insertedClient);
      });

      const notesPayload = cleanClients.flatMap((client) =>
        (Array.isArray(client.notes) ? client.notes : []).map((note) => ({
          id: note.id,
          client_id: client.id,
          cabinet_id: currentCabinet.id,
          content: note.text,
          created_by: currentUser?.id || null,
          created_at: note.createdAt || note.date || new Date().toISOString(),
        })),
      );
      const actionsPayload = cleanClients.flatMap((client) =>
        (Array.isArray(client.actions) ? client.actions : []).map((action) => ({
          id: action.id,
          client_id: client.id,
          cabinet_id: currentCabinet.id,
          text: action.text,
          status: action.status || "todo",
          done_at: action.doneAt || null,
          created_by: currentUser?.id || null,
          created_at: action.createdAt || new Date().toISOString(),
        })),
      );
      const historyPayload = cleanClients.flatMap((client) =>
        (Array.isArray(client.history) ? client.history : []).map((entry) => ({
          id: entry.id,
          client_id: client.id,
          cabinet_id: currentCabinet.id,
          type: entry.type || "update",
          label: entry.label,
          created_by: currentUser?.id || null,
          created_at: entry.date || new Date().toISOString(),
        })),
      );

      if (notesPayload.length > 0) {
        const { error } = await supabase.from("client_notes").insert(notesPayload);
        if (error) throw error;
      }

      if (actionsPayload.length > 0) {
        const { error } = await supabase
          .from("client_actions")
          .insert(actionsPayload);
        if (error) throw error;
      }

      if (historyPayload.length > 0) {
        const { error } = await supabase
          .from("client_history")
          .insert(historyPayload);
        if (error) throw error;
      }

      replaceStoredDemoClients(persistedClients);
      setDevDataMessage("Données cloud de démonstration réinitialisées.");
    } catch (error) {
      logDevError("Cloud demo reset failed:", error);
      setDevDataMessage("Impossible de réinitialiser les données cloud.");
    }
  }

  async function handleAuthSuccess(data) {
    const user = data?.user || data?.session?.user || null;

    if (user?.email) {
      setCurrentUser({ id: user.id, email: user.email });
    }

    setShowAuthModal(false);

    if (user) {
      try {
        const cabinet = await ensureExpertCabinet(user);

        if (cabinet) {
          setCurrentCabinet(cabinet);
        }

        setAuthToast("Connexion réussie");
      } catch {
        setAuthToast("Session connectée, cabinet à configurer");
      }
      return;
    }

    setAuthToast("Connexion réussie");
  }

  async function handleSignOut() {
    await signOutExpert();
    setCurrentUser(null);
    setCurrentCabinet(null);
    setAuthToast("Déconnexion réussie");
  }

  return (
    <div className="app appShell">
      <aside className="appSidebar" aria-label="Navigation principale">
        <div className="appSidebarBrand">
          <div className="appLogoMark">ME</div>
          <div className="appBrandBlock">
            <h1>
              <span>Microassist</span>
              <span>Expert</span>
            </h1>
            <p className="appSubtitle">Tableau de bord B2B</p>
          </div>
        </div>

        <nav className="appNav">
          {sections.map((section) => (
            <button
              className={`appNavPill${
                activeSection === section.id ? " appNavPillActive" : ""
              }`}
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="appWorkspace">
        <header className="appHeader">
          <div>
            <p className="appEyebrow">Mon cabinet</p>
            <h2>{activeLabel}</h2>
          </div>
          <div className="appHeaderActions">
            <p className="appHeaderMeta">Interface cabinet</p>
            <span className="appPrototypeNote">
              {currentUser
                ? "Session connectée — synchronisation cloud à venir."
                : "Données enregistrées localement dans ce navigateur."}
            </span>
            {currentUser ? (
              <>
                {currentCabinet && (
                  <span className="appCabinetBadge">
                    Cabinet : {currentCabinet.name}
                  </span>
                )}
                <span className="appUserBadge">
                  Connecté : {currentUser.email}
                </span>
                <button
                  type="button"
                  className="btn btnGhost btnSmall"
                  onClick={handleSignOut}
                >
                  Se déconnecter
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btnGhost btnSmall"
                onClick={() => setShowAuthModal(true)}
                disabled={authLoading}
              >
                Se connecter
              </button>
            )}
          </div>
        </header>

        <main className="appMain">
          {["dashboard", "clients", "echeancier", "alertes", "notes"].includes(activeSection) ? (
            <ExpertDashboard
              view={activeSection}
              onOpenClient={() => setActiveSection("clients")}
              currentUser={currentUser}
              currentCabinet={currentCabinet}
            />
          ) : activeSection === "parametres" ? (
            <section className="settingsPage">
              <div className="settingsHeader">
                <p className="appEyebrow">Administration</p>
                <h2>Paramètres cabinet</h2>
                <p>Informations de l’espace professionnel</p>
              </div>

              <div className="settingsGrid">
                <section className="settingsCard">
                  <h3>Informations cabinet</h3>

                  <div className="settingsForm">
                    <label>
                      <span>Nom du cabinet</span>
                      <input
                        type="text"
                        value={cabinetSettings.name}
                        onChange={(event) =>
                          updateCabinetSetting("name", event.target.value)
                        }
                      />
                    </label>

                    <label>
                      <span>Email de contact</span>
                      <input
                        type="email"
                        value={cabinetSettings.email}
                        onChange={(event) =>
                          updateCabinetSetting("email", event.target.value)
                        }
                      />
                    </label>

                    <label>
                      <span>Type de structure</span>
                      <select
                        value={cabinetSettings.structureType}
                        onChange={(event) =>
                          updateCabinetSetting("structureType", event.target.value)
                        }
                      >
                        <option>Expert-comptable</option>
                        <option>Consultant</option>
                        <option>Association</option>
                        <option>Incubateur</option>
                        <option>Autre</option>
                      </select>
                    </label>

                    <label>
                      <span>Nombre maximum de clients suivis</span>
                      <input
                        type="number"
                        min="1"
                        value={cabinetSettings.maxClients}
                        onChange={(event) =>
                          updateCabinetSetting("maxClients", event.target.value)
                        }
                      />
                    </label>
                  </div>

                  <div className="settingsActions">
                    <button
                      type="button"
                      className="btn btnPrimary btnSmall"
                      onClick={saveCabinetSettings}
                    >
                      Enregistrer les paramètres
                    </button>
                    {settingsSaved && (
                      <span className="settingsSaved">Paramètres enregistrés</span>
                    )}
                  </div>
                </section>

                <section className="settingsCard settingsStatusCard">
                  <h3>Statut de l’espace</h3>
                  <ul>
                    <li>Mode prototype</li>
                    <li>Données enregistrées localement</li>
                    <li>Version B2B en démonstration</li>
                  </ul>
                  <p className="settingsSafetyNote">
                    Les données sont enregistrées localement dans ce prototype.
                  </p>
                </section>

                <section className="settingsCard settingsDemoCard">
                  <h3>Sécurité et données</h3>
                  <ul className="settingsInfoList">
                    <li>Version de démonstration</li>
                    <li>Aucune donnée réelle de client ne doit être utilisée.</li>
                    <li>Aucun téléchargement n’est nécessaire.</li>
                    <li>L’utilisation du prototype peut se faire sans inscription.</li>
                    <li>Les données de démonstration peuvent être supprimées à tout moment.</li>
                  </ul>

                  <div className="settingsTechInfo">
                    <p>
                      <strong>Mode actuel :</strong>{" "}
                      {currentUser && currentCabinet ? "cloud" : "local"}
                    </p>
                    <p>
                      <strong>Cabinet :</strong>{" "}
                      {currentCabinet?.name || "Non configuré"}
                    </p>
                    <p>
                      <strong>Utilisateur connecté :</strong>{" "}
                      {currentUser?.email || "Non connecté"}
                    </p>
                  </div>

                  <div className="settingsActions">
                    <button
                      type="button"
                      className="btn btnGhost btnSmall settingsDangerButton"
                      onClick={resetDemoClientData}
                    >
                      Réinitialiser les données locales
                    </button>
                    {currentUser && currentCabinet && supabase && (
                      <button
                        type="button"
                        className="btn btnGhost btnSmall settingsDangerButton"
                        onClick={resetCloudDemoData}
                      >
                        Réinitialiser les données cloud de démonstration
                      </button>
                    )}
                  </div>
                </section>

                {isDevelopment && (
                  <section className="settingsCard settingsDevCard">
                    <h3>Outils de développement</h3>
                    <p>
                      Ces actions servent uniquement à tester le prototype en local.
                    </p>
                    <div className="settingsActions">
                      <button
                        type="button"
                        className="btn btnPrimary btnSmall"
                        onClick={loadSeedClients}
                      >
                        Charger données démo
                      </button>
                      <button
                        type="button"
                        className="btn btnGhost btnSmall settingsDangerButton"
                        onClick={resetLocalData}
                      >
                        Réinitialiser données locales
                      </button>
                      {devDataMessage && (
                        <span className="settingsSaved">{devDataMessage}</span>
                      )}
                    </div>
                  </section>
                )}
              </div>
            </section>
          ) : (
            <section className="appPlaceholderCard">
              <p className="appPlaceholderLabel">{activeLabel}</p>
              <h3>Section à venir</h3>
            </section>
          )}
        </main>
      </div>

      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={handleAuthSuccess}
        />
      )}

      {authToast && (
        <div className="appToast" role="status" aria-live="polite">
          <span>{authToast}</span>
          <button
            type="button"
            onClick={() => setAuthToast("")}
            aria-label="Fermer le message"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
