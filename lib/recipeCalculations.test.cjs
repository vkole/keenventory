const test = require('node:test');
const assert = require('node:assert/strict');

const { calculateRecipeCosts, calculatePricingGuidance, getDefaultRecipeName } = require('./recipeCalculations.ts');

test('calculateRecipeCosts adds material and labor correctly', () => {
  const result = calculateRecipeCosts({
    items: [
      { item_name: 'Wax', quantity: 9, unit: 'oz', unit_cost: 1.05 },
      { item_name: 'Fragrance', quantity: 1, unit: 'oz', unit_cost: 2.8 },
    ],
    batchYield: 12,
    batchMinutes: 45,
    hourlyLaborRate: 8,
  });

  assert.equal(Math.round(result.materialCost * 100) / 100, 147);
  assert.equal(Math.round(result.laborCost * 100) / 100, 6);
  assert.equal(Math.round(result.totalBatchCost * 100) / 100, 153);
  assert.equal(Math.round(result.costPerUnit * 100) / 100, 12.75);
});

test('calculatePricingGuidance distinguishes markup and margin', () => {
  const result = calculatePricingGuidance({
    costPerUnit: 2.65,
    markup: 150,
    targetMargin: 50,
    salesQuantity: 1,
    sellingFees: 0,
  });

  assert.equal(Math.round(result.markupPrice * 100) / 100, 6.63);
  assert.equal(Math.round(result.marginPrice * 100) / 100, 5.3);
  assert.ok(result.grossMargin > 0);
});

test('getDefaultRecipeName falls back to product name when blank', () => {
  assert.equal(getDefaultRecipeName('Blaque Candle', ''), 'Blaque Candle');
  assert.equal(getDefaultRecipeName('Blaque Candle', 'Spring Blend'), 'Spring Blend');
});
