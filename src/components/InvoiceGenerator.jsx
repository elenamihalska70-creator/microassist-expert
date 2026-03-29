import { useState } from "react";
import { supabase } from "../lib/supabase.js";
import jsPDF from "jspdf";

const DEFAULT_FORM = {
  client_name: "",
  client_address: "",
  client_email: "",
  description: "",
  amount: "",
  invoice_date: new Date().toISOString().slice(0, 10),
  due_date: "",
};

export default function InvoiceGenerator({ user, onClose, onSaved }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState(null);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function generateInvoiceNumber(count) {
    const year = new Date().getFullYear();
    const num = String(count + 1).padStart(3, "0");
    return `${year}-${num}`;
  }

  async function handleSave() {
    if (!form.client_name || !form.amount || !form.description) {
      alert("Merci de remplir : client, prestation et montant.");
      return;
    }

    setSaving(true);

    try {
      // Compter les factures existantes pour numérotation
      const { count } = await supabase
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      const number = generateInvoiceNumber(count || 0);
      setInvoiceNumber(number);

      const { error } = await supabase.from("invoices").insert({
        user_id: user.id,
        invoice_number: number,
        client_name: form.client_name,
        client_address: form.client_address,
        client_email: form.client_email,
        description: form.description,
        amount: Number(String(form.amount).replace(",", ".")),
        invoice_date: form.invoice_date,
        due_date: form.due_date || null,
        status: "sent",
      });

      if (error) throw error;

      // Générer et télécharger le PDF
      generatePDF(number);

      if (onSaved) onSaved();
    } catch (err) {
      console.error("Erreur sauvegarde facture:", err);
      alert("Impossible d'enregistrer la facture.");
    } finally {
      setSaving(false);
    }
  }

  function generatePDF(number) {
    const doc = new jsPDF();
    const amount = Number(String(form.amount).replace(",", "."));
    const pageWidth = doc.internal.pageSize.getWidth();

    // En-tête
    doc.setFillColor(91, 33, 182);
    doc.rect(0, 0, pageWidth, 40, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("FACTURE", 20, 18);

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`N° ${number}`, 20, 28);
    doc.text(`Date : ${formatDate(form.invoice_date)}`, 20, 35);

    // Infos vendeur (à gauche)
    doc.setTextColor(30, 27, 75);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Émetteur", 20, 55);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(55, 65, 81);
    doc.setFontSize(10);
    doc.text(user?.email || "—", 20, 63);
    doc.text("SIRET : en cours d'immatriculation", 20, 70);
    doc.text("TVA non applicable — Art. 293B CGI", 20, 77);

    // Infos client (à droite)
    doc.setTextColor(30, 27, 75);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Client", 120, 55);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(55, 65, 81);
    doc.setFontSize(10);
    doc.text(form.client_name, 120, 63);
    if (form.client_address) {
      const lines = doc.splitTextToSize(form.client_address, 70);
      doc.text(lines, 120, 70);
    }
    if (form.client_email) {
      doc.text(form.client_email, 120, 84);
    }

    // Ligne séparatrice
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.line(20, 95, pageWidth - 20, 95);

    // Tableau prestations
    doc.setFillColor(245, 243, 255);
    doc.rect(20, 100, pageWidth - 40, 10, "F");
    doc.setTextColor(91, 33, 182);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Prestation", 25, 107);
    doc.text("Montant HT", pageWidth - 50, 107);

    doc.setTextColor(55, 65, 81);
    doc.setFont("helvetica", "normal");
    const descLines = doc.splitTextToSize(form.description, 120);
    doc.text(descLines, 25, 120);
    doc.text(`${amount.toLocaleString("fr-FR")} €`, pageWidth - 50, 120);

    // Ligne totale
    doc.setDrawColor(229, 231, 235);
    doc.line(20, 135, pageWidth - 20, 135);

    doc.setFillColor(91, 33, 182);
    doc.rect(pageWidth - 80, 140, 60, 14, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL", pageWidth - 75, 149);
    doc.text(`${amount.toLocaleString("fr-FR")} €`, pageWidth - 50, 149);

    // Mentions légales
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("TVA non applicable, article 293 B du CGI", 20, 170);

    if (form.due_date) {
      doc.text(`Date d'échéance : ${formatDate(form.due_date)}`, 20, 178);
    }

    // Pied de page
    doc.setFillColor(245, 243, 255);
    doc.rect(0, 275, pageWidth, 22, "F");
    doc.setTextColor(91, 33, 182);
    doc.setFontSize(9);
    doc.text("Microassist — Assistant fiscal pour micro-entrepreneurs", pageWidth / 2, 283, { align: "center" });
    doc.text("microassist.fr", pageWidth / 2, 290, { align: "center" });

    doc.save(`facture-${number}.pdf`);
  }

  function formatDate(dateStr) {
    if (!dateStr) return "—";
    return new Date(`${dateStr}T00:00:00`).toLocaleDateString("fr-FR", {
      day: "2-digit", month: "long", year: "numeric"
    });
  }

  const amount = Number(String(form.amount || "0").replace(",", "."));

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div
        className="modalCard"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 560, width: "100%" }}
      >
        <div className="sectionHead">
          <h3>🧾 Créer une facture</h3>
          <button className="iconBtn" onClick={onClose}>✕</button>
        </div>

        <div className="formGrid">
          <label className="field fieldFull">
            <span>Client *</span>
            <input
              type="text"
              value={form.client_name}
              onChange={(e) => handleChange("client_name", e.target.value)}
              placeholder="Nom ou raison sociale"
            />
          </label>

          <label className="field fieldFull">
            <span>Adresse client</span>
            <input
              type="text"
              value={form.client_address}
              onChange={(e) => handleChange("client_address", e.target.value)}
              placeholder="Optionnel"
            />
          </label>

          <label className="field fieldFull">
            <span>Email client</span>
            <input
              type="email"
              value={form.client_email}
              onChange={(e) => handleChange("client_email", e.target.value)}
              placeholder="Optionnel"
            />
          </label>

          <label className="field fieldFull">
            <span>Prestation *</span>
            <input
              type="text"
              value={form.description}
              onChange={(e) => handleChange("description", e.target.value)}
              placeholder="Ex : Développement site web — mars 2026"
            />
          </label>

          <label className="field">
            <span>Montant HT (€) *</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => handleChange("amount", e.target.value)}
              placeholder="Ex : 500"
            />
          </label>

          <label className="field">
            <span>Date de facture</span>
            <input
              type="date"
              value={form.invoice_date}
              onChange={(e) => handleChange("invoice_date", e.target.value)}
            />
          </label>

          <label className="field">
            <span>Date d'échéance</span>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => handleChange("due_date", e.target.value)}
            />
          </label>
        </div>

        {amount > 0 && (
          <div className="revenuePreview" style={{ marginTop: 12 }}>
            <div className="previewTitle">Aperçu</div>
            <div className="previewRow">
              <span>Montant HT</span>
              <strong>{amount.toLocaleString("fr-FR")} €</strong>
            </div>
            <div className="previewRow">
              <span>TVA</span>
              <strong>Non applicable (Art. 293B CGI)</strong>
            </div>
            <div className="previewRow">
              <span>Total à payer</span>
              <strong>{amount.toLocaleString("fr-FR")} €</strong>
            </div>
          </div>
        )}

        <div className="miniActions" style={{ marginTop: 16 }}>
          <button className="btn btnGhost" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn btnPrimary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Enregistrement..." : "💾 Enregistrer & télécharger PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}