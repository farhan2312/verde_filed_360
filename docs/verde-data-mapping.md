# Verde data mapping — required vs provided

Reviewed 2026-09-13 against the four ERP exports dropped in the repo root:
`retailer_master.csv` (24 rows), `bdm_master.csv` (7), `user_master.csv` (16), `customer_details.csv` (466).

Legend: ✅ provided & usable · ⚠️ provided but needs a decision / cleanup · ❌ not provided

---

## 1. Store  ←  `retailer_master.csv`  (24 rows) — ✅ mostly covered

| App column | Need | Source column | Status | Notes |
|---|---|---|---|---|
| `code` | required | `retailer_code` | ✅ | AGRO0001 … AGRO0125, unique |
| `name` | required | `name` / `full_name` | ✅ | identical; trim trailing spaces |
| `status` | optional | `status` | ✅ | all `1` → "Active" |
| `zone` (district) | recommended — drives every district filter | `zone_id` / `new_zone_id` | ⚠️ | only numeric IDs (`1/13` = 22 stores, `9/9` = 2). No zone-name lookup table. Can be derived from `address`/`pincode` (Anand, Vadodara, Sabarkantha, Narmada…) or you give me the zone names |
| `address` | optional | `address` (+ `pincode`) | ✅ | multi-line; will flatten |
| `empCode` (store manager code) | optional | `contact_name`, `contact_number` | ⚠️ | manager name + mobile present, but no employee code |
| `regionalManager` | optional | `bdm_id` → `bdm_master.name` | ✅ | `bdm_id = 1` on 2 stores (Guest_Verde, MODASA) has no BDM row |
| `lat`, `lng` | needed for Map View | `lat`, `long` | ❌ | empty for all 24 stores |
| `tagIds` | — | — | n/a | admin assigns in-app |

Provided but no app column (ignored): `inv_series`, `lic_no_PESTICIDE/FERTILIZER/SEEDS`, `delivery_center`, `email`, `password`, `menu`, `login_*`, `warehouse_id`, `pending_amount`, `batch_wise_sale`, `temp_closed*`.

Rows to confirm: **AGRO0001 Central Office** (HQ, not a retail store) and **AGRO0125 Guest_Verde** (state 9, pincode 208007 = Kanpur, dc "Gandhinagar" — looks like a test/guest account).

---

## 2. Employee  ←  `bdm_master.csv` (7) + `retailer_master` contacts (24) — ⚠️ partial

| App column | Need | Source | Status | Notes |
|---|---|---|---|---|
| `name` | required | BDM: `name`; Store: `contact_name` | ✅ | |
| `storeCode` | recommended | BDM: `retailer_id` (comma list of store ids); Store contact: own `retailer_code` | ⚠️ | BDMs cover **many** stores (Ashish = 22, others 19). App's `Employee` is one-store; BDMs will be modelled as regional managers with a territory instead |
| `mobile` | recommended | `contact_number` | ✅ | mixed formats (`+91…`, `93693 17551`) — will normalise to 10 digits |
| `email` | optional | BDM `email`; store `email` is a store mailbox | ✅ / ⚠️ | |
| `designation` | optional | — | ⚠️ | BDMs implied "BDM"; store contacts assumed "Store Manager" — confirm |
| `post` | optional | — | ❌ | |
| employee code | needed for login | BDM: `bdm_code` (BDM002…BDM036) | ⚠️ | ✅ for 7 BDMs; ❌ for the 24 store contacts and for `user_master` users |

No **Agri Officer / field-rep (ASR)** list at all — the app's primary users (people who log visits) are not in any file.

---

## 3. User (logins)  ←  `user_master.csv` (16) + BDMs — ⚠️ needs role mapping

| App column | Need | Source | Status | Notes |
|---|---|---|---|---|
| `employeeCode` (login id) | required | BDM `bdm_code` | ⚠️ | only BDMs have one; `user_master` has `username` instead |
| `name` | required | `name` | ✅ | |
| `role` | required | `admin_flag` | ⚠️ | only admin / non-admin. Need: who is REGIONAL, CENTRAL, STORE_MANAGER, ASR |
| `email` | optional | `email` | ⚠️ | 9 of 16 are not real emails (`hemil`, `sanjeev`…) |
| `mobile` | optional | `mobile` | ⚠️ | 11/16 filled; 8 share the same number `9687641497` (placeholder) |
| `passwordHash` | required | `password` | ⚠️ | source has **plaintext passwords** — will NOT be imported; users get default password = mobile + forced reset |

Who is actually Verde? `user_master` mixes ERP-vendor admins (`@hsrp.in`), a UA account (`store@uaagro.in`, `UA_PRICE`), a guest, and 3 clearly-Verde people (Rahul Pal, Ashish Budholiya, Dhiraj Kumar Sharma). Need a yes/no per row.

---

## 4. Farmer  ←  `customer_details.csv` (466) — ❌ **this is UA Agro's data, not Verde's**

| Evidence | Value |
|---|---|
| `company_id` | 465 rows = `3`, 1 row = `2` (Verde) — and that one is `cus_name = "test"` |
| `uniq_no` | all `UAAGRO-…` |
| `retailer_id` | 465 rows point to store ids 15–102 which **do not exist** in Verde's retailer master |
| villages / crops | Mardan Nagar, Budhauliya, Gokula; Sugarcane/Paddy/Wheat/Mustard — Uttar Pradesh, not Gujarat |
| dates | 436 of 466 added Oct 2023 |

If it *were* the right file, the column fit would be:

| App column | Need | Source column | Status | Notes |
|---|---|---|---|---|
| `code` | required | `uniq_no` | ✅ | |
| `name` | required | `cus_name` | ✅ | |
| `mobile` | key for sales matching | `cus_mobile` | ⚠️ | 384/466 valid 10-digit; 356 distinct; rest `N/A`, `NO`, 9/11-digit |
| `village` | recommended | `cus_village` | ✅ | |
| `storeCode` | recommended | `retailer_id` → retailer master | ❌ | join fails (UA store ids) |
| `district` / `zone` | recommended | — (derived from store) | ❌ | |
| `crop` | optional | `crops_grow` | ⚠️ | free text, misspelt (`MUSTURD`, `SUGERCANE`, `PADDAY`), 102 = NA |
| `land` | optional | `total_land` | ⚠️ | free text with mixed units (`6 ACER`, `5`, `1 ACRE`) |
| `lat`, `lng` | optional | — | ❌ | |

Provided but no app column: `father_name`, `date_of_birth`, `education`, `children`, `total_cow`, `total_buffalow`, `insurance`, `loan_req`, **`aadhar_no`** (sensitive — would not be imported regardless).

**Net: Verde has no farmer master in these files.** Options: (a) export `customer_details` from the ERP filtered to `company_id = 2`, if Verde stores have registered customers there; (b) start empty — the app auto-creates farmers from the monthly **sales upload** (`Cus Mobile` / `Cus Name` / `Cus Village` / `Retailer Name`), which is how most UA farmers came in anyway.

---

## 5. Not provided at all — ❌

| Dataset | App table | Impact if missing |
|---|---|---|
| Store GPS (lat/lng per store) | `Store` | Map View has no pins / heatmap |
| Zone / district names | `Store.zone` | District filters show numbers or blanks |
| Field options (17 dropdown lists for the visit form) | `FieldOption` | App falls back to UA's UP-centric defaults (Wheat/Paddy/Mustard, land in Bigha). Gujarat needs Cotton, Groundnut, Castor, Cumin, Tobacco, Banana… and land in Vigha/Acre |
| Product / inventory master (Item Code, category, Target Crops, Target Pests) | `Product` | No crop/pest auto-tagging from purchases; catalog self-builds from sales uploads only |
| Sales history (invoice line-items) | `SaleLine` / `Sale` | No spend, segments (HNI etc.), trends, lead conversion — dashboard stays at 0 until the first monthly upload |
| Agri Officers / field reps with codes + store mapping | `Employee` / `User` | Nobody to log visits; the core workflow |

---

## What I can import right now

1. **24 stores** (code, name, address, pincode, manager name/mobile, BDM as regional manager) — zone left blank or derived from address.
2. **7 BDMs** as `Employee` + `User` (REGIONAL role, login = BDM code, default password = mobile, forced reset).
3. **24 store contacts** as `Employee` (Store Manager) — no login until they get employee codes.

## What I need from you

1. Confirm `customer_details.csv` is UA's — and whether a Verde customer export exists.
2. Zone/district name per store (or OK to derive from address/pincode).
3. Employee-code convention for non-BDM staff (store managers, agri officers, central team) and the list of agri officers with their store.
4. Which `user_master` rows are Verde people, and their role.
5. Store GPS, field-option lists, product master, sales history — as available.
