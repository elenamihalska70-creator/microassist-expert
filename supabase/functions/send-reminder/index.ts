// supabase/functions/send-reminder/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { Resend } from "https://esm.sh/resend@2.0.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = "noreply@microassist.fr";
const APP_URL = Deno.env.get("APP_URL") || "https://microassist.fr";

interface User {
  id: string;
  email: string;
  userName?: string;
}

interface FiscalProfile {
  activity_type: string;
  declaration_frequency: string;
}

serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const resend = new Resend(RESEND_API_KEY);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

    const { data: reminders, error: remindersError } = await supabaseClient
      .from("reminders")
      .select("*")
      .eq("status", "pending")
      .lte("reminder_date", dayAfterTomorrow.toISOString().split("T")[0])
      .gte("reminder_date", today.toISOString().split("T")[0]);

    if (remindersError) {
      console.error("Error fetching reminders:", remindersError);
      return new Response(JSON.stringify({ error: remindersError.message }), { status: 500 });
    }

    if (!reminders || reminders.length === 0) {
      console.log("No reminders to send");
      return new Response(JSON.stringify({ message: "No reminders to send" }), { status: 200 });
    }

    console.log(`Found ${reminders.length} reminders to process`);

    const results = [];

    for (const reminder of reminders) {
      // Получаем email пользователя
      const { data: userData } = await supabaseClient.auth.admin.getUserById(reminder.user_id);
      const user = { id: reminder.user_id, email: userData?.user?.email || "" } as User;

      // Получаем fiscal profile
      const { data: fiscalProfileData } = await supabaseClient
        .from("fiscal_profiles")
        .select("activity_type, declaration_frequency")
        .eq("user_id", reminder.user_id)
        .single();
      const fiscalProfile = fiscalProfileData as FiscalProfile | null;

      if (!user?.email) {
        console.error(`No email for user ${reminder.user_id}`);
        results.push({ id: reminder.id, status: "failed", reason: "No email" });
        continue;
      }

      const reminderDate = new Date(reminder.reminder_date);
      const daysUntil = Math.ceil((reminderDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      let daysText = "";
      if (daysUntil === 0) daysText = "aujourd'hui";
      else if (daysUntil === 1) daysText = "demain";
      else if (daysUntil === 2) daysText = "après-demain";
      else daysText = `dans ${daysUntil} jours`;

      let subject = "";
      let htmlContent = "";

      if (reminder.reminder_type === "declaration") {
        const period = fiscalProfile?.declaration_frequency === "mensuel" ? "mensuelle" : "trimestrielle";
        subject = `🔔 Rappel : Votre déclaration ${period} est prévue ${daysText}`;
        htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #7c3aed; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9fafb; padding: 20px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; }
              .button { display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 16px; }
              .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #6b7280; }
              .highlight { background: #fef3c7; padding: 12px; border-radius: 8px; margin: 16px 0; }
            </style>
          </head>
          <body>
            <div class="header"><h1>📋 Microassist</h1></div>
            <div class="content">
              <h2>Bonjour 👋</h2>
              <p>Votre <strong>déclaration ${period}</strong> est prévue <strong>${daysText}</strong>.</p>
              <div class="highlight">
                <strong>📊 Points à vérifier :</strong>
                <ul>
                  <li>Ton chiffre d'affaires est-il à jour dans ton espace ?</li>
                  <li>As-tu pensé à mettre de côté les charges estimées ?</li>
                  <li>Connecte-toi à autoentrepreneur.urssaf.fr pour déclarer.</li>
                </ul>
              </div>
              <a href="${APP_URL}" class="button">Accéder à mon espace fiscal →</a>
              <p style="font-size: 14px; color: #6b7280; margin-top: 16px;">💡 Conseil : Prévois 10 minutes pour faire ta déclaration sans stress.</p>
            </div>
            <div class="footer">
              <p>Microassist - Assistant fiscal pour micro-entrepreneurs</p>
              <p>Cet email est automatique, merci de ne pas y répondre.</p>
            </div>
          </body>
          </html>
        `;
      } else if (reminder.reminder_type === "tva") {
        const tvaThreshold = fiscalProfile?.activity_type === "vente" ? 91900 : 36800;
        subject = `⚠️ Alerte TVA : Seuil bientôt atteint ${daysText}`;
        htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #ef4444; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9fafb; padding: 20px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; }
              .button { display: inline-block; background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 16px; }
              .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #6b7280; }
              .warning { background: #fee2e2; padding: 12px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #ef4444; }
            </style>
          </head>
          <body>
            <div class="header"><h1>⚠️ Microassist</h1></div>
            <div class="content">
              <h2>Bonjour 👋</h2>
              <div class="warning">
                <strong>🚨 Attention seuil TVA !</strong>
                <p>Ton chiffre d'affaires approche du seuil de ${tvaThreshold.toLocaleString("fr-FR")} €.</p>
              </div>
              <ul>
                <li>La TVA devient obligatoire dès le dépassement du seuil</li>
                <li>Tu devras facturer la TVA sur tes prochaines factures</li>
                <li>Anticipe les démarches pour ne pas être surpris</li>
              </ul>
              <a href="${APP_URL}" class="button">Voir mon tableau de bord →</a>
            </div>
            <div class="footer"><p>Microassist - Assistant fiscal pour micro-entrepreneurs</p></div>
          </body>
          </html>
        `;
      } else {
        subject = `🔔 Rappel Microassist ${daysText}`;
        htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #7c3aed; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9fafb; padding: 20px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; }
              .button { display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 16px; }
            </style>
          </head>
          <body>
            <div class="header"><h1>📋 Microassist</h1></div>
            <div class="content">
              <h2>Bonjour 👋</h2>
              <p>Tu as un rappel prévu ${daysText}.</p>
              <a href="${APP_URL}" class="button">Accéder à mon espace →</a>
            </div>
            <div class="footer"><p>Microassist - Assistant fiscal pour micro-entrepreneurs</p></div>
          </body>
          </html>
        `;
      }

      try {
        const { data: emailData, error: emailError } = await resend.emails.send({
          from: FROM_EMAIL,
          to: [user.email],
          subject: subject,
          html: htmlContent,
        });

        if (emailError) {
          console.error(`Error sending email to ${user.email}:`, emailError);
          results.push({ id: reminder.id, status: "failed", reason: emailError.message });
          await supabaseClient.from("reminders").update({ status: "failed" }).eq("id", reminder.id);
        } else {
          console.log(`Email sent to ${user.email}, id: ${emailData?.id}`);
          results.push({ id: reminder.id, status: "sent", email_id: emailData?.id });
          await supabaseClient.from("reminders").update({ status: "sent" }).eq("id", reminder.id);
        }
      } catch (emailError) {
        console.error(`Error sending email to ${user.email}:`, emailError);
        results.push({ id: reminder.id, status: "failed", reason: String(emailError) });
        await supabaseClient.from("reminders").update({ status: "failed" }).eq("id", reminder.id);
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});