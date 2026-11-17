import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FoodLookupError,
  buildSearchTerm,
  clearLookupCache,
  inferBasis,
  lookupFoods,
  normalizeFood,
  suggestAllergens,
  suggestCategory,
} from '../server/foodLookup.ts';

const almondsRaw = {
  fdcId: 170567,
  description: 'Nuts, almonds',
  dataType: 'SR Legacy',
  foodCategory: 'Nut and Seed Products',
  foodNutrients: [
    { nutrientNumber: '208', unitName: 'KCAL', value: 579 },
    { nutrientNumber: '268', unitName: 'kJ', value: 2423 },
    { nutrientNumber: '203', value: 21.15 },
    { nutrientNumber: '204', value: 49.93 },
    { nutrientNumber: '205', value: 21.55 },
    { nutrientNumber: '291', value: 12.5 },
  ],
};

function mockFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
}

test('Arabic names are translated to an English search term', () => {
  assert.equal(buildSearchTerm('لوز').term, 'almonds');
  assert.equal(buildSearchTerm('اللوز').term, 'almonds');
  assert.equal(buildSearchTerm('صدر دجاج مشوي').term, 'chicken breast roasted');
  assert.equal(buildSearchTerm('أرز مطبوخ').term, 'rice white cooked');
  assert.equal(buildSearchTerm('بطاطا حلوة').term, 'sweet potato');
  assert.equal(buildSearchTerm('عدس نيء').term, 'lentils raw');
});

test('English input passes through and unknown Arabic asks for English', () => {
  assert.equal(buildSearchTerm('  Almonds  ').term, 'almonds');
  const unknown = buildSearchTerm('كلمة غير معروفة');
  assert.equal(unknown.term, null);
  assert.equal(unknown.needsEnglish, true);
});

test('basis is inferred from the USDA description', () => {
  assert.equal(inferBasis('Nuts, almonds, raw'), 'raw');
  assert.equal(inferBasis('Rice, white, long-grain, cooked'), 'cooked');
  assert.equal(inferBasis('Chicken, breast, roasted'), 'cooked');
  assert.equal(inferBasis('Oil, olive, salad or cooking'), 'as_sold');
});

test('allergen suggestions follow the description and ignore plant milks and nut butters', () => {
  assert.deepEqual(suggestAllergens('Nuts, almonds'), ['nuts']);
  assert.deepEqual(suggestAllergens('Pasta, cooked, enriched'), ['gluten']);
  assert.deepEqual(suggestAllergens('Fish, salmon, Atlantic, raw'), ['fish']);
  assert.deepEqual(suggestAllergens('Cheese, cottage, lowfat'), ['milk']);
  assert.deepEqual(suggestAllergens('Peanut butter, smooth style'), []);
  assert.deepEqual(suggestAllergens('Beverages, coconut milk, raw'), []);
  assert.deepEqual(suggestAllergens('Egg, whole, cooked, hard-boiled'), ['eggs']);
});

test('category is suggested from the USDA food group', () => {
  assert.equal(suggestCategory('Nut and Seed Products', 'Nuts, almonds'), 'fat');
  assert.equal(suggestCategory('Poultry Products', 'Chicken, breast'), 'protein');
  assert.equal(suggestCategory('Cereal Grains and Pasta', 'Rice, white'), 'carb');
  assert.equal(suggestCategory('Vegetables and Vegetable Products', 'Broccoli, raw'), 'veg');
  assert.equal(suggestCategory('Vegetables and Vegetable Products', 'Potatoes, boiled'), 'carb');
  assert.equal(suggestCategory('Fruits and Fruit Juices', 'Orange juice, raw'), 'juice');
  assert.equal(suggestCategory('Something Else', 'x'), null);
});

test('USDA food is normalized per 100 g using kcal (not kJ) with traceable source', () => {
  const food = normalizeFood(almondsRaw);
  assert.ok(food);
  assert.equal(food.kcal, 579);
  assert.equal(food.protein, 21.2);
  assert.equal(food.fat, 49.9);
  assert.equal(food.carbs, 21.6);
  assert.equal(food.fiber, 12.5);
  assert.equal(food.sourceRecordId, 'FDC 170567');
  assert.equal(food.source, 'USDA FoodData Central (SR Legacy)');
  assert.deepEqual(food.allergens, ['nuts']);
});

test('Foundation foods without 208 fall back to Atwater energy', () => {
  const food = normalizeFood({
    fdcId: 1,
    description: 'Chicken, breast, raw',
    dataType: 'Foundation',
    foodCategory: 'Poultry Products',
    foodNutrients: [
      { nutrientNumber: '958', value: 112 },
      { nutrientNumber: '203', value: 22.5 },
      { nutrientNumber: '204', value: 2.6 },
      { nutrientNumber: '205', value: 0 },
    ],
  });
  assert.ok(food);
  assert.equal(food.kcal, 112);
  assert.equal(food.basis, 'raw');
  assert.equal(food.fiber, 0);
});

test('incomplete or implausible USDA records are dropped', () => {
  assert.equal(normalizeFood({ fdcId: 2, description: 'x', foodNutrients: [{ nutrientNumber: '208', value: 100 }] }), null);
  assert.equal(
    normalizeFood({
      fdcId: 3,
      description: 'kJ mistaken for kcal',
      foodNutrients: [
        { nutrientNumber: '208', value: 2423 },
        { nutrientNumber: '203', value: 1 },
        { nutrientNumber: '204', value: 1 },
        { nutrientNumber: '205', value: 1 },
      ],
    }),
    null
  );
  assert.equal(normalizeFood({} as never), null);
});

test('lookupFoods returns candidates, caches them, and never calls USDA for unknown Arabic', async () => {
  clearLookupCache();
  let calls = 0;
  const fetchImpl = (async (...args: Parameters<typeof fetch>) => {
    calls += 1;
    const url = String(args[0]);
    assert.ok(url.includes('query=almonds'));
    assert.ok(url.includes('api_key=TESTKEY'));
    return new Response(JSON.stringify({ foods: [almondsRaw, { fdcId: 9 }] }), { status: 200 });
  }) as typeof fetch;

  const first = await lookupFoods('لوز', 'TESTKEY', fetchImpl);
  assert.equal(first.searchTerm, 'almonds');
  assert.equal(first.candidates.length, 1);
  const second = await lookupFoods('Almonds', 'TESTKEY', fetchImpl);
  assert.equal(second.candidates.length, 1);
  assert.equal(calls, 1);

  const unknown = await lookupFoods('كلمة غير معروفة', 'TESTKEY', fetchImpl);
  assert.equal(unknown.needsEnglish, true);
  assert.equal(calls, 1);
});

test('upstream failures become clear Arabic errors', async () => {
  clearLookupCache();
  await assert.rejects(
    () => lookupFoods('almonds', 'K', mockFetch({}, 429)),
    (e: unknown) => e instanceof FoodLookupError && e.status === 429
  );
  await assert.rejects(
    () => lookupFoods('almonds', 'K', mockFetch({}, 403)),
    (e: unknown) => e instanceof FoodLookupError && e.status === 502
  );
  await assert.rejects(
    () => lookupFoods('almonds', 'K', (async () => { throw new Error('network'); }) as typeof fetch),
    (e: unknown) => e instanceof FoodLookupError && e.status === 502
  );
});
