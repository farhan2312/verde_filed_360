/**
 * Role-based training content — authored in code (one topic at a time, plain English, step-by-step).
 * System Admin sees every topic; every other role sees only the topics tagged for it.
 * Each step can carry a screenshot (public/training/<file>), a tip, or a warning callout.
 */

export type TrainingRole = "officer" | "regional" | "central" | "sysadmin" | "campaigner";

export const ROLE_LABEL: Record<TrainingRole, string> = {
  officer: "Agri Officer",
  regional: "Regional Manager",
  central: "Central Admin",
  sysadmin: "System Admin",
  campaigner: "Campaigner",
};

/** The role a signed-in user is, mapped from the app's RoleKey. */
export type ViewerRole = TrainingRole;

export interface TrainingStep {
  text: string;
  image?: string;   // filename under /public/training
  tip?: string;     // green "tip" callout
  warn?: string;    // amber "heads up" callout
}

/** A slide deck shown in a windowed viewer (the real deck as a PDF), with a downloadable source file. */
export interface TrainingDeck {
  pdf: string;         // the actual deck rendered to PDF, shown in the viewer (path under /public)
  file: string;        // downloadable source file, path under /public (e.g. /training/deck/intro.pptx)
  fileLabel: string;   // download button label, e.g. "Download PowerPoint"
}

/** A how-to video with English + Hindi audio tracks (same footage, different voiceover). Paths under /public. */
export interface TrainingVideo {
  en: string;          // /training/video/<name>-en.mp4
  hi: string;          // /training/video/<name>-hi.mp4
  poster?: string;     // thumbnail shown before play (path under /public)
}

export interface TrainingTopic {
  id: string;               // url slug
  title: string;
  summary: string;
  section: string;          // group heading
  roles: TrainingRole[];    // who sees it (sysadmin always sees all)
  minutes?: number;         // rough read time
  steps: TrainingStep[];
  outcome?: string;         // "What happens next"
  related?: string[];       // topic ids
  deck?: TrainingDeck;      // when set, the topic opens a windowed slide deck instead of steps
  video?: TrainingVideo;    // when set, a bilingual how-to video plays above the steps
}

/** Ordered sections (topics render grouped in this order). */
export const TRAINING_SECTIONS = [
  "Getting Started",
  "Farmers",
  "Field Visits",
  "Analytics",
  "Map & Clusters",
  "Campaigns",
  "Administration",
] as const;

export const TRAINING: TrainingTopic[] = [
  // ─────────────────────────── Getting Started ───────────────────────────
  {
    id: "intro-tour",
    title: "Introduction to the tool",
    summary: "A short visual tour of what Verde Field Intel is, the key terms, and how it all fits together. Flip through the slides in the window, or download the deck.",
    section: "Getting Started",
    roles: ["officer", "regional", "central", "sysadmin", "campaigner"],
    minutes: 5,
    steps: [],
    deck: {
      pdf: "/training/deck/verde-intro.pdf",
      file: "/training/deck/verde-intro.pptx",
      fileLabel: "Download the deck (PowerPoint)",
    },
    related: ["signing-in"],
  },
  {
    id: "signing-in",
    title: "Signing in for the first time",
    summary: "Log in with your employee code and set your own password.",
    section: "Getting Started",
    roles: ["officer", "regional", "central", "sysadmin"],
    minutes: 2,
    steps: [
      { text: "Open the portal link. On the sign-in screen, type your Employee Code (for example VERDE1042) in the first box.", image: "login.png" },
      { text: "Enter the password you were given. For a brand-new account this is usually your mobile number." },
      { text: "Press “Sign in”. If this is your first login, the portal will ask you to set a new password.", warn: "Your first password is temporary — you must change it before you can continue." },
      { text: "Choose a new password (at least 8 characters), type it again to confirm, and press save. You’re now in." },
    ],
    outcome: "You land on your home screen. From now on you sign in with your employee code and your new password.",
    related: ["getting-around"],
  },
  {
    id: "getting-around",
    title: "Getting around the portal",
    summary: "Where the menu, page title, and the help buttons live.",
    section: "Getting Started",
    roles: ["officer", "regional", "central", "sysadmin", "campaigner"],
    minutes: 3,
    steps: [
      { text: "On a computer, the menu is the sidebar on the left. On a phone, use the bar at the bottom of the screen (and the “More” button for the rest).", image: "nav.png" },
      { text: "The top bar always shows the name of the page you’re on, plus quick buttons on the right.", image: "topbar.png" },
      { text: "“🎓 Training” (this page) and “🐞 Report a Bug” are in the top bar of every page — use them any time.", tip: "Stuck on a screen? Hover over a bold word like HNI or LTV to see a short definition." },
      { text: "Only the menu items your role is allowed to use will appear. If you can’t see a page, your role doesn’t have access to it." },
    ],
    outcome: "You can find any page from the menu and reach Training / Report a Bug from anywhere.",
    related: ["signing-in", "report-a-bug"],
  },
  {
    id: "report-a-bug",
    title: "Reporting a problem (Report a Bug)",
    summary: "Tell the admin when something looks wrong.",
    section: "Getting Started",
    roles: ["officer", "regional", "central", "sysadmin"],
    minutes: 2,
    steps: [
      { text: "Click “🐞 Report a Bug” in the top bar.", image: "report-bug.png" },
      { text: "Give it a short Title, describe what happened, and pick how serious it is (Severity)." },
      { text: "The “Page / where” box is filled in for you with the screen you were on — leave it as-is." },
      { text: "Optional: attach a screenshot. You can click to choose an image, or just paste one from your clipboard with Ctrl/⌘+V.", tip: "A screenshot helps the admin fix it much faster." },
      { text: "Press “Submit Bug”. You’ll see a “Thanks — bug reported!” message." },
    ],
    outcome: "Your report goes straight to the System Admin’s Bug Tracker, where it’s triaged and fixed.",
  },

  // ─────────────────────────── Farmers ───────────────────────────
  {
    id: "find-a-farmer",
    title: "Finding a farmer (Farmer 360)",
    summary: "Search and filter to reach any farmer’s record.",
    section: "Farmers",
    roles: ["officer", "regional", "central", "sysadmin"],
    minutes: 3,
    steps: [
      { text: "Open “Farmer 360” from the menu.", image: "farmers-list.png" },
      { text: "Use the search box to type a name, village, or mobile number." },
      { text: "Or narrow the list with the filters: Value segment, Lifecycle, Store, District, Crop, Pest/Disease, and Spend. Filters combine, so you can ask very specific questions (e.g. HNI potato farmers in Lucknow).", tip: "Filters with lots of options have a search box inside — start typing to find the one you want." },
      { text: "Click any row to open that farmer’s full profile." },
    ],
    outcome: "You’re looking at exactly the farmers you need, and one click opens any profile.",
    related: ["read-a-profile"],
  },
  {
    id: "read-a-profile",
    title: "Reading a farmer’s profile",
    summary: "What the segment, lifecycle, LTV, and sales history mean.",
    section: "Farmers",
    roles: ["officer", "regional", "central", "sysadmin"],
    minutes: 4,
    steps: [
      { text: "Open a farmer from Farmer 360. The top card shows their name with two coloured tags: their Value segment and their Lifecycle.", image: "farmer-detail.png" },
      { text: "Value segment = how much they spend, all-time: HNI (₹12k+), Potential HNI (₹8–12k), or Regular. Lifecycle = how recently they bought: New, Recent, At Risk, or Lapsed.", tip: "Hover any tag to see its exact definition." },
      { text: "“Lifetime Value (base)” is their total spend on the pre-tax price — this is the number used everywhere in the portal." },
      { text: "“Lifetime incl. GST” is the final price they actually paid (with tax). It’s shown for reference only and is never used in any calculation or segment." },
      { text: "The Sales / Invoice History table lists each bill: the Base ₹ (used in calculations) and the +GST ₹ (final price) side by side." },
    ],
    outcome: "You understand a farmer’s value and recency at a glance, and know which money figure is which.",
    related: ["find-a-farmer"],
  },

  // ─────────────────────────── Field Visits ───────────────────────────
  {
    id: "new-visit",
    title: "Recording a new visit",
    summary: "Watch the walkthrough, then follow the five steps. Log a field visit end to end.",
    section: "Field Visits",
    roles: ["officer", "regional", "sysadmin"],
    minutes: 5,
    video: {
      en: "/training/video/visit-form-en.mp4",
      hi: "/training/video/visit-form-hi.mp4",
      poster: "/training/video/visit-form-poster.png",
    },
    steps: [
      { text: "From your home screen, press the “New Visit” button. The form opens as five short steps.", image: "new-visit-start.png" },
      { text: "Step 1 – Farmer: search for an existing farmer by mobile/name, or add a new one (name, 10-digit mobile starting 6–9, village, district).", warn: "The mobile number must be 10 digits and start with 6, 7, 8, or 9." },
      { text: "Step 2 – Farm details: pick land-holding and annual-expense ranges, main + other crops, and any soil-testing details." },
      { text: "Step 3 – Visit details: choose the visit reason, note the current problem/pest, and any products discussed." },
      { text: "Step 4 – Media: take or attach photos, and record a short voice note if useful.", tip: "You can switch between the front and back camera while taking a photo." },
      { text: "Step 5 – Review & submit: check everything, set a follow-up date if needed, and press Submit. A success message confirms it saved.", image: "new-visit-review.png" },
    ],
    outcome: "The visit is saved against that farmer, with photos, notes, and a follow-up date if you set one.",
    related: ["after-a-visit", "find-visits"],
  },
  {
    id: "after-a-visit",
    title: "What happens after a visit is created",
    summary: "Where the visit shows up and what it feeds.",
    section: "Field Visits",
    roles: ["officer", "regional", "central", "sysadmin"],
    minutes: 2,
    steps: [
      { text: "The visit is attached to the farmer immediately. Open that farmer in Farmer 360 → “Visit Reports” to see it with its date, notes, photos, and voice note." },
      { text: "It also appears in the Visit Repository (Visit Repo) so managers can see all field activity." },
      { text: "If you set a follow-up date, it’s stored on the visit and shown on the farmer’s record so nothing slips." },
      { text: "Your visit activity also updates the “Last active” signal on the Users page, so managers can see who’s active in the field." },
    ],
    outcome: "The visit is visible to you and your managers, and any follow-up date is tracked.",
    related: ["new-visit", "find-visits"],
  },
  {
    id: "find-visits",
    title: "Finding past visits (Visit Repo)",
    summary: "Browse and open any recorded visit.",
    section: "Field Visits",
    roles: ["officer", "regional", "central", "sysadmin"],
    minutes: 2,
    steps: [
      { text: "Open “Visit Repo” from the menu to see recent visits, newest first.", image: "visit-repo.png" },
      { text: "Click a visit to open the full report — date, farmer, notes, photos, audio, and follow-up date." },
      { text: "As an officer you see your store’s visits; a Regional Manager sees their district; Central/Admin see everything." },
    ],
    outcome: "You can review any visit and its media whenever you need it.",
    related: ["after-a-visit"],
  },

  // ─────────────────────────── Analytics ───────────────────────────
  {
    id: "analytics-basics",
    title: "Reading the Analytics page",
    summary: "The segment matrix, KPI tree, and filters.",
    section: "Analytics",
    roles: ["regional", "central", "sysadmin"],
    minutes: 5,
    steps: [
      { text: "Open “Analytics”. The filter row at the top controls everything below it — District, Crop, Pest, Value segment, Lifecycle, Spend, and Financial Year.", image: "analytics.png" },
      { text: "The main table is Store × (Value + Lifecycle). “Detailed” shows every one of the 12 value×lifecycle pockets per store; “Summary” shows the marginal totals.", tip: "Hover a column header like “HNI” or “Recent” to see what it means." },
      { text: "The KPI tree groups farmers by Value → Lifecycle (use ⇄ Flip to swap the grouping). Click any number to drill into that exact group of farmers." },
      { text: "Pick a Financial Year to see segments as of that year; pick a Crop to scope revenue to just that crop’s sales.", warn: "All money on this page is base (pre-tax) price." },
    ],
    outcome: "You can slice the whole farmer base by store, segment, lifecycle, crop, and year.",
    related: ["analytics-export"],
  },
  {
    id: "analytics-export",
    title: "Exporting analytics to Excel",
    summary: "Download the matrix + every sale line, at any size.",
    section: "Analytics",
    roles: ["regional", "central", "sysadmin"],
    minutes: 2,
    steps: [
      { text: "Set any filters you want first — the export respects them (leave them empty to export everything)." },
      { text: "Click “⬇ Export to Excel” on the matrix card." },
      { text: "A “Preparing Excel… (size)” indicator counts up while the file streams. The whole dataset can be large, so give it a moment.", tip: "The counter going up means it’s working — don’t close the tab." },
      { text: "The file downloads automatically: one workbook with the Value×Lifecycle matrix, every matching sale line, and a “Filters applied” sheet." },
    ],
    outcome: "You get a complete Excel workbook of exactly the data on screen — no row limit.",
    related: ["analytics-basics"],
  },

  // ─────────────────────────── Map & Clusters ───────────────────────────
  {
    id: "map-clusters",
    title: "Using the Map and building a cluster",
    summary: "Pick stores on the map and save a group of farmers.",
    section: "Map & Clusters",
    roles: ["regional", "central", "sysadmin"],
    minutes: 4,
    steps: [
      { text: "Open “Map View”. Tick one or more stores in the list (or click their pins on the map).", image: "map.png" },
      { text: "Their farmers appear below. Narrow them with the filters — purchase category, crop, pest, segment, spend — and the nearby-village picker." },
      { text: "When the list is the group you want, save it as a cluster (Central/Admin). A cluster is a saved audience you can use in a campaign.", warn: "Regional Managers can view clusters for their district but only Central/Admin create them." },
    ],
    outcome: "You’ve saved a targeted group of farmers, ready to attach to a campaign.",
    related: ["create-campaign"],
  },

  // ─────────────────────────── Campaigns ───────────────────────────
  {
    id: "execute-campaign",
    title: "Executing a campaign (calls & outreach)",
    summary: "Contact your assigned farmers and log the outcome.",
    section: "Campaigns",
    roles: ["officer", "regional", "sysadmin", "campaigner"],
    minutes: 4,
    steps: [
      { text: "Open “Campaigns”. You’ll see the campaigns assigned to your store/district and the farmers you need to reach.", image: "campaigns.png" },
      { text: "For each farmer, contact them using the suggested approach (Call, WhatsApp, in-person…). You can tick more than one approach." },
      { text: "Mark them as reached, and record their response — interested, not interested, or interested in another crop.", tip: "Use the call-script panel as a ready-made talking point." },
      { text: "Add a short comment if there’s anything worth noting." },
    ],
    outcome: "Your outreach is recorded against each farmer and feeds the campaign’s results.",
    related: ["campaign-tracker"],
  },
  {
    id: "create-campaign",
    title: "Creating a project & campaign (Central)",
    summary: "Bundle clusters into a project and launch a campaign.",
    section: "Campaigns",
    roles: ["central", "sysadmin"],
    minutes: 5,
    steps: [
      { text: "Open “Campaigns”. The flow is Cluster → Project → Campaign across the three tabs." },
      { text: "Build or pick the clusters (the audiences). Bundle the relevant clusters into a Project with a start and end date." },
      { text: "Create a Campaign inside the project. Enrolled farmers are split into a Test group (contacted) and a Control group (held back) so you can measure real uplift." },
      { text: "Pick the communication template / offer for each segment from the Comm Plan." },
    ],
    outcome: "The campaign is live: officers/RMs see their farmers to contact, and results start accruing.",
    related: ["execute-campaign", "campaign-tracker"],
  },
  {
    id: "campaign-tracker",
    title: "Reading the Campaign Tracker",
    summary: "Reach, attributed revenue, and test-vs-control uplift.",
    section: "Campaigns",
    roles: ["central", "sysadmin"],
    minutes: 4,
    steps: [
      { text: "On a campaign, open “Campaign Tracker”." },
      { text: "“Outreach” shows how many test farmers were reached and by which approach, plus their interest responses." },
      { text: "“Attributed revenue” counts purchases by contacted farmers on the campaign’s products, over the campaign window (base price)." },
      { text: "“Test vs control uplift” compares the contacted group to the held-back control. Use the toggle to break it down by Value segment or by Lifecycle — a farmer can be HNI and Lapsed, so the two views differ.", tip: "Uplift matures as each month’s sales are imported." },
    ],
    outcome: "You can see whether the campaign actually drove extra sales, and for which segments.",
    related: ["create-campaign"],
  },

  // ─────────────────────────── Administration ───────────────────────────
  {
    id: "manage-users",
    title: "Managing users",
    summary: "Approve requests, set roles, and see activity.",
    section: "Administration",
    roles: ["central", "sysadmin"],
    minutes: 4,
    steps: [
      { text: "Open “Users”. Pending access requests appear at the top — approve or reject each, setting the right role.", image: "users.png" },
      { text: "Use the search and the role / store / status filters to find any user." },
      { text: "Click a user’s name to open their detail popup: phone, code, role, store, district, last active, and their activity/audit trail." },
      { text: "Use Edit to change a user’s role or store mapping; Delete removes their access.", warn: "Deleting a user removes their login permanently." },
    ],
    outcome: "Every account has the correct role and store, and you can audit who did what.",
    related: ["manage-stores"],
  },
  {
    id: "manage-stores",
    title: "Managing stores",
    summary: "The all-stores table, officer mapping, and filters.",
    section: "Administration",
    roles: ["central", "sysadmin"],
    minutes: 3,
    steps: [
      { text: "Open “Users” and switch to the Store Management tab. The KPI strip shows totals, unmapped stores, and farmers mapped." },
      { text: "Filter by All / Mapped / Unmapped / Closed, by District, or search by store/code/RM." },
      { text: "“Unmapped” (orange) means an active store with no active officer — map an officer to fix it." },
      { text: "Add, edit, or close a store, and assign its Agri Officers and Regional Manager." },
    ],
    outcome: "Stores are correctly set up and every active store has an officer.",
    related: ["manage-users"],
  },
  {
    id: "import-sales",
    title: "Importing monthly sales",
    summary: "Upload the sales file that powers segments & revenue.",
    section: "Administration",
    roles: ["sysadmin"],
    minutes: 3,
    steps: [
      { text: "Open “Sales Import”. Download the template if you need the exact column layout." },
      { text: "Drop the monthly sales workbook into the upload area." },
      { text: "After import, the value/lifecycle segments, LTV, and spend figures refresh from the new data.", warn: "Money is read from the base (pre-tax) column; crop tagging comes only from the sheet’s Crops column." },
    ],
    outcome: "The whole portal reflects the latest month’s sales — segments, LTV, and analytics all update.",
  },
  {
    id: "bug-tracker",
    title: "Working the Bug Tracker",
    summary: "Triage and resolve reported bugs on a kanban.",
    section: "Administration",
    roles: ["sysadmin"],
    minutes: 3,
    steps: [
      { text: "Open “Bug Tracker”. The KPI strip shows total, open, in-progress, fixed, and average turnaround.", image: "bug-tracker.png" },
      { text: "Each report is a card. Drag it across the columns — Open → In Progress → Testing → Fixed → Closed — as you work it. (You can also use the little status dropdown on the card.)" },
      { text: "Click 📷 to view an attached screenshot; use the filters to focus by severity or search." },
      { text: "Moving a card to Fixed/Closed stamps the resolved time, which feeds the average-turnaround number." },
    ],
    outcome: "Reported issues are visibly tracked from filed to fixed.",
    related: ["report-a-bug"],
  },

  // ─────────────────────────── Farmers (concepts) ───────────────────────────
  {
    id: "understanding-segments",
    title: "Understanding value segments & lifecycle",
    summary: "What HNI, Potential, Regular, New, Recent, At Risk and Lapsed mean.",
    section: "Farmers",
    roles: ["officer", "regional", "central", "sysadmin"],
    minutes: 3,
    steps: [
      { text: "Every farmer has two independent tags. The Value segment is by how much they’ve spent all-time (base price): HNI = ₹12,000+, Potential HNI = ₹8,000–12,000, Regular = under ₹8,000.", image: "farmer-detail.png" },
      { text: "The Lifecycle is by how recently they bought: New (first purchase in the last 6 months), Recent (bought in the last 6 months and earlier too), At Risk (last bought 6–12 months ago), Lapsed (12+ months, or never)." },
      { text: "The two are independent — a big spender can still be Lapsed. That’s why campaigns can be broken down by either dimension.", tip: "Anywhere you see a tag like “HNI”, hover it to read its definition." },
    ],
    outcome: "You can read any farmer’s worth and recency, and know why the two tags are separate.",
    related: ["read-a-profile"],
  },

  // ─────────────────────────── Map & Clusters ───────────────────────────
  {
    id: "clusters-page",
    title: "Viewing saved farmer clusters",
    summary: "Browse clusters and see who’s inside each one.",
    section: "Map & Clusters",
    roles: ["regional", "central", "sysadmin"],
    minutes: 2,
    steps: [
      { text: "Open “Farmer Clusters” to see every saved cluster and its farmer count.", image: "clusters.png" },
      { text: "Click “View” on a cluster to see its members — with each farmer’s store, village, value segment, lifecycle, and spend.", warn: "If the cluster is crop-scoped, the spend column shows that crop’s spend only, while the segment stays the farmer’s overall tier." },
    ],
    outcome: "You can inspect exactly who is in any audience before using it.",
    related: ["map-clusters", "create-campaign"],
  },

  // ─────────────────────────── Campaigns ───────────────────────────
  {
    id: "projects",
    title: "Organising work with Projects",
    summary: "Bundle clusters into a dated project.",
    section: "Campaigns",
    roles: ["central", "sysadmin"],
    minutes: 2,
    steps: [
      { text: "Open “Projects”. A project groups one or more clusters together with a start and end date.", image: "projects.png" },
      { text: "Create a project, add its clusters, and set the dates. You can extend a project’s dates later if needed." },
      { text: "Campaigns are then created inside a project, so all the outreach for a season sits together." },
    ],
    outcome: "Your clusters are organised into dated projects, ready for campaigns.",
    related: ["create-campaign"],
  },
  {
    id: "comm-plan",
    title: "Setting up the communication plan",
    summary: "The message, offer, and channel for each segment.",
    section: "Campaigns",
    roles: ["central", "sysadmin"],
    minutes: 3,
    steps: [
      { text: "In Campaigns, open the Comm Plan. Each segment has a recommended channel (Call, WhatsApp, 1:1), an offer, timing, and a ready-made message template.", image: "comm-plan.png" },
      { text: "Edit any row — change the wording, offer, or channel — and save. Templates use the farmer’s name and crop automatically." },
    ],
    outcome: "Every segment has an approved message and offer that officers use during outreach.",
    related: ["create-campaign", "execute-campaign"],
  },

  // ─────────────────────────── Administration ───────────────────────────
  {
    id: "product-catalog",
    title: "Browsing the Product Catalog",
    summary: "Every product with its category, pricing, and sales.",
    section: "Administration",
    roles: ["regional", "central", "sysadmin"],
    minutes: 2,
    steps: [
      { text: "Open “Product Catalog” to see all products from the master file, with their category, crop, and pricing columns.", image: "products.png" },
      { text: "Use it to check which products belong to a crop or category — this is what campaign attribution matches against." },
    ],
    outcome: "You know what’s in the catalogue and how products map to crops/categories.",
  },
  {
    id: "stock-movement",
    title: "Reading Stock / Movement",
    summary: "Units, revenue, fast movers, and dead stock.",
    section: "Administration",
    roles: ["regional", "central", "sysadmin"],
    minutes: 2,
    steps: [
      { text: "Open “Stock / Movement”. The top shows total units and revenue (base price), and a monthly trend.", image: "movement.png" },
      { text: "See fast-moving products, slow/dead stock, category mix, and a store leaderboard." },
    ],
    outcome: "You can see what’s selling, what’s idle, and where.",
  },
  {
    id: "settings",
    title: "System settings & reference data",
    summary: "Configuration and the reference-data counts.",
    section: "Administration",
    roles: ["sysadmin"],
    minutes: 2,
    steps: [
      { text: "Open “Settings”. The Reference data card shows counts of crops, villages, products, stores, and problem categories.", image: "settings.png" },
      { text: "Adjust system configuration and data-management options from here." },
    ],
    outcome: "The portal’s reference data and configuration are in one place.",
  },
  {
    id: "audit-log",
    title: "Reviewing the Audit Log",
    summary: "A record of system activity and data changes.",
    section: "Administration",
    roles: ["sysadmin"],
    minutes: 2,
    steps: [
      { text: "Open “Audit Log” to see recent activity — who changed what and when.", image: "audit.png" },
      { text: "An employee’s own activity also shows on their user detail popup in the Users page." },
    ],
    outcome: "You have an activity trail for accountability.",
    related: ["manage-users"],
  },
];

/** Topics visible to a viewer role (sysadmin sees all). */
export function topicsForRole(role: ViewerRole): TrainingTopic[] {
  if (role === "sysadmin") return TRAINING;
  return TRAINING.filter((t) => t.roles.includes(role));
}
