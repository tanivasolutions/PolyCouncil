// Hawthorne Legacy Group — Insurance Agency
// New agency — update carrier list, producer count, and financial
// targets as the book of business develops

export const HAWTHORNE_LEGACY = {
  id: "hawthorne-legacy",
  displayName: "Hawthorne Legacy Group",
  shortName: "Hawthorne Legacy",
  agentSet: "general",
  owner: "Taylor McKinney",
  location: "Birmingham, Alabama",
  description:
    "Retirement protection advisory practice serving adults 50+ in the Birmingham metro and across Alabama, California, Michigan, and Ohio. Specializing in Medicare planning and life insurance with living benefits.",

  financial: {
    marginFloor: "TBD — set once commission structure and overhead are baselined",
    cashRunwayTarget: "90+ days minimum at startup stage",
    revenueTarget: "TBD — establish after first full quarter of production",
    currentRunRate: "Pre-production / ramp phase",
    revenueModel: "Commission-based — percentage of premium per policy written and renewed",
    currentStageNote: "New agency. Priority is writing first policies and establishing carrier appointments. Financial targets should be formalized after 60–90 days of production data.",
  },

  operations: {
    carriers: [
      "American Amicable — writing number 0001194850",
      "American Home Life / Aetna Patriot Series — writing number AMW6032051",
      "American Home Life GuideStar — writing number 16878",
      "Americo — writing number DPAC0N",
      "Mutual of Omaha — writing number 0994070",
      "National Life Group — writing number 051K6",
      "Occidental — writing number 7027907",
      "Transamerica — writing number MLSR206867",
    ],
    lines: ["Life", "Health"],
    producerCount: "1",
    bindingAuthority: "Life and health products — confirm direct binding authority per carrier",
    licensingStatus: "Active — Alabama, California, Michigan, Ohio",
  },

  marketIntelligence: `
    - Alabama has one of the oldest median populations in the 
      Southeast — Medicare Advantage and Medicare Supplement 
      demand is high and growing year over year

    - Birmingham metro has a significant Medicare-eligible 
      population concentrated in Hoover, Vestavia Hills, 
      Homewood, and Trussville — primary prospecting territory 
      for Hawthorne Legacy Group

    - Medicare Annual Enrollment Period (AEP: Oct 15 – Dec 7) 
      and Open Enrollment Period (OEP: Jan 1 – Mar 31) are the 
      two highest-volume sales windows — all marketing and 
      outreach activity should build toward AEP

    - Alabama, California, Michigan, and Ohio are active license 
      states — California and Michigan both have large 
      Medicare-eligible populations that can be served remotely, 
      expanding the addressable market beyond Birmingham

    - Carrier portfolio (American Amicable, Mutual of Omaha, 
      Transamerica, National Life Group, Americo, Occidental, 
      American Home Life) covers Medicare Supplement, Medicare 
      Advantage, final expense, and term life — strong product 
      breadth to cross-sell within the same client relationship

    - Final expense is the highest-volume entry product for 
      life insurance in this demographic — low face amounts, 
      simplified underwriting, and high close rates make it 
      a natural complement to Medicare

    - Independent broker advantage: ability to shop Medicare 
      Supplement rates across multiple carriers at renewal — 
      captive agents cannot do this. Rate shopping at renewal 
      is a primary retention and referral driver.

    - Key referral channels: senior centers, assisted living 
      facilities, hospice and home care agencies, faith 
      communities, and Medicare counseling programs (SHIP — 
      State Health Insurance Assistance Program)

    - CMS compliance governs all Medicare marketing — TPMO 
      disclaimer requirements, scope of appointment rules, 
      and annual certification per carrier are non-negotiable. 
      Maintain compliance calendar from day one.
  `,

  expansionTiers: `
    Tier 1 — Medicare foundation (current)
      Build core Medicare Supplement and Medicare Advantage 
      book across all four license states
      Target: 50 active Medicare clients as baseline for 
      referral momentum
      Complete annual carrier certifications before AEP — 
      all carriers require this to sell Medicare products
      Establish referral relationships with 3–5 senior-facing 
      organizations in Birmingham metro

    Tier 2 — Final expense activation
      Cross-sell final expense life to existing Medicare clients 
      — same demographic, same conversation, natural add-on
      American Amicable, Americo, and Mutual of Omaha all have 
      strong final expense products in the carrier portfolio
      Target: final expense cross-sell rate of 25%+ on existing 
      Medicare book

    Tier 3 — Term life and living benefits expansion
      Add term life and living benefits products to serve 
      clients with dependents or income protection needs
      National Life Group and Transamerica are the primary 
      carriers for this tier
      Target clients aged 40–64 approaching Medicare 
      eligibility — highest lifetime value segment

    Tier 4 — Geographic expansion
      Activate California, Michigan, and Ohio books more 
      aggressively through remote sales and referral networks
      Each state has a large Medicare-eligible population 
      that can be served without physical presence

    Core rule: Medicare is the anchor — every other product 
    is a cross-sell to a client who already trusts you. 
    Retention through rate shopping at renewal is the 
    compounding advantage of the independent model. 
    Never let a client shop without you.
  `,

  skills: {},
};
