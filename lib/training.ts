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
  "Reviews & Reports",
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
      { text: "The 🔔 bell next to them is your notification inbox — a red number means something needs your attention. Click it to see what, and click an item to go there." },
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
      { text: "Your Regional Manager is notified and reviews the visit — usually within 48 hours. Their comment, rating, and any follow-up request then appear on the visit." },
    ],
    outcome: "The visit is visible to you and your managers, any follow-up date is tracked, and your RM reviews it.",
    related: ["new-visit", "find-visits", "officer-review-feedback"],
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
      { text: "As an officer you see your store’s visits; a Regional Manager sees the stores they manage; Central/Admin see everything." },
      { text: "Regional Managers: to review visits, use “Visit Reviews” instead — it puts pending visits first and lets you review without leaving the list." },
    ],
    outcome: "You can review any visit and its media whenever you need it.",
    related: ["after-a-visit", "review-queue"],
  },

  // ───────────────────────── Reviews & Reports ──────────────────────────
  {
    id: "review-queue",
    title: "Your review queue (Visit Reviews)",
    summary: "Every visit in your stores that needs your review — pending first, with the SLA clock on each.",
    section: "Reviews & Reports",
    roles: ["regional", "central", "sysadmin"],
    minutes: 3,
    steps: [
      { text: "Open “Visit Reviews” from the menu. The red number on the menu item is how many visits in your stores are still waiting for your review." },
      { text: "Use the pills at the top to switch between All, Pending, Overdue, Needs follow-up, and Reviewed. Each pill shows its count. “All” puts pending visits first.", tip: "Short on time? Pick “Overdue” and sort “Oldest logged first” — that clears the visits that have waited longest." },
      { text: "Narrow the list with the search box (farmer, village, mobile, or officer), the officer and store dropdowns, and the visit-date range. Central and admins also get an RM filter, including “Unassigned (no RM)”.", tip: "A store can have more than one Regional Manager. If it does, its visits appear in the queue of every manager it is mapped to — the first to review it clears it for all of them." },
      { text: "The badge on the right of each row is the SLA clock. Grey = waiting but within time, amber “Due soon” = close to the limit, red “Overdue” = past it. For reviewed visits it shows how long the review took — green if within the SLA, orange “Late” if not.", warn: "The SLA (48 hours by default) starts when the visit is logged in the app, not when you open it." },
      { text: "Click any row to open it in a side panel and review it there, without leaving the list. On a phone the panel opens full-screen; tap ✕ (or press Esc) to close it." },
    ],
    outcome: "You can see exactly what’s waiting, what’s late, and work through it in one place.",
    related: ["review-a-visit", "weekly-reports"],
  },
  {
    id: "review-a-visit",
    title: "Reviewing a visit: comment, rating & follow-up",
    summary: "Sign off a visit, give feedback, rate it, and flag anything that needs follow-up.",
    section: "Reviews & Reports",
    roles: ["regional", "central", "sysadmin"],
    minutes: 4,
    steps: [
      { text: "Open a visit — from the Visit Reviews side panel, or from the visit page itself. The panel shows the key facts first: farmer, crops, problems, pests, products asked for, and the officer’s notes. Press “Show photos” to load the photos and voice notes." },
      { text: "Write a comment for the officer (optional) — what was good, what to fix, what to follow up. Then give a 1–5 star quality rating if you want to (also optional; click the same star again to clear it)." },
      { text: "If something needs action, tick “🚩 Needs follow-up”, pick a due date, and say what needs to happen. Saving creates a follow-up in the Action Registry for that store, linked to this visit.", tip: "The due date starts as the officer’s own follow-up date (if it’s still ahead), otherwise a week from today." },
      { text: "Press “Mark reviewed”. The visit leaves your pending list and the officer can see your feedback on the visit." },
      { text: "Changed your mind? Use “Edit review” to change the comment, rating, or flag, or “Remove review” to put it back to pending. Unticking the follow-up flag closes its action.", warn: "Every change is kept. “Review history” at the bottom of the panel shows who did what and when — nothing can be silently overwritten." },
    ],
    outcome: "The visit is signed off with your feedback, and any follow-up is tracked until someone closes it.",
    related: ["review-queue", "officer-review-feedback"],
  },
  {
    id: "officer-review-feedback",
    title: "Seeing your RM’s feedback on a visit",
    summary: "Where your Regional Manager’s comment, rating and follow-up requests show up.",
    section: "Reviews & Reports",
    roles: ["officer", "sysadmin"],
    minutes: 2,
    steps: [
      { text: "Open any visit you logged (Visit Repo → click the visit). The “Visit review” box at the top says “Awaiting RM sign-off” until your Regional Manager reviews it — there’s nothing you need to do." },
      { text: "Once reviewed, the box shows your RM’s comment and star rating, and who reviewed it and when." },
      { text: "If you see “🚩 Needs follow-up”, your RM has asked for action. It also appears in the Action Registry for your store with a due date — add progress notes there as you work on it.", tip: "When the follow-up is done, your RM (or an admin) signs it off in the Action Registry — the flag on the visit then shows “Follow-up resolved”." },
    ],
    outcome: "You always know what your RM thought of a visit and what they want followed up.",
    related: ["after-a-visit"],
  },
  {
    id: "weekly-reports",
    title: "Reading your weekly report",
    summary: "The automatic weekly summary of visits, reviews, findings and next steps for your region.",
    section: "Reviews & Reports",
    roles: ["regional", "central", "sysadmin"],
    minutes: 4,
    steps: [
      { text: "Open “Weekly Reports”. A new report arrives every Monday morning for the previous week (the day and time are set by the admin). You also get a 🔔 notification — and an email, if email is switched on." },
      { text: "The top row shows the week in numbers: visits logged, % reviewed, % reviewed within the SLA, average turnaround, follow-ups, average rating, farmers visited, and your review backlog right now. Small arrows compare with the previous week." },
      { text: "The Summary box reads the week for you: what happened, Key findings, Concerns / flags, and Recommended next steps.", tip: "Each point has small VIS-… tags — click one to open exactly the visit it came from. Nothing in the summary is invented; every point comes from your visits." },
      { text: "Below that: a table per officer (including officers who logged no visits), visits per store, the most reported problems, pests, crops and products, open follow-ups, low-rated visits, and your latest review comments." },
      { text: "Use “⬇ Excel” to download the full report (including every visit of the week), or “🖨 Print / Save as PDF” to print it or save it as a PDF.", warn: "If a week had no visits, you still get a report — it clearly says there was no activity." },
    ],
    outcome: "In a few minutes you know how the week went and what to do next — without reading every visit.",
    related: ["review-queue", "reports-central"],
  },
  {
    id: "reports-central",
    title: "Trends, comparing regions & exports (Central)",
    summary: "See every region at once, track review completion over time, and compare RMs side by side.",
    section: "Reviews & Reports",
    roles: ["central", "sysadmin"],
    minutes: 4,
    steps: [
      { text: "In “Weekly Reports”, pick a week using the chips at the top. The table lists every Regional Manager with their visits, % reviewed, % within SLA (red when under 90%), follow-ups, rating, and overdue count, plus all-region totals above it.", warn: "A store with two Regional Managers counts in both of their rows, so the per-RM numbers can add up to more than the all-regions total — that total still counts each visit once." },
      { text: "“⬇ Excel (all regions)” downloads that week’s comparison as one sheet with remarks such as “Below the 90% SLA target”." },
      { text: "The “📈 Completion trend” tab shows the last 12 weeks: an all-regions line against the 90% target, visits per week, and a grid of RMs × weeks where darker cells mean better review completion. Switch between “Within SLA %” and “Reviewed %” at the top.", tip: "Hover or tab onto any grid cell to see that RM’s visits, reviewed and within-SLA counts for the week." },
      { text: "The “⇆ Compare regions” tab puts up to 4 regions side by side for the same week — their numbers and full summaries. It opens with the three busiest regions; click names to add or remove." },
      { text: "Every morning you also get a 🔔 (and an email, if switched on) listing the RMs with visits past the review SLA." },
    ],
    outcome: "You can judge field execution quality across every region without opening a single visit record.",
    related: ["weekly-reports", "notifications"],
  },
  {
    id: "notifications",
    title: "Notifications: the bell and emails",
    summary: "What you get notified about, and where.",
    section: "Reviews & Reports",
    roles: ["regional", "central", "sysadmin"],
    minutes: 2,
    steps: [
      { text: "The 🔔 bell in the top bar shows your unread notifications. Click it to open your inbox; click an item to go straight to it. “Mark all read” clears the number.", warn: "The bell is always the inbox of the account you signed in with. An admin viewing the portal as another role still sees their own notifications, never that person’s." },
      { text: "Regional Managers get one running item a day — “N new visits to review” — that updates each time an officer logs a visit in your stores, plus “Your weekly report is ready” every week." },
      { text: "Central gets “N weekly reports ready” each week and a daily item listing RMs with visits past the review SLA." },
      { text: "If email is switched on and your profile has a valid Work email, you also get: RMs — a short morning digest of visits waiting for review and your weekly report; Central — the weekly all-regions summary and the daily SLA alert.", warn: "No email arriving? Ask an admin to check your Work email on the Users page — a missing or mistyped address means you only get the bell. The bell always works, even while email is switched off." },
    ],
    outcome: "You hear about what needs your attention without having to go looking for it.",
    related: ["review-queue", "weekly-reports"],
  },
  {
    id: "review-settings",
    title: "Setting up reviews, schedules & email (Admin)",
    summary: "The review SLA, when reports and digests run, and switching on email.",
    section: "Reviews & Reports",
    roles: ["sysadmin"],
    minutes: 4,
    steps: [
      { text: "Open Settings → “📋 Reviews & Reports”. Set the review SLA in hours (default 48), the day the reporting week starts, when the weekly report runs, and when the daily digest and SLA alert go out. All times are India time. Press “Save settings”." },
      { text: "The Email card shows whether email is connected. While it says “Not configured”, nothing is emailed — but the review queue, the 🔔 bell, the weekly reports and the trend all keep working as normal, and every email the portal would have sent is listed under “Recent emails” as “Failed — not configured”.", tip: "Nothing is marked as already sent while email is off, so real delivery simply starts once the key is in place." },
      { text: "To switch it on, add RESEND_API_KEY and EMAIL_FROM (a no-reply address such as noreply@verdeagrotech.com) in Vercel → Project → Settings → Environment Variables, then redeploy. EMAIL_REPLY_TO is optional — leave it unset and the emails tell readers not to reply.", warn: "Email only works once the sending domain (verdeagrotech.com) is verified in Resend — add the DNS records it gives you with whoever hosts the domain." },
      { text: "Send yourself a test email. Check it arrives in the inbox (not spam); in Gmail, “Show original” should show SPF, DKIM and DMARC all as PASS." },
      { text: "“Preview the real emails” sends the actual RM and Central emails, filled with live data and marked “[Sample]”, to any addresses you choose — nobody else receives anything and no real send is blocked or duplicated." },
      { text: "Then tick “Send automatic emails” and save. It’s off by default so nothing goes out until you’ve confirmed the setup works." },
      { text: "“Who can receive email” shows how many RMs, Central and Admin users have a valid Work email — use “Fix missing emails in Users” to fill the gaps. “Recent emails” lists the last sends and any failures." },
      { text: "In Weekly Reports, “⟳ Generate last week now” builds reports immediately instead of waiting for the schedule, and “⟳ Regenerate” on a report rebuilds it from current data.", tip: "Reports and digests run automatically every hour in the background — changing the times here never needs a code change." },
    ],
    outcome: "Reviews are timed the way you operate, and RMs and Central receive their reports and alerts reliably.",
    related: ["settings", "manage-users"],
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
      { text: "Give every Regional Manager and Central user a real Work email — that’s where review digests and weekly reports are sent. The form checks the address as you type and offers a fix for common typos (like “gamil.com”). Each address can belong to only one person.", tip: "The banner at the top counts RMs / Central / Admins with a missing or wrong email — press “Show them” to fix them one by one." },
    ],
    outcome: "Every account has the correct role, store, and a working email, and you can audit who did what.",
    related: ["manage-stores", "notifications"],
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
    id: "sales-sync",
    title: "Keeping sales in sync with the ERP",
    summary: "The daily ERP feed that powers segments & revenue — and how to re-run it.",
    section: "Administration",
    roles: ["sysadmin"],
    minutes: 3,
    steps: [
      { text: "Sales arrive automatically: every night at 02:00 IST the portal pulls the previous day’s invoices from the Verde ERP. Nothing to upload." },
      { text: "Open “Sales Sync” to see the run log, how many bills and new customers each run brought in, and the bill-date coverage strip — an empty cell is a day worth re-fetching.", tip: "The same “Run sync now” card is on Settings → Sales Sync." },
      { text: "To re-fetch a window (a missed night, or corrected invoices), pick the dates and press “Run sync now”. Re-running is safe — bills are replaced by invoice number, never duplicated." },
      { text: "After a run, value/lifecycle segments, LTV and spend figures refresh for every farmer it touched.", warn: "Bills with a placeholder customer mobile (like 1234567890) are skipped — the ERP has no farmer to attach them to." },
    ],
    outcome: "The whole portal reflects yesterday’s sales every morning — segments, LTV, and analytics all update.",
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
      { text: "The “📋 Reviews & Reports” tab holds the review SLA, the weekly-report and digest schedule, and the email setup — see “Setting up reviews, schedules & email”." },
    ],
    outcome: "The portal’s reference data and configuration are in one place.",
    related: ["review-settings"],
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
