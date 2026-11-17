// Automatic nutrition lookup from USDA FoodData Central (Foundation + SR Legacy).
// The API key stays on the server. Results are CANDIDATES: the admin picks one,
// so raw / cooked / roasted variants are never chosen blindly.

export type FoodBasis = 'raw' | 'cooked' | 'as_sold';
export type FoodCategory = 'protein' | 'carb' | 'fat' | 'veg' | 'juice';
export type AllergenKey = 'gluten' | 'eggs' | 'fish' | 'milk' | 'nuts';

export interface FoodCandidate {
  fdcId: number;
  description: string;
  dataType: string;
  usdaCategory: string;
  basis: FoodBasis;
  category: FoodCategory | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  allergens: AllergenKey[];
  source: string;
  sourceRecordId: string;
}

export interface LookupResult {
  searchTerm: string | null;
  needsEnglish: boolean;
  candidates: FoodCandidate[];
}

export class FoodLookupError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'FoodLookupError';
    this.status = status;
  }
}

const FDC_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 200;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_CANDIDATES = 6;

/* ---------- Arabic -> English search term ---------- */

export function normalizeArabic(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripArticle(token: string): string {
  return token.length > 3 && token.startsWith('ال') ? token.slice(2) : token;
}

const RAW_DICTIONARY: Record<string, string> = {
  // nuts & seeds
  'لوز': 'almonds',
  'جوز': 'walnuts',
  'فستق': 'pistachio nuts',
  'كاجو': 'cashew nuts',
  'بندق': 'hazelnuts',
  'فول سوداني': 'peanuts',
  'زبدة الفول السوداني': 'peanut butter',
  'بذور الشيا': 'chia seeds',
  'بذور الكتان': 'flaxseed',
  'سمسم': 'sesame seeds',
  'طحينة': 'tahini',
  // protein
  'صدر دجاج': 'chicken breast',
  'دجاج': 'chicken',
  'ديك رومي': 'turkey',
  'لحم بقري': 'beef',
  'لحم بقر': 'beef',
  'لحم غنم': 'lamb',
  'لحم ضأن': 'lamb',
  'بيض': 'egg whole',
  'بيضة': 'egg whole',
  'سلمون': 'salmon',
  'تونة': 'tuna',
  'سردين': 'sardines',
  'سمك': 'fish',
  'جمبري': 'shrimp',
  'حليب': 'milk',
  'لبن': 'yogurt plain',
  'زبادي': 'yogurt plain',
  'جبن قريش': 'cottage cheese',
  'جبن': 'cheese',
  'جبنه': 'cheese',
  // carbs
  'ارز': 'rice white',
  'ارز بسمتي': 'rice white',
  'ارز بني': 'rice brown',
  'معكرونه': 'pasta',
  'سباغيتي': 'spaghetti',
  'كسكس': 'couscous',
  'سميد': 'semolina',
  'برغل': 'bulgur',
  'شوفان': 'oats',
  'خبز': 'bread',
  'خبز كامل': 'bread whole wheat',
  'بطاطا': 'potato',
  'بطاطس': 'potato',
  'بطاطا حلوه': 'sweet potato',
  'ذره': 'corn',
  'كينوا': 'quinoa',
  // legumes
  'عدس': 'lentils',
  'حمص': 'chickpeas',
  'فول': 'fava beans',
  'فاصوليا': 'beans',
  'لوبيا خضراء': 'green beans',
  'بازلاء': 'peas',
  // fats
  'زيت زيتون': 'olive oil',
  'زبده': 'butter',
  'افوكادو': 'avocado',
  // vegetables
  'بروكلي': 'broccoli',
  'سبانخ': 'spinach',
  'جزر': 'carrots',
  'طماطم': 'tomatoes',
  'خيار': 'cucumber',
  'خس': 'lettuce',
  'سلطه خضراء': 'lettuce',
  'بصل': 'onions',
  'فلفل': 'peppers sweet',
  'كوسه': 'zucchini',
  'باذنجان': 'eggplant',
  'قرنبيط': 'cauliflower',
  'ملفوف': 'cabbage',
  // fruit & juice
  'موز': 'bananas',
  'تفاح': 'apples',
  'برتقال': 'oranges',
  'عنب': 'grapes',
  'تمر': 'dates',
  'تمر دقله نور': 'dates deglet noor',
  'فراوله': 'strawberries',
  'رمان': 'pomegranate',
  'ليمون': 'lemon',
  'بطيخ': 'watermelon',
  'خوخ': 'peaches',
  'مشمش': 'apricots',
  'تين': 'figs',
  'عصير برتقال': 'orange juice',
  'عصير تفاح': 'apple juice',
  'عصير رمان': 'pomegranate juice',
  'عصير جزر': 'carrot juice',
  // misc
  'عسل': 'honey',
  'سكر': 'sugar',
};

const DICTIONARY: Map<string, string> = new Map(
  Object.entries(RAW_DICTIONARY).map(([ar, en]) => [normalizeArabic(ar), en])
);
const MAX_PHRASE_TOKENS = Math.max(
  ...Array.from(DICTIONARY.keys()).map((k) => k.split(' ').length)
);

const MODIFIERS: Record<string, string> = {
  'نيء': 'raw',
  'نيئ': 'raw',
  'ني': 'raw',
  'مطبوخ': 'cooked',
  'مسلوق': 'boiled',
  'مشوي': 'roasted',
  'مقلي': 'fried',
  'بالبخار': 'steamed',
  'مخبوز': 'baked',
};
const MODIFIER_MAP: Map<string, string> = new Map(
  Object.entries(MODIFIERS).map(([ar, en]) => [normalizeArabic(ar), en])
);

const ARABIC_RE = /[\u0600-\u06FF]/;

export function buildSearchTerm(query: string): { term: string | null; needsEnglish: boolean } {
  const cleaned = query.trim().replace(/\s+/g, ' ');
  if (!cleaned) return { term: null, needsEnglish: false };
  if (!ARABIC_RE.test(cleaned)) return { term: cleaned.toLowerCase(), needsEnglish: false };

  const tokens = normalizeArabic(cleaned).split(' ').map(stripArticle);
  let bestStart = -1;
  let bestLen = 0;
  for (let start = 0; start < tokens.length; start++) {
    for (let len = Math.min(MAX_PHRASE_TOKENS, tokens.length - start); len >= 1; len--) {
      const phrase = tokens.slice(start, start + len).join(' ');
      if (DICTIONARY.has(phrase)) {
        if (len > bestLen) {
          bestLen = len;
          bestStart = start;
        }
        break;
      }
    }
  }
  if (bestStart < 0) return { term: null, needsEnglish: true };

  const base = DICTIONARY.get(tokens.slice(bestStart, bestStart + bestLen).join(' ')) as string;
  const mods: string[] = [];
  tokens.forEach((token, index) => {
    if (index >= bestStart && index < bestStart + bestLen) return;
    const mod = MODIFIER_MAP.get(token);
    if (mod && !mods.includes(mod)) mods.push(mod);
  });
  return { term: [base, ...mods].join(' '), needsEnglish: false };
}

/* ---------- classification helpers ---------- */

export function inferBasis(description: string): FoodBasis {
  const d = description.toLowerCase();
  if (/\b(raw|uncooked)\b/.test(d)) return 'raw';
  if (/\b(cooked|roasted|boiled|baked|grilled|steamed|fried|broiled|stewed|braised|toasted|microwaved|sauteed)\b/.test(d)) {
    return 'cooked';
  }
  return 'as_sold';
}

export function suggestCategory(usdaCategory: string, description: string): FoodCategory | null {
  const c = usdaCategory.toLowerCase();
  const d = description.toLowerCase();
  if (/fats and oils|nut and seed/.test(c)) return 'fat';
  if (/poultry|beef|pork|lamb|veal|game|sausages|lunch meat|finfish|shellfish|dairy and egg|legume/.test(c)) {
    return 'protein';
  }
  if (/cereal|grain|pasta|baked|snacks|sweets/.test(c)) return 'carb';
  if (/vegetable/.test(c)) return /potato|corn|cassava|yam|plantain/.test(d) ? 'carb' : 'veg';
  if (/beverage/.test(c)) return 'juice';
  if (/fruit/.test(c)) return /juice/.test(d) ? 'juice' : 'carb';
  return null;
}

export function suggestAllergens(description: string): AllergenKey[] {
  const d = description.toLowerCase();
  const dairyText = d.replace(/(coconut|almond|soy|oat|rice|cashew) milk/g, '');
  const found: AllergenKey[] = [];
  if (/(wheat|bread|pasta|spaghetti|macaroni|noodle|couscous|semolina|bulgur|barley|\brye\b|\boat|flour|cracker|bagel|pita|tortilla)/.test(d)) {
    found.push('gluten');
  }
  if (/\begg/.test(d)) found.push('eggs');
  if (/(fish|salmon|tuna|sardine|\bcod\b|mackerel|trout|tilapia|anchov|herring|haddock|pollock|halibut|sea bass)/.test(d)) {
    found.push('fish');
  }
  if (/(milk|cheese|yogurt|yoghurt|cream|whey|casein|cottage|kefir|ghee|dairy|(?<!peanut |almond |nut |cocoa |shea )butter\b)/.test(dairyText)) {
    found.push('milk');
  }
  if (/(almond|walnut|hazelnut|cashew|pistachio|pecan|macadamia|brazil nut|pine nut|chestnut)/.test(d)) {
    found.push('nuts');
  }
  return found;
}

/* ---------- USDA response normalization ---------- */

interface UsdaNutrient {
  nutrientNumber?: string | number;
  value?: number;
  unitName?: string;
}
interface UsdaFood {
  fdcId?: number;
  description?: string;
  dataType?: string;
  foodCategory?: unknown;
  foodNutrients?: UsdaNutrient[];
}

function nutrientValue(nutrients: UsdaNutrient[], numbers: string[]): number | null {
  for (const number of numbers) {
    const hit = nutrients.find(
      (n) => String(n.nutrientNumber) === number && typeof n.value === 'number' && Number.isFinite(n.value)
    );
    if (hit && typeof hit.value === 'number') return hit.value;
  }
  return null;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function normalizeFood(raw: UsdaFood): FoodCandidate | null {
  if (typeof raw?.fdcId !== 'number' || typeof raw.description !== 'string' || !Array.isArray(raw.foodNutrients)) {
    return null;
  }
  const nutrients = raw.foodNutrients;
  // 208 = Energy (kcal). 958 / 957 = Atwater energy used by Foundation foods.
  const kcal = nutrientValue(nutrients, ['208', '958', '957']);
  const protein = nutrientValue(nutrients, ['203']);
  const fat = nutrientValue(nutrients, ['204']);
  const carbs = nutrientValue(nutrients, ['205']);
  const fiber = nutrientValue(nutrients, ['291']) ?? 0;
  if (kcal === null || protein === null || fat === null || carbs === null) return null;
  if (kcal < 0 || kcal > 902 || protein < 0 || fat < 0 || carbs < 0 || fiber < 0) return null;

  const dataType = typeof raw.dataType === 'string' ? raw.dataType : 'USDA';
  const usdaCategory = typeof raw.foodCategory === 'string' ? raw.foodCategory : '';
  return {
    fdcId: raw.fdcId,
    description: raw.description,
    dataType,
    usdaCategory,
    basis: inferBasis(raw.description),
    category: suggestCategory(usdaCategory, raw.description),
    kcal: round1(kcal),
    protein: round1(protein),
    carbs: round1(carbs),
    fat: round1(fat),
    fiber: round1(fiber),
    allergens: suggestAllergens(raw.description),
    source: 'USDA FoodData Central (' + dataType + ')',
    sourceRecordId: 'FDC ' + raw.fdcId,
  };
}

/* ---------- lookup with small in-memory cache ---------- */

const cache = new Map<string, { at: number; candidates: FoodCandidate[] }>();

export function clearLookupCache(): void {
  cache.clear();
}

export async function lookupFoods(
  query: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<LookupResult> {
  const { term, needsEnglish } = buildSearchTerm(query);
  if (!term) return { searchTerm: null, needsEnglish, candidates: [] };

  const cached = cache.get(term);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { searchTerm: term, needsEnglish: false, candidates: cached.candidates };
  }

  const url = new URL(FDC_SEARCH_URL);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('query', term);
  url.searchParams.set('dataType', 'Foundation,SR Legacy');
  url.searchParams.set('pageSize', '15');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
  } catch {
    throw new FoodLookupError('تعذر الوصول إلى قاعدة USDA الآن. حاول لاحقاً أو أدخل القيم يدوياً.', 502);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) {
    throw new FoodLookupError('تجاوزت حصة طلبات USDA. انتظر قليلاً أو استخدم مفتاحاً خاصاً بك.', 429);
  }
  if (response.status === 401 || response.status === 403) {
    throw new FoodLookupError('مفتاح USDA_API_KEY غير صالح.', 502);
  }
  if (!response.ok) {
    throw new FoodLookupError('أعادت قاعدة USDA خطأً غير متوقع. أدخل القيم يدوياً مؤقتاً.', 502);
  }

  let payload: { foods?: UsdaFood[] };
  try {
    payload = (await response.json()) as { foods?: UsdaFood[] };
  } catch {
    throw new FoodLookupError('استجابة USDA غير مفهومة.', 502);
  }

  const candidates: FoodCandidate[] = [];
  for (const item of Array.isArray(payload.foods) ? payload.foods : []) {
    const normalized = normalizeFood(item);
    if (normalized) candidates.push(normalized);
    if (candidates.length >= MAX_CANDIDATES) break;
  }

  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(term, { at: Date.now(), candidates });
  return { searchTerm: term, needsEnglish: false, candidates };
}
