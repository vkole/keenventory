import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import type Database from 'better-sqlite3';
import {
  productSchema,
  products,
  saveProduct,
  type ProductRecord,
} from './productStore';
export const headers = [
  'Product Name',
  'SKU',
  'Category',
  'Description',
  'Measurement Unit',
  'Starting Quantity',
  'Unit Cost',
  'Sale Price',
  'Wholesale Price',
  'Low Stock Limit',
  'Status',
];
const keys = [
  'name',
  'sku',
  'category',
  'description',
  'measurement_type',
  'stock_quantity',
  'cost_per_unit',
  'retail_price',
  'wholesale_price',
  'reorder_threshold',
  'state',
];
export function previewImport(db: Database.Database, csv: string) {
  if (Buffer.byteLength(csv) > 3 * 1024 * 1024)
    throw Error('CSV must be smaller than 3 MB.');
  const rows = parse(csv, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: false,
  }) as Record<string, string>[];
  if (rows.length > 5000 || !rows.length)
    throw Error('Import 1 to 5,000 rows at a time.');
  const seen = new Set<string>();
  const existing = products(db);
  return rows.map((row, index) => {
    const input: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      if (row[h] !== undefined && row[h] !== '') input[keys[i]] = row[h];
    });
    const checked = productSchema.safeParse(input);
    const sku = String(input.sku ?? '').toLowerCase();
    const errors = checked.success
      ? []
      : checked.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    if (seen.has(sku)) errors.push('Duplicate SKU in CSV.');
    seen.add(sku);
    const match = existing.find((p) => p.sku.toLowerCase() === sku);
    return {
      row: index + 2,
      sku: String(input.sku ?? ''),
      name: String(input.name ?? ''),
      match_id: match?.id ?? null,
      archived: !!match?.archived_at,
      opening_quantity: checked.success ? checked.data.stock_quantity : 0,
      errors,
      input: checked.success ? checked.data : null,
      supplied_fields: Object.keys(input),
    };
  });
}
export function importProducts(
  db: Database.Database,
  csv: string,
  mode: string,
  opening: boolean,
) {
  const rows = previewImport(db, csv);
  if (rows.some((r) => r.errors.length))
    throw Error('Fix CSV validation errors before importing.');
  return db
    .transaction(() => {
      let created = 0,
        updated = 0,
        skipped = 0;
      for (const r of rows) {
        if (r.match_id) {
          if (mode !== 'update') {
            skipped++;
            continue;
          }
          if (r.archived)
            throw Error('Archived matches must be restored before updating.');
          const original = products(db).find((p) => p.id === r.match_id)!;
          saveProduct(db, {
            ...original,
            ...Object.fromEntries(
              r.supplied_fields
                .filter((field) => field !== 'sku')
                .map((field) => [field, (r.input as Record<string, unknown>)[field]]),
            ),
            id: r.match_id,
            stock_quantity: 0,
            location: original.location,
            parent_id: original.parent_id,
            attributes: JSON.parse(original.attributes),
            barcode: original.barcode,
            auto_manufacture: !!original.auto_manufacture,
            confirm_sku_change: false,
          });
          updated++;
        } else {
          saveProduct(db, {
            ...r.input,
            stock_quantity: opening ? r.input!.stock_quantity : 0,
          });
          created++;
        }
      }
      return { created, updated, skipped };
    })
    .immediate();
}
export { filterProducts } from './productFilters';
export const exportColumns: Record<
  string,
  (p: ProductRecord) => string | number
> = {
  'Product Name': (p) => p.name,
  SKU: (p) => p.sku,
  Category: (p) => p.category,
  Variation: (p) =>
    Object.entries(JSON.parse(p.attributes))
      .map(([k, v]) => `${k}: ${v}`)
      .join('; '),
  Location: (p) => p.location,
  'On Hand': (p) => p.stock_quantity,
  Reserved: (p) => p.reserved,
  Available: (p) => p.available,
  'Physical Count': () => '',
  Variance: () => '',
  'Unit Cost': (p) => p.cost_per_unit,
  'Inventory Value': (p) =>
    Number((p.stock_quantity * p.cost_per_unit).toFixed(2)),
  'Sale Price': (p) => p.retail_price,
  'Wholesale Price': (p) => p.wholesale_price,
  'Low Stock Limit': (p) => p.reorder_threshold,
  Status: (p) =>
    p.archived_at
      ? 'Archived'
      : p.available <= 0
        ? 'Out of Stock'
        : p.available <= p.reorder_threshold
          ? 'Low Stock'
          : 'In Stock',
};
export function reportColumns(report: string) {
  return report === 'worksheet'
    ? [
        'Product Name',
        'SKU',
        'Location',
        'On Hand',
        'Physical Count',
        'Variance',
      ]
    : report === 'prices'
      ? ['Product Name', 'Variation', 'SKU', 'Sale Price', 'Wholesale Price']
      : [
          'Product Name',
          'SKU',
          'Location',
          'On Hand',
          'Reserved',
          'Available',
          'Low Stock Limit',
          'Inventory Value',
          'Status',
        ];
}
export function csvReport(rows: ProductRecord[], columns: string[]) {
  return stringify([
    columns,
    ...rows.map((p) =>
      columns.map((c) => {
        const value = exportColumns[c](p);
        return typeof value === 'string' && /^[=+\-@\t\r]/.test(value)
          ? `'${value}`
          : value;
      }),
    ),
  ]);
}
