function calculateRecipeCosts({
  items,
  batchYield,
  batchMinutes,
  hourlyLaborRate,
}) {
  const materialCost = items.reduce((sum, item) => {
    const quantity = Number(item.quantity || 0);
    const unitCost = Number(item.unit_cost || 0);
    return sum + quantity * unitCost;
  }, 0);

  const laborCost = batchMinutes > 0 && hourlyLaborRate > 0 ? (batchMinutes / 60) * hourlyLaborRate : 0;
  const totalBatchCost = materialCost + laborCost;
  const costPerUnit = batchYield > 0 ? totalBatchCost / batchYield : 0;

  return {
    materialCost,
    laborCost,
    totalBatchCost,
    costPerUnit,
  };
}

function calculatePricingGuidance({
  costPerUnit,
  markup,
  targetMargin,
  salesQuantity,
  sellingFees,
}) {
  const costPrice = costPerUnit * (salesQuantity || 1);
  const markupPrice = costPrice * (1 + (markup || 0) / 100);
  const marginPrice = costPrice / (1 - (targetMargin || 0) / 100);
  const suggestedPrice = Number.isFinite(markupPrice) ? markupPrice : 0;
  const grossProfit = suggestedPrice - costPrice - (sellingFees || 0);
  const grossMargin = suggestedPrice > 0 ? ((suggestedPrice - costPrice) / suggestedPrice) * 100 : 0;

  return {
    costPrice,
    markupPrice,
    marginPrice,
    suggestedPrice,
    grossProfit,
    grossMargin,
  };
}

function getDefaultRecipeName(productName, providedName) {
  return providedName && providedName.trim() ? providedName.trim() : (productName && productName.trim()) || 'Recipe';
}

module.exports = {
  calculateRecipeCosts,
  calculatePricingGuidance,
  getDefaultRecipeName,
};
