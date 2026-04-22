import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { Resend } from "https://esm.sh/resend@2.0.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type TrialEndingEmailRequest = {
  userId?: string | null;
  email?: string | null;
  eventType?: string | null;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  trialEndsAt?: string | null;
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        ok: false,
        skipped: false,
        error: "Method not allowed",
      }),
      { status: 405, headers: corsHeaders },
    );
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({
          ok: false,
          skipped: false,
          error: "Missing Supabase environment variables",
        }),
        { status: 500, headers: corsHeaders },
      );
    }

    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({
          ok: false,
          skipped: false,
          error: "Missing RESEND_API_KEY",
        }),
        { status: 500, headers: corsHeaders },
      );
    }

    if (!EMAIL_FROM) {
      return new Response(
        JSON.stringify({
          ok: false,
          skipped: false,
          error: "Missing EMAIL_FROM",
        }),
        { status: 500, headers: corsHeaders },
      );
    }

    const body = (await req.json()) as TrialEndingEmailRequest;

    const userId = body?.userId || null;
    const email = String(body?.email || "").trim().toLowerCase();
    const eventType = String(body?.eventType || "trial_ending_j7").trim() || "trial_ending_j7";
    const subject = String(body?.subject || "").trim();
    const text = String(body?.text || "").trim();
    const html = String(body?.html || "").trim();
    const trialEndsAt = body?.trialEndsAt || null;

    if (!isValidEmail(email)) {
      return new Response(
        JSON.stringify({
          ok: false,
          skipped: false,
          error: "Invalid email",
        }),
        { status: 400, headers: corsHeaders },
      );
    }

    if (!subject) {
      return new Response(
        JSON.stringify({
          ok: false,
          skipped: false,
          error: "Missing subject",
        }),
        { status: 400, headers: corsHeaders },
      );
    }

    if (!text && !html) {
      return new Response(
        JSON.stringify({
          ok: false,
          skipped: false,
          error: "Missing email body",
        }),
        { status: 400, headers: corsHeaders },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: existingEvent, error: existingEventError } = await supabase
      .from("email_events")
      .select("id")
      .eq("email", email)
      .eq("event_type", eventType)
      .limit(1)
      .maybeSingle();

    if (existingEventError) {
      return new Response(
        JSON.stringify({
          ok: false,
          skipped: false,
          error: existingEventError.message,
        }),
        { status: 500, headers: corsHeaders },
      );
    }

    if (existingEvent) {
      return new Response(
        JSON.stringify({
          ok: true,
          skipped: true,
          reason: "already_sent",
        }),
        { status: 200, headers: corsHeaders },
      );
    }

    const resend = new Resend(RESEND_API_KEY);
    const { data: resendData, error: resendError } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [email],
      subject,
      text: text || undefined,
      html: html || undefined,
    });

    if (resendError) {
      console.log("RESEND RESPONSE:", resendData);
      return new Response(
        JSON.stringify({
          ok: false,
          success: false,
          skipped: false,
          error: "Resend send failed",
          resend: {
            data: resendData,
            error: resendError,
          },
        }),
        { status: 502, headers: corsHeaders },
      );
    }

    const providerMessageId = resendData?.id ?? null;

    const { error: insertError } = await supabase.from("email_events").insert({
      user_id: userId,
      email,
      event_type: eventType,
      meta: {
        trialEndsAt,
        resendId: providerMessageId,
      },
    });

    if (insertError) {
      return new Response(
        JSON.stringify({
          ok: false,
          skipped: false,
          error: insertError.message,
          providerMessageId,
        }),
        { status: 500, headers: corsHeaders },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        skipped: false,
        providerMessageId,
      }),
      { status: 200, headers: corsHeaders },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        skipped: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: corsHeaders },
    );
  }
});
