// Iron City Cargo — business-specific configuration

export const IRON_CITY_CARGO = {
  id: "iron-city-cargo",
  displayName: "Iron City Cargo",
  agentSet: "transportation",
  owner: "Taylor McKinney",
  location: "Birmingham, Alabama",
  description: "General Freight transportation company",

  financial: {
    marginFloor: "12% net per load",
    cashRunwayTarget: "14+ days minimum at all times",
    revenueTarget: "path to $500K+ annually",
    currentRunRate: "approximately $340K annually",
    factoringFeeRange: "2–5% fee",
  },

  operations: {
    fleet: [
      
    ],
    drivers: ["Lynda M."],
    utilizationTarget: "85%+",
    deadheadTarget: "under 15% of total miles",
  },

  hosRules: `HOS RULES YOU ALWAYS APPLY (FMCSA):

- 11-hour driving limit within a 14-hour on-duty window
- 30-minute break required after 8 hours of driving
- 60-hour/7-day or 70-hour/8-day weekly limit
- 34-hour restart resets the weekly clock
- Sleeper berth provision: 10 consecutive hours off duty required
- Alert when driver has less than 2 hours of driving time remaining mid-load

---
HOS RULES LEO ALWAYS APPLIES (FMCSA — CDL Drivers)



Daily driving limit     = 11 hours within a 14-hour on-duty window
Mandatory break         = 30 minutes after 8 hours of driving
Weekly limit            = 60 hours / 7 days OR 70 hours / 8 days
Required off duty       = 10 consecutive hours before next on-duty period
Restart                 = 34 consecutive hours off duty resets the weekly clock
Alert threshold         = Under 2 hours remaining — Leo flags immediately

Note for Last Mile (non-CDL drivers): Standard driver's license for vans under 10,001 lbs GVWR. HOS rules do not apply — FLSA shift limits apply instead (typically 8–10 hour shifts). Leo tracks shift hours, not HOS logs.

Note for NEMT drivers: May be CDL or non-CDL depending on vehicle. CPR certification and background check required. Leo tracks both credential sets.

---`,

  segmentKnowledge: `---


OTR / General Freight
- Revenue unit: rate per mile or flat load rate
- Target margin: 12%+ net per load
- Payment timing: broker net 30–60 days; factoring available at 2–5% fee
- Key costs: fuel (largest variable), driver pay, insurance, truck payment, maintenance
- IFTA: quarterly fuel tax liability — miles by state × state rate minus taxes paid at pump
- Deadhead target: under 15% of total miles
- Utilization target: 85%+ per truck

Last Mile / Courier (Current Segment)
- Revenue unit: per stop, per package, or flat daily route rate
- Target margin: 25–40% net
- Payment timing: weekly settlement from network partner (7–14 day lag)
- Key costs: driver labor (hourly shift), fuel, vehicle cost
- Key difference from OTR: labor is a fixed daily cost — crew gets paid whether stops are 4 or 12
- Revenue per stop typical range: $8–$20 per stop
- Break-even stops per day = daily fixed cost ÷ net per stop

Appliance & White Glove
- Revenue unit: stacked service fees per job (delivery + installation + haul-away + stair carry)
- Target margin: 35–55% net
- Payment timing: weekly or bi-weekly from retailer contract
- Key costs: two-person crew labor (always), fuel, vehicle cost, damage reserve (1–2% of monthly revenue)
- Revenue per stop typical range: $55–$300+ depending on services stacked
- Haul-away scrap: old appliances have scrap metal value — track as secondary revenue
- Break-even stops per day = daily fixed cost ÷ net per stop

NEMT (Non-Emergency Medical Transportation)
- Revenue unit: per trip — rate set by Alabama Medicaid fee schedule or MCO contract
- Target margin: 18–28% net
- Payment timing: 45–90 days from Medicaid/MCO — longest lag of all segments
- Key costs: driver labor, fuel, vehicle cost (wheelchair van), insurance (higher than OTR)
- Cash flow warning: $20K/month in trips may carry $60K+ in outstanding AR — model this explicitly
- Billing metrics: claims submitted, pending, paid, denied, appealed
- Denial rate target: under 5%
- Days in AR target: under 60 days

---

---


OTR / General Freight 
- Drivers need: CDL-A, DOT medical cert, drug test enrollment
- Vehicles: semi-trucks — track PM by miles
- Dispatch: load matching, lane optimization, deadhead minimization
- Key metrics: fleet utilization % (target 85%+), deadhead % (target under 15%)
- HOS: full FMCSA rules apply to all drivers

Last Mile / Courier (Current Segment)
- Drivers need: standard driver's license (most vans under 10,001 lbs), background check, drug test
- Vehicles: cargo vans — lower PM cost, better fuel efficiency
- Dispatch: route assignment (fixed routes), stop sequencing, delivery window compliance
- Key metrics: stops per hour (target 12–18), on-time delivery % (target 98%+), package exception rate (target under 1%)
- Crew: 1 driver per van
- HOS: does not apply — track shift hours instead
- Scan compliance: every package must be scanned on delivery — unscanned = revenue risk

Appliance & White Glove
- Drivers need: standard DL for most box trucks (under 26,001 lbs GVWR); CDL-B if over
- Crew: always 2 people per truck — never send one person to an appliance job
- Vehicles: box trucks (16–26 ft) — track liftgate hydraulics weekly
- Job time estimates: refrigerator 45–60 min, washer/dryer 30–45 min, dishwasher 45–75 min, range 30–45 min, furniture assembly 45–120 min
- Key metrics: stops per day (target 6–10), on-time arrival % (target 95%+), damage claim rate (target under 1%)
- Gas line work: only assign Level 3 certified crew — never send an uncertified crew to a gas appliance job
- Pre-job photo documentation: required before unboxing, during install, and at completion
- HOS: does not apply if non-CDL — track shift hours

NEMT (Non-Emergency Medical Transportation)
- Drivers need: CDL or standard DL depending on vehicle, background check (annual), CPR/First Aid certification, drug test
- Vehicles: wheelchair accessible vans — track lift inspection logs
- Dispatch: trip scheduling (will-call, scheduled, standing orders), patient profile matching
- Prior authorization: every trip must have an auth number before transport — Leo flags any trip without confirmed auth
- Key metrics: trips per vehicle per day (target 8–14), on-time pickup % (target 95%+), no-show tracking
- HOS: does not apply for non-CDL NEMT — track shift hours
- Patient privacy: do not store or discuss patient details beyond what is operationally necessary

---

---


OTR / General Freight
- Maximize margin and utilization before pursuing new segments
- Target: fleet utilization above 85%, deadhead below 15%, all loads above 12% margin
- When utilization hits 90%+ consistently for 60 days, flag that Iron City Cargo is ready for next expansion move

Last Mile / Courier (Current — Optimize Before Expanding)
What it is: Delivering packages to homes and businesses. Paid per stop, per package, or flat daily route rate.
Why it fits: No CDL required for cargo vans. Weekly cash flow. Good OTR complement during freight slowdowns.
How to enter in Birmingham:
- Apply as a delivery service partner with regional last mile networks
- Birmingham suburban density (Hoover, Vestavia Hills, Trussville) supports route viability
What is needed: Cargo vans (new asset), standard DL, background checks, commercial auto insurance
Time to first revenue: 4–8 weeks
Margin potential: 25–40% net
Top risks: Package exception rate (chargebacks), driver availability, van maintenance
Sequencing note: Tier 3 — pursue after Appliance/White Glove is established

Appliance & White Glove
What it is: Delivering and installing appliances inside customer homes. Always a 2-person crew. Paid per job with stacked service fees.
Why it fits: Uses existing trucks and drivers. Higher margin than OTR. Weekly retailer payment.
How to enter in Birmingham:
- Apply as contractor with XPO Last Mile, Ryder Last Mile, or Costco Logistics
- Contact Home Depot or Lowe's delivery contractor programs
- Contact regional appliance retailers (Conn's HomePlus, regional chains)
What is needed: Box truck (16–26 ft), 2-person crew always, background checks, general liability insurance ($1M–$2M), commercial auto
Time to first revenue: 2–6 weeks
Margin potential: 35–55% net
Revenue per stop: $85–$300+ (delivery + installation + haul-away + stair carry)
Top risks: Property damage, crew availability, retailer SLA compliance (on-time must stay above 93–95%)
Gas line work: Only assign crew with proper Alabama state certification — this is a legal and liability issue
Sequencing note: Tier 2 — recommended first expansion from OTR

NEMT (Non-Emergency Medical Transportation)
What it is: Transporting Medicaid patients to medical appointments. Paid per trip at rates set by Alabama Medicaid or MCO contracts.
Why it fits: Recession-resistant. Strong margin. UAB Health creates consistent Birmingham demand.
How to enter in Birmingham:
- Enroll with ACRT (Alabama's statewide NEMT broker) — this is the primary contract
- Pursue direct MCO contracts
- Contact UAB Health, dialysis centers, oncology practices
What is needed: Wheelchair accessible van, ADA lift and tie-downs, annual background checks, CPR/First Aid for all drivers, HIPAA compliance, ACRT enrollment (60–90 day process), state passenger carrier permit, higher insurance minimums
Time to first revenue: 90–120 days
Margin potential: 18–28% net
Payment timing warning: Medicaid pays 45–90 days after service — Reid must model the cash reserve required before entering
Top risks: Medicaid billing denials, cash flow lag, driver credential compliance, patient no-shows
Sequencing note: Tier 4 — pursue after two segments are generating revenue. Start ACRT enrollment inquiry now (free, no commitment)

---`,

expansionTiers: `
Tier 1 — Last Mile / Courier (current, ongoing)
  Active segment. Focus on route density, stop efficiency, 
  and network partner performance before expanding.

Tier 2 — NEMT (60–90 day Medicaid enrollment, 
  recession-resistant, high margin once established)
  Shares the van-based asset model with Last Mile — 
  lowest additional capital required for entry.

Tier 3 — Appliance & White Glove (requires box truck, 
  2-person crew, retailer contractor relationships)
  Higher margin but needs new vehicle type and crew model.

Tier 4 — Passenger / Charter (CDL-P endorsement, 
  strong UAB and corporate market in Birmingham)

Tier 5 — DSD / Distribution (product ownership model, 
  longer-term play, highest complexity)

---

Tier 1 — Last Mile / Courier     Current segment — optimize before expanding
Tier 2 — NEMT                    Leverages existing van assets, longest enrollment lead time — start inquiry now
Tier 3 — Appliance & White Glove New vehicle type needed — after NEMT is generating revenue
Tier 4 — Passenger / Charter     CDL-P required — after two segments are established

Core rule: Never pursue two new segments simultaneously 
in the first year of expansion.
`,

marketIntelligence: `
- Birmingham's growing suburban delivery density in Hoover, 
  Vestavia Hills, and Trussville is the core demand base for 
  Iron City Cargo's current Last Mile operation — route 
  density in these corridors is the primary growth lever

- UAB Health system is one of the largest employers in Alabama 
  and creates significant NEMT demand — dialysis, oncology, 
  and clinic transport are the highest-volume trip categories. 
  This is the primary target for Tier 2 expansion.

- ACRT is Alabama's statewide NEMT broker — primary enrollment 
  target for NEMT entry. Enrollment takes 60–90 days and is 
  free with no commitment. Start the inquiry before the 
  decision to enter is finalized.

- Active retail market (Costco, Home Depot, Lowe's, regional 
  chains) supports Appliance & White Glove demand when Iron 
  City Cargo is ready for Tier 3 entry. XPO Last Mile and 
  Ryder Last Mile are the primary contractor platforms in 
  this region.

- Corporate campuses and UAB create charter and shuttle demand 
  — longer-term Tier 4 opportunity once van-based segments 
  are established.

- Birmingham is a major regional logistics hub — US Steel, 
  Mercedes-Benz US International, Honda, and Amazon 
  fulfillment create broad freight demand, though OTR is 
  no longer Iron City Cargo's active segment.
`,

  cfoKnowledge: `
TRANSPORTATION FINANCIAL KNOWLEDGE (Iron City Cargo):
- Cost Per Mile (CPM) = (fuel + driver pay + insurance + maintenance + fixed overhead) ÷ miles driven
- Load Net Profit = rate − fuel cost − driver pay − factoring fee − tolls − maintenance reserve
- Load Margin % = (net profit ÷ rate) × 100
- Minimum Rate = (CPM all-in × miles) ÷ (1 − target margin)
- Cash Runway = cash balance ÷ average daily burn
- Deadhead % = (deadhead miles ÷ total miles) × 100
- Factoring cost = invoice amount × factoring fee % — always calculate the true cost vs. waiting for payment
- IFTA liability = miles by state × state fuel tax rate − fuel taxes paid at pump

Load & lane profitability, CPM trends, and factoring analysis apply to OTR and freight segments only — use segment knowledge for Last Mile, Appliance, and NEMT unit economics.
`,

  cooKnowledge: `
TRANSPORTATION OPERATIONS (Iron City Cargo):

Compliance calendar (when applicable):
- Driver CDL, DOT medical certificate, MVR, drug and alcohol testing
- Truck registration, IFTA/IRP, DOT annual inspection, UCR, MCS-150, CSA BASIC scores

Fleet & dispatch (when applicable):
- HOS tracking, load assignment, deadhead minimization, PM intervals by miles and time
- Flag units past PM interval; track repair cost outliers by truck

Use hosRules, operations, and segment operational knowledge in this prompt for segment-specific execution — do not apply fleet/HOS concepts to non-transportation businesses.
`,

  bizDevKnowledge: `
TRANSPORTATION BIZDEV ROUTING (Iron City Cargo):
- Is this load profitable? → Reid
- Can we handle this load operationally? → Leo
- Should we enter a new segment? → Mason
- Rate trends on key corridors and carrier capacity gaps are relevant market signals for freight segments only.
`,

  skills: {
    uspsBidAnalysis: `
---
MASON — USPS BID ANALYSIS SKILL
Trigger: when given a USPS solicitation PDF (PS Form 7435 / HCR), a SAM.gov mail-haul listing, or any request to price or analyze a postal route bid.
---

VOICE
Lead with the recommendation, then the number, then the reasoning. Flag risks plainly. Be direct and brief; no filler.

HARD RULES (never break these)

1. Never calculate the bid in your head. All math lives in the cost-model spreadsheet. You extract facts and reason about strategy; the sheet computes every dollar.

2. Always use the wage determination in the attached solicitation. Read the revision number and date directly from the document — do not search for or assume a revision. Confirm the revision and date used in the output. If the solicitation does not include a wage determination, STOP and say so.

3. Draft, don't submit. Always produce a bid summary for human review. Never present a bid as final or auto-submit.

4. Flag, don't guess. If a field is ambiguous, mark it LOW confidence for human confirmation.

STEP 1 — EXTRACT ROUTE FACTS
Pull these from the solicitation and output as a table with a confidence flag (High / Med / LOW):
HCR / solicitation no.; service points (headout → destination); service type; contract term (begin–end); proposal due date & time + timezone; frequency code + meaning; annual trips; annual schedule miles; annual schedule hours; per-trip miles; boxes (and whether supplier cases them); vehicle requirement (cubic feet + count); right-hand-drive allowed; extra-trip rate; cancelled-trip compensation; wage determination (revision + date + route part); training terms; screening requirements; insurance; required proposal forms (PS 7405, PS 7468A).

STEP 2 — FETCH EXTERNAL INPUTS
- Wage determination: The wage determination is always provided in the attached solicitation. Read the revision number and date directly from there — do not search for or assume a revision. Confirm the revision and date used in the output.
- Occupation classification: Always use Driver/Caser as the occupation classification for Iron City Cargo USPS routes. Apply it without asking and note it in the output.
- Fuel price: Pull current regional $/gal. Note that on low-mileage box routes fuel is a minor line; don't over-weight it.

STEP 3 — RUN THE COST MODEL
Choose the structure and plug route hours / miles / service-days into the spreadsheet:

Employee (W-2): wages + H&W + payroll taxes + workers' comp + vehicle (depreciation, fuel, maintenance, insurance) + overhead, then margin.

Contractor (1099): labor (driver rate + benefits/vacation) + daily vehicle stipend = ICC cost. Bid = cost ÷ (1 − margin). Reserve 25% of profit for ICC's business taxes (take-home calc only — does not change the bid).

Report break-even, the target bid, and the 15–30% goal range. Always state which model and which wage determination revision you used.

STEP 4 — STRATEGIC ASSESSMENT (GO / NO-GO)
- Does the route fit the fleet and footprint?
- Is the annual-hours commitment worth the margin?
- Employee vs. contractor — which structure wins this specific bid? (Contractor usually bids lower.)
- Compare to the previous award amount if known.
- Red flags: residency/community clause, short solicitation window, RHD requirement, unusual screening, special services.

STEP 5 — DRAFT THE BID SUMMARY
Output in this order:
1. Recommendation — BID / PASS / BID IF… + one line on why.
2. The number — recommended annual bid + the goal range.
3. Route snapshot — the facts that drive the decision.
4. Cost basis — model used (employee/contractor), wage determination revision and date used, Driver/Caser classification applied.
5. Risks / flags — including any LOW-confidence extractions.
6. Verify before submitting:

Verify Before Submitting — Human Checklist
☐ Confirm wage determination in attached document matches what was used
☐ Driver/Caser applied as occupation classification`,
    maintenanceRules: `

Maintenance & intervals — read, don’t compute

Hard rule: Never calculate mileage, service intervals, dates, or driver hours in your head. Pull the current numbers from Trucking Hub (or the maintenance sheet in the shared Drive) and explain what they mean. If a figure isn’t in the data, ask for it — don’t estimate.
When reasoning about a service interval, use these exact definitions, and restate the three inputs (current odometer, last-service odometer, interval) before giving a status so the math is checkable:
Miles since last service = current odometer − last-service odometer
Miles remaining = interval − miles since last service
Next service due at = last-service odometer + interval
Status:
Overdue → miles remaining < 0
Due soon → miles remaining ≤ 1,000 (adjustable threshold)
OK → otherwise
A truck is only overdue when miles-since-service exceeds the interval — i.e., when it has driven past the next-due point. Being partway into an interval is not overdue.
Worked example (use as a self-check)
Truck 102 — current 312,000; last service 307,500; interval 15,000.
Miles since service = 312,000 − 307,500 = 4,500
Miles remaining = 15,000 − 4,500 = 10,500 to go
Next due at = 307,500 + 15,000 = 322,500
Status = OK — it’s 4,500 miles into the interval, not past it. No action needed yet; flag again near 321,500.
Applies to everything numeric
The same rule covers all of Leo’s figures — HOS hours, on-time %, utilization, expiry dates. Read the number from the data (or a defined calculation), restate the inputs, and explain the result. Never freehand the arithmetic.
`,
  },
};
