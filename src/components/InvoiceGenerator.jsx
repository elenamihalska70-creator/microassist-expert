import { useState } from "react";
import { supabase } from "../lib/supabase.js";
import jsPDF from "jspdf";

const SELLER_NAME =
  import.meta.env.VITE_INVOICE_SELLER_NAME || "Microassist";
const SELLER_ADDRESS =
  import.meta.env.VITE_INVOICE_SELLER_ADDRESS || "Adresse a completer";
const SELLER_EMAIL = import.meta.env.VITE_INVOICE_SELLER_EMAIL || "";
const SELLER_SIRET = import.meta.env.VITE_INVOICE_SELLER_SIRET || "";
const TVA_MENTION = "TVA non applicable, art. 293 B du CGI";
const LATE_PENALTY_MENTION =
  "Penalites de retard : taux legal en vigueur apres la date d'echeance.";
const FLAT_FEE_MENTION =
  "Indemnite forfaitaire pour frais de recouvrement : 40 EUR.";

function formatDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysToDate(dateString, days = 30) {
  const base = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + days);
  return formatDateInput(base);
}

function formatDateFr(dateStr) {
  if (!dateStr) return "—";
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function pad(value, length = 2) {
  return String(value).padStart(length, "0");
}

const today = formatDateInput(new Date());

const DEFAULT_FORM = {
  client_name: "",
  client_address: "",
  client_email: "",
  description: "",
  amount: "",
  invoice_date: today,
  due_date: addDaysToDate(today, 30),
};

function getSellerTvaMention(fiscalProfile) {
  if (
    fiscalProfile?.tva_mode === "franchise_en_base" ||
    !fiscalProfile?.tva_mode
  ) {
    return TVA_MENTION;
  }

  return "TVA applicable selon le regime fiscal en vigueur.";
}

export default function InvoiceGenerator({
  user,
  fiscalProfile,
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  function handleChange(field, value) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };

      if (field === "invoice_date") {
        next.due_date = addDaysToDate(value, 30);
      }

      return next;
    });
  }

  async function generateInvoiceNumber() {
    const year = new Date().getFullYear();
    const prefix = `FAC-${year}-`;

    const { data, error } = await supabase
      .from("invoices")
      .select("invoice_number")
      .eq("user_id", user.id)
      .like("invoice_number", `${prefix}%`)
      .order("invoice_number", { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    const maxSequence = (data || []).reduce((max, invoice) => {
      const invoiceNumber = String(invoice?.invoice_number || "");
      const match = invoiceNumber.match(
        new RegExp(`^FAC-${year}-(\\d{4})$`),
      );

      if (!match) return max;

      return Math.max(max, Number(match[1]));
    }, 0);

    return `${prefix}${pad(maxSequence + 1, 4)}`;
  }

  function getNormalizedAmount() {
    return Number(String(form.amount || "0").replace(",", "."));
  }

  function validateForm() {
    const amount = getNormalizedAmount();

    if (!form.client_name.trim()) {
      return "Le nom du client est obligatoire.";
    }

    if (!form.description.trim()) {
      return "La prestation est obligatoire.";
    }

    if (!amount || amount <= 0) {
      return "Le montant HT doit être supérieur à 0 €.";
    }

    if (!form.invoice_date) {
      return "La date de facture est obligatoire.";
    }

    if (!form.due_date) {
      return "La date d’échéance est obligatoire.";
    }

    const invoiceDate = new Date(`${form.invoice_date}T00:00:00`);
    const dueDate = new Date(`${form.due_date}T00:00:00`);

    if (
      Number.isNaN(invoiceDate.getTime()) ||
      Number.isNaN(dueDate.getTime())
    ) {
      return "Les dates de facture et d’échéance doivent être valides.";
    }

    if (dueDate < invoiceDate) {
      return "La date d’échéance ne peut pas être antérieure à la date de facture.";
    }

    return null;
  }

  async function handleSave() {
    if (saving) return;

    const validationError = validateForm();

    if (validationError) {
      alert(validationError);
      return;
    }

    if (!user?.id) {
      alert("Impossible d'enregistrer la facture sans compte connecté.");
      return;
    }

    setSaving(true);

    try {
      const number = await generateInvoiceNumber();
      const amount = getNormalizedAmount();

      const payload = {
        user_id: user.id,
        invoice_number: number,
        client_name: form.client_name.trim(),
        client_address: form.client_address.trim(),
        client_email: form.client_email.trim(),
        description: form.description.trim(),
        amount,
        invoice_date: form.invoice_date,
        due_date: form.due_date,
        status: "sent",
      };

      const { error } = await supabase.from("invoices").insert(payload);

      if (error) throw error;

      generatePDF(number, payload);

      if (onSaved) onSaved();
    } catch (err) {
      console.error("Erreur sauvegarde facture:", err);
      alert("Impossible d'enregistrer la facture.");
    } finally {
      setSaving(false);
    }
  }

  function generatePDF(number, data) {
    const doc = new jsPDF();
    const amount = Number(data.amount || 0);
    const pageWidth = doc.internal.pageSize.getWidth();
    const sellerEmail = SELLER_EMAIL || user?.email || "Email non renseigne";
    const sellerTvaMention = getSellerTvaMention(fiscalProfile);

    // Header
    doc.setFillColor(91, 33, 182);
    doc.rect(0, 0, pageWidth, 40, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("FACTURE", 20, 18);

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`N° ${number}`, 20, 28);
    doc.text(`Date : ${formatDateFr(data.invoice_date)}`, 20, 35);

    // Emetteur
    doc.setTextColor(30, 27, 75);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Émetteur", 20, 55);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(55, 65, 81);
    doc.setFontSize(10);
    doc.text(SELLER_NAME, 20, 63);
    doc.text(user?.email || "Email non renseigné", 20, 70);
    doc.setFillColor(255, 255, 255);
    doc.rect(20, 64, 95, 10, "F");
    doc.setTextColor(55, 65, 81);
    doc.text(sellerEmail, 20, 70);
    const sellerAddressLines = doc.splitTextToSize(SELLER_ADDRESS, 80);
    doc.text(sellerAddressLines, 20, 77);
    const sellerInfoY = 77 + sellerAddressLines.length * 6 + 8;
    if (SELLER_SIRET) {
      doc.text(`SIRET : ${SELLER_SIRET}`, 20, sellerInfoY);
    }
    doc.setFillColor(255, 255, 255);
    doc.rect(20, sellerInfoY + 1, 95, 8, "F");
    doc.setTextColor(55, 65, 81);
    doc.text(sellerTvaMention, 20, sellerInfoY + 7);
    doc.text("TVA non applicable — Art. 293 B du CGI", 20, 84);

    doc.setFillColor(255, 255, 255);
    doc.rect(20, 80, 95, 8, "F");
    doc.setTextColor(55, 65, 81);
    doc.text(sellerTvaMention, 20, sellerInfoY + 7);

    // Client
    doc.setTextColor(30, 27, 75);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Client", 120, 55);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(55, 65, 81);
    doc.setFontSize(10);
    doc.text(data.client_name || "—", 120, 63);

    let clientY = 70;

    if (data.client_address) {
      const lines = doc.splitTextToSize(data.client_address, 70);
      doc.text(lines, 120, clientY);
      clientY += lines.length * 6 + 2;
    }

    if (data.client_email) {
      doc.text(data.client_email, 120, clientY);
    }

    // Separator
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.line(20, 100, pageWidth - 20, 100);

    // Table header
    doc.setFillColor(245, 243, 255);
    doc.rect(20, 105, pageWidth - 40, 10, "F");

    doc.setTextColor(91, 33, 182);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Prestation", 25, 112);
    doc.text("Montant HT", pageWidth - 55, 112);

    // Table row
    doc.setTextColor(55, 65, 81);
    doc.setFont("helvetica", "normal");
    const descLines = doc.splitTextToSize(data.description || "Prestation", 115);
    doc.text(descLines, 25, 125);
    doc.text(`${amount.toLocaleString("fr-FR")} €`, pageWidth - 55, 125);

    const tableBottom = Math.max(140, 125 + descLines.length * 6);

    // Total box
    doc.setDrawColor(229, 231, 235);
    doc.line(20, tableBottom + 5, pageWidth - 20, tableBottom + 5);

    doc.setFillColor(91, 33, 182);
    doc.rect(pageWidth - 85, tableBottom + 12, 65, 14, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL TTC", pageWidth - 80, tableBottom + 21);
    doc.text(`${amount.toLocaleString("fr-FR")} €`, pageWidth - 52, tableBottom + 21);

    // Legal mentions
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text(sellerTvaMention, 20, tableBottom + 42);
    doc.text(`Date d'échéance : ${formatDateFr(data.due_date)}`, 20, tableBottom + 50);

    // Footer
    doc.setFillColor(245, 243, 255);
    doc.rect(0, 268, pageWidth, 29, "F");

    doc.setTextColor(91, 33, 182);
    doc.setFontSize(9);
    doc.text("Microassist — Assistant fiscal pour micro-entrepreneurs", pageWidth / 2, 283, {
      align: "center",
    });
    doc.text("microassist.fr", pageWidth / 2, 290, { align: "center" });
    doc.setFillColor(245, 243, 255);
    doc.rect(0, 268, pageWidth, 29, "F");
    doc.setTextColor(91, 33, 182);
    doc.setFontSize(7.5);
    doc.text(LATE_PENALTY_MENTION, pageWidth / 2, 278, {
      align: "center",
    });
    doc.text(FLAT_FEE_MENTION, pageWidth / 2, 284, { align: "center" });
    doc.setFontSize(8.5);
    doc.text("Microassist - Assistant fiscal pour micro-entrepreneurs", pageWidth / 2, 291, {
      align: "center",
    });

    doc.save(`facture-${number}.pdf`);
  }

  const amount = getNormalizedAmount();

  return (
    <div
      className="modalOverlay"
      onClick={onClose}
      style={{ overflowY: "auto", alignItems: "flex-start" }}
    >
      <div
        className="modalCard"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 560,
          width: "100%",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          overflowX: "hidden",
          margin: "auto",
        }}
      >
        <div className="sectionHead">
          <h3>🧾 Créer une facture</h3>
          <button className="iconBtn" onClick={onClose} type="button">
            ✕
          </button>
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
              placeholder="Ex : Développement d’un site web — mars 2026"
            />
          </label>

          <label className="field">
            <span>Montant HT (€) *</span>
            <input
              type="number"
              min="0.01"
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
              min={form.invoice_date}
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
              <strong>Non applicable (Art. 293 B du CGI)</strong>
            </div>

            <div className="previewRow">
              <span>Total à payer</span>
              <strong>{amount.toLocaleString("fr-FR")} €</strong>
            </div>
          </div>
        )}

        <div
          className="miniActions"
          style={{
            marginTop: 16,
            position: "sticky",
            bottom: 0,
            background: "#fff",
            paddingTop: 12,
          }}
        >
          <button className="btn btnGhost" onClick={onClose} type="button">
            Annuler
          </button>

          <button
            className="btn btnPrimary"
            onClick={handleSave}
            disabled={saving}
            type="button"
          >
            {saving ? "Enregistrement..." : "Créer et télécharger la facture"}
          </button>
        </div>
      </div>
    </div>
  );
}
