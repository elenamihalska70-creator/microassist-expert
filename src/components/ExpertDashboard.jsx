import { useEffect, useMemo, useState } from "react";
import "./ExpertDashboard.css";

const EXPERT_CLIENTS_STORAGE_KEY = "microassist_expert_clients";
const EXPERT_HISTORY_STORAGE_KEY = "microassist_expert_history";

const FILTERS = [
  { key: "all", label: "Tous" },
  { key: "late", label: "En retard" },
  { key: "tva_risk", label: "Risque TVA" },
  { key: "alert", label: "Alertes" },
  { key: "ok", label: "OK" },
];

const mockClients = [
  {
    id: 1,
    name: "Sophie Martin",
    activity: "Prestation de services",
    revenue: "4 850 €",
    status: "ok",
    nextAction: "Déclaration URSSAF le 30 avril",
    notes: "Cliente autonome, peu de relances nécessaires.",
    priorities: [
      "Vérifier la prochaine échéance URSSAF",
      "Préparer le suivi mensuel",
    ],
  },
  {
    id: 2,
    name: "Lucas Bernard",
    activity: "Vente en ligne",
    revenue: "12 400 €",
    status: "tva_risk",
    nextAction: "Vérifier le seuil TVA",
    notes: "CA en hausse, surveiller le passage de seuil.",
    priorities: [
      "Contrôler le seuil TVA",
      "Préparer un point client sur la facturation",
    ],
  },
  {
    id: 3,
    name: "Emma Petit",
    activity: "Consulting",
    revenue: "2 100 €",
    status: "late",
    nextAction: "Déclaration en retard à régulariser",
    notes: "Besoin d’un rappel rapide cette semaine.",
    priorities: [
      "Régulariser la déclaration",
      "Envoyer un rappel client",
    ],
  },
  {
    id: 4,
    name: "Nina Robert",
    activity: "Graphisme",
    revenue: "6 320 €",
    status: "ok",
    nextAction: "Préparer l’échéance CFE",
    notes: "RAS, dossier stable.",
    priorities: [
      "Préparer l’échéance CFE",
      "Vérifier les charges estimées",
    ],
  },
  {
    id: 5,
    name: "Thomas Garcia",
    activity: "Activité mixte",
    revenue: "8 970 €",
    status: "alert",
    nextAction: "Contrôler les charges estimées",
    notes: "Activité mixte, points de vigilance sur le suivi.",
    priorities: [
      "Vérifier la ventilation vente / service",
      "Contrôler les charges estimées",
    ],
  },
];

function getStatusLabel(status) {
  switch (status) {
    case "late":
      return "En retard";
    case "tva_risk":
      return "Risque TVA";
    case "alert":
      return "Alerte";
    default:
      return "OK";
  }
}

function getSuggestedStatus(revenueInput, nextActionInput) {
  const normalizedRevenue = String(revenueInput || "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  const revenueValue = Number(normalizedRevenue);
  const nextAction = String(nextActionInput || "").toLowerCase();

  if (nextAction.includes("retard")) {
    return "late";
  }

  if (!Number.isNaN(revenueValue) && revenueValue >= 10000) {
    return "tva_risk";
  }

  if (!Number.isNaN(revenueValue) && revenueValue >= 7000) {
    return "alert";
  }

  return "ok";
}

export default function ExpertDashboard() {
  const [clients, setClients] = useState(() => {
    try {
      const raw = localStorage.getItem(EXPERT_CLIENTS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : mockClients;
    } catch {
      return mockClients;
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
    if (!selectedClient) return [];

    if (Array.isArray(selectedClient.notesList) && selectedClient.notesList.length > 0) {
      return selectedClient.notesList;
    }

    return selectedClient.notes ? [selectedClient.notes] : [];
  }, [selectedClient]);

  const kpis = useMemo(() => {
    const clientsSuivis = clients.length;
    const enRetard = clients.filter((client) => client.status === "late").length;
    const risqueTva = clients.filter(
      (client) => client.status === "tva_risk",
    ).length;
    const actionsCetteSemaine = clients.filter(
      (client) =>
        client.status === "late" ||
        client.status === "tva_risk" ||
        client.status === "alert",
    ).length;

    return { clientsSuivis, enRetard, risqueTva, actionsCetteSemaine };
  }, [clients]);

  const visibleClients = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return clients.filter((client) => {
      const matchesFilter =
        activeFilter === "all" ? true : client.status === activeFilter;
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

    const nextNotesList = Array.isArray(noteClient.notesList)
      ? [trimmedNote, ...noteClient.notesList]
      : noteClient.notes
        ? [trimmedNote, noteClient.notes]
        : [trimmedNote];

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
                className={`expertBadge expertBadge--${selectedClient.status}`}
              >
                {getStatusLabel(selectedClient.status)}
              </span>
            </div>

            <div className="expertDetailGrid">
              <div className="expertInfoBlock">
                <span>Activité</span>
                <strong>{selectedClient.activity}</strong>
              </div>
              <div className="expertInfoBlock">
                <span>Chiffre d’affaires</span>
                <strong>{selectedClient.revenue}</strong>
              </div>
              <div className="expertInfoBlock">
                <span>Prochaine action</span>
                <strong>{selectedClient.nextAction}</strong>
              </div>
              <div className="expertInfoBlock">
                <span>Statut</span>
                <strong>{getStatusLabel(selectedClient.status)}</strong>
              </div>
            </div>

            <div className="expertPanelBlock">
              <h3>Notes expert</h3>
              {selectedClientNotes.length > 0 ? (
                <ul className="expertNotesList">
                  {selectedClientNotes.map((note, index) => (
                    <li key={`${selectedClient.id}-note-${index}`}>{note}</li>
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
            Vue rapide des dossiers à suivre en priorité.
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

      <div className="expertKpis">
        <div className="expertKpiCard">
          <span>Clients suivis</span>
          <strong>{kpis.clientsSuivis}</strong>
        </div>
        <div className="expertKpiCard">
          <span>En retard</span>
          <strong>{kpis.enRetard}</strong>
        </div>
        <div className="expertKpiCard">
          <span>Risque TVA</span>
          <strong>{kpis.risqueTva}</strong>
        </div>
        <div className="expertKpiCard">
          <span>Actions cette semaine</span>
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
            className={`expertCard expertCard--${client.status}`}
          >
            <div className="expertCard__top">
              <div>
                <h3>{client.name}</h3>
                <p>{client.activity}</p>
              </div>
              <span className={`expertBadge expertBadge--${client.status}`}>
                {getStatusLabel(client.status)}
              </span>
            </div>

            <div className="expertCard__body">
              <div>
                <span>Chiffre d’affaires</span>
                <strong>{client.revenue}</strong>
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

      {showAddClientModal && (
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
                <option value="tva_risk">Risque TVA</option>
                <option value="alert">Alerte</option>
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
