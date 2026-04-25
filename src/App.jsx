import React from "react";
import "./App.css";
import ExpertDashboard from "./components/ExpertDashboard";

function App() {
  return (
    <div className="app appShell">
      <div className="appContainer">
        <header className="appHeader">
          <div className="appBrandBlock">
            <p className="appSubtitle">Tableau de bord B2B</p>
            <h1>Microassist Expert</h1>
          </div>

          <nav className="appNav" aria-label="Navigation principale">
            <a className="appNavPill appNavPillActive" href="#dashboard">
              Dashboard
            </a>
            <a className="appNavPill" href="#clients">
              Clients
            </a>
            <a className="appNavPill" href="#alertes">
              Alertes
            </a>
            <a className="appNavPill" href="#parametres">
              Paramètres
            </a>
          </nav>
        </header>

        <main className="appMain" id="dashboard">
          <ExpertDashboard />
        </main>
      </div>
    </div>
  );
}

export default App;
