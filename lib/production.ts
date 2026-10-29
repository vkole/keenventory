import Decimal from 'decimal.js';

export type Ingredient = {
  material_id?: number;
  item_name: string;
  quantity: number;
  unit: string;
  item_type: string;
  unit_cost?: number;
};
export type Stock = {
  id: number;
  name: string;
  unit: string;
  stock_quantity: number;
  cost_per_unit: number;
  reorder_threshold: number;
  reserved_quantity?: number;
};
export type Formula = {
  batch_yield: number;
  batch_minutes: number;
  hourly_labor_rate: number;
  labor_mode?: string;
  labor_reference_yield?: number;
  overhead?: number;
  ingredients: Ingredient[];
};
export const decimal = (value: Decimal.Value) => new Decimal(value || 0);
export const quantity = (value: Decimal.Value) =>
  decimal(value).toDecimalPlaces(6).toNumber();
export const money = (value: Decimal.Value) =>
  decimal(value).toDecimalPlaces(2).toNumber();

export function planProduction(
  formula: Formula,
  stock: Stock[],
  yieldCount = formula.batch_yield,
) {
  // Aggregate repeated inventory rows before evaluating capacity and shortages.
  const grouped = new Map<
    number,
    { stock: Stock; perUnit: Decimal; item_type: string }
  >();
  const lines = formula.ingredients.map((item) => {
    const material = stock.find((m) =>
      item.material_id ? m.id === item.material_id : m.name === item.item_name,
    );
    const valid = !!material && material.unit === item.unit;
    if (valid) {
      const previous = grouped.get(material.id);
      grouped.set(material.id, {
        stock: material,
        perUnit: (previous?.perUnit ?? decimal(0)).plus(item.quantity),
        item_type: item.item_type,
      });
    }
    const required = decimal(item.quantity).times(yieldCount);
    return {
      ...item,
      material_id: material?.id,
      unit_cost: material?.cost_per_unit ?? 0,
      required: quantity(required),
      total: money(required.times(material?.cost_per_unit ?? 0)),
      valid,
    };
  });
  const availability = [...grouped.values()].map(({ stock: m, perUnit }) => {
    const available = decimal(m.stock_quantity).minus(m.reserved_quantity ?? 0);
    const required = perUnit.times(yieldCount);
    const remaining = available.minus(required);
    return {
      ...m,
      reserved_quantity: m.reserved_quantity ?? 0,
      per_unit: quantity(perUnit),
      required: quantity(required),
      available: quantity(available),
      remaining: quantity(remaining),
      capacity: perUnit.gt(0)
        ? Math.max(0, available.div(perUnit).floor().toNumber())
        : 0,
      shortage: remaining.lt(0),
      low: remaining.lte(m.reorder_threshold),
    };
  });
  const materialCost = lines
    .filter((l) => l.item_type !== 'component')
    .reduce(
      (sum, l) =>
        sum.plus(decimal(l.quantity).times(yieldCount).times(l.unit_cost)),
      decimal(0),
    );
  const componentCost = lines
    .filter((l) => l.item_type === 'component')
    .reduce(
      (sum, l) =>
        sum.plus(decimal(l.quantity).times(yieldCount).times(l.unit_cost)),
      decimal(0),
    );
  const minutes = decimal(formula.batch_minutes).times(
    formula.labor_mode === 'per_unit'
      ? yieldCount
      : formula.labor_mode === 'scaled'
        ? decimal(yieldCount).div(formula.labor_reference_yield || 1)
        : 1,
  );
  const laborCost = minutes.div(60).times(formula.hourly_labor_rate);
  const total = materialCost
    .plus(componentCost)
    .plus(laborCost)
    .plus(formula.overhead ?? 0);
  const capacity =
    lines.some((l) => !l.valid) || !availability.length
      ? 0
      : Math.min(...availability.map((a) => a.capacity));
  return {
    lines,
    availability,
    capacity,
    limiting: availability
      .filter((a) => a.capacity === capacity)
      .map((a) => a.name),
    materialCost: money(materialCost),
    componentCost: money(componentCost),
    laborCost: money(laborCost),
    minutes: quantity(minutes),
    totalBatchCost: money(total),
    costPerUnit: yieldCount > 0 ? money(total.div(yieldCount)) : 0,
    hasShortage:
      lines.some((l) => !l.valid) || availability.some((a) => a.shortage),
  };
}

export function pricing(
  cost: number,
  retail: number,
  markup: number,
  margin: number,
  method: string,
) {
  const markupPrice = decimal(cost).times(decimal(markup).div(100).plus(1));
  const marginPrice =
    margin >= 0 && margin < 100
      ? decimal(cost).div(decimal(1).minus(decimal(margin).div(100)))
      : null;
  const suggested = method === 'margin' ? marginPrice : markupPrice;
  return {
    profit: money(decimal(retail).minus(cost)),
    margin:
      retail > 0
        ? decimal(retail).minus(cost).div(retail).times(100).toNumber()
        : 0,
    markupPrice: money(markupPrice),
    marginPrice: marginPrice === null ? null : money(marginPrice),
    suggested: suggested === null ? null : money(suggested),
    wholesale: money(decimal(cost).times(2)),
    estimatedProfit: suggested === null ? null : money(suggested.minus(cost)),
    estimatedMargin: suggested?.gt(0)
      ? suggested.minus(cost).div(suggested).times(100).toNumber()
      : 0,
  };
}
