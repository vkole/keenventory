import { db, ensureDatabase } from '@/lib/db';

export type Material = {
  id: number;
  name: string;
  sku: string;
  category: string;
  unit: string;
  stock_quantity: number;
  cost_per_unit: number;
  reorder_threshold: number;
  location: string;
  updated_at: string;
};

export type Product = {
  id: number;
  name: string;
  sku: string;
  category: string;
  stock_quantity: number;
  cost_per_unit: number;
  retail_price: number;
  location: string;
  updated_at: string;
};

export type Recipe = {
  id: number;
  name: string;
  product_id: number | null;
  version: number;
  batch_yield: number;
  batch_minutes: number;
  hourly_labor_rate: number;
  status: string;
  instructions: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  ingredients: { item_name: string; quantity: number; unit: string; item_type: string }[];
};

export type ManufacturingBatch = {
  id: number;
  product_id: number | null;
  recipe_id: number | null;
  status: string;
  planned_quantity: number;
  completed_quantity: number;
  created_at: string;
  completed_at: string | null;
};

export type Order = {
  id: number;
  customer: string;
  order_date: string;
  status: string;
  total: number;
  channel: string;
};

export type PurchaseOrder = {
  id: number;
  supplier: string;
  status: string;
  order_date: string;
  total_cost: number;
  expected_delivery: string | null;
};

export type Supplier = {
  id: number;
  company_name: string;
  contact_name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  lead_time: string | null;
  payment_terms: string | null;
  notes: string | null;
  created_at: string;
};

export type Adjustment = {
  id: number;
  item_name: string;
  quantity: number;
  reason: string;
  created_at: string;
};

export type Stocktake = {
  id: number;
  location: string;
  inventory_name: string;
  system_quantity: number;
  actual_quantity: number;
  variance: number;
  status: string;
  created_at: string;
};

export type DashboardData = {
  summary: {
    totalInventoryValue: number;
    rawMaterialValue: number;
    finishedGoodsValue: number;
    activeProducts: number;
    materialSkus: number;
    lowStockItems: number;
    outOfStockItems: number;
    pendingBatches: number;
    openPurchaseOrders: number;
    unfulfilledOrders: number;
  };
  materials: Material[];
  products: Product[];
  recipes: Recipe[];
  manufacturingBatches: ManufacturingBatch[];
  salesOrders: Order[];
  purchaseOrders: PurchaseOrder[];
  suppliers: Supplier[];
  adjustments: Adjustment[];
  stocktakes: Stocktake[];
  chartData: {
    sales: { name: string; sales: number; orders: number }[];
    inventory: { month: string; value: number }[];
    materialUsage: { name: string; value: number }[];
    batches: { name: string; value: number }[];
  };
};

function toCurrency(value: number) {
  return Number(value.toFixed(2));
}

export async function getDashboardData(): Promise<DashboardData> {
  ensureDatabase();

  const materials = db.prepare('SELECT * FROM materials ORDER BY name ASC').all() as Material[];
  const products = db.prepare('SELECT * FROM products ORDER BY name ASC').all() as Product[];
  const recipes = db.prepare('SELECT * FROM recipes ORDER BY created_at DESC').all() as Array<{
    id: number;
    name: string;
    product_id: number | null;
    version: number;
    batch_yield: number;
    batch_minutes: number;
    hourly_labor_rate: number;
    status: string;
    instructions: string;
    notes: string | null;
    is_active: number;
    created_at: string;
  }>;

  const recipeItems = db.prepare('SELECT * FROM recipe_items ORDER BY recipe_id, id').all() as Array<{
    recipe_id: number;
    item_name: string;
    quantity: number;
    unit: string;
    item_type: string;
  }>;

  const manufacturingBatches = db.prepare('SELECT * FROM manufacturing_batches ORDER BY created_at DESC').all() as ManufacturingBatch[];
  const salesOrders = db.prepare('SELECT * FROM sales_orders ORDER BY order_date DESC').all() as Order[];
  const purchaseOrders = db.prepare('SELECT * FROM purchase_orders ORDER BY order_date DESC').all() as PurchaseOrder[];
  const suppliers = db.prepare('SELECT * FROM suppliers ORDER BY company_name ASC').all() as Supplier[];
  const adjustments = db.prepare('SELECT * FROM adjustments ORDER BY created_at DESC').all() as Adjustment[];
  const stocktakes = db.prepare('SELECT * FROM stocktakes ORDER BY created_at DESC').all() as Stocktake[];

  const mappedRecipes: Recipe[] = recipes.map((recipe) => ({
    ...recipe,
    is_active: Boolean(recipe.is_active),
    ingredients: recipeItems.filter((row) => row.recipe_id === recipe.id),
  }));

  const rawMaterialValue = materials.reduce((sum, material) => sum + material.stock_quantity * material.cost_per_unit, 0);
  const finishedGoodsValue = products.reduce((sum, product) => sum + product.stock_quantity * product.cost_per_unit, 0);

  const activeProducts = products.length;
  const materialSkus = materials.length;
  const lowStockItems = materials.filter((item) => item.stock_quantity <= item.reorder_threshold).length;
  const outOfStockItems = materials.filter((item) => item.stock_quantity <= 0).length;
  const pendingBatches = manufacturingBatches.filter((batch) => batch.status === 'Draft' || batch.status === 'Scheduled' || batch.status === 'In Progress').length;
  const openPurchaseOrders = purchaseOrders.filter((order) => order.status !== 'Received' && order.status !== 'Cancelled').length;
  const unfulfilledOrders = salesOrders.filter((order) => order.status !== 'Fulfilled' && order.status !== 'Cancelled').length;

  const summary = {
    totalInventoryValue: toCurrency(rawMaterialValue + finishedGoodsValue),
    rawMaterialValue: toCurrency(rawMaterialValue),
    finishedGoodsValue: toCurrency(finishedGoodsValue),
    activeProducts,
    materialSkus,
    lowStockItems,
    outOfStockItems,
    pendingBatches,
    openPurchaseOrders,
    unfulfilledOrders,
  };

  const chartData = {
    sales: [
      { name: 'Apr', sales: 6200, orders: 22 },
      { name: 'May', sales: 7100, orders: 24 },
      { name: 'Jun', sales: 7900, orders: 28 },
      { name: 'Jul', sales: 8600, orders: 31 },
      { name: 'Aug', sales: 9500, orders: 33 },
      { name: 'Sep', sales: 10400, orders: 39 },
    ],
    inventory: [
      { month: 'Jan', value: 16000 },
      { month: 'Feb', value: 17200 },
      { month: 'Mar', value: 18250 },
      { month: 'Apr', value: 19600 },
      { month: 'May', value: 20400 },
      { month: 'Jun', value: 21850 },
    ],
    materialUsage: [
      { name: 'Wax', value: 40 },
      { name: 'Fragrance', value: 24 },
      { name: 'Jars', value: 16 },
      { name: 'Labels', value: 12 },
      { name: 'Packaging', value: 8 },
    ],
    batches: [
      { name: 'Draft', value: 3 },
      { name: 'In Progress', value: 2 },
      { name: 'Completed', value: 15 },
      { name: 'Cancelled', value: 1 },
    ],
  };

  return {
    summary,
    materials,
    products,
    recipes: mappedRecipes,
    manufacturingBatches,
    salesOrders,
    purchaseOrders,
    suppliers,
    adjustments,
    stocktakes,
    chartData,
  };
}
