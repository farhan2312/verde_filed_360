# Coupon-code campaign attribution — plan

Status: **proposal** (data capture is live; nothing below the "What's already done" line is built yet).

## Why

Today the Campaign Tracker calls a promoted farmer a success if they are a **contacted TEST member**
who made **any matched purchase** (same crop / category) in `[campaign start, end + 30 days]`
(`app/actions/campaigns.ts` → `matchedLineWhere`). That is correlation: a paddy farmer buying paddy
inputs in season would have bought anyway. A coupon that only exists because of the campaign turns
that into evidence.

## What's already done (15 Sep 2026)

The ERP now sends two coupon fields per line and we store both, normalised (`"0"` / blank → null,
upper-cased):

| ERP field | Stored on | Meaning |
|---|---|---|
| `invoice_coupon_code` | `Sale.couponCode`, `SaleLine.invoiceCouponCode` | code applied to the whole bill |
| `item_coupon_code` | `SaleLine.couponCode` | code applied to that line only |

Both are indexed. `ItemDiscountAmount + InvoiceDiscountAmount` already lands in `SaleLine.discount`,
so the *cost* of a coupon is known too. No coupons have been redeemed yet in the feed (all `"0"`).

## Design

### 1. Codes belong to campaigns — `CampaignCoupon`

```
CampaignCoupon
  id, campaignId → Campaign
  code            String @unique      // as typed at the till, upper-cased: VRD-PADDY-R1
  label           String?             // "Round 1 WhatsApp", "Anand stores"
  channel         String?             // WHATSAPP | SMS | CALL | IN_PERSON — which message carried it
  segment         String?             // campaign segment it was sent to (null = all)
  round           Int?                // campaign round / phase
  discountType    String?             // PCT | FLAT | FREEBIE   (for ROI display)
  discountValue   Float?
  validFrom / validTo  DateTime?
  maxRedemptions  Int?
  active          Boolean
```

One campaign can own many codes. Splitting codes by **channel × segment × round** is what gives
"which message actually worked" — the granularity you can't get from spend-in-window.

Per-farmer unique codes (`VRD-PADDY-R1-7K3Q`) are the strongest form (no sharing, exact person).
They only work if the ERP accepts arbitrary codes at billing — see *Questions for ERP* below. The
schema supports both: a unique code is just a `CampaignCoupon` row with `farmerId` set.

### 2. Issuance — record who got which code

- `CampaignMember.couponCode` (+ `couponIssuedAt`): stamped when the code is inserted into a message
  for that farmer. The WhatsApp/SMS templates already have an "offer code" slot (`{{3}}` in the
  presets); the broadcast and 1:1 send paths fill it from the campaign's code for that channel/segment.
- Officers doing in-person / call outreach pick the code from a dropdown on the reach form.

### 3. Redemption matching — runs at the end of every sales sync

For each bill in the synced window with a code (invoice-level, or any line-level code):

1. Look the code up in `CampaignCoupon` (case-insensitive). Unknown code → `CouponRedemption` with
   `campaignId = null` (surfaced as "unrecognised codes" for admin — typo at the till, or a code we
   never registered).
2. Find `CampaignMember` for `(campaignId, farmerId)`.
   - Member exists → write `CouponRedemption { memberId, saleId, code, amount, discount, redeemedAt }`
     and stamp `CampaignMember.redeemedAt / redeemedSaleId / redeemedAmount` (first redemption; later
     ones add to revenue but don't re-convert).
   - No member (code shared with a neighbour, or the farmer was in CONTROL) → redemption row with
     `memberId = null`, flagged `offTarget` (still real revenue, and a CONTROL redemption is a
     contamination signal worth showing).
3. Amounts: invoice code → whole bill (`Sale.amountNum`); item code → that line (`SaleLine.basic`).
   Both on one bill → count the bill once at bill level.
4. Also set the phase flags the campaign engine already uses (`booked` / `boughtFertiliser` /
   `boughtCombo`, source `SALES`) when the code's campaign is phased — a redemption is the most
   reliable "purchased" signal we have.

Idempotent like the rest of the sync: redemptions are keyed by `saleId` and rebuilt when a bill is
re-imported; rolling back a run removes its redemptions.

### 4. What the Campaign Tracker shows

Three attribution tiers, side by side, so the old number doesn't disappear — it gets qualified:

| Tier | Definition | Reads as |
|---|---|---|
| **A · Coupon-verified** | contacted member redeemed one of the campaign's codes | caused by the campaign |
| **B · Matched purchase** (today's logic) | contacted member bought matching crop/category in window, no code | probably influenced |
| **C · Control baseline** | CONTROL members' matching purchases | what happens anyway |

Metrics: redemption rate (A ÷ reached), revenue via coupon, discount cost and ROI
(revenue − discount), redemptions by channel / segment / store / round (from the code split),
median days from send to redemption, off-target and control redemptions, unrecognised codes.

The reach list gets a "Redeemed ✓" chip per farmer with the bill and date.

### 5. Sales Sync page

A small "Coupons" strip: codes seen in the last run, redemptions matched, unrecognised codes
(with a one-click "register to campaign…").

## Rollout

1. Schema (`CampaignCoupon`, `CouponRedemption`, member stamps) + code registry UI on the campaign
   page (create codes, set channel/segment/round/discount/validity).
2. Redemption matcher hooked into `runSalesSync` (+ backfill command for historical bills once codes
   exist).
3. Tracker tiers + coupon metrics; reach list chip.
4. Template / broadcast integration: fill the offer-code slot from the registry and stamp the member.
5. (If ERP supports it) per-farmer unique codes.

Steps 1–3 don't depend on the ERP; 4 is app-only; 5 needs the ERP answer.

## Questions for the ERP team

- Does the till **validate** coupon codes against a master list, or accept free text? If validated,
  we need either (a) an API to register codes we generate, or (b) a shared naming convention and a
  list we send them before each campaign.
- Can a code be **unique per farmer** (thousands of codes per campaign), or only a handful per campaign?
- Is the discount amount tied to the code in the ERP (so we can trust `ItemDiscountAmount` /
  `InvoiceDiscountAmount` as the coupon cost), or entered manually?
- When both an invoice code and item codes are on one bill, what does the ERP do — is that even possible?

## Open decisions for us

- Code format: propose `VRD-<CROP>-<ROUND><CHANNEL>` e.g. `VRD-PADDY-1W` (short enough to read out on a
  call, unambiguous at the till: no O/0, I/1).
- Attribution window for a code: the code's own `validTo`, not the campaign's +30 days.
- Whether CONTROL members who redeem a leaked code should be moved out of the control group for uplift
  maths (recommend: yes, excluded — otherwise uplift is understated).
