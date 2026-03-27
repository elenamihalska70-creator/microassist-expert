import { useState } from 'react';

export default function CGUModal({ isOpen, onClose, initialTab = 'cgu' }) {
  const [activeTab, setActiveTab] = useState(initialTab);

  if (!isOpen) return null;

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" style={{ maxWidth: '700px', maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="sectionHead">
          <h3>Mentions légales</h3>
          <button className="iconBtn" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid #e2e8f0' }}>
          <button
            onClick={() => setActiveTab('cgu')}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: activeTab === 'cgu' ? '600' : '400',
              borderBottom: activeTab === 'cgu' ? '2px solid #7c3aed' : 'none',
              color: activeTab === 'cgu' ? '#7c3aed' : '#64748b'
            }}
          >
            📋 CGU
          </button>
          <button
            onClick={() => setActiveTab('privacy')}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: activeTab === 'privacy' ? '600' : '400',
              borderBottom: activeTab === 'privacy' ? '2px solid #7c3aed' : 'none',
              color: activeTab === 'privacy' ? '#7c3aed' : '#64748b'
            }}
          >
            🔒 Confidentialité
          </button>
        </div>

        {activeTab === 'cgu' && (
          <div style={{ lineHeight: 1.6, color: '#334155' }}>
            <h4 style={{ marginBottom: 12 }}>1. Objet</h4>
            <p style={{ marginBottom: 16 }}>Microassist est un outil d'aide à la gestion fiscale pour micro-entrepreneurs. Les informations fournies sont à titre indicatif et ne remplacent pas un conseil d'expert-comptable.</p>

            <h4 style={{ marginBottom: 12 }}>2. Utilisation</h4>
            <p style={{ marginBottom: 16 }}>L'utilisateur est responsable de la saisie de ses données et de la vérification des calculs auprès des organismes officiels (URSSAF, impôts).</p>

            <h4 style={{ marginBottom: 12 }}>3. Responsabilité</h4>
            <p style={{ marginBottom: 16 }}>Microassist ne saurait être tenu responsable d'éventuelles erreurs de calcul ou d'omissions. L'outil est fourni "en l'état".</p>

            <h4 style={{ marginBottom: 12 }}>4. Modification</h4>
            <p style={{ marginBottom: 16 }}>Nous nous réservons le droit de modifier les CGU à tout moment. Les utilisateurs seront informés des changements majeurs.</p>

            <p style={{ fontSize: 12, color: '#64748b', marginTop: 20 }}>Dernière mise à jour : mars 2026</p>
          </div>
        )}

        {activeTab === 'privacy' && (
          <div style={{ lineHeight: 1.6, color: '#334155' }}>
            <h4 style={{ marginBottom: 12 }}>Données collectées</h4>
            <p style={{ marginBottom: 16 }}>Nous collectons uniquement les données nécessaires au fonctionnement : email, revenus, activité, périodicité de déclaration. Aucune donnée bancaire n'est collectée.</p>

            <h4 style={{ marginBottom: 12 }}>Stockage</h4>
            <p style={{ marginBottom: 16 }}>Les données sont stockées de manière sécurisée sur les serveurs Supabase (hébergement UE). Vous pouvez demander la suppression de vos données à tout moment.</p>

            <h4 style={{ marginBottom: 12 }}>Cookies</h4>
            <p style={{ marginBottom: 16 }}>Nous utilisons uniquement des cookies techniques nécessaires au fonctionnement (authentification, préférences).</p>

            <h4 style={{ marginBottom: 12 }}>Vos droits</h4>
            <p style={{ marginBottom: 16 }}>Conformément au RGPD, vous disposez d'un droit d'accès, de rectification et de suppression de vos données. Contactez-nous à : support@microassist.fr</p>

            <p style={{ fontSize: 12, color: '#64748b', marginTop: 20 }}>Dernière mise à jour : mars 2026</p>
          </div>
        )}

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btnPrimary" onClick={onClose}>
            J'ai compris
          </button>
        </div>
      </div>
    </div>
  );
}