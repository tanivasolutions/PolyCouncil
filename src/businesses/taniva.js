// Taniva — Healthcare App
// MVP stage — update financial targets and product metrics as they develop

export const TANIVA = {
  id: "taniva",
  displayName: "Taniva Health",
  agentSet: "general",
  owner: "Taylor McKinney",
  location: "Birmingham, Alabama",
  description: "Care management platform for families navigating home care. Combines a verified caregiver marketplace, family coordination layer, Benefits Navigator, and guaranteed backup coverage into a single product. Where platforms like Care.com stop at connecting a family to a caregiver, Taniva becomes the operating layer for the entire care situation.",

  financial: {
    marginFloor: "TBD — set once pricing model is finalized",
    cashRunwayTarget: "90+ days minimum at MVP stage",
    revenueTarget: "TBD — establish baseline after first paying cohort",
    currentStageNote: "Pre-revenue. Financial targets should be set when pricing tiers are confirmed and first users are onboarded.",
  },

  product: {
    appName: "Taniva Health",
    category: "Care management / home care coordination",
    platform: "TBD — web, iOS, Android",
    currentStage: "MVP development",
    targetUsers: "Families managing home care situations; adult children coordinating care for aging parents; caregivers seeking verified placements",
    corePillars: [
      "Verified caregiver marketplace",
      "Family coordination layer",
      "Benefits Navigator",
      "Guaranteed backup coverage",
    ],
    pricingModel: "TBD — subscription, per-placement fee, or hybrid",
    mrr: "Pre-revenue",
    churnRate: "Pre-revenue",
    keyDifferentiator: "Not a matching service — a full operating layer for the care situation. Competitors like Care.com stop at the connection. Taniva manages everything after it.",
  },

  marketIntelligence: `
    - 53 million Americans provide unpaid care to an adult or child 
      with special needs — the coordination burden is the primary 
      pain point Taniva solves
    - Home care is a $130B+ US market growing due to aging Baby 
      Boomers preferring to age in place
    - Birmingham and Alabama have significant aging population 
      density — strong local pilot market
    - UAB Health and regional hospital systems create natural 
      referral and partnership channels
    - Benefits navigation is a high-friction problem — Medicare, 
      Medicaid, and VA benefits are underutilized by families who 
      don't know what they qualify for
    - Guaranteed backup coverage is a differentiated feature with 
      no direct analog in current market
    - Primary competitors: Care.com (matching only), Honor (west 
      coast focused), HireAHelper — none offer a full coordination 
      layer
    - B2C and B2B2C both viable — employer benefits and health plan 
      partnerships are longer-term channels worth evaluating
  `,

  expansionTiers: `
    Tier 1 — MVP validation
      Core loop: family posts care need → verified caregiver matched 
      → coordination layer active
      Goal: 20–50 paying families, measure retention and NPS before 
      expanding features

    Tier 2 — Benefits Navigator activation
      Layer in Benefits Navigator as a differentiated feature driving 
      upgrade or retention
      Partnership conversations with UAB Health and local senior care 
      networks

    Tier 3 — Guaranteed backup coverage
      Operationalize backup coverage — this is the moat feature and 
      the hardest to deliver
      Requires caregiver supply depth before it can be reliably 
      guaranteed

    Tier 4 — B2B2C channel
      Employer benefits integration and health plan partnerships
      Longer sales cycle but significantly higher LTV per account

    Core rule: Validate the core marketplace loop before building 
    out coordination features. A marketplace that doesn't retain 
    families cannot support the operating layer on top of it.
  `,
};
