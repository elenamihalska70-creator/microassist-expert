export const BETA_MODE = true;
export const PRICING_LIMITS = {
beta_founder: {
  revenues: 50,
  invoicesPerMonth: 30,
  pdfExportsPerMonth: 10,
  historyDays: 365,
},

  free: {
    revenues: 30,
    invoicesPerMonth: Infinity,
    pdfExportsPerMonth: 0,
    historyDays: 60,
  },

  essential: {
    revenues: Infinity,
    invoicesPerMonth: Infinity,
    pdfExportsPerMonth: Infinity,
    historyDays: Infinity,
  },

  pilotage: {
    revenues: Infinity,
    invoicesPerMonth: Infinity,
    pdfExportsPerMonth: Infinity,
    historyDays: Infinity,
    projections: true,
    reminders: true,
  },
};

export const PLAN_PRICES = {
  beta_founder: 0,
  free: 0,
  essential: 5,
  pilotage: 9,
  fiscal_ai: 15,
  finance_pro: 25,
};
