export const actions = [
  "view",
  "create",
  "edit",
  "delete",
  "approve",
  "export",
] as const;
export type Action = (typeof actions)[number];
export const features: Record<string, readonly Action[]> = {
  calendar:['view','create','edit','delete'],
  content:['view','create','edit','delete','export'],
  products: ["view", "create", "edit", "delete", "export"],
  materials: ["view", "create", "edit", "delete", "export"],
  components: ["view", "create", "edit", "delete", "export"],
  recipes: ["view", "create", "edit", "delete", "approve", "export"],
  manufacturing: ["view", "create", "edit", "approve", "export"],
  orders: ["view", "create", "edit", "delete", "approve", "export"],
  purchases: ["view", "create", "edit", "delete", "approve", "export"],
  vendors: ["view", "create", "edit", "delete", "export"],
  stocktakes: ["view", "create", "edit", "approve", "export"],
  adjustments: ["view", "create", "approve", "export"],
  transfers: ["view", "create", "approve"],
  inventoryExports: ["view", "export"],
  customers: ["view", "edit", "export"],
  reporting: ["view", "export"],
  integrations: ["view", "edit"],
  profitability: ["view"],
  productPricing: ["view", "edit", "export"],
  materialCosts: ["view", "edit", "export"],
  orderTotals: ["view", "edit", "export"],
  stockPush: ["view", "approve"],
  users: ["view", "create", "edit", "delete"],
  account: ["view", "edit"],
};
export const featureLabels: Record<string, string> = {
  calendar:'Calendars',content:'Content Calendar',
  products: "Products",
  materials: "Materials",
  components: "Components",
  recipes: "Recipes",
  manufacturing: "Manufacturing",
  orders: "Orders",
  purchases: "Purchases",
  vendors: "Vendors",
  stocktakes: "Stocktakes",
  adjustments: "Stock Adjustments",
  transfers: "Inventory Transfers",
  inventoryExports: "Inventory Exports",
  customers: "Customer Details",
  reporting: "Reporting",
  integrations: "Integrations",
  profitability: "Profitability",
  productPricing: "Product Pricing",
  materialCosts: "Material Costs",
  orderTotals: "Order Totals",
  stockPush: "Stock Push",
  users: "User Management",
  account: "Account Settings",
};
export const roles = [
  "Owner",
  "Admin",
  "Manager",
  "Staff",
  "View Only",
] as const;
export type Role = (typeof roles)[number];
export type Permissions = Record<string, Action[]>;
export type Viewer = {
  id: string;
  name: string;
  email: string;
  organization_id: number;
  role: Role;
  permissions: Permissions;
  image?: string | null;
};
export function defaults(role: Role): Permissions {
  if (role === "Owner" || role === "Admin")
    return Object.fromEntries(
      Object.entries(features)
        .filter(([k]) => role === "Owner" || k !== "account")
        .map(([k, v]) => [k, [...v]]),
    );
  const operational = [
    "products",
    "materials",
    "components",
    "recipes",
    "manufacturing",
    "orders",
    "purchases",
    "vendors",
    "stocktakes",
    "adjustments",
    "transfers",
    "calendar","content",
  ];
  if (role === "Manager")
    return Object.fromEntries(operational.map((k) => [k, [...features[k]]]));
  if (role === "Staff")
    return Object.fromEntries(
      [
        "products",
        "materials",
        "components",
        "recipes",
        "manufacturing",
        "orders",
        "stocktakes",
        "calendar","content",
      ].map((k) => [k, k === "stocktakes" ? ["view", "create"] : ["view"]]),
    );
  return Object.fromEntries(operational.map((k) => [k, ["view"]]));
}
export function can(user: Viewer, feature: string, action: Action = "view") {
  return (
    user.role === "Owner" ||
    ((user.role !== "View Only" || action === "view") &&
      !!user.permissions[feature]?.includes(action))
  );
}
export function validatePermissions(value: unknown, role: Role): Permissions {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Choose valid permissions.");
  const result: Permissions = {};
  for (const [feature, list] of Object.entries(value)) {
    if (
      !features[feature] ||
      !Array.isArray(list) ||
      list.some((a) => !features[feature].includes(a))
    )
      throw Error("Invalid feature permission.");
    result[feature] = [...new Set(list)] as Action[];
    if (role === "View Only" && result[feature].some((a) => a !== "view"))
      throw Error("View Only users can only have view permissions.");
  }
  return result;
}
