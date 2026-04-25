import React, { useState } from "react";
import "./App.css";
import ExpertDashboard from "./components/ExpertDashboard";

const sections = [
  { id: "dashboard", label: "Dashboard" },
  { id: "clients", label: "Clients" },
  { id: "alertes", label: "Alertes" },
  { id: "notes", label: "Notes" },
  { id: "parametres", label: "Paramètres" },
];

const placeholders = {
  parametres: "Paramètres du cabinet",
};

function App() {
  const [activeSection, setActiveSection] = useState("dashboard");
  const activeLabel =
    sections.find((section) => section.id === activeSection)?.label ||
    "Dashboard";

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
          ) : (
            <section className="appPlaceholderCard">
              <p className="appPlaceholderLabel">{activeLabel}</p>
              <h3>{placeholders[activeSection]}</h3>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
