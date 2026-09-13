# Screen Spec — New Visit Wizard (5 steps)

Source: `webapp/docs/original-design.dc.html`
- Template slice: lines **919–1262** (inside `<sc-if value="{{ isNewVisit }}">`)
- Script: state lines **2585–2648**, `renderVals()` lines **2650–3808**

---

## 1. PURPOSE & WHEN IT SHOWS

A 5-step guided form for a field officer to record a **new farmer visit** (capture/refresh a Farmer record + log a Visit). It is the data-capture core of the app ("Kisan Sewa Kendra" field intel).

- **View gate:** rendered only when `s.view === 'newVisit'` → exposed as `isNewVisit` (line 2677). The whole template block is wrapped in `<sc-if value="{{ isNewVisit }}">`.
- **Entered via:** sidebar nav handler `goToNewVisit = go('newVisit')` (line 3605). `go(v)` resets `{ view:v, step:0, selectedFarmer:null }` (line 2652), so opening the wizard always starts at **Step 0**. NOTE: `go()` does NOT clear `s.form` — the form persists from a previous session/visit until `submitVisit` resets it. In the React port decide whether to reset form on mount (recommended).
- **Role gating:** the **nav entry** for New Visit is shown only when `showNewVisit = R === 'regional' || R === 'officer' || R === 'sysadmin'` (line 2693). `central` (Dr. Anita Sharma) does NOT get the New Visit nav item. The view itself has no internal role branches; gate it at the route/nav layer (and ideally guard the route so `central` cannot deep-link to it).
- **Wizard step state:** `s.step` (0..4), initialized to `0` in state (line 2587). Step flags: `isStep0:s.step===0` … `isStep4:s.step===4` (line 3615).

### Configurable props (design-time, `data-props`, lines 2559–2583)
These are injected props with defaults (lines 2656–2658). Port them as component props / config:
| Prop | Type | Default | Options | Effect |
|---|---|---|---|---|
| `primaryIdLabel` | string (enum) | `'Mobile Number'` | `Mobile Number`, `Farmer ID`, `Aadhaar Number` | Label of the primary identifier field (Step 0 hero) |
| `visitReasonRequired` | boolean | `true` | — | If true, `visitReasonStar = ' *'` else `''` (line 3644) → controls the asterisk on "Visit Reason" label |
| `requireGPS` | boolean | `true` | — | Read into a local (line 2658) but the GPS row is **hardcoded** in this slice; treat as future toggle for showing/requiring the GPS confirmation row |
| `defaultDistrict` | string (enum) | `'Agra'` | Agra, Firozabad, Mainpuri, Etah, Mathura, Hathras | Intended default district (NOTE: state default is actually `'Barabanki'`, see Gotchas) |

---

## 2. LAYOUT TREE (top → bottom, with Tailwind translation)

Color tokens used throughout (map to your theme):
- Primary green `#2E7D32` → `brand-700` / `primary`; hover `#1B5E20` → `brand-800`
- Mid green `#43A047` → `brand-600`; light `#66BB6A` → `brand-400`; `#A5D6A7`→`brand-200`; `#C8E6C9`→`brand-100`; `#E8F5E9`/`#F1F8F1`→`brand-50`
- Neutrals: `#1A1C1A` (near-black text), `#424242`, `#616161`, `#757575`, `#9E9E9E`, `#BDBDBD`, `#E0E0E0` (border), `#F0F0F0` / `#F5F7F5` / `#F5F5F5` (rails)
- Warning: `#FFF8E1` bg / `#FFE082` border / `#F9A825` icon / `#795548` text / `#F57F17`

```
<sc-if isNewVisit>
└─ Outer wrapper                              max-w-[800px] mx-auto  (animation fadeUp 0.4s)
   ├─ A. Progress Steps row                   flex items-center mb-7 gap-1
   │     sc-for wizSteps (5)  →  per step:    flex items-center gap-1 flex-1
   │        ├─ number circle  w-[30px] h-[30px] rounded-full grid place-items-center
   │        │     text-[12px] font-bold  bg={ws.circleBg} text={ws.circleColor} shrink-0
   │        ├─ label          text-[11.5px] whitespace-nowrap font-={ws.fw} text={ws.textColor}
   │        └─ connector line flex-1 h-[2px] mx-1 bg={ws.lineBg}
   │
   └─ B. Form Card            bg-white rounded-2xl p-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)]
         │                    border border-black/[0.03]
         │
         ├─ STEP 0 (sc-if isStep0): "Farmer & Location"
         │   ├─ H: text-[18px] font-bold text-[#1A1C1A] mb-5
         │   ├─ Primary ID hero card   mb-5 p-5 rounded-[13px]
         │   │      bg-gradient-to-br from-[#F1F8F1] to-[#E8F5E9] border-[1.5px] border-[#A5D6A7]
         │   │   ├─ eyebrow row  text-[11px] font-bold text-[#2E7D32] uppercase tracking-[0.7px]
         │   │   │      mb-2 flex items-center gap-1.5  (green ⊕ svg)  "{{primaryIdLabel}} — Unique Identifier *"
         │   │   ├─ <input tel>  w-full px-4 py-[13px] border-2 border-[#C8E6C9] rounded-[10px]
         │   │   │      text-[16px] tracking-[1px] bg-white  focus:border-[#2E7D32] focus:ring-[3px] focus:ring-[#2E7D32]/[0.12]
         │   │   └─ helper  mt-[7px] text-[11px] text-[#757575]  "Used as the unique identifier…"
         │   │
         │   ├─ (sc-if mobileLookupFound) Returning-Farmer result card
         │   │      p-[14px_16px] rounded-xl bg-[#E8F5E9] border-[1.5px] border-[#A5D6A7] mb-[18px]
         │   │   ├─ eyebrow "Returning Farmer Found" (green check svg)  text-[10.5px] uppercase
         │   │   ├─ identity row  flex items-center gap-3 mb-3
         │   │   │     ├ avatar  w-10 h-10 rounded-full grid place-items-center text-white font-bold text-[14px]  bg={mlAvBg}
         │   │   │     ├ name/loc  flex-1 :  name text-[14.5px] font-bold ; "{mlVillage}, {mlDistrict}" text-[11.5px] text-[#616161]
         │   │   │     └ segment pill  px-2.5 py-[3px] rounded-full text-[10.5px] font-bold  bg={mlSegBg} text={mlSegColor}
         │   │   ├─ 3-col stat grid  grid-cols-3 gap-2 mb-3  (each: bg-white rounded-lg px-2.5 py-2)
         │   │   │     • Crop = {mlCrop}    • Last Visit = {mlLastVisit}    • Lifetime Value = {mlLtv} (green)
         │   │   │       (cell label text-[9px] uppercase text-[#9E9E9E] font-semibold; value text-[12.5px] font-semibold)
         │   │   └─ CTA  onClick goToLookupProfile  py-[9px] rounded-lg bg-[#2E7D32] text-white text-[12px]
         │   │             text-center cursor-pointer  hover:bg-[#1B5E20]   "View Full Profile →"
         │   │
         │   ├─ (sc-if mobileLookupNoMatch) New-farmer banner
         │   │      p-[11px_14px] rounded-[10px] bg-[#FFF8E1] border-[1.5px] border-[#FFE082] mb-[18px]
         │   │      flex items-center gap-2  (amber ⚠ svg) text-[12px] text-[#795548]
         │   │      "New farmer — no existing record for this mobile. Continuing as new registration."
         │   │
         │   ├─ Farmer details grid  grid-cols-2 gap-4 mb-[18px]
         │   │     ├ Farmer Name *      <input text>  setName
         │   │     ├ Father/Husband Name <input text> setFather
         │   │     ├ Village *          <select> setVillage  (options below)
         │   │     └ District           <select> setDistrict (options below)
         │   │        field label: text-[12px] font-semibold text-[#616161] mb-1.5
         │   │        input/select:  w-full px-3.5 py-[11px] border-[1.5px] border-[#E0E0E0] rounded-[10px]
         │   │                       text-[14px] focus:border-[#2E7D32] ; selects add bg-white
         │   ├─ Visit Reason{visitReasonStar}  mb-4 : <input text> setVisitPurpose
         │   └─ GPS row  p-[14px_18px] bg-[#F5F7F5] rounded-[10px] flex items-center gap-2.5
         │         • green dot w-2 h-2 rounded-full ; "GPS Location: 27.1767° N, 78.0081° E — Confirmed" (HARDCODED)
         │
         ├─ STEP 1 (sc-if isStep1): "Land & Crops"
         │   ├─ Land Holding *  → chip row, sc-for landChips (single-select, 8)
         │   ├─ 2-col grid: Soil Type (sc-for soilChips, single, 10)  |  Soil Testing (sc-for soilTestChips, single, 2)
         │   ├─ Water Source  → sc-for waterChips (MULTI, 9)
         │   ├─ Main Crop *   → sc-for mainCropChips (single, 15)
         │   ├─ Other Crops Grown → sc-for cropChips (MULTI, 21)
         │   ├─ 2-col grid:
         │   │     Season *  → sc-for seasonChips (single, 3)
         │   │     | Crop Insured? toggle (toggleCropIns / cropInsBg / cropInsPos / cropInsLabel) + label
         │   └─ Other Crops & Vegetables (free text)  <input text> setOtherCrops
         │
         ├─ STEP 2 (sc-if isStep2): "Products & Issues"
         │   ├─ Products Currently Using → sc-for productChips (MULTI, 11)
         │   ├─ Products Required        → sc-for prodReqChips (MULTI, 13)
         │   ├─ Current Problem          → sc-for probChips (MULTI, 11)
         │   ├─ Crop Risk               → sc-for riskChips (MULTI, 11)
         │   └─ Danger Zone             → sc-for dangerChips (MULTI, 16)
         │
         ├─ STEP 3 (sc-if isStep3): "Commercial & Services"
         │   ├─ Annual Agriculture Expense → sc-for expenseChips (single, 6)
         │   ├─ Purchase Frequency         → sc-for freqChips (single, 4)
         │   ├─ Other Shops Buy From       <input text> setOtherShops
         │   ├─ divider + heading "Services & Membership" (border-top #F0F0F0)
         │   └─ 2-col grid of 4 toggles (gap-y-4 gap-x-8):
         │        FPO Member? (toggleFpo) | Contract Farming? (toggleContract)
         │        Dairy Services? (toggleDairy) | WhatsApp Available? (toggleWhatsapp)
         │        each row: label flex-1 + toggle + Yes/No label (w-6)
         │
         ├─ STEP 4 (sc-if isStep4): "Review & Submit"
         │   ├─ Lead Status * → sc-for statusChips (single, 6)
         │   ├─ Follow-up Date  <input type=date>  (NOT wired — no onChange/value)
         │   ├─ Visit Summary card  p-[18px] bg-[#F5F7F5] rounded-xl mb-5
         │   │     grid-cols-2 gap-2 text-[12px] : Farmer, Mobile, Village, Land, Main Crop, Season, Expense, Status
         │   │     (labels #757575 ; values #1A1C1A font-semibold ; Status value is green #2E7D32)
         │   └─ 2 dashed action buttons (flex gap-3): "+ Attach Photos" | "+ Record Voice Note"
         │        border-[1.5px] border-dashed border-[#BDBDBD] text-[#757575] hover:border/text #2E7D32
         │        (NOT wired — decorative placeholders)
         │
         └─ WIZARD NAV  flex justify-between mt-7 pt-5 border-t border-[#F0F0F0]
               ├ (sc-if showPrev) "Previous"  onClick prevStep  — outlined pill
               ├ (sc-if hidePrev) empty <div>  (spacer so Continue stays right-aligned on step 0)
               ├ (sc-if showNext) "Continue"   onClick nextStep  — solid green, active:scale-[0.97]
               └ (sc-if showSubmit) "Submit Visit" onClick submitVisit — solid green, active:scale-[0.97]
```

### Step `<select>` static options (hardcode or pull from FieldOption)
- **Village:** Chandpur, Barauli, Khandauli, Fatehabad, Sikandra, Shamsabad
- **District:** Agra, Firozabad, Mainpuri, Etah, Mathura

---

## 3. DATA

### Form state (`s.form`, lines 2636–2647) — maps to a Farmer + Visit draft
| Field (`s.form`) | Binding(s) | Setter | Initial | Step | Entity field |
|---|---|---|---|---|---|
| `name` | `formName` | `setName=sf('name')` | `''` | 0 | Farmer.name |
| `father` | `formFather` | `setFather=sf('father')` | `''` | 0 | Farmer.fatherName |
| `mobile` | `formMobile` | `setMobile=sf('mobile')` | `''` | 0 | Farmer.mobile (UNIQUE id) |
| `village` | `formVillage` | `setVillage=sf('village')` | `'Ram Nagar'` | 0/4 | Farmer.village |
| `district` | `formDistrict` | `setDistrict=sf('district')` | `'Barabanki'` | 0 | Farmer.district |
| `visitPurpose` | `formVisitPurpose` | `setVisitPurpose=sf('visitPurpose')` | `''` | 0 | Visit.purpose |
| `landHolding` | chips `landChips` + summary `formLandHolding` | chip click | `''` | 1/4 | Farmer.landHolding |
| `soil` | chips `soilChips` | chip click | `''` | 1 | Farmer.soilType |
| `soilTesting` | chips `soilTestChips` | chip click | `''` | 1 | Farmer.soilTesting |
| `waterSource[]` | chips `waterChips` (multi) | chip toggle | `[]` | 1 | Farmer.waterSources |
| `mainCrop` | chips `mainCropChips` + `formMainCrop` | chip click | `''` | 1/4 | Farmer.mainCrop |
| `crop[]` | chips `cropChips` (multi) | chip toggle | `[]` | 1 | Farmer.crops |
| `otherCrops` | `formOtherCrops` | `setOtherCrops=sf('otherCrops')` | `''` | 1 | Farmer.otherCrops |
| `season` | chips `seasonChips` + `formSeason` | chip click | `'Rabi'` | 1/4 | Visit.season |
| `cropInsured` | `cropInsBg/Pos/Label` | `toggleCropIns` | `false` | 1 | Farmer.cropInsured |
| `product[]` | chips `productChips` (multi) | chip toggle | `[]` | 2 | Visit.productsUsing |
| `productRequired[]` | chips `prodReqChips` (multi) | chip toggle | `[]` | 2 | Visit.productsRequired |
| `currentProblem[]` | chips `probChips` (multi) | chip toggle | `[]` | 2 | Visit.problems |
| `cropRisk[]` | chips `riskChips` (multi) | chip toggle | `[]` | 2 | Visit.cropRisks |
| `dangerZone[]` | chips `dangerChips` (multi) | chip toggle | `[]` | 2 | Farmer.dangerZones |
| `annualExpense` | chips `expenseChips` + `formExpense` | chip click | `''` | 3/4 | Farmer.annualExpense |
| `purchaseFreq` | chips `freqChips` | chip click | `''` | 3 | Farmer.purchaseFreq |
| `otherShops` | `formOtherShops` | `setOtherShops=sf('otherShops')` | `''` | 3 | Farmer.otherShops |
| `fpoMember` | `fpoBg/Pos/Label` | `toggleFpo` | `false` | 3 | Farmer.fpoMember |
| `contractFarming` | `contractBg/Pos/Label` | `toggleContract` | `false` | 3 | Farmer.contractFarming |
| `dairyServices` | `dairyBg/Pos/Label` | `toggleDairy` | `false` | 3 | Farmer.dairyServices |
| `whatsappAvail` | `whatsappBg/Pos/Label` | `toggleWhatsapp` | `false` | 3 | Farmer.whatsappAvail |
| `leadStatus` | chips `statusChips` + `formStatus` | chip click | `'New'` | 4 | Farmer.leadStatus / Visit.outcome |

`sf = key => e => setState(form:{...form,[key]:e.target.value})` (line 3040).

### Progress steps — `wizSteps` (lines 2994–3002)
`stepLabels = ['Farmer & Location','Land & Crops','Products & Issues','Commercial & Services','Review & Submit']`. Per step `i`, derived purely from `s.step`:
- `num = i+1`
- `circleBg`: current `#2E7D32` / done(`step>i`) `#66BB6A` / future `#E0E0E0`
- `circleColor`: `step>=i ? white : #9E9E9E`
- `fw`: current `600` else `400`
- `textColor`: current `#2E7D32` / done `#43A047` / future `#BDBDBD`
- `lineBg`: done `#66BB6A` else `#E8E8E8`

### Chip options (the FieldOption catalog — port to a `FieldOption` table or constants)
Built by `mkSingle(key, opts)` (single-select, lines 3011–3016) and `mkMulti(key, opts)` (multi, lines 3005–3010). Each chip returns `{label, bg, color, border, click}`.
- Selected chip styling: `bg #E8F5E9`, `color #2E7D32`, `border #2E7D32`.
- Unselected: `bg white`, `color #616161`, `border #E0E0E0`.

Option lists (lines 3019–3037):
- `landChips` (single): `< 1 Bigha, 1–3 Bigha, 3–5 Bigha, 5–10 Bigha, 10–20 Bigha, 20–50 Bigha, 50–100 Bigha, 100+ Bigha`
- `soilChips` (single): `Sandy, Sandy Loam, Loam, Clay Loam, Clay, Black Soil, Red Soil, Alluvial Soil, Saline Soil, Other`
- `soilTestChips` (single): `Required, Not Required`
- `waterChips` (multi): `Canal, Tube Well, Bore Well, River, Pond, Rain Water, Drip Irrigation, Sprinkler Irrigation, Other`
- `mainCropChips` (single): `Wheat, Paddy, Maize, Mustard, Potato, Sugarcane, Gram, Arhar, Urad, Moong, Soybean, Groundnut, Vegetables, Fruits, Other`
- `cropChips` (multi): `Wheat, Paddy, Maize, Mustard, Potato, Sugarcane, Gram, Arhar, Urad, Moong, Soybean, Groundnut, Tomato, Onion, Chilli, Brinjal, Okra, Cabbage, Cauliflower, Pea, Other`
- `seasonChips` (single): `Kharif, Rabi, Zaid`
- `productChips` (multi): `Seeds, Fertilizers, Pesticides, Fungicides, Herbicides, Insecticides, Bio Products, Micronutrients, PGR, Farm Equipment, Other`
- `prodReqChips` (multi): `Seeds, Fertilizers, DAP, Urea, NPK, Micronutrients, Insecticides, Fungicides, Herbicides, Bio Fertilizers, Growth Promoters, Equipment, Other`
- `probChips` (multi): `Pest Infestation, Disease Infection, Weed Problem, Irrigation Issue, Fertilizer Req., Seed Req., Low Yield, Soil Issue, Market Price, Labour Shortage, Other`
- `riskChips` (multi): `Pest Attack, Disease, Drought, Flood, Water Logging, Low Germination, Nutrient Deficiency, Weather Damage, Animal Damage, None, Other`
- `dangerChips` (multi): `Flood Prone, Water Logging, Heavy Rainfall, Drought Prone, Hailstorm, Heat Wave, Frost, Cold Wave, Storm/Wind, River Overflow, Salinity, Soil Erosion, Wild Animal, Pest Outbreak, Disease Outbreak, No Major Risk`
- `expenseChips` (single): `< ₹10K, ₹10–25K, ₹25–50K, ₹50K–1L, ₹1–2.5L, ₹2.5L+`
- `freqChips` (single): `Weekly, Monthly, Seasonal, As Required`
- `statusChips` (single): `New, Contacted, Recommendation Given, Follow-up Scheduled, Converted, Lost`

### Mobile Lookup (lines 2971–2991) — reads the Farmer directory
- `mobileVal = s.form.mobile`. When `length >= 10`, search `farmersWithEdits.find(f => f.mobile === mobileVal)` (the demo `farmers` array merged with `s.farmerEdits`, line 2782).
- `mobileLookupFound = !!match`; `mobileLookupNoMatch = mobileVal.length>=10 && !match`.
- Result fields: `mlName, mlVillage, mlDistrict, mlCrop, mlSegment` (from farmer); `mlInit` = initials; `mlAvBg` = `avColors[index % 8]` (palette line 2779); `mlSegBg/mlSegColor` from `segBgs/segColors` maps (lines 2725–2726, keyed by segment `High Value / Medium Value / New/Low / Dormant`).
- `goToLookupProfile` → `setState({ view:'farmerDetail', selectedFarmer: match })` (navigates to Farmer 360 detail screen).

> GOTCHA: `mlLastVisit = match.lastVisit` and `mlLtv = match.ltv`, but the demo `farmers` objects (lines 2727+) have **no `lastVisit` or `ltv` keys** → these render **empty** in the result card. In the real port, map these to `Farmer.lastVisitDate` and a derived lifetime-value (`SUM(sales.amt)` / a stored `Farmer.ltv`). The Crop / segment / village / district fields ARE present.

---

## 4. INTERACTIONS

| Trigger | Handler (line) | Behavior |
|---|---|---|
| Mobile input change | `setMobile` (3624) | sets `form.mobile`; at ≥10 chars triggers lookup → shows Found card or No-match banner |
| Name/Father/Village/District/VisitReason/OtherCrops/OtherShops change | `setName, setFather, setVillage, setDistrict, setVisitPurpose, setOtherCrops, setOtherShops` (3624-3643) | update respective `form.*` |
| "View Full Profile →" | `goToLookupProfile` (2989) | `view:'farmerDetail'`, `selectedFarmer=match` → Farmer 360 |
| Any **single-select** chip | `ch.click` from `mkSingle` (3015) | `form[key]=o` (replaces) |
| Any **multi-select** chip | `ch.click` from `mkMulti` (3009) | toggles `o` in/out of `form[key]` array |
| Crop Insured toggle | `toggleCropIns` (3631) | flips `form.cropInsured`; knob `left:2↔24px`, bg `#BDBDBD↔#2E7D32`, label `No↔Yes` |
| FPO / Contract / Dairy / WhatsApp toggles | `toggleFpo/Contract/Dairy/Whatsapp` (3633-3640) | flip `form.fpoMember/contractFarming/dairyServices/whatsappAvail`; same knob/bg/label logic |
| "Previous" | `prevStep` (3618) | `step = max(step-1, 0)` |
| "Continue" | `nextStep` (3617) | `step = min(step+1, 4)` |
| "Submit Visit" | `submitVisit` (3619) | `view:'dashboard'`, `step:0`, and **fully resets `form`** to blank defaults (village→`'Chandpur'`, district→`'Agra'`, season→`'Rabi'`, leadStatus→`'New'`, everything else empty/false). NO persistence in the prototype. |

**Nav visibility:** `showPrev = step>0`, `hidePrev = step===0` (renders empty spacer), `showNext = step<4`, `showSubmit = step===4` (lines 3616). So step 0 shows only Continue (right); steps 1–3 show Previous + Continue; step 4 shows Previous + Submit Visit.

> No validation gating exists in the prototype — `*` markers are visual only; `nextStep` advances regardless of empty required fields. Add real validation in the port (block Continue until required fields filled per step).

---

## 5. ROLE DIFFERENCES / EMPTY STATES / DYNAMIC STYLING

- **Roles:** no in-view branching. Access controlled only by the nav (`showNewVisit`; `central` excluded). Guard the route accordingly.
- **Empty states:**
  - Before 10 mobile digits: neither lookup card nor no-match banner shows.
  - ≥10 digits, match: green "Returning Farmer Found" card (Last Visit / Lifetime Value cells blank in prototype — see gotcha).
  - ≥10 digits, no match: amber "New farmer" banner.
  - Step 4 summary shows whatever is currently in `form` (blank fields render as empty after the value `:` ).
- **Dynamic styling:**
  - Progress circles/lines/labels recolor by step position (`wizSteps`).
  - Chips: selected vs unselected color set (green-tinted vs neutral); `style-hover="opacity:0.85"` → `hover:opacity-85`.
  - Toggles: knob `left` (2px↔24px) and track bg animate (`transition` 0.2s) on the boolean.
  - Buttons: `style-hover` green darken (`#1B5E20`), `style-active="transform:scale(0.97)"` → `active:scale-[0.97]`; outlined Previous → hover border+text green.
  - Inputs: `style-focus="border-color:#2E7D32"` (mobile input adds focus ring) → `focus:border-brand-700` / `focus:ring`.

---

## 6. PORT NOTES (React/Next + Tailwind)

**Component split:**
- `NewVisitWizard` (page/route `view==='newVisit'`): owns `step` + `form` state (e.g. `useState` or a `useReducer`/`react-hook-form`). Renders `WizardProgress`, the current `StepN` panel, and `WizardNav`.
- `WizardProgress` — props `{ steps, current }`; pure presentational from `wizSteps` logic.
- `StepFarmerLocation`, `StepLandCrops`, `StepProductsIssues`, `StepCommercialServices`, `StepReviewSubmit` — each takes the form slice + setters it needs.
- `ChipGroup` — props `{ options, value, onChange, multi }`; reproduces `mkSingle`/`mkMulti` (selected = green tint). Centralize chip option lists in a `fieldOptions.ts` (or fetch from `FieldOption` table by category).
- `Toggle` — props `{ checked, onChange, label }`; reproduces the 48×26 pill knob.
- `MobileLookupCard` / `NewFarmerBanner` — driven by a lookup hook.

**Data hooks / props:**
- `useFarmerLookup(mobile)` → debounced query `GET /api/farmers?mobile=` returning `{ found, farmer }` (replace the in-memory `farmersWithEdits.find`). Trigger at length ≥ 10.
- Config props (`primaryIdLabel`, `visitReasonRequired`, `requireGPS`, `defaultDistrict`) from app config / tenant settings.
- `villages` / `districts` selects → from `FieldOption` (or geo master) rather than hardcoded.
- Submit → `POST /api/visits` creating a Visit (+ upserting Farmer by mobile), then route to dashboard. Write an `AuditLog` entry on submit. Wire the Follow-up Date input (`Visit.followUpDate`) and the Attach Photos / Voice Note placeholders (`Visit.attachments`) which are non-functional stubs in the prototype.

**Gotchas:**
1. `form` is NOT reset on entering the wizard (only on submit). Decide on mount-reset; also persist a draft (offline field use) since field officers may lose connectivity.
2. State default `village:'Ram Nagar', district:'Barabanki'` (line 2637) does NOT match the Step-0 `<select>` options (Chandpur…/Agra…) nor `submitVisit`'s reset (Chandpur/Agra) nor `defaultDistrict` prop. Pick one source of truth; align select options with defaults so the controlled `<select>` shows a valid selected value.
3. `lastVisit`/`ltv` missing on farmer demo data → handle null gracefully in the lookup card.
4. No validation / no real persistence in the prototype — add both.
5. GPS row is hardcoded text; implement real geolocation (gate by `requireGPS`).
6. Several chip lists overlap with other screens (segments, crops) — share the FieldOption source.

---

### Summary
The New Visit Wizard (`view==='newVisit'`, hidden from the `central` role) is a 5-step farmer-visit capture form centered on a 800px card: Step 0 Farmer & Location (mobile-as-unique-id with live directory lookup that shows a returning-farmer card or new-farmer banner), Step 1 Land & Crops, Step 2 Products & Issues, Step 3 Commercial & Services, Step 4 Review & Submit. All inputs write to a single `s.form` object; selections use single/multi chip groups (`mkSingle`/`mkMulti`) and four boolean toggles, with a progress header derived purely from `s.step`. Data dependencies: the Farmer directory (`farmersWithEdits` + `segColors/segBgs/avColors`) for the mobile lookup, a static FieldOption catalog for all chips/selects, and four config props (`primaryIdLabel`, `visitReasonRequired`, `requireGPS`, `defaultDistrict`). `nextStep`/`prevStep` clamp the step; `submitVisit` resets the form and returns to the dashboard with no validation or persistence in the prototype (both must be added in the port).
