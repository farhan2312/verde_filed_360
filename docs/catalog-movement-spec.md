# Product Catalog & Stock/Movement — Execution Spec

Source file: `UA Agro_Agros MasterCRMMay 2023 To 31 March 2026.xlsx`
Author: engineering · Status: approved, in build

## 1. Source data (analyzed)

Single sheet, **31 cols × 682,793 rows**. Each row = **one product line on a sales bill** (sales OUT to farmers — not procurement).

| Scope | Value |
|---|---|
| Line items | 682,793 |
| Distinct bills (Order No) | 395,665 |
| Distinct products (Item) | 1,921 |
| Stores (Retailer ID) | 84 (matches system stores) |
| Main categories / sub-categories | 8 / 29 |
| Date range (Added Date) | 2023-05-04 → 2026-03-31 (FY 23-24, 24-25, 25-26) |
| Total qty / revenue | 4.89 M units · ₹66.6 cr |

Columns: Retailer ID · Main/Sub Category · Company · Order No · Total Price (incl GST) · Basic (pre-tax) · Fin Year · **Item** · Qty · UOM · CGST/SGST rate & amt · Discount · Coupon · **Added Date** (DD/MM/YY) · Month · **Batch No** · Customer Name/Address/Phone/Aadhaar/Pin · B2B Flag · GSTIN · Credit Note · Return Qty · Crops (all 0).

Data quality: UOM messy (`KG`/`KGS`, `Bag`/`BAG`, `GRAM`/`Gram`); customer phones ~70% valid / ~30% junk (`NA`, `N0`); `Crops` unusable (derive crop from seed item names instead).

## 2. Locked decisions

1. **Feature #2 = product movement / velocity** (demand & reorder signal; there is no procurement/on-hand data in this file).
2. **Full line-item import** via a streaming importer (825 MB unzipped — SheetJS cannot load it).
3. **Merge & backfill** against existing bill-level `Sale` (dedupe by Order No + Item; backfill older bills missing from `Sale`).
4. **Catalog = auto-built, then admin-editable.**
5. **Drop lines without a valid phone** entirely (so every retained line links to a farmer). Match existing farmers by normalized mobile; create new farmers for valid-phone customers not already present.
6. **Recompute crop-base + segmentation** off the richer line-items (the exact crop base comes from seed purchases).
7. **Two new nav items:** Product Catalog, Stock / Movement.

## 3. Assumptions

- `Total Price` = line total incl GST; unit price = `Total Price ÷ Qty`. `Basic` = pre-tax.
- UOM normalized to a canonical set (`KGS`→`KG`, `Bag`→`BAG`, `Gram`→`GRAM`, `LT`→`LTR`, …).
- One `Product` per distinct `Item` string (1,921); admins merge variants later.
- Net qty = `Qty − Return Qty`; `Credit Note` flagged.
- `Batch No` stored per line; batch-lifecycle view deferred.
- Phone normalization: strip non-digits, drop leading `91`/`0`, take last 10, require first digit 6–9.

## 4. Data model (Prisma)

**New `Product`** (catalog): `rawName` (unique) · `name` (canonical, editable) · `mainCategory` · `subCategory` · `uom` · `taxRate` · `cropTag` · `isSeed` · rollups (`lastPrice`, `avgPrice`, `totalQty`, `totalRevenue`, `lineCount`, `firstSoldAt`, `lastSoldAt`) · `active` · `mergedIntoId` · timestamps. Indexes on mainCategory, subCategory, cropTag.

**New `SaleLine`** (line-items): `orderNo` · `productId`→Product · `itemRaw` · `store` · `storeId`→Store · `farmerId`→Farmer · `saleId`→Sale (nullable) · `qty` · `returnQty` · `uom` · `unitPrice` · `totalPrice` · `basic` · `cgstRate`/`sgstRate`/`cgst`/`sgst` · `discount` · `batchNo` · `soldAt` · `financialYear` · `mainCategory`/`subCategory` · `custName`/`custPhone` · `b2b` · timestamp. Indexes: productId, farmerId, orderNo, soldAt, (storeId, soldAt), (productId, soldAt).

**Existing `Sale`** (bill-level): unchanged shape; backfill one row per older Order No (aggregated from its lines); add `lines SaleLine[]` back-relation. `Farmer` gets `saleLines SaleLine[]`.

## 5. Import pipeline (streaming, idempotent)

Reuses the `scripts/_agg-crm.ts` streaming skeleton (unzip → sharedStrings in memory → stream `sheet1.xml`).

- **Pass 1 (discover):** collect distinct Products (+ category/uom/tax/crop/rollups), distinct Farmers (by normalized phone → name/addr/aadhaar/store), retained/dropped counts. Drop lines with no valid phone.
- **Load & resolve:** existing Farmers (id, normalized mobile) and Stores (id, normalized name) into maps. Insert new Products (`createMany` on unique `rawName`) and new Farmers (chunked; code `C<phone>`, source REAL). Build rawName→productId, phone→farmerId, storeName→storeId maps.
- **Pass 2 (insert lines):** stream again, build `SaleLine` rows, `createMany` in 5k chunks (buffer to bound memory).
- **Backfill `Sale`:** one raw `INSERT … SELECT … GROUP BY orderNo` for Order Nos not already in `Sale` (farmerId, min date, sum(totalPrice), itemCount, dominant category, item summary). Then `UPDATE SaleLine.saleId` by orderNo.
- **Log** a `SalesImport` row. Idempotency: clear prior master-sourced `SaleLine` before re-insert.

## 6. Recompute (Phase C)

- Product rollups from `SaleLine` (qty, revenue, lineCount, first/last sold, last/avg price).
- Farmer **crop base**: `cropTags` from distinct seed-item crops per farmer (wheat, paddy, mustard, maize, potato, …).
- Re-run `scripts/compute-segments.ts` (spend/recency/segment) now that the older history is backfilled into `Sale`.

## 7. Features

**Product Catalog** (`/products`, view: managers+admin, edit: admin): searchable/filterable list (category / sub / crop / UOM), unit price (latest + range), total qty & revenue, first/last sold, active toggle; edit canonical name/category/UOM/price/crop; merge duplicate variants.

**Stock / Movement** (`/movement`): product velocity (units/month trend, by store), fast vs slow movers, days-since-last-sale / dead-stock signal, store × product matrix. Framed as demand/reorder signal.

## 8. Phases

A. Schema (Product, SaleLine, relations) → push.
B. Streaming importer + normalizers (phone/UOM/date/crop); dry-run slice → full import; SalesImport log.
C. Recompute rollups + crop base + segmentation.
D. Product Catalog page + actions + nav.
E. Stock / Movement page + actions + nav.
F. Adversarial review (importer + linkage + normalization) → fix → verify.
