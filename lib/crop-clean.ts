/**
 * Crop derivation from a SEEDS product name. Shared by the importer and the
 * crop-base recompute so both stay in sync.
 *
 * Rule order matters: multi-word pulse spellings ("GREEN GRAM"→moong,
 * "BLACK GRAM"→urad) MUST be tested before the bare-word chickpea rule
 * ("\bGRAM\b"→gram), otherwise "GREEN/BLACK GRAM" would mis-tag as chickpea.
 */
export const CROP_RULES: [RegExp, string][] = [
  [/PADDY|BASMATI|ARIZE|\bDHAN\b|\bRICE\b|\bSAVA\b/, "paddy"],
  [/WHEAT|GEHU|KANAK/, "wheat"],
  [/MUSTARD|SARSON|TORIA|\bRAYA\b/, "mustard"],
  [/MAIZE|\bCORN\b|MAKKA|DEKALB/, "maize"],
  [/POTATO|\bALOO\b|\bALU\b/, "potato"],
  [/SUGARCANE|GANNA/, "sugarcane"],
  [/\bPEAS?\b|MATAR/, "pea"],
  [/MASOOR|LENTIL/, "lentil"],
  [/MOONG|GREEN GRAM/, "moong"],
  [/URAD|\bURD\b|BLACK GRAM/, "urad"],
  [/ARHAR|\bTUR\b|PIGEON/, "arhar"],
  [/CHANA|CHANNA|CHICKPEA|\bGRAM\b/, "gram"], // chickpea — keep AFTER green/black gram
  [/SOYA/, "soybean"],
  [/GROUNDNUT|MOONGFALI|PEANUT/, "groundnut"],
  [/BAJRA|PEARL MILLET/, "bajra"],
  [/JOWAR|SORGHUM/, "jowar"],
  [/BARLEY|\bJAU\b/, "barley"],
  [/BERSEEM|BARSEEM/, "berseem"],
  [/ONION|PYAJ|PIYAJ/, "onion"],
  [/TOMATO|TAMATAR/, "tomato"],
  [/GARLIC|LEHSUN/, "garlic"],
  [/CHILL?I|MIRCH/, "chilli"],
  [/OKRA|BHINDI/, "okra"],
  [/CABBAGE|CAULIFLOWER|GOBHI/, "cole"],
  [/CUCUMBER|KHEERA/, "cucumber"],
  [/LAUKI|GOURD|KARELA/, "gourd"],
  [/MELON/, "melon"],
];

export function cropFromItem(item: string): string | null {
  const s = item.toUpperCase();
  for (const [re, c] of CROP_RULES) if (re.test(s)) return c;
  return null;
}

/**
 * Clean/canonicalize a free-text crop value from the Crops column (monthly sales
 * upload) or a field-visit crop entry. Returns a canonical crop name or null for
 * non-crop junk (equipment, storage, livestock, "field clean", etc.). Data is very
 * dirty — variant spellings + Hindi/English mix + non-crop entries.
 */
const CROP_JUNK = /GODOWN|GODAUN|WITHOUT CROP|NO CROP|FIELD CLEAN|CLEAR FIELD|^FIELD$|HOME USE|^HOUSE$|FARM HOUSE|HERBICIDE|INSECTI(?:C|S)IDE|^WEED$|KHARPATWAR|RAT ?KIL|KILL ?RAT|RODENT|KHATMAL|^TOOLS?$|HARDWARE|EMPLIMANT|SPRAYER|^LED$|KITCHEN|^AGRICULTURE$|^OTHER$|ALL CROPS|NURSERY|CARRI? BAG|GAJA KATILA|GILOR|GILOD|SUNDHIYU|PEEROSARAINYA|^BEEJ$|^SEEDS?$|^COW$|BUFFALO|BAFFALO|^FISH$|CATTLE/;
const CROP_CLEAN_RULES: [RegExp, string][] = [
  [/PADDY|BASMATI|\bDHAN\b|\bRICE\b/, "paddy"],
  [/SUGARCANE|GANNA/, "sugarcane"],
  [/MUSTARD|MUSTER|MUSTURD|MUSTRD|SARSON|TORIA|\bRAYA\b/, "mustard"],
  [/MENTHA|PIPPERMENT|PIPERMENT|PEPPERMINT|\bMINT\b/, "mentha"],
  [/WHEAT|GEHU|KANAK/, "wheat"], // "wheat storage" -> wheat (godown handled by JUNK)
  [/POTATO|PATATO|\bALOO\b/, "potato"],
  [/MAIJE|MAIZE|MAKKA|\bCORN\b|DEKALB/, "maize"],
  [/BANANA|KELA/, "banana"],
  [/TAMATO|TOMATO|TAMATAR/, "tomato"],
  [/MUSK ?MELON/, "muskmelon"],
  [/WATER ?MELON|TARBOOJ/, "watermelon"],
  [/BERSEEM|BARSEEM/, "berseem"],
  [/GROUNDNUT|GRAUNDNET|MUNGPHALI|MOONGFALI|PEANUT/, "groundnut"],
  [/CUCUMBER|KHEERA|KAKDI/, "cucumber"],
  [/COLOCAS|CALOCAS|\bARVI\b|\bARBI\b|TARO/, "arvi"],
  [/BRINJAL|BAINGAN|EGGPLANT/, "brinjal"],
  [/ONION|PYAJ|PIYAJ/, "onion"],
  [/GARLIC|LAHSUN|LEHSUN/, "garlic"],
  [/MOONG|GREEN GRAM/, "moong"],
  [/URAD|BLACK GRAM|\bURD\b/, "urad"],
  [/ARHAR|\bTUR\b|\bTUAR\b|PIGEON/, "arhar"],
  [/\bGRAM\b|CHANA|CHANNA|CHICKPEA/, "gram"],
  [/BAJRA|BAJARA|PEARL/, "bajra"],
  [/JOWAR|SORGHUM|\bCHARI\b/, "sorghum"],
  [/BARLEY|\bJAU\b/, "barley"],
  [/\bOATS?\b/, "oats"],
  [/OKRA|BHINDI|LADY ?FINGER/, "okra"],
  [/CORIANDER|DHANIYA/, "coriander"],
  [/CAPSICUM|SHIMLA|SHIMA MIRCH/, "capsicum"],
  [/CHILL?I|MIRCH/, "chilli"],
  [/CAULIFLOWER|CAULIFLAWER/, "cauliflower"],
  [/CABBAGE|PATTA GOBHI/, "cabbage"],
  [/RADISH|MOOLI/, "radish"],
  [/PUMPKIN|KADDU/, "pumpkin"],
  [/PARWAL|POINTED GOURD/, "pointed_gourd"],
  [/BOTTELE|BOTTLE ?GAURD|BOTTLE ?GOURD|LAUKI/, "bottle_gourd"],
  [/KARELA|KARAILA|BITTER ?GOURD/, "bitter_gourd"],
  [/SPONGE ?GOURD|SONGE ?GOURD|TOREE|TORI/, "sponge_gourd"],
  [/\bGOURD\b/, "gourd"],
  [/\bYAM\b|SURAN|JIMIKAND/, "yam"],
  [/WATER ?NUT|WAT+ER ?CHESTNUT|SINGHARA/, "water_chestnut"],
  [/MUSHROOM|MASROOM/, "mushroom"],
  [/DRAGON|DRAGAN/, "dragon_fruit"],
  [/\bAPPLE\b/, "apple"],
  [/PAPAYA|PAPITA/, "papaya"],
  [/JACKFRUIT|KATHAL/, "jackfruit"],
  [/GUAVA|GUAVAVA|AMROOD/, "guava"],
  [/LICHI|LITCHI/, "litchi"],
  [/BLACK PLUM|JAMUN/, "jamun"],
  [/GRAPES|ANGOOR/, "grapes"],
  [/CARROT|GAJAR/, "carrot"],
  [/POMEGRANATE|\bANAR\b/, "pomegranate"],
  [/LEMON|LEMAN|NEEBOO|\bNIBOO\b|NIMBU|CITRUS/, "citrus"],
  [/SOYA|SOYBEAN/, "soybean"],
  [/SUNFLOWER|SURAJMUKHI/, "sunflower"],
  [/TOBACCO|TAMBAKU/, "tobacco"],
  [/BETEL|\bPAAN\b/, "betel"],
  [/GINGER|ADRAK/, "ginger"],
  [/FENNEL|SAUNF/, "fennel"],
  [/\bTILLI\b|\bTIL\b|\bTAL\b|SESAME/, "sesame"],
  [/POSTA|KHAS ?-? ?KHAS|KHASKHAS|POPPY/, "poppy"],
  [/BEANS?|CHOLI|COWPEA|LOBIA|\bGUAR\b|GAUR BEAN/, "beans"],
  [/\bPEAS?\b|MATAR/, "pea"],
  [/MARIGOLD|MERIGOLD|GENDA/, "marigold"],
  [/\bROSE\b|GUDHAL|HIBISCUS|\bFLOWER\b|\bPHOOL\b/, "flower"],
  [/KAHU|LETTUCE/, "lettuce"],
  [/SAPHEDA|EUCALYPTUS/, "eucalyptus"],
  [/\bMELON\b/, "melon"],
  [/VEGETABLE|SABJI|SABZI/, "vegetable"],
  [/FODDER|\bCHARA\b|\bGRASS\b|GRAZE|\bGROSS\b/, "fodder"],
  [/MANGO|MANG0|\bAAM\b/, "mango"],
];
export function cleanCrop(raw?: string | null): string | null {
  if (!raw) return null;
  const s = raw.toUpperCase().replace(/[{}[\]()].*$/g, "").replace(/\s+/g, " ").trim();
  if (!s || s === "0") return null;
  if (CROP_JUNK.test(s)) return null;
  for (const [re, c] of CROP_CLEAN_RULES) if (re.test(s)) return c;
  return null; // unknown → drop
}

/**
 * Canonicalize a Pest/Disease/Weed value from the visit form (or a future sales pest column) into
 * a lowercase tag key (tagLabel() re-titles it). Unwraps an "Other: <text>" chip, strips
 * parentheticals, and drops empty/"other"/"none" placeholders. Kept permissive (no fixed catalogue)
 * so the visit dropdown can grow without a rules table — segregated from crop cleaning on purpose.
 */
export function cleanPest(raw?: string | null): string | null {
  if (!raw) return null;
  let s = raw.trim();
  const other = s.match(/^other\s*:\s*(.+)$/i);
  if (other) s = other[1];
  s = s.toLowerCase().replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  if (!s || s === "other" || s === "none") return null;
  return s;
}
