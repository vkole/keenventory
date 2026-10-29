'use client';
import { ProductWorkspace } from './ProductWorkspace';
import { ProductChannelHub } from './ProductActions';
import type { ProductRecord } from '@/lib/productStore';
import { RecipeBuilder, type EditableRecipe } from './RecipeBuilder';
import { ManufacturingPlanner } from './ManufacturingPlanner';
import { can, features, type Viewer } from '@/lib/permissions';
import { AccountMenu } from './AccountMenu';
import { RestrictedWorkspace } from './RestrictedWorkspace';


import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  Bell,
  Boxes,
  CalendarDays,
  Factory,
  LayoutGrid,
  List,
  Package2,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  Truck,
  Warehouse,
} from 'lucide-react';
import type { DashboardData, Material, Product, Recipe, Order, PurchaseOrder } from '@/lib/data';


const tabs = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
  { id: 'materials', label: 'Materials', icon: Warehouse },
  { id: 'components', label: 'Components', icon: Package2 },
  { id: 'products', label: 'Products', icon: Package2 },
  { id: 'recipes', label: 'Recipes', icon: Factory },
  { id: 'manufacturing', label: 'Manufacturing', icon: Boxes },
  { id: 'orders', label: 'Orders', icon: ShoppingCart },
  { id: 'purchases', label: 'Purchases', icon: Truck },
  { id: 'suppliers', label: 'Suppliers & Contacts', icon: Truck },
  { id: 'stocktakes', label: 'Stocktakes', icon: ArrowRightLeft },
  { id: 'adjustments', label: 'Adjustments', icon: AlertTriangle },
  { id: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
  { id: 'shopify', label: 'Shopify Integration', icon: ShoppingCart },
  { id: 'stockpush', label: 'Stock Push', icon: ArrowRightLeft },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const barColors = ['#000E2D', '#868F9E', '#E8C9C9', '#F4EAE8', '#E2E1E2'];

export function InventoryWorkspace({ initialData, user }: { initialData: DashboardData; user:Viewer }) {
  if(!['products','materials','components','recipes','manufacturing','orders','purchases','vendors','stocktakes','adjustments','reporting','integrations','profitability','productPricing','materialCosts','orderTotals','stockPush','transfers','inventoryExports'].every(f=>features[f].every(a=>can(user,f,a)))) return <RestrictedWorkspace initialData={initialData} user={user}/>;
  return <FullWorkspace initialData={initialData} user={user}/>;
}
function FullWorkspace({ initialData,user }: { initialData:DashboardData;user:Viewer }) {
  const [data, setData] = useState(initialData);
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]['id']>('dashboard');
  const [viewMode, setViewMode] = useState<Record<string, 'list' | 'calendar'>>({
    dashboard: 'list',
    materials: 'list',
    components: 'list',
    products: 'list',
    recipes: 'list',
    manufacturing: 'list',
    orders: 'list',
    purchases: 'list',
    suppliers: 'list',
    stocktakes: 'list',
    adjustments: 'list',
    reports: 'list',
    shopify: 'list',
    stockpush: 'list',
    settings: 'list',
  });

  const [materialForm, setMaterialForm] = useState({
    name: '',
    sku: '',
    category: 'Candle Wax',
    unit: 'oz',
    stock_quantity: '0',
    cost_per_unit: '0',
    reorder_threshold: '0',
    location: 'Main Storage',
    inventoriable: true,
  });

  const [componentForm, setComponentForm] = useState({
    name: '',
    sku: '',
    category: 'Jar',
    unit: 'unit',
    low_stock_limit: '0',
    starting_quantity: '0',
    unit_cost: '0',
    currency: 'USD',
    storage_location: 'Production Area',
    description: '',
    notes: '',
  });

  const isComponent = (item: Material) => /component|jar|lid|wick|label|packaging|box/i.test(item.category + ' ' + item.name) || data.recipes.some(r => r.ingredients.some(i => i.item_type === 'component' && (i.material_id === item.id || i.item_name === item.name)));
  const [recipeSeedProduct, setRecipeSeedProduct] = useState<number | undefined>();
  const [productionSeed, setProductionSeed] = useState<{ recipe: EditableRecipe; count: number } | null>(null);
  async function refreshDashboard() {
    const response = await fetch('/api/dashboard', { cache: 'no-store' });
    if (response.ok) setData(await response.json());
  }

  const [stocktakeForm, setStocktakeForm] = useState({
    type: 'Material',
    code: 'STK-001',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
    location: 'Main Storage',
    method: 'All',
    categories: 'All',
    totalCount: '25',
    sort: 'Name',
    lastStocktakeBefore: '',
    inventory_name: 'Glass Jar',
    actual_quantity: '86',
  });

  const [orderForm, setOrderForm] = useState({
    code: 'ORD-1001',
    customer: '',
    total: '0',
    channel: 'Direct',
    status: 'Pending',
    deliveryAddress: 'Main Warehouse',
    inventoryLocation: 'Main Storage',
    orderDate: new Date().toISOString().slice(0, 10),
    manufacturedDate: '',
    shippedDate: '',
    dueDate: '',
    discount: '0',
    shipping: '0',
    taxRate: '8',
    category: 'Standard',
    paymentStatus: 'Unpaid',
    fulfillmentStatus: 'Pending',
    customerMessage: '',
    internalNotes: '',
    trackingNumber: '',
  });

  const [purchaseForm, setPurchaseForm] = useState({
    vendor: '',
    supplier: '',
    code: 'PO-1001',
    purchaseDate: new Date().toISOString().slice(0, 10),
    estimatedArrivalDate: '',
    total_cost: '0',
    status: 'Ordered',
    notes: '',
    paid: false,
    paymentStatus: 'Unpaid',
    invoiceNumber: '',
    trackingNumber: '',
  });

  const [supplierForm, setSupplierForm] = useState({
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    website: '',
    lead_time: '7 days',
    payment_terms: 'Net 30',
    notes: '',
  });

  const [adjustmentForm, setAdjustmentForm] = useState({
    item_name: '',
    quantity: '0',
    reason: 'Manufacturing waste',
  });

  const stats = useMemo(
    () => [
      { label: 'Total inventory value', value: currency.format(data.summary.totalInventoryValue), icon: BarChart3 },
      { label: 'Raw material value', value: currency.format(data.summary.rawMaterialValue), icon: Warehouse },
      { label: 'Finished goods', value: currency.format(data.summary.finishedGoodsValue), icon: Package2 },
      { label: 'Active products', value: String(data.summary.activeProducts), icon: Boxes },
      { label: 'Material SKUs', value: String(data.summary.materialSkus), icon: Factory },
      { label: 'Low stock items', value: String(data.summary.lowStockItems), icon: AlertTriangle },
    ],
    [data.summary]
  );

  const reportMetrics = useMemo(() => {
    const revenue = data.salesOrders.reduce((sum, order) => sum + order.total, 0);
    const spend = data.purchaseOrders.reduce((sum, order) => sum + order.total_cost, 0);
    const grossProfit = revenue - spend;

    return [
      { label: 'Gross revenue', value: currency.format(revenue) },
      { label: 'COGS', value: currency.format(spend) },
      { label: 'Gross profit', value: currency.format(grossProfit) },
      { label: 'Inventory turns', value: '3.8x' },
    ];
  }, [data.purchaseOrders, data.salesOrders]);

  const shopifyMetrics = useMemo(() => ({
    onlineSales: data.salesOrders.filter((order) => order.channel === 'Shopify').reduce((sum, order) => sum + order.total, 0),
    orderCount: data.salesOrders.filter((order) => order.channel === 'Shopify').length,
    avgOrderValue: data.salesOrders.filter((order) => order.channel === 'Shopify').length
      ? data.salesOrders.filter((order) => order.channel === 'Shopify').reduce((sum, order) => sum + order.total, 0) /
        data.salesOrders.filter((order) => order.channel === 'Shopify').length
      : 0,
  }), [data.salesOrders]);

  const handleMaterialSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      name: materialForm.name,
      sku: materialForm.sku,
      category: materialForm.category,
      unit: materialForm.unit,
      stock_quantity: Number(materialForm.stock_quantity),
      cost_per_unit: Number(materialForm.cost_per_unit),
      reorder_threshold: Number(materialForm.reorder_threshold),
      location: materialForm.location,
    };

    const response = await fetch('/api/materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      alert('Material could not be saved.');
      return;
    }

    const saved = await response.json();
    setData((current) => ({
      ...current,
      materials: [
        {
          id: saved.id,
          name: payload.name,
          sku: payload.sku,
          category: payload.category,
          unit: payload.unit,
          stock_quantity: payload.stock_quantity,
          cost_per_unit: payload.cost_per_unit,
          reorder_threshold: payload.reorder_threshold,
          location: payload.location,
          updated_at: new Date().toISOString(),
        },
        ...current.materials,
      ],
      summary: {
        ...current.summary,
        materialSkus: current.summary.materialSkus + 1,
      },
    }));

    setMaterialForm({
      name: '',
      sku: '',
      category: 'Candle Wax',
      unit: 'oz',
      stock_quantity: '0',
      cost_per_unit: '0',
      reorder_threshold: '0',
      location: 'Main Storage',
      inventoriable: true,
    });
  };

  const handleComponentSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const payload = {
      name: componentForm.name,
      sku: componentForm.sku,
      category: componentForm.category,
      unit: componentForm.unit,
      stock_quantity: Number(componentForm.starting_quantity),
      cost_per_unit: Number(componentForm.unit_cost),
      reorder_threshold: Number(componentForm.low_stock_limit),
      location: componentForm.storage_location,
    };

    const response = await fetch('/api/materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      alert('Component could not be saved.');
      return;
    }

    const saved = await response.json();
    setData((current) => ({
      ...current,
      materials: [
        {
          id: saved.id,
          name: payload.name,
          sku: payload.sku,
          category: payload.category,
          unit: payload.unit,
          stock_quantity: payload.stock_quantity,
          cost_per_unit: payload.cost_per_unit,
          reorder_threshold: payload.reorder_threshold,
          location: payload.location,
          updated_at: new Date().toISOString(),
        },
        ...current.materials,
      ],
    }));

    setComponentForm({
      name: '',
      sku: '',
      category: 'Jar',
      unit: 'unit',
      low_stock_limit: '0',
      starting_quantity: '0',
      unit_cost: '0',
      currency: 'USD',
      storage_location: 'Production Area',
      description: '',
      notes: '',
    });
  };

  const handleStocktakeSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await fetch('/api/stocktakes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stocktake_type: stocktakeForm.type,
        location: stocktakeForm.location,
        inventory_name: stocktakeForm.inventory_name,
        actual_quantity: Number(stocktakeForm.actual_quantity || 0),
        notes: stocktakeForm.notes,
      }),
    });

    if (!response.ok) {
      alert('Stocktake could not be added.');
      return;
    }

    const created = await response.json();
    setData((current) => ({
      ...current,
      stocktakes: [
        {
          id: created.id,
          location: stocktakeForm.location,
          inventory_name: stocktakeForm.inventory_name,
          system_quantity: created.system_quantity,
          actual_quantity: Number(stocktakeForm.actual_quantity),
          variance: created.variance,
          status: 'Open',
          created_at: new Date().toISOString(),
        },
        ...current.stocktakes,
      ],
    }));

    setStocktakeForm({
      type: 'Material',
      code: 'STK-001',
      date: new Date().toISOString().slice(0, 10),
      notes: '',
      location: 'Main Storage',
      method: 'All',
      categories: 'All',
      totalCount: '25',
      sort: 'Name',
      lastStocktakeBefore: '',
      inventory_name: 'Glass Jar',
      actual_quantity: '86',
    });
  };

  const handleOrderSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: orderForm.customer,
        total: Number(orderForm.total),
        channel: orderForm.channel,
        status: orderForm.status,
      }),
    });

    if (!response.ok) {
      alert('Order could not be saved.');
      return;
    }

    const created = await response.json();
    setData((current) => ({
      ...current,
      salesOrders: [
        {
          id: created.id,
          customer: orderForm.customer,
          order_date: new Date().toISOString(),
          status: orderForm.status,
          total: Number(orderForm.total),
          channel: orderForm.channel,
        },
        ...current.salesOrders,
      ],
    }));

    setOrderForm({
      code: 'ORD-1001',
      customer: '',
      total: '0',
      channel: 'Direct',
      status: 'Pending',
      deliveryAddress: 'Main Warehouse',
      inventoryLocation: 'Main Storage',
      orderDate: new Date().toISOString().slice(0, 10),
      manufacturedDate: '',
      shippedDate: '',
      dueDate: '',
      discount: '0',
      shipping: '0',
      taxRate: '8',
      category: 'Standard',
      paymentStatus: 'Unpaid',
      fulfillmentStatus: 'Pending',
      customerMessage: '',
      internalNotes: '',
      trackingNumber: '',
    });
  };

  const handlePurchaseSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await fetch('/api/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier: purchaseForm.vendor || purchaseForm.supplier,
        total_cost: Number(purchaseForm.total_cost),
        status: purchaseForm.status,
      }),
    });

    if (!response.ok) {
      alert('Purchase order could not be saved.');
      return;
    }

    const created = await response.json();
    setData((current) => ({
      ...current,
      purchaseOrders: [
        {
          id: created.id,
          supplier: purchaseForm.supplier,
          status: purchaseForm.status,
          order_date: new Date().toISOString(),
          total_cost: Number(purchaseForm.total_cost),
          expected_delivery: null,
        },
        ...current.purchaseOrders,
      ],
    }));

    setPurchaseForm({
      vendor: '',
      supplier: '',
      code: 'PO-1001',
      purchaseDate: new Date().toISOString().slice(0, 10),
      estimatedArrivalDate: '',
      total_cost: '0',
      status: 'Ordered',
      notes: '',
      paid: false,
      paymentStatus: 'Unpaid',
      invoiceNumber: '',
      trackingNumber: '',
    });
  };

  const handleSupplierSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await fetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(supplierForm),
    });

    if (!response.ok) {
      alert('Supplier could not be saved.');
      return;
    }

    const created = await response.json();
    setData((current) => ({
      ...current,
      suppliers: [
        {
          id: created.id,
          company_name: supplierForm.company_name,
          contact_name: supplierForm.contact_name,
          email: supplierForm.email,
          phone: supplierForm.phone,
          website: supplierForm.website,
          lead_time: supplierForm.lead_time,
          payment_terms: supplierForm.payment_terms,
          notes: supplierForm.notes,
          created_at: new Date().toISOString(),
        },
        ...current.suppliers,
      ],
    }));

    setSupplierForm({
      company_name: '',
      contact_name: '',
      email: '',
      phone: '',
      website: '',
      lead_time: '7 days',
      payment_terms: 'Net 30',
      notes: '',
    });
  };

  const handleAdjustmentSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await fetch('/api/adjustments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_name: adjustmentForm.item_name,
        quantity: Number(adjustmentForm.quantity),
        reason: adjustmentForm.reason,
      }),
    });

    if (!response.ok) {
      alert('Adjustment could not be recorded.');
      return;
    }

    const created = await response.json();
    setData((current) => ({
      ...current,
      adjustments: [
        {
          id: created.id,
          item_name: adjustmentForm.item_name,
          quantity: Number(adjustmentForm.quantity),
          reason: adjustmentForm.reason,
          created_at: new Date().toISOString(),
        },
        ...current.adjustments,
      ],
    }));

    setAdjustmentForm({
      item_name: '',
      quantity: '0',
      reason: 'Manufacturing waste',
    });
  };

  const renderCalendarView = (module: 'manufacturing' | 'orders' | 'purchases' | 'stocktakes' | 'products' | 'materials' | 'components') => {
    const startDay = new Date();
    startDay.setDate(startDay.getDate() - startDay.getDay() - 7);

    const days = Array.from({ length: 35 }, (_, index) => {
      const current = new Date(startDay);
      current.setDate(startDay.getDate() + index);
      return current;
    });

    const eventsMap = {
      manufacturing: data.manufacturingBatches.map((batch) => ({ id: batch.id, title: `Batch #${batch.id}`, date: batch.created_at.slice(0, 10), color: '#000E2D' })),
      orders: data.salesOrders.map((order) => ({ id: order.id, title: order.customer, date: order.order_date.slice(0, 10), color: '#868F9E' })),
      purchases: data.purchaseOrders.map((purchase) => ({ id: purchase.id, title: purchase.supplier, date: purchase.order_date.slice(0, 10), color: '#E8C9C9' })),
      stocktakes: data.stocktakes.map((stocktake) => ({ id: stocktake.id, title: stocktake.inventory_name, date: stocktake.created_at.slice(0, 10), color: '#F4EAE8' })),
      products: data.products.map((product) => ({ id: product.id, title: product.name, date: product.updated_at.slice(0, 10), color: '#000E2D' })),
      materials: data.materials.map((material) => ({ id: material.id, title: material.name, date: material.updated_at.slice(0, 10), color: '#868F9E' })),
      components: data.materials.filter(isComponent).map((material) => ({ id: material.id, title: material.name, date: material.updated_at.slice(0, 10), color: '#E8C9C9' })),
    } as const;

    return (
      <div className="card rounded-3xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Calendar view</h3>
          <div className="flex items-center gap-2 text-sm text-[#868F9E]">
            <button type="button" className="rounded-lg border border-[#E2E1E2] bg-white px-2 py-1">Today</button>
            <button type="button" className="rounded-lg border border-[#E2E1E2] bg-white px-2 py-1">Previous</button>
            <button type="button" className="rounded-lg border border-[#E2E1E2] bg-white px-2 py-1">Next</button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-2 text-center text-xs text-[#868F9E]">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="pb-2 font-semibold">{day}</div>
          ))}
          {days.map((date, index) => {
            const matches = eventsMap[module].filter((event) => event.date === date.toISOString().slice(0, 10));
            return (
              <div key={`${date.toISOString()}-${index}`} className="min-h-[110px] rounded-xl border border-[#E2E1E2] bg-[#F4EAE8]/40 p-2 text-left">
                <div className="mb-2 text-[11px] font-medium text-[#000E2D]">{date.getDate()}</div>
                <div className="space-y-1">
                  {matches.slice(0, 2).map((event) => (
                    <div key={event.id} className="truncate rounded-md px-1.5 py-0.5 text-[10px] text-white" style={{ background: event.color }}>
                      {event.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F4EAE8] text-[#000E2D]">
      <div className="mx-auto flex max-w-[1600px]">
        <aside className="hidden min-h-screen w-72 flex-col bg-[#000E2D] p-6 text-white lg:flex">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8C9C9] text-lg font-bold text-[#000E2D]">K</div>
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-slate-300">Keenventory</p>
              <h1 className="text-xl font-semibold">Inventory OS</h1>
            </div>
          </div>

          <nav className="space-y-2">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-medium transition ${
                  activeTab === id ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5'
                }`}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </nav>

          <div className="mt-auto rounded-2xl bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Demo mode</p>
            <p className="mt-2 text-sm text-slate-100">Operations are stored in SQLite and can be expanded to more modules.</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-4 md:p-6 xl:p-8">
          <label className="mb-4 grid gap-2 text-sm lg:hidden">
            Module
            <select aria-label="Module" className="rounded-xl border border-[#E2E1E2] bg-white p-3" value={activeTab} onChange={e => { const tab = tabs.find(tab => tab.id === e.target.value); if (tab) setActiveTab(tab.id); }}>
              {tabs.map(tab => <option key={tab.id} value={tab.id}>{tab.label}</option>)}
            </select>
          </label>
          <header className="mb-8 flex flex-col gap-4 rounded-3xl border border-[#E2E1E2] bg-white/80 p-4 shadow-soft backdrop-blur md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#868F9E]">Operations Overview</p>
              <h2 className="mt-2 text-3xl font-semibold text-[#000E2D]">Keenventory Dashboard</h2>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl border border-[#E2E1E2] bg-[#F4EAE8] px-3 py-2 text-sm text-[#000E2D]">
                <Search size={16} />
                <span>Search inventory</span>
              </div>
              <div className="flex items-center gap-1 rounded-xl border border-[#E2E1E2] bg-white p-1">
                <button type="button" onClick={() => setViewMode((current) => ({ ...current, [activeTab]: 'list' }))} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm ${viewMode[activeTab] === 'list' ? 'bg-[#000E2D] text-white' : 'text-[#000E2D]'}`}>
                  <List size={14} /> List View
                </button>
                <button type="button" onClick={() => setViewMode((current) => ({ ...current, [activeTab]: 'calendar' }))} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm ${viewMode[activeTab] === 'calendar' ? 'bg-[#000E2D] text-white' : 'text-[#000E2D]'}`}>
                  <CalendarDays size={14} /> Calendar View
                </button>
              </div>
              <button type="button" className="rounded-xl bg-[#000E2D] p-2 text-white">
                <Bell size={18} />
              </button>
              <AccountMenu user={user}/>
            </div>
          </header>

          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                {stats.map(({ label, value, icon: Icon }) => (
                  <div key={label} className="card rounded-2xl p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-[#868F9E]">{label}</span>
                      <div className="rounded-lg bg-[#E8C9C9] p-2 text-[#000E2D]">
                        <Icon size={16} />
                      </div>
                    </div>
                    <div className="table-mono text-2xl font-semibold text-[#000E2D]">{value}</div>
                  </div>
                ))}
              </section>

              <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
                <div className="card rounded-3xl p-5">
                  <div className="mb-5 flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Sales trend</h3>
                    <div className="badge bg-[#E8C9C9] text-[#000E2D]">This year</div>
                  </div>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.chartData.sales}>
                        <defs>
                          <linearGradient id="salesFill" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="5%" stopColor="#000E2D" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#000E2D" stopOpacity={0.03} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E1E2" />
                        <XAxis dataKey="name" stroke="#868F9E" />
                        <YAxis stroke="#868F9E" />
                        <Tooltip formatter={(value) => currency.format(Number(value ?? 0))} />
                        <Area type="monotone" dataKey="sales" stroke="#000E2D" fill="url(#salesFill)" strokeWidth={3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card rounded-3xl p-5">
                  <div className="mb-5 flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Material usage</h3>
                    <div className="badge bg-[#F4EAE8] text-[#000E2D]">By volume</div>
                  </div>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={data.chartData.materialUsage} dataKey="value" nameKey="name" innerRadius={54} outerRadius={90} paddingAngle={4}>
                          {data.chartData.materialUsage.map((entry, index) => (
                            <Cell key={entry.name} fill={barColors[index % barColors.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => `${value ?? 0}%`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
                <div className="card rounded-3xl p-5">
                  <div className="mb-5 flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Inventory valuation</h3>
                    <div className="badge bg-[#E8C9C9] text-[#000E2D]">6-month</div>
                  </div>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.chartData.inventory}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E1E2" />
                        <XAxis dataKey="month" stroke="#868F9E" />
                        <YAxis stroke="#868F9E" />
                        <Tooltip formatter={(value) => currency.format(Number(value ?? 0))} />
                        <Bar dataKey="value" fill="#000E2D" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card rounded-3xl p-5">
                  <h3 className="mb-4 text-lg font-semibold">Recent activity</h3>
                  <div className="space-y-4">
                    {data.adjustments.slice(0, 4).map((adjustment) => (
                      <div key={adjustment.id} className="flex items-center justify-between border-b border-[#E2E1E2] pb-2 last:border-0 last:pb-0">
                        <div>
                          <p className="font-medium">{adjustment.item_name}</p>
                          <p className="text-xs text-[#868F9E]">{adjustment.reason}</p>
                        </div>
                        <span className="table-mono text-sm font-semibold text-[#000E2D]">
                          {adjustment.quantity > 0 ? '+' : ''}{adjustment.quantity}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'materials' && (
            viewMode.materials === 'calendar' ? renderCalendarView('materials') : (
            <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
              <div className="card rounded-3xl p-5">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Material inventory</h3>
                  <span className="badge bg-[#F4EAE8] text-[#000E2D]">{data.materials.length} records</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-[#E2E1E2] text-[#868F9E]">
                      <tr>
                        <th className="pb-3 pr-4">Name</th>
                        <th className="pb-3 pr-4">SKU</th>
                        <th className="pb-3 pr-4">Stock</th>
                        <th className="pb-3 pr-4">Cost</th>
                        <th className="pb-3 pr-4">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.materials.map((material: Material) => (
                        <tr key={material.id} className="border-b border-[#F4EAE8] last:border-0">
                          <td className="py-3 pr-4 font-medium">{material.name}</td>
                          <td className="py-3 pr-4 text-[#868F9E]">{material.sku}</td>
                          <td className="table-mono py-3 pr-4">{material.stock_quantity} {material.unit}</td>
                          <td className="table-mono py-3 pr-4">{currency.format(material.cost_per_unit)}</td>
                          <td className="py-3 pr-4">{material.location}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <form onSubmit={handleMaterialSubmit} className="card rounded-3xl p-5">
                <h3 className="mb-5 text-lg font-semibold">Add material</h3>
                <div className="grid gap-3">
                  <input value={materialForm.name} onChange={(e) => setMaterialForm({ ...materialForm, name: e.target.value })} placeholder="Material name" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                  <input value={materialForm.sku} onChange={(e) => setMaterialForm({ ...materialForm, sku: e.target.value })} placeholder="SKU" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                  <div className="grid grid-cols-2 gap-3">
                    <select value={materialForm.category} onChange={(e) => setMaterialForm({ ...materialForm, category: e.target.value })} className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none">
                      <option>Candle Wax</option>
                      <option>Fragrance Oils</option>
                      <option>Candle Jars</option>
                      <option>Wicks</option>
                      <option>Candle Lids</option>
                    </select>
                    <select value={materialForm.unit} onChange={(e) => setMaterialForm({ ...materialForm, unit: e.target.value })} className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none">
                      <option>oz</option>
                      <option>lb</option>
                      <option>g</option>
                      <option>mL</option>
                      <option>unit</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" value={materialForm.stock_quantity} onChange={(e) => setMaterialForm({ ...materialForm, stock_quantity: e.target.value })} placeholder="Stock" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                    <input type="number" step="0.01" value={materialForm.cost_per_unit} onChange={(e) => setMaterialForm({ ...materialForm, cost_per_unit: e.target.value })} placeholder="Unit cost" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" value={materialForm.reorder_threshold} onChange={(e) => setMaterialForm({ ...materialForm, reorder_threshold: e.target.value })} placeholder="Reorder threshold" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                    <input value={materialForm.location} onChange={(e) => setMaterialForm({ ...materialForm, location: e.target.value })} placeholder="Location" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                  </div>
                  <button type="submit" className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-[#000E2D] p-3 font-medium text-white">
                    <Plus size={16} /> Add material
                  </button>
                </div>
              </form>
            </div>
            )
          )}

          {activeTab === 'components' && (
            viewMode.components === 'calendar' ? renderCalendarView('components') : (
            <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
              <div className="card rounded-3xl p-5">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Component inventory</h3>
                  <span className="badge bg-[#F4EAE8] text-[#000E2D]">{data.materials.filter(isComponent).length} records</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-[#E2E1E2] text-[#868F9E]">
                      <tr>
                        <th className="pb-3 pr-4">Name</th>
                        <th className="pb-3 pr-4">SKU</th>
                        <th className="pb-3 pr-4">Stock</th>
                        <th className="pb-3 pr-4">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.materials.filter(isComponent).map((item: Material) => (
                        <tr key={item.id} className="border-b border-[#F4EAE8] last:border-0">
                          <td className="py-3 pr-4 font-medium">{item.name}</td>
                          <td className="py-3 pr-4 text-[#868F9E]">{item.sku}</td>
                          <td className="table-mono py-3 pr-4">{item.stock_quantity} {item.unit}</td>
                          <td className="py-3 pr-4">{item.location}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <form onSubmit={handleComponentSubmit} className="card rounded-3xl p-5">
                <h3 className="mb-5 text-lg font-semibold">Add component</h3>
                <div className="grid gap-3">
                  <input value={componentForm.name} onChange={(e) => setComponentForm({ ...componentForm, name: e.target.value })} placeholder="Component name" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                  <input value={componentForm.sku} onChange={(e) => setComponentForm({ ...componentForm, sku: e.target.value })} placeholder="SKU" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" value={componentForm.starting_quantity} onChange={(e) => setComponentForm({ ...componentForm, starting_quantity: e.target.value })} placeholder="Starting quantity" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                    <input type="number" step="0.01" value={componentForm.unit_cost} onChange={(e) => setComponentForm({ ...componentForm, unit_cost: e.target.value })} placeholder="Unit cost" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" value={componentForm.low_stock_limit} onChange={(e) => setComponentForm({ ...componentForm, low_stock_limit: e.target.value })} placeholder="Low stock limit" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                    <input value={componentForm.unit} onChange={(e) => setComponentForm({ ...componentForm, unit: e.target.value })} placeholder="Tracking unit" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                  </div>
                  <input value={componentForm.storage_location} onChange={(e) => setComponentForm({ ...componentForm, storage_location: e.target.value })} placeholder="Storage location" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                  <textarea value={componentForm.notes} onChange={(e) => setComponentForm({ ...componentForm, notes: e.target.value })} placeholder="Notes" className="min-h-[90px] rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                  <button type="submit" className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-[#000E2D] p-3 font-medium text-white">
                    <Plus size={16} /> Save component
                  </button>
                </div>
              </form>
            </div>
            )
          )}

          {activeTab === 'products' && <ProductWorkspace data={data} onRefresh={refreshDashboard} onRecipes={p => { setRecipeSeedProduct(p.id); setActiveTab('recipes'); }} onManufacture={p => { const recipe = data.recipes.find(r => r.product_id === p.id && r.is_active && r.status === 'Active'); if (!recipe) { setRecipeSeedProduct(p.id); setActiveTab('recipes'); return; } setProductionSeed({ recipe, count: recipe.batch_yield }); setActiveTab('manufacturing'); }} />}
          {activeTab === 'recipes' && <RecipeBuilder productId={recipeSeedProduct} data={data} onRefresh={refreshDashboard} onManufacture={(recipe, count) => { setProductionSeed({ recipe, count }); setActiveTab('manufacturing'); }} />}
          {activeTab === 'manufacturing' && (viewMode.manufacturing === 'calendar' ? renderCalendarView('manufacturing') : <ManufacturingPlanner data={data} seed={productionSeed} onRefresh={refreshDashboard} />)}

          {activeTab === 'orders' && (
            viewMode.orders === 'calendar' ? renderCalendarView('orders') : (
            <div className="grid gap-6 xl:grid-cols-[1.3fr_0.8fr]">
              <div className="card rounded-3xl p-5">
                <h3 className="mb-5 text-lg font-semibold">Sales orders</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-[#E2E1E2] text-[#868F9E]">
                      <tr>
                        <th className="pb-3 pr-4">Customer</th>
                        <th className="pb-3 pr-4">Channel</th>
                        <th className="pb-3 pr-4">Status</th>
                        <th className="pb-3 pr-4">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.salesOrders.map((order: Order) => (
                        <tr key={order.id} className="border-b border-[#F4EAE8] last:border-0">
                          <td className="py-3 pr-4 font-medium">{order.customer}</td>
                          <td className="py-3 pr-4">{order.channel}</td>
                          <td className="py-3 pr-4">{order.status}</td>
                          <td className="table-mono py-3 pr-4">{currency.format(order.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <form onSubmit={handleOrderSubmit} className="card rounded-3xl p-5">
                <h3 className="mb-5 text-lg font-semibold">Add customer order</h3>
                <div className="grid gap-3">
                  <input value={orderForm.customer} onChange={(e) => setOrderForm({ ...orderForm, customer: e.target.value })} placeholder="Customer" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                  <div className="grid grid-cols-2 gap-3">
                    <select value={orderForm.channel} onChange={(e) => setOrderForm({ ...orderForm, channel: e.target.value })} className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none">
                      <option>Direct</option>
                      <option>Wholesale</option>
                      <option>Shopify</option>
                    </select>
                    <select value={orderForm.status} onChange={(e) => setOrderForm({ ...orderForm, status: e.target.value })} className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none">
                      <option>Pending</option>
                      <option>Fulfilled</option>
                      <option>Cancelled</option>
                    </select>
                  </div>
                  <input type="number" step="0.01" value={orderForm.total} onChange={(e) => setOrderForm({ ...orderForm, total: e.target.value })} placeholder="Order total" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                  <button type="submit" className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-[#000E2D] p-3 font-medium text-white">
                    <Plus size={16} /> Save order
                  </button>
                </div>
              </form>
            </div>
            )
          )}

          {activeTab === 'purchases' && (
            viewMode.purchases === 'calendar' ? renderCalendarView('purchases') : (
            <div className="grid gap-6 xl:grid-cols-[1.3fr_0.8fr]">
              <div className="card rounded-3xl p-5">
                <h3 className="mb-5 text-lg font-semibold">Purchase orders</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-[#E2E1E2] text-[#868F9E]">
                      <tr>
                        <th className="pb-3 pr-4">Supplier</th>
                        <th className="pb-3 pr-4">Status</th>
                        <th className="pb-3 pr-4">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.purchaseOrders.map((purchase: PurchaseOrder) => (
                        <tr key={purchase.id} className="border-b border-[#F4EAE8] last:border-0">
                          <td className="py-3 pr-4 font-medium">{purchase.supplier}</td>
                          <td className="py-3 pr-4">{purchase.status}</td>
                          <td className="table-mono py-3 pr-4">{currency.format(purchase.total_cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <form onSubmit={handlePurchaseSubmit} className="card rounded-3xl p-5">
                <h3 className="mb-5 text-lg font-semibold">Create purchase</h3>
                <div className="grid gap-3">
                  <input value={purchaseForm.supplier} onChange={(e) => setPurchaseForm({ ...purchaseForm, supplier: e.target.value })} placeholder="Supplier" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                  <select value={purchaseForm.status} onChange={(e) => setPurchaseForm({ ...purchaseForm, status: e.target.value })} className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none">
                    <option>Ordered</option>
                    <option>Partially Received</option>
                    <option>Received</option>
                    <option>Cancelled</option>
                  </select>
                  <input type="number" step="0.01" value={purchaseForm.total_cost} onChange={(e) => setPurchaseForm({ ...purchaseForm, total_cost: e.target.value })} placeholder="Total cost" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                  <button type="submit" className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-[#000E2D] p-3 font-medium text-white">
                    <Plus size={16} /> Save purchase
                  </button>
                </div>
              </form>
            </div>
            )
          )}

          {activeTab === 'stocktakes' && (
            viewMode.stocktakes === 'calendar' ? renderCalendarView('stocktakes') : (
            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="card rounded-3xl p-5">
                <h3 className="mb-5 text-lg font-semibold">Stocktakes</h3>
                <div className="space-y-3">
                  {data.stocktakes.map((stocktake) => (
                    <div key={stocktake.id} className="rounded-2xl border border-[#E2E1E2] p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold">{stocktake.inventory_name}</p>
                          <p className="text-xs text-[#868F9E]">{stocktake.location}</p>
                        </div>
                        <span className="badge bg-[#E8C9C9] text-[#000E2D]">{stocktake.status}</span>
                      </div>
                      <div className="mt-3 table-mono text-sm text-[#000E2D]">
                        System {stocktake.system_quantity} / Actual {stocktake.actual_quantity} / Variance {stocktake.variance}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <form onSubmit={handleStocktakeSubmit} className="card rounded-3xl p-5">
                <h3 className="mb-5 text-lg font-semibold">Add stocktake</h3>
                <div className="grid gap-3">
                  <input value={stocktakeForm.location} onChange={(e) => setStocktakeForm({ ...stocktakeForm, location: e.target.value })} placeholder="Location" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                  <input value={stocktakeForm.inventory_name} onChange={(e) => setStocktakeForm({ ...stocktakeForm, inventory_name: e.target.value })} placeholder="Item name" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                  <input type="number" value={stocktakeForm.actual_quantity} onChange={(e) => setStocktakeForm({ ...stocktakeForm, actual_quantity: e.target.value })} placeholder="Actual quantity" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                  <button type="submit" className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-[#000E2D] p-3 font-medium text-white">
                    <Plus size={16} /> Log count
                  </button>
                </div>
              </form>
            </div>
            )
          )}

          {activeTab === 'suppliers' && (
            <div className="grid gap-6 xl:grid-cols-[1.3fr_0.85fr]">
              <div className="card rounded-3xl p-5">
                <h3 className="mb-5 text-lg font-semibold">Suppliers & contacts</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-[#E2E1E2] text-[#868F9E]">
                      <tr>
                        <th className="pb-3 pr-4">Company</th>
                        <th className="pb-3 pr-4">Contact</th>
                        <th className="pb-3 pr-4">Lead time</th>
                        <th className="pb-3 pr-4">Payments</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.suppliers.map((supplier) => (
                        <tr key={supplier.id} className="border-b border-[#F4EAE8] last:border-0">
                          <td className="py-3 pr-4 font-medium">{supplier.company_name}</td>
                          <td className="py-3 pr-4">{supplier.contact_name}</td>
                          <td className="py-3 pr-4">{supplier.lead_time ?? 'N/A'}</td>
                          <td className="py-3 pr-4">{supplier.payment_terms ?? 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <form onSubmit={handleSupplierSubmit} className="card rounded-3xl p-5">
                <h3 className="mb-5 text-lg font-semibold">Add supplier</h3>
                <div className="grid gap-3">
                  <input value={supplierForm.company_name} onChange={(e) => setSupplierForm({ ...supplierForm, company_name: e.target.value })} placeholder="Company name" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                  <input value={supplierForm.contact_name} onChange={(e) => setSupplierForm({ ...supplierForm, contact_name: e.target.value })} placeholder="Contact name" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                  <div className="grid grid-cols-2 gap-3">
                    <input value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} placeholder="Email" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                    <input value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} placeholder="Phone" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input value={supplierForm.website} onChange={(e) => setSupplierForm({ ...supplierForm, website: e.target.value })} placeholder="Website" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                    <input value={supplierForm.lead_time} onChange={(e) => setSupplierForm({ ...supplierForm, lead_time: e.target.value })} placeholder="Lead time" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                  </div>
                  <input value={supplierForm.payment_terms} onChange={(e) => setSupplierForm({ ...supplierForm, payment_terms: e.target.value })} placeholder="Payment terms" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                  <textarea value={supplierForm.notes} onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })} placeholder="Notes" className="min-h-[90px] rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                  <button type="submit" className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-[#000E2D] p-3 font-medium text-white">
                    <Plus size={16} /> Save supplier
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'adjustments' && (
            <div className="grid gap-6 xl:grid-cols-[1.3fr_0.8fr]">
              <div className="card rounded-3xl p-5">
                <h3 className="mb-5 text-lg font-semibold">Inventory adjustments</h3>
                <div className="space-y-3">
                  {data.adjustments.map((adjustment) => (
                    <div key={adjustment.id} className="rounded-2xl border border-[#E2E1E2] p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold">{adjustment.item_name}</p>
                          <p className="text-xs text-[#868F9E]">{adjustment.reason}</p>
                        </div>
                        <span className="table-mono text-sm font-semibold text-[#000E2D]">
                          {adjustment.quantity > 0 ? '+' : ''}{adjustment.quantity}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <form onSubmit={handleAdjustmentSubmit} className="card rounded-3xl p-5">
                <h3 className="mb-5 text-lg font-semibold">Record adjustment</h3>
                <div className="grid gap-3">
                  <input value={adjustmentForm.item_name} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, item_name: e.target.value })} placeholder="Item name" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                  <input type="number" step="0.01" value={adjustmentForm.quantity} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, quantity: e.target.value })} placeholder="Quantity" className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none" />
                  <select value={adjustmentForm.reason} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, reason: e.target.value })} className="rounded-xl border border-[#E2E1E2] bg-white p-3 outline-none">
                    <option>Manufacturing waste</option>
                    <option>Damaged materials</option>
                    <option>Expired materials</option>
                    <option>Counting corrections</option>
                    <option>Found inventory</option>
                  </select>
                  <button type="submit" className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-[#000E2D] p-3 font-medium text-white">
                    <Plus size={16} /> Save adjustment
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="space-y-6">
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {reportMetrics.map((metric) => (
                  <div key={metric.label} className="card rounded-2xl p-4">
                    <p className="text-sm text-[#868F9E]">{metric.label}</p>
                    <p className="mt-4 table-mono text-2xl font-semibold text-[#000E2D]">{metric.value}</p>
                  </div>
                ))}
              </section>

              <div className="card rounded-3xl p-5">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Performance overview</h3>
                  <div className="badge bg-[#F4EAE8] text-[#000E2D]">Sales vs purchases</div>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.chartData.sales.map((entry, index) => ({ name: entry.name, sales: entry.sales, purchases: [5400, 6100, 7000, 8200, 9100, 9800][index] }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E1E2" />
                      <XAxis dataKey="name" stroke="#868F9E" />
                      <YAxis stroke="#868F9E" />
                      <Tooltip formatter={(value) => currency.format(Number(value ?? 0))} />
                      <Bar dataKey="sales" fill="#000E2D" radius={[8, 8, 0, 0]} />
                      <Bar dataKey="purchases" fill="#868F9E" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {(activeTab === 'shopify' || activeTab === 'stockpush') && <div className="space-y-5"><div className="card rounded-3xl p-5"><h3 className="mb-4 text-xl font-semibold">Shopify Integration</h3><p>Online sales {currency.format(shopifyMetrics.onlineSales)} ? Orders {shopifyMetrics.orderCount} ? Average order {currency.format(shopifyMetrics.avgOrderValue)}</p></div><ProductChannelHub products={data.products as unknown as ProductRecord[]} onRefresh={refreshDashboard} /></div>}

          {activeTab === 'settings' && (
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="card rounded-3xl p-5">
                <h3 className="mb-4 text-lg font-semibold">Business profile</h3>
                <div className="space-y-3 text-sm text-[#000E2D]">
                  <div className="flex justify-between rounded-xl border border-[#E2E1E2] bg-[#F4EAE8] p-3"><span>Business name</span><span className="font-semibold">Keen Scents</span></div>
                  <div className="flex justify-between rounded-xl border border-[#E2E1E2] bg-[#F4EAE8] p-3"><span>Currency</span><span className="font-semibold">USD</span></div>
                  <div className="flex justify-between rounded-xl border border-[#E2E1E2] bg-[#F4EAE8] p-3"><span>Time zone</span><span className="font-semibold">America/New_York</span></div>
                  <div className="flex justify-between rounded-xl border border-[#E2E1E2] bg-[#F4EAE8] p-3"><span>Default units</span><span className="font-semibold">oz / unit</span></div>
                </div>
              </div>
              <div className="card rounded-3xl p-5">
                <h3 className="mb-4 text-lg font-semibold">Operational preferences</h3>
                <div className="space-y-3 text-sm text-[#000E2D]">
                  <div className="flex items-center justify-between rounded-xl border border-[#E2E1E2] bg-[#F4EAE8] p-3"><span>Low-stock alerts</span><span className="font-semibold text-emerald-600">On</span></div>
                  <div className="flex items-center justify-between rounded-xl border border-[#E2E1E2] bg-[#F4EAE8] p-3"><span>Shopify sync</span><span className="font-semibold text-amber-600">Pending</span></div>
                  <div className="flex items-center justify-between rounded-xl border border-[#E2E1E2] bg-[#F4EAE8] p-3"><span>Inventory costing</span><span className="font-semibold">Weighted average</span></div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
