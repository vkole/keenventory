export const reportTypes = [
  ["revenue", "Total Revenue", "Sales", "currency"],
  ["orders", "Number of Orders", "Sales", "count"],
  ["average_order", "Average Order Value", "Sales", "currency"],
  ["sales_product", "Sales by Product", "Sales", "currency"],
  ["sales_category", "Sales by Category", "Sales", "currency"],
  ["sales_channel", "Sales by Channel", "Sales", "currency"],
  ["sales_trends", "Sales Trends", "Sales", "currency"],
  ["inventory_value", "Current Inventory Value", "Inventory", "currency"],
  ["stock", "Stock on Hand", "Inventory", "quantity"],
  ["low_stock", "Low Stock Items", "Inventory", "count"],
  ["out_stock", "Out of Stock Items", "Inventory", "count"],
  ["movement", "Inventory Movement", "Inventory", "quantity"],
  ["adjustments", "Inventory Adjustments", "Inventory", "quantity"],
  ["usage", "Material Usage", "Inventory", "quantity"],
  ["production_cost", "Production Costs", "Manufacturing", "currency"],
  ["volume", "Manufacturing Volume", "Manufacturing", "quantity"],
  ["labor_cost", "Labor Costs", "Manufacturing", "currency"],
  ["material_cost", "Material Costs", "Manufacturing", "currency"],
  ["unit_cost", "Cost Per Unit", "Manufacturing", "currency"],
  ["production_history", "Production History", "Manufacturing", "quantity"],
  ["profit", "Gross Profit", "Profitability", "currency"],
  ["margin", "Gross Margin", "Profitability", "percent"],
  ["product_profit", "Product Profitability", "Profitability", "currency"],
  ["revenue_cost", "Revenue vs. Production Cost", "Profitability", "currency"],
  ["profit_trends", "Profit Trends", "Profitability", "currency"],
] as const;
export const reportPresets = [
  "Today",
  "Yesterday",
  "Last 7 Days",
  "Last 30 Days",
  "This Month",
  "Last Month",
  "This Quarter",
  "Last Quarter",
  "This Year",
  "Last Year",
  "Year to Date",
  "All Time",
  "Custom Date Range",
];
export type ReportRow = {
  label: string;
  value: number | null;
  revenue?: number;
  production_cost?: number;
  quantity?: number;
  previous?: number | null;
};
export type ReportResult = {
  title: string;
  type: string;
  unit: string;
  start: string;
  end: string;
  timezone: string;
  grouping: string;
  generated_at: string;
  filters: Record<string, string>;
  rows: ReportRow[];
  summary: {
    value: number | null;
    previous: number | null;
    change_percent: number | null;
  };
  warnings: string[];
  categorical: boolean;
};
