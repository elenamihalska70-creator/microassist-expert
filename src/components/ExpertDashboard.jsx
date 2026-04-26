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

function getClientRisk(client) {
  const revenueValue = parseRevenueValue(client?.revenue);
  const nextAction = String(client?.nextAction || "").toLowerCase();

  if (nextAction.includes("retard") || nextAction.includes("régulariser")) {
    return {
      status: "late",
      label: "En retard",
      priorityLevel: 1,
      recommendedAction: "Régulariser le dossier et relancer le client.",
    };
  }

  if (revenueValue >= 12000 || nextAction.includes("tva")) {
    return {
      status: "tva",
      label: "Risque TVA",
      priorityLevel: 2,
      recommendedAction: "Vérifier les seuils TVA et préparer la facturation.",
    };
  }

  if (
    nextAction.includes("charges") ||
    nextAction.includes("cfe") ||
    nextAction.includes("vérifier") ||
    nextAction.includes("contrôler")
  ) {
    return {
      status: "warning",
      label: "Alerte",
      priorityLevel: 3,
      recommendedAction: "Contrôler le point de vigilance avant échéance.",
    };
  }

  return {
    status: "ok",
    label: "OK",
    priorityLevel: 4,
    recommendedAction: "Continuer le suivi régulier du dossier.",
  };
}

function getSuggestedStatus(revenueInput, nextActionInput) {
  const revenueValue = parseRevenueValue(revenueInput);
  const nextAction = String(nextActionInput || "").toLowerCase();

  if (nextAction.includes("retard")) {
    return "late";
  }

  if (revenueValue >= 12000 || nextAction.includes("tva")) {
    return "tva";
  }

  if (
    nextAction.includes("charges") ||
    nextAction.includes("cfe") ||
    nextAction.includes("vérifier") ||
    nextAction.includes("contrôler")
  ) {
    return "warning";
  }

  return "ok";
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
  if (typeof revenue === "number") {
    return `${revenue.toLocaleString("fr-FR")} €`;
  }

  return revenue || "—";
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
  const [reminderType, setReminderType] = useState("declaration");
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
  const [addClientError, setAddClientError] = useState("");
  const [noteClientId, setNoteClientId] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteError, setNoteError] = useState("");
  const [notesClientId, setNotesClientId] = useState(null);
  const [inlineNoteDraft, setInlineNoteDraft] = useState("");
  const [inlineNoteError, setInlineNoteError] = useState("");
  const [newClientForm, setNewClientForm] = useState({
    name: "",
    activity: "",
    revenue: "",
    nextAction: "",
    status: "ok",
  });

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

    return clientHistory.filter((event) => event.clientId === selectedClient.id);
  }, [clientHistory, selectedClient]);
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
          action: client.nextAction,
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
  const suggestedStatus = useMemo(
    () => getSuggestedStatus(newClientForm.revenue, newClientForm.nextAction),
    [newClientForm.nextAction, newClientForm.revenue],
  );

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

  function buildReminderMessage(client) {
    if (!client) return "";

    return `Bonjour ${client.name}, petit rappel concernant : ${client.nextAction}. Merci de vérifier ce point dès que possible.`;
  }

  function openReminderModal(client) {
    setReminderClientId(client.id);
    setReminderType("declaration");
    setReminderMessage(buildReminderMessage(client));
  }

  function closeReminderModal() {
    setReminderClientId(null);
    setReminderType("declaration");
    setReminderMessage("");
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
    setAddClientError("");
    setNewClientForm({
      name: "",
      activity: "",
      revenue: "",
      nextAction: "",
      status: "ok",
    });
    setShowAddClientModal(true);
  }

  function closeAddClientModal() {
    setAddClientError("");
    setShowAddClientModal(false);
  }

  function handleNewClientChange(field, value) {
    setNewClientForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }

  function handleAddClient() {
    const clientName = newClientForm.name.trim();
    const clientActivity = newClientForm.activity.trim();
    const clientRevenue = newClientForm.revenue.trim();
    const clientNextAction = newClientForm.nextAction.trim();
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

    if (!clientNextAction) {
      setAddClientError("La prochaine action est requise.");
      return;
    }

    setAddClientError("");

    const nextClient = {
      id: Date.now(),
      name: clientName,
      activity: clientActivity,
      revenue: `${revenueValue.toLocaleString("fr-FR")} €`,
      nextAction: clientNextAction,
      status: newClientForm.status,
      priorities: [
        "Vérifier les informations du dossier",
        "Préparer la prochaine action",
      ],
      notes: "Dossier ajouté manuellement dans le prototype expert.",
    };

    setClients((currentClients) => [nextClient, ...currentClients]);
    setSuccessMessage(`Client ajouté : ${clientName}`);
    closeAddClientModal();
  }

  function handleSimulateReminder() {
    if (!reminderClient) return;

    const reminderTypeLabels = {
      declaration: "Déclaration URSSAF",
      tva: "TVA",
      cfe: "CFE",
      pieces: "Pièces manquantes",
      autre: "Autre",
    };

    setClientHistory((currentHistory) => [
      {
        clientId: reminderClient.id,
        type: "reminder",
        label: "Rappel envoyé",
        detail: reminderTypeLabels[reminderType] || "Autre",
        date: new Date(),
      },
      ...currentHistory,
    ]);
    setSuccessMessage(`Rappel préparé pour ${reminderClient.name}.`);
    closeReminderModal();
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

    setClientHistory((currentHistory) => [
      {
        clientId: noteClient.id,
        type: "note",
        label: "Note ajoutée",
        detail:
          trimmedNote.length > 60 ? `${trimmedNote.slice(0, 60)}…` : trimmedNote,
        date: new Date(),
      },
      ...currentHistory,
    ]);

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

    setClientHistory((currentHistory) => [
      {
        clientId: notesClient.id,
        type: "note",
        label: "Note ajoutée",
        detail:
          trimmedNote.length > 60 ? `${trimmedNote.slice(0, 60)}…` : trimmedNote,
        date: new Date(),
      },
      ...currentHistory,
    ]);

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
              <h3 id="expert-add-client-title">Ajouter un client</h3>
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
            <label htmlFor="expert-client-activity">Activité</label>
            <input
              id="expert-client-activity"
              type="text"
              className="expertModalInput"
              value={newClientForm.activity}
              onChange={(event) =>
                handleNewClientChange("activity", event.target.value)
              }
            />
          </div>

          <div className="expertModalField">
            <label htmlFor="expert-client-revenue">Chiffre d’affaires</label>
            <input
              id="expert-client-revenue"
              type="text"
              className="expertModalInput"
              value={newClientForm.revenue}
              onChange={(event) =>
                handleNewClientChange("revenue", event.target.value)
              }
            />
          </div>

          <div className="expertModalField">
            <label htmlFor="expert-client-next-action">Prochaine action</label>
            <input
              id="expert-client-next-action"
              type="text"
              className="expertModalInput"
              value={newClientForm.nextAction}
              onChange={(event) =>
                handleNewClientChange("nextAction", event.target.value)
              }
            />
          </div>

          <div className="expertModalField">
            <label htmlFor="expert-client-status">Statut</label>
            <select
              id="expert-client-status"
              className="expertModalSelect"
              value={newClientForm.status}
              onChange={(event) =>
                handleNewClientChange("status", event.target.value)
              }
            >
              <option value="ok">OK</option>
              <option value="late">En retard</option>
              <option value="tva">Risque TVA</option>
              <option value="warning">Alerte</option>
            </select>
            <div className="expertModalHelperRow">
              <span className="expertModalHelperText">
                Statut suggéré : {getStatusLabel(suggestedStatus)}
              </span>
              <button
                type="button"
                className="expertModalHelperAction"
                onClick={() => handleNewClientChange("status", suggestedStatus)}
              >
                Appliquer le statut suggéré
              </button>
            </div>
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
              onClick={handleAddClient}
            >
              Ajouter
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
                <span>Dossiers stables</span>
                <strong>
                  {clients.filter((client) => getClientRisk(client).status === "ok").length}
                </strong>
              </div>
              <div className="expertKpiCard">
                <span>Notes enregistrées</span>
                <strong>
                  {clients.reduce((total, client) => {
                    if (Array.isArray(client.notesList)) {
                      return total + client.notesList.length;
                    }

                    return total + (client.notes ? 1 : 0);
                  }, 0)}
                </strong>
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
                          <p>{client.nextAction}</p>
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
                <span>Activité</span>
                <strong>{selectedClient.activity}</strong>
              </div>
              <div className="expertInfoBlock">
                <span>Chiffre d’affaires</span>
                <strong>{formatRevenue(selectedClient.revenue)}</strong>
              </div>
              <div className="expertInfoBlock">
                <span>Prochaine action</span>
                <strong>{selectedClient.nextAction}</strong>
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
                {selectedClient.priorities.map((priority) => (
                  <li key={priority}>{priority}</li>
                ))}
              </ul>
            </div>

            <div className="expertPanelBlock">
              <h3>Historique des actions</h3>
              {selectedClientHistory.length === 0 ? (
                <p className="expertHistoryEmpty">Aucune action pour ce client.</p>
              ) : (
                <ul className="expertHistoryList">
                  {selectedClientHistory.map((event, index) => (
                    <li
                      key={`${event.clientId}-${event.type}-${event.date.toISOString()}-${index}`}
                    >
                      <span className="expertHistoryDate">
                        {event.date.toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </span>
                      <span className="expertHistoryText">
                        {event.label} ({event.detail})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
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
        <>
          {renderEmptyState()}
          {renderAddClientModal()}
        </>
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
                <span>Prochaine action</span>
                <strong>{client.nextAction}</strong>
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
              <label htmlFor="expert-reminder-type">Type de rappel</label>
              <select
                id="expert-reminder-type"
                className="expertModalSelect"
                value={reminderType}
                onChange={(event) => setReminderType(event.target.value)}
              >
                <option value="declaration">Déclaration URSSAF</option>
                <option value="tva">TVA</option>
                <option value="cfe">CFE</option>
                <option value="pieces">Pièces manquantes</option>
                <option value="autre">Autre</option>
              </select>
            </div>

            <div className="expertModalField">
              <label htmlFor="expert-reminder-message">Message</label>
              <textarea
                id="expert-reminder-message"
                className="expertModalTextarea"
                value={reminderMessage}
                onChange={(event) => setReminderMessage(event.target.value)}
                rows={5}
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
                onClick={handleSimulateReminder}
              >
                Simuler l’envoi
              </button>
            </div>
          </div>
        </div>
      )}

      {clients.length > 0 && showAddClientModal && (
        <div className="expertModalOverlay" role="presentation">
          <div
            className="expertModalCard"
            role="dialog"
            aria-modal="true"
            aria-labelledby="expert-add-client-title"
          >
            <div className="expertModalHeader">
              <div>
                <h3 id="expert-add-client-title">Ajouter un client</h3>
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
              <label htmlFor="expert-client-activity">Activité</label>
              <input
                id="expert-client-activity"
                type="text"
                className="expertModalInput"
                value={newClientForm.activity}
                onChange={(event) =>
                  handleNewClientChange("activity", event.target.value)
                }
              />
            </div>

            <div className="expertModalField">
              <label htmlFor="expert-client-revenue">Chiffre d’affaires</label>
              <input
                id="expert-client-revenue"
                type="text"
                className="expertModalInput"
                value={newClientForm.revenue}
                onChange={(event) =>
                  handleNewClientChange("revenue", event.target.value)
                }
              />
            </div>

            <div className="expertModalField">
              <label htmlFor="expert-client-next-action">Prochaine action</label>
              <input
                id="expert-client-next-action"
                type="text"
                className="expertModalInput"
                value={newClientForm.nextAction}
                onChange={(event) =>
                  handleNewClientChange("nextAction", event.target.value)
                }
              />
            </div>

            <div className="expertModalField">
              <label htmlFor="expert-client-status">Statut</label>
              <select
                id="expert-client-status"
                className="expertModalSelect"
                value={newClientForm.status}
                onChange={(event) =>
                  handleNewClientChange("status", event.target.value)
                }
              >
                <option value="ok">OK</option>
                <option value="late">En retard</option>
                <option value="tva">Risque TVA</option>
                <option value="warning">Alerte</option>
              </select>
              <div className="expertModalHelperRow">
                <span className="expertModalHelperText">
                  Statut suggéré : {getStatusLabel(suggestedStatus)}
                </span>
                <button
                  type="button"
                  className="expertModalHelperAction"
                  onClick={() => handleNewClientChange("status", suggestedStatus)}
                >
                  Appliquer le statut suggéré
                </button>
              </div>
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
                onClick={handleAddClient}
              >
                Ajouter
              </button>
            </div>
          </div>
        </div>
      )}

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
