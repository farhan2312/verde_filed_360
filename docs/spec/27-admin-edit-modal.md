# Screen 27 — Admin Edit Modal

Source: `original-design.dc.html` template lines **2397–2553**; script: state `editModal`/`editDraft` (~2606–2611), renderVals `// ─── Edit Modal ───` block (~3445–3496) plus binding exports (~3580–3603) and the four openers (farmer 3456–3463, kpi 3464–3470, user 3438–3442, store 3284–3289).

---

## 1. PURPOSE & WHEN IT SHOWS

A single **polymorphic edit modal** used by the System Admin to edit four different entity kinds in place:

- **Farmer** (lead / profile fields)
- **User** (staff account)
- **Store** (Kisan Sewa Kendra)
- **KPI** (dashboard headline metrics)

**Visibility gate.** Rendered whenever `showEditModal` is truthy:
```
const showEditModal = !!s.editModal;   // line 3448
```
`s.editModal` is `null` by default. It is set to an object `{ type, entityId, title, sub }` by one of four openers. The modal is an overlay layered on top of the current screen (it lives at the very end of `<main>`, `z-index:300`), so it can appear over **any** view — but in practice it is only opened from sysadmin surfaces.

**Role-gating.** The modal markup itself is NOT wrapped in a role `sc-if`; it is gated purely by `showEditModal`. However all four openers originate from **System Admin–only** contexts:
- `openFarmerEdit` — Farmer 360 / Farmer Detail edit button (sysadmin)
- `openKpiEdit` — Dashboard "edit KPIs" affordance (sysadmin)
- `userRows[].onEdit` — Users admin table (sysadmin; `isAdmin = R === 'sysadmin'`, line 2702)
- `storeRows[].onEdit` — Stores admin table (sysadmin)

The header always reads **"System Admin · Edit"** and the default subtitle is `'System Admin · Edit Mode'`. So treat the whole modal as **sysadmin-only** in the port (guard the openers, not just the render).

The `type` discriminator drives which form body renders:
```
editIsFarmer = em.type === 'farmer'   // 3449
editIsUser   = em.type === 'user'     // 3450
editIsKpi    = em.type === 'kpi'      // 3451
editIsStore  = em.type === 'store'    // 3599
```

---

## 2. LAYOUT TREE (with Tailwind translation)

> Token map used below: green primary `#2E7D32` → `green-700` (`brand.primary`), hover green `#1B5E20` → `green-900`, admin-orange `#E65100` → `orange-800`, admin-orange tint bg `#FFF3E0` → `orange-50`, text near-black `#1A1C1A` → `neutral-900`, label gray `#616161` → `neutral-700`, muted `#9E9E9E` → `neutral-400`, sub-muted `#757575` → `neutral-500`, border `#E0E0E0` → `neutral-300`, input/divider `#F0F0F0`/`#F5F5F5` → `neutral-100`, close-hover `#EEEEEE` → `neutral-200`.

```
Overlay (sc-if showEditModal)                                         line 2398
  div  position:fixed inset:0  bg rgba(0,0,0,.5)  z-300  flex center
       onClick → closeEditModal   (backdrop dismiss)
  └ Modal card                                                        line 2399
      div  bg white  rounded-[18px]  p-8 (32px)  w-[560px]
           max-h-[82vh]  overflow-y-auto
           shadow-[0_24px_72px_rgba(0,0,0,.25)]
           onClick → stopProp   (prevents backdrop close)
      ├ Header row  flex justify-between items-start mb-[22px]        line 2400
      │  ├ Left column
      │  │  ├ Eyebrow row  flex items-center gap-2 mb-[5px]          line 2402
      │  │  │  ├ Icon chip  26×26  rounded-full  bg #FFF3E0(orange-50)
      │  │  │  │    flex center  flex-none
      │  │  │  │    └ shield svg 13×13 fill #E65100(orange-800)
      │  │  │  └ "SYSTEM ADMIN · EDIT"  10px/700  #E65100
      │  │  │       uppercase  tracking-[0.8px]
      │  │  ├ Title   17px/700  #1A1C1A   → {{ editModalTitle }}     line 2408
      │  │  └ Sub     11.5px  #9E9E9E  mt-[2px] → {{ editModalSub }} line 2409
      │  └ Close button  32×32 rounded-full bg #F5F5F5 flex center   line 2411
      │       cursor-pointer  flex-none  ml-4
      │       hover bg #EEEEEE        onClick → closeEditModal
      │       └ X svg 12×12 stroke #757575 w-2
      │
      ├ BODY — exactly one of the four sc-if blocks renders:
      │
      │  (A) sc-if editIsFarmer  →  grid grid-cols-2 gap-[14px]      line 2416
      │       8 fields (each: label 11px/600 #616161 mb-[5px] + control)
      │       1 Farmer Name        input text   {{ editName }}
      │       2 Mobile Number      input text   {{ editMobile }}
      │       3 Village            input text   {{ editVillage }}
      │       4 District           input text   {{ editDistrict }}
      │       5 Land (acres)       input number {{ editLandAcres }}
      │       6 Main Crop          input text   {{ editCrop }}
      │       7 Lead Status        select       {{ editStatus }}
      │            options: New / Contacted / Follow-up / Converted / Lost
      │       8 Segment            select       {{ editSegment }}
      │            options: High Value / Medium Value / New/Low / Dormant
      │
      │  (B) sc-if editIsUser  →  flex flex-col gap-[14px]           line 2464
      │       1 Full Name         input text   {{ editUserName }}
      │       2 Role              select       {{ editUserRole }}
      │            options: Regional Manager / Agri Officer / Central Admin / System Admin
      │       3 Territory Assignment input text {{ editUserTerritory }}
      │       4 Account Status    select       {{ editUserStatus }}
      │            options: Active / Inactive
      │
      │  (C) sc-if editIsStore  →  flex flex-col gap-[14px]          line 2493
      │       1 Store Name        input text   {{ editStoreName }}
      │       2 Address           input text   {{ editStoreAddress }}
      │       3 District          select       {{ editStoreDistrict }}
      │            options: Agra / Firozabad / Mainpuri / Etah / Mathura
      │       4 Nested grid grid-cols-2 gap-[14px]:                  line 2509
      │            Agri Officer 1  select  {{ editStoreAO1 }}
      │            Agri Officer 2  select  {{ editStoreAO2 }}
      │              both options (value=id): 2=Raj Kumar 3=Amit Yadav
      │                                       4=Vikram Singh 5=Deepak Verma
      │
      │  (D) sc-if editIsKpi  →  grid grid-cols-2 gap-[14px]         line 2526
      │       1 Total Visits        input text {{ editKpiVisits }}
      │       2 Farmers Registered  input text {{ editKpiFarmers }}
      │       3 Conversion Rate     input text {{ editKpiConv }}
      │       4 Pending Follow-ups  input text {{ editKpiFollowups }}
      │
      └ Footer  flex gap-[10px] justify-end mt-6 pt-[18px]          line 2547
                border-t border-[#F0F0F0]
          ├ Cancel  px-[22px] py-[10px] rounded-[10px]
          │   border-[1.5px] #E0E0E0  13px/600  #616161  cursor-pointer
          │   hover: border #9E9E9E, color #424242   onClick → closeEditModal
          └ Save Changes  px-[28px] py-[10px] rounded-[10px]
              bg #2E7D32  text white  13px/600  cursor-pointer
              hover bg #1B5E20        onClick → saveEditModal
```

**Shared field-control styling** (every input & select):
```
w-full  px-[14px] py-[10px]  border-[1.5px] border-[#E0E0E0]  rounded-[10px]
text-[13px]  font-[inherit]  box-border  outline-none
focus: border-color #2E7D32   (style-focus on inputs)
selects add: bg white
```
Translate `style-focus="border-color:#2E7D32"` → Tailwind `focus:border-green-700` (use `focus:outline-none` to match `outline:none`).

---

## 3. DATA — every value & its entity/field

### Modal envelope (`s.editModal`)
| Binding | Source | Notes |
|---|---|---|
| `editModalTitle` | `em.title || ''` | preset per opener (see below) |
| `editModalSub` | `em.sub || 'System Admin · Edit Mode'` | preset per opener |
| `em.type` | discriminator | `'farmer' \| 'user' \| 'store' \| 'kpi'` |
| `em.entityId` | id of edited record | farmer/user/store id, or `'kpi'` |

Title/sub set by openers:
- Farmer: `title='Edit Farmer — '+f.name`, `sub=f.village+' · '+f.mobile`
- User: `title='Edit User — '+m.name`, `sub=m.email`
- Store: `title='Edit Store — '+st.name`, `sub=st.address`
- KPI: `title='Edit Dashboard KPIs'`, `sub='Update key performance indicator values'`

### Draft buffer (`s.editDraft`) — the form holds a **draft copy**, not the live record
All field bindings read from `eDraft` (with fallbacks) and write back via `mSet(key)`:
```
mSet = key => e => this.setState(p => ({ editDraft:{ ...p.editDraft, [key]: e.target.value } }));  // 3454
```

**(A) Farmer** — entity **Farmer** (from `farmersWithEdits`, i.e. base farmer + `s.farmerEdits[id]` overlay):
| Field | Binding (read) | Handler (write) | Draft key | Farmer field |
|---|---|---|---|---|
| Name | `editName` (`eDraft.fName\|\|''`) | `setEditName` | `fName` | `name` |
| Mobile | `editMobile` (`fMobile`) | `setEditMobile` | `fMobile` | `mobile` |
| Village | `editVillage` (`fVillage`) | `setEditVillage` | `fVillage` | `village` |
| District | `editDistrict` (`fDistrict`) | `setEditDistrict` | `fDistrict` | `district` |
| Land | `editLandAcres` (`fLand`) | `setEditLandAcres` | `fLand` | `land` (stored as `String(f.land)`, saved via `Number()`) |
| Crop | `editCrop` (`fCrop`) | `setEditCrop` | `fCrop` | `crop` |
| Status | `editStatus` (`fStatus\|\|'New'`) | `setEditStatus` | `fStatus` | `status` (enum) |
| Segment | `editSegment` (`fSegment\|\|'High Value'`) | `setEditSegment` | `fSegment` | `segment` (enum) |

**(B) User** — entity **User** (from `userRows`/`baseUsers` + `s.userEdits[id]`):
| Field | Binding | Handler | Draft key | User field |
|---|---|---|---|---|
| Full Name | `editUserName` (`userName`) | `setEditUserName` | `userName` | `name` |
| Role | `editUserRole` (`userRole`) | `setEditUserRole` | `userRole` | `role` (enum) |
| Territory | `editUserTerritory` (`userTerritory`) | `setEditUserTerritory` | `userTerritory` | `territory` |
| Status | `editUserStatus` (`userStatus\|\|'Active'`) | `setEditUserStatus` | `userStatus` | `status` (Active/Inactive) |

**(C) Store** — entity **Store** (from `storeRows`/`storesWithEdits` + `s.storeEdits[id]`):
| Field | Binding | Handler | Draft key | Store field |
|---|---|---|---|---|
| Store Name | `editStoreName` (`storeName`) | `setEditStoreName` | `storeName` | `name` |
| Address | `editStoreAddress` (`storeAddress`) | `setEditStoreAddress` | `storeAddress` | `address` |
| District | `editStoreDistrict` (`storeDistrict`) | `setEditStoreDistrict` | `storeDistrict` | `district` (enum: Agra/Firozabad/Mainpuri/Etah/Mathura) |
| Agri Officer 1 | `editStoreAO1` (`storeAO1\|\|'2'`) | `setEditStoreAO1` | `storeAO1` | `officers[0]` (option **value=user id**, label=name) |
| Agri Officer 2 | `editStoreAO2` (`storeAO2\|\|'3'`) | `setEditStoreAO2` | `storeAO2` | `officers[1]` |

> ⚠️ **Store opener vs. options mismatch (demo bug to preserve/fix).** The opener seeds `storeAO1`/`storeAO2` with officer **names** (`st.officers[0].name`), but the `<select>` option `value`s are officer **ids** ("2","3","4","5"). So on open the selects show the placeholder/first option, not the actual officer. Also `saveEditModal` for stores does **not** persist the AO selections — it writes `officers: st.officers || []` (the original, where `st` is the last-mapped store in the closure, not the edited one). In the port, fix this by keying officer `<option value>` to user id and persisting the selected ids into `officers`.

**(D) KPI** — entity **derived dashboard KPIs** (`s.kpiData`):
| Field | Binding | Handler | Draft key | kpiData field | Default |
|---|---|---|---|---|---|
| Total Visits | `editKpiVisits` (`kpiVisits`) | `setEditKpiVisits` | `kpiVisits` | `visits` | `'1,024'` |
| Farmers Registered | `editKpiFarmers` (`kpiFarmers`) | `setEditKpiFarmers` | `kpiFarmers` | `farmers` | `'22,210'` |
| Conversion Rate | `editKpiConv` (`kpiConvRate`) | `setEditKpiConv` | `kpiConvRate` | `convRate` | `'38.7%'` |
| Pending Follow-ups | `editKpiFollowups` (`kpiFollowups`) | `setEditKpiFollowups` | `kpiFollowups` | `followups` | `'34'` |
> KPI values are free-text strings (incl. comma formatting and `%`), not numbers.

**sc-for loops:** none inside the modal — the `<option>` lists are hardcoded literals (Lead Status, Segment, Role, Account Status, Store District, Agri Officers). **sc-if conditionals:** outer `showEditModal`, then mutually-exclusive `editIsFarmer` / `editIsUser` / `editIsStore` / `editIsKpi` on `em.type`.

---

## 4. INTERACTIONS

| Trigger | Handler | Effect |
|---|---|---|
| Click backdrop | `closeEditModal` | `setState({ editModal:null, editDraft:{} })` → closes, discards draft |
| Click modal card | `stopProp` | `e.stopPropagation()` so inner clicks don't bubble to backdrop |
| Click ✕ button | `closeEditModal` | same as backdrop dismiss |
| Click **Cancel** | `closeEditModal` | discard & close |
| Edit any input/select | `mSet(key)` | merges `{ [key]: value }` into `editDraft` (controlled inputs) |
| Click **Save Changes** | `saveEditModal` | persist draft into the appropriate edits overlay, then close (`editModal:null, editDraft:{}`) |

**`saveEditModal` branch behavior** (lines 3473–3496):
- **farmer** → writes `farmerEdits[entityId] = {name,mobile,village,district,land:Number(fLand)||0,crop,status,segment}`; **also** patches `selectedFarmer` in place if it is the one being edited (so Farmer 360 reflects edits immediately).
- **user** → writes `userEdits[entityId] = {name,role,territory,status}`.
- **kpi** → replaces `kpiData = {visits,farmers,convRate,followups}` (whole object).
- **store** → writes `storeEdits[entityId] = {name,address,district, officers: st.officers||[]}` (officers NOT updated from form — see bug note above).

All edits are layered overlays merged at read time (`{...base, ...edits[id]}`), so saving updates downstream tables, Farmer 360, dashboard KPI cards, etc. **Openers are NOT in this template slice** — they are invoked from other screens (Users/Stores tables, Farmer detail, Dashboard) and set `editModal` + seed `editDraft`.

---

## 5. ROLE DIFFERENCES · EMPTY STATES · DYNAMIC STYLING

- **Role:** effectively **System Admin only** (all openers are sysadmin surfaces; header brands it "System Admin · Edit"). No alternate render for other roles — they never trigger it. Guard openers behind `isAdmin` in the port.
- **Empty states:** none. The body always renders one of four forms; missing draft values fall back (`''`, `'New'`, `'High Value'`, `'Active'`, AO defaults `'2'`/`'3'`). If `em.type` is somehow none of the four, the body is empty (header + footer only) — not reachable in practice.
- **Dynamic styling (hover/active/focus):**
  - Close button: `style-hover="background:#EEEEEE"` → `hover:bg-neutral-200`.
  - Cancel: `style-hover="border-color:#9E9E9E; color:#424242"` → `hover:border-neutral-400 hover:text-neutral-700`.
  - Save: `style-hover="background:#1B5E20"` → `hover:bg-green-900`.
  - All inputs: `style-focus="border-color:#2E7D32"` → `focus:border-green-700`.
  - No `style-active`. No conditional/computed styling — titles/subtitles/values are plain strings; the only "computed" aspect is which form block shows (the `type` discriminator).

---

## 6. PORT NOTES (Next.js + TS + Tailwind)

**Component split.**
- `<AdminEditModal>` — controlled, presentational shell: backdrop + card + header (icon/eyebrow/title/sub/close) + footer (Cancel/Save). Renders `children` for the body.
- One body component per type, switched on `type`:
  `<FarmerEditForm>`, `<UserEditForm>`, `<StoreEditForm>`, `<KpiEditForm>`.
- A shared `<Field label>{children}</Field>` wrapper (label 11px/600 + control) and shared `<TextInput>` / `<SelectInput>` primitives carrying the field-control + focus classes. Saves duplication across all four forms.

**State / hooks.**
- Hold the modal in a store/context: `editModal: {type, entityId, title, sub} | null` and `editDraft: Record<string,string>`. Mirror the existing global `state` reducer or a Zustand slice.
- `useEditModal()` exposing `open(type, entityId, seedDraft, title, sub)`, `close()`, `save()`, `setField(key, value)`.
- Each opener (in Users table, Stores table, Farmer detail, Dashboard) calls `open(...)` with the correctly seeded draft — keep seeding logic colocated with the opener so the modal stays generic.

**Props for `<AdminEditModal>`:** `{ open: boolean; title: string; sub: string; onClose(): void; onSave(): void; children }`. The discriminated forms take `{ draft, setField }`.

**Data layer.** Map saves to Prisma upserts on the matching entity:
- farmer → `Farmer` (status & segment enums; coerce `land` to number/decimal).
- user → `User` (role & status enums).
- store → `Store` (district enum; **officers as relation by user id** — fix the value/id seeding).
- kpi → there is no KPI table; `kpiData` is presentation-only headline metrics. Either treat as a `SiteSetting`/derived-cache row that admins can override, or compute from data and drop manual edit. Confirm with product; the demo lets admins type arbitrary strings.

**Gotchas to carry over (or deliberately fix):**
1. **Store officer select value/id vs. seeded name mismatch**, and **store save drops officer edits** (uses stale `st` closure). Fix: option `value` = user id; persist selected ids to `officers`.
2. KPI fields are **formatted strings** (commas, `%`) — if backed by numbers, format on display and parse on save.
3. `land` round-trips as string in draft (`String(f.land)` in, `Number(fLand)||0` out). Replicate parse-on-save.
4. Farmer save also mutates `selectedFarmer` so the open Farmer 360 reflects edits — preserve this cross-screen sync (or rely on a shared cache that recomputes overlays).
5. Backdrop click closes; inner click must `stopPropagation`. In React, put `onClick={onClose}` on backdrop and `onClick={e=>e.stopPropagation()}` on the card.
6. Edits are stored as **id-keyed overlays** merged at read time, not destructive writes — in the DB port these become real row updates, but keep the "draft is a separate buffer; Cancel discards" UX.
7. Add `Escape`-to-close and focus-trap/scroll-lock (not in the DSL but expected for a modal); `max-h-[82vh] overflow-y-auto` scroll behavior must be retained.

---

### Summary
The Admin Edit Modal is a **single sysadmin-only polymorphic dialog** (gated by `showEditModal = !!s.editModal`) that edits one of four entity types — **Farmer, User, Store, or KPI** — selected by `editModal.type`, rendering one of four `sc-if` form bodies inside a fixed white 560px card over a dim backdrop. It binds every field to a **separate `editDraft` buffer** (read via `eDraft.*`, written via `mSet(key)`), with header `title`/`sub` preset by whichever opener launched it. **Save** writes the draft into per-entity id-keyed overlays (`farmerEdits`/`userEdits`/`storeEdits`) or replaces `kpiData`, then clears the modal; **Cancel/backdrop/✕** discard. Data dependencies: `farmersWithEdits`+`farmerEdits`, `baseUsers`+`userEdits`, `storesWithEdits`+`storeEdits`, and `kpiData`. Two demo bugs to fix on port: store Agri-Officer selects mismatch option value (id) vs seeded value (name), and store save discards officer edits.
