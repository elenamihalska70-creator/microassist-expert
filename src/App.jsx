import React, { useState } from "react";
import "./App.css";
import ExpertDashboard from "./components/ExpertDashboard";

const CABINET_SETTINGS_STORAGE_KEY = "microassist_expert_cabinet_settings";

const sections = [
  { id: "dashboard", label: "Dashboard" },
  { id: "clients", label: "Clients" },
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
  const activeLabel =
    sections.find((section) => section.id === activeSection)?.label ||
    "Dashboard";

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
          <p className="appHeaderMeta">Interface cabinet</p>
        </header>

        <main className="appMain">
          {["dashboard", "clients", "alertes", "notes"].includes(activeSection) ? (
            <ExpertDashboard
              view={activeSection}
              onOpenClient={() => setActiveSection("clients")}
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
                    <li>Version B2B en test</li>
                  </ul>
                </section>
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
    </div>
  );
}

export default App;
