/**
 * Ready-made WhatsApp template starters, in English + Hindi, for the common Verde Agrotech campaign messages.
 * Picking one pre-fills the template builder (body + example values + category + language) so an admin
 * can submit for Meta approval in a couple of clicks. Variables are positional ({{1}},{{2}}…) as Meta
 * requires; the example values below are what Meta reviews the template against.
 */

export type PresetLang = "en" | "hi";

export interface PresetBody {
  body: string;
  examples: string[]; // one per {{n}}, in order
}

export interface WaPreset {
  key: string;
  label: string;              // menu label
  category: "MARKETING" | "UTILITY";
  vars: string[];             // human labels for {{1}},{{2}}… (helps the builder explain each slot)
  en: PresetBody;
  hi: PresetBody;
}

export const WA_PRESETS: WaPreset[] = [
  {
    key: "advance_booking",
    label: "Advance booking offer",
    category: "MARKETING",
    vars: ["Farmer name", "Last booking date", "Coupon code"],
    en: {
      body: "Namaste {{1}}! Book your potato fertiliser at Verde Agrotech before {{2}} and get a special discount. Show code {{3}} at your nearest store.",
      examples: ["Ramesh", "10 Sep", "POT300"],
    },
    hi: {
      body: "नमस्ते {{1}}! Verde Agrotech से {{2}} तक आलू खाद की एडवांस बुकिंग करें और खास छूट पाएं। कोड {{3}} अपने नज़दीकी स्टोर पर दिखाएं।",
      examples: ["रमेश", "10 सितंबर", "POT300"],
    },
  },
  {
    key: "discount_reminder",
    label: "Discount reminder",
    category: "MARKETING",
    vars: ["Farmer name", "Discount amount (₹)", "Coupon code"],
    en: {
      body: "{{1}}, only a few days left! Get ₹{{2}} off on potato fertiliser (minimum purchase applies). Offer code {{3}}. — Verde Agrotech",
      examples: ["Ramesh", "300", "POT300"],
    },
    hi: {
      body: "{{1}}, कुछ ही दिन बाकी हैं! आलू खाद पर ₹{{2}} की छूट पाएं (न्यूनतम खरीद पर)। ऑफर कोड {{3}}। — Verde Agrotech",
      examples: ["रमेश", "300", "POT300"],
    },
  },
  {
    key: "fertiliser_push",
    label: "Fertiliser purchase nudge",
    category: "MARKETING",
    vars: ["Farmer name", "Crop"],
    en: {
      body: "{{1}}, it's the right time to buy fertiliser for your {{2}} crop. Visit your Verde Agrotech store for the best rates and expert advice.",
      examples: ["Ramesh", "potato"],
    },
    hi: {
      body: "{{1}}, आपकी {{2}} फसल के लिए खाद खरीदने का सही समय है। बेहतरीन रेट और सलाह के लिए अपने Verde Agrotech स्टोर पर आएं।",
      examples: ["रमेश", "आलू"],
    },
  },
  {
    key: "combo_offer",
    label: "Combo offer",
    category: "MARKETING",
    vars: ["Farmer name", "Coupon code"],
    en: {
      body: "{{1}}, complete your crop protection with the Verde Agrotech combo pack at a special price. Use code {{2}} at your store today!",
      examples: ["Ramesh", "COMBO50"],
    },
    hi: {
      body: "{{1}}, Verde Agrotech कॉम्बो पैक के साथ अपनी फसल सुरक्षा पूरी करें, खास कीमत पर। आज ही कोड {{2}} अपने स्टोर पर इस्तेमाल करें!",
      examples: ["रमेश", "COMBO50"],
    },
  },
  {
    key: "crop_offer_advance_booking",
    label: "Crop/product offer — with advance booking",
    category: "MARKETING",
    vars: ["Farmer name", "Crop", "Product", "Min spend (₹)", "Discount (₹)", "Offer end date"],
    en: {
      body: "Namaste {{1}} ji, the {{2}} season is here! Pre-book {{3}} — spend over ₹{{4}} and get ₹{{5}} off. Offer valid till {{6}}.",
      examples: ["Ramesh", "potato", "urea", "4500", "300", "10 Sep"],
    },
    hi: {
      body: "नमस्ते {{1}} जी, {{2}} का सीज़न आ गया है! {{3}} की एडवांस बुकिंग करें और ₹{{4}} से अधिक की खरीद पर ₹{{5}} की छूट पाएं। ऑफर {{6}} तक।",
      examples: ["रमेश", "आलू", "यूरिया", "4500", "300", "10 सितंबर"],
    },
  },
  {
    key: "crop_offer_no_booking",
    label: "Crop/product offer — without advance booking",
    category: "MARKETING",
    vars: ["Farmer name", "Crop", "Product", "Min spend (₹)", "Discount (₹)", "Offer end date"],
    en: {
      body: "Namaste {{1}} ji, the {{2}} season is here! Buy {{3}} — spend over ₹{{4}} and get ₹{{5}} off. Offer valid till {{6}}.",
      examples: ["Ramesh", "potato", "urea", "4500", "300", "10 Sep"],
    },
    hi: {
      body: "नमस्ते {{1}} जी, {{2}} का सीज़न आ गया है! {{3}} खरीदें और ₹{{4}} से अधिक की खरीद पर ₹{{5}} की छूट पाएं। ऑफर {{6}} तक।",
      examples: ["रमेश", "आलू", "यूरिया", "4500", "300", "10 सितंबर"],
    },
  },
  {
    key: "meetup_invite",
    label: "Farmer meet (Ghoshti) invite",
    category: "MARKETING",
    vars: ["Farmer name", "Date", "Venue"],
    en: {
      body: "{{1}}, you're invited to a Verde Agrotech farmer meet on {{2}} at {{3}}. Learn the latest crop tips and offers. See you there!",
      examples: ["Ramesh", "12 Sep", "Village panchayat hall"],
    },
    hi: {
      body: "{{1}}, आप Verde Agrotech किसान गोष्ठी में आमंत्रित हैं — {{2}} को {{3}} पर। फसल की नई जानकारी और ऑफर पाएं। ज़रूर आएं!",
      examples: ["रमेश", "12 सितंबर", "गाँव पंचायत भवन"],
    },
  },
  {
    key: "post_purchase",
    label: "Post-purchase follow-up",
    category: "UTILITY",
    vars: ["Farmer name", "Crop"],
    en: {
      body: "Thank you {{1}} for your purchase! For any help with your {{2}} crop, reply here or visit your Verde Agrotech store. Happy farming!",
      examples: ["Ramesh", "potato"],
    },
    hi: {
      body: "धन्यवाद {{1}}, आपकी खरीद के लिए! अपनी {{2}} फसल में किसी भी मदद के लिए यहाँ जवाब दें या Verde Agrotech स्टोर पर आएं। शुभ खेती!",
      examples: ["रमेश", "आलू"],
    },
  },
];

/** Substitute {{1}},{{2}}… in a template body with example/sample values for a live preview. */
export function fillPreview(body: string, examples: string[]): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => examples[Number(n) - 1] || `{{${n}}}`);
}

/** Count distinct {{n}} placeholders in a body. */
export function countVars(body: string): number {
  return new Set((body.match(/\{\{\s*(\d+)\s*\}\}/g) ?? []).map((m) => m.replace(/\D/g, ""))).size;
}

/**
 * Best-guess friendly names for a template's {{1}},{{2}}… slots, using our preset library as prior
 * knowledge. Matches the template by name (ignoring a trailing _en/_hi language suffix) or by exact
 * body text; falls back to generic "Variable N". Returns exactly `countVars(body)` labels. This is what
 * lets existing (already-approved) templates show meaningful names without anyone re-entering them.
 */
export function guessVarLabels(name: string, body: string): string[] {
  const n = countVars(body);
  const key = (name || "").toLowerCase().replace(/_(en(_us|_gb)?|hi)$/i, "");
  const byName = WA_PRESETS.find((p) => p.key === key);
  const byBody = WA_PRESETS.find((p) => p.en.body === body || p.hi.body === body);
  const vars = (byName ?? byBody)?.vars ?? [];
  return Array.from({ length: n }, (_, i) => vars[i] || `Variable ${i + 1}`);
}
