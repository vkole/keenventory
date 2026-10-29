import { decimal, money, pricing } from './production';
export type RecipeIngredientInput = {
  item_name: string;
  quantity: number;
  unit: string;
  item_type?: string;
  unit_cost?: number;
};
export function calculateRecipeCosts({
  items,
  batchYield,
  batchMinutes,
  hourlyLaborRate,
  laborMode = 'fixed',
  laborReferenceYield = 1,
  overhead = 0,
}: {
  items: RecipeIngredientInput[];
  batchYield: number;
  batchMinutes: number;
  hourlyLaborRate: number;
  laborMode?: string;
  laborReferenceYield?: number;
  overhead?: number;
}) {
  const material = items.reduce(
    (sum, item) =>
      sum.plus(
        decimal(item.quantity)
          .times(item.unit_cost ?? 0)
          .times(batchYield),
      ),
    decimal(0),
  );
  const minutes = decimal(batchMinutes).times(
    laborMode === 'per_unit'
      ? batchYield
      : laborMode === 'scaled'
        ? decimal(batchYield).div(laborReferenceYield || 1)
        : 1,
  );
  const labor = minutes.div(60).times(hourlyLaborRate);
  const total = material.plus(labor).plus(overhead);
  return {
    materialCost: money(material),
    laborCost: money(labor),
    totalBatchCost: money(total),
    costPerUnit: batchYield > 0 ? money(total.div(batchYield)) : 0,
  };
}
export function calculatePricingGuidance({
  costPerUnit,
  markup,
  targetMargin,
  salesQuantity,
  sellingFees,
}: {
  costPerUnit: number;
  markup: number;
  targetMargin: number;
  salesQuantity: number;
  sellingFees: number;
}) {
  const costPrice = money(decimal(costPerUnit).times(salesQuantity || 1));
  const result = pricing(costPrice, 0, markup, targetMargin, 'markup');
  return {
    costPrice,
    markupPrice: result.markupPrice,
    marginPrice: result.marginPrice ?? 0,
    suggestedPrice: result.suggested ?? 0,
    grossProfit: money(decimal(result.estimatedProfit ?? 0).minus(sellingFees)),
    grossMargin: result.estimatedMargin,
  };
}
export function getDefaultRecipeName(
  productName: string,
  providedName?: string,
) {
  return providedName?.trim() || productName.trim() || 'Recipe';
}
