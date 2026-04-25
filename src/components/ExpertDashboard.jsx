import { useMemo, useState } from "react";
import "./ExpertDashboard.css";

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

export default function ExpertDashboard() {
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const selectedClient = useMemo(
    () => mockClients.find((client) => client.id === selectedClientId) || null,
    [selectedClientId],
  );

  const kpis = useMemo(() => {
    const clientsSuivis = mockClients.length;
    const enRetard = mockClients.filter((client) => client.status === "late").length;
    const risqueTva = mockClients.filter(
      (client) => client.status === "tva_risk",
    ).length;
    const actionsCetteSemaine = mockClients.filter(
      (client) =>
        client.status === "late" ||
        client.status === "tva_risk" ||
        client.status === "alert",
    ).length;

    return { clientsSuivis, enRetard, risqueTva, actionsCetteSemaine };
  }, []);

  const visibleClients = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return mockClients.filter((client) => {
      const matchesFilter =
        activeFilter === "all" ? true : client.status === activeFilter;
      const matchesSearch = normalizedQuery
        ? client.name.toLowerCase().includes(normalizedQuery)
        : true;

      return matchesFilter && matchesSearch;
    });
  }, [activeFilter, searchQuery]);

  if (selectedClient) {
    return (
      <section className="expertDashboard">
        <div className="expertBanner">
          Microassist Expert aide les professionnels à suivre plusieurs
          micro-entrepreneurs, repérer les risques et éviter les oublis côté
          client.
        </div>

        <div className="expertDetail">
          <button
            type="button"
            className="btn btnGhost btnSmall"
            onClick={() => setSelectedClientId(null)}
          >
            Retour à la liste
          </button>

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
              <p>{selectedClient.notes}</p>
            </div>

            <div className="expertPanelBlock">
              <h3>Smart Priorités</h3>
              <ul className="expertPriorityList">
                {selectedClient.priorities.map((priority) => (
                  <li key={priority}>{priority}</li>
                ))}
              </ul>
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
      </div>

      <div className="expertDashboard__header">
        <div>
          <p className="expertDashboard__eyebrow">Mode expert</p>
          <h2>Portefeuille clients</h2>
          <p className="expertDashboard__subtitle">
            Vue rapide des dossiers à suivre en priorité.
          </p>
        </div>
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
              <button type="button" className="btn btnGhost btnSmall">
                Envoyer rappel
              </button>
              <button type="button" className="btn btnGhost btnSmall">
                Ajouter note
              </button>
            </div>
          </article>
        ))}

        {visibleClients.length === 0 && (
          <div className="expertEmptyState">Aucun dossier pour cette recherche.</div>
        )}
      </div>
    </section>
  );
}
