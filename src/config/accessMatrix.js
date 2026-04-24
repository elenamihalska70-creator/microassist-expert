// Single source of truth for product access by user segment.
export const ACCESS_MATRIX = {
  guest: {
    label: "Guest",
    features: {
      dashboard_basic: true,
      local_usage: true,
      revenue_tracking: true,
      smart_priorities_count: 0,
      declaration_email_j7: false,
      declaration_email_j2: false,
      smart_priority_email: false,
      premium_like_access: false,
      export_csv: true,
      export_pdf: true,
      reminders_advanced: false,
      pricing_cta: true,
    },
  },

  registered_free: {
    label: "Compte gratuit",
    features: {
      dashboard_basic: true,
      local_usage: false,
      revenue_tracking: true,
      smart_priorities_count: 1,
      declaration_email_j7: false,
      declaration_email_j2: false,
      smart_priority_email: false,
      premium_like_access: false,
      export_csv: true,
      export_pdf: true,
      reminders_advanced: false,
      pricing_cta: true,
    },
  },

  early_access: {
    label: "Mode découverte",
    features: {
      dashboard_basic: true,
      local_usage: false,
      revenue_tracking: true,
      smart_priorities_count: "all",
      declaration_email_j7: true,
      declaration_email_j2: true,
      smart_priority_email: true,
      premium_like_access: true,
      export_csv: true,
      export_pdf: true,
      reminders_advanced: true,
      pricing_cta: true,
    },
  },

  founder_trial: {
    label: "Offre fondateur",
    features: {
      dashboard_basic: true,
      local_usage: false,
      revenue_tracking: true,
      smart_priorities_count: "all",
      declaration_email_j7: true,
      declaration_email_j2: true,
      smart_priority_email: true,
      premium_like_access: true,
      export_csv: true,
      export_pdf: true,
      reminders_advanced: true,
      pricing_cta: true,
      trial_days: 90,
    },
  },

  premium_active: {
    label: "Premium actif",
    features: {
      dashboard_basic: true,
      local_usage: false,
      revenue_tracking: true,
      smart_priorities_count: "all",
      declaration_email_j7: true,
      declaration_email_j2: true,
      smart_priority_email: true,
      premium_like_access: true,
      export_csv: true,
      export_pdf: true,
      reminders_advanced: true,
      pricing_cta: false,
    },
  },
};

export function getAccessProfile({
  isGuest,
  isPremiumUser,
  isFounder,
  isEarlyFullAccess,
  billingUiState,
}) {
  if (isGuest) return "guest";
  if (isPremiumUser || billingUiState === "premium_active") {
    return "premium_active";
  }
  if (isEarlyFullAccess && isFounder) return "founder_trial";
  if (isEarlyFullAccess) return "early_access";
  return "registered_free";
}
