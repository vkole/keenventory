export const MATERIAL_SKU_MAX_LENGTH = 128;
export type MaterialSkuMode = 'auto' | 'manual' | 'regenerate';
export function generateMaterialSku(name: string): string {
  const normalized = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/(\d+(?:\.\d+)?)\s*(FL\s*OZ|OZ|LBS?|KG|MG|ML|CM|MM|G|L)\b/g, (_match, size: string, unit: string) => size + unit.replace(/\s/g, ''))
    .replace(/[^A-Z0-9.\s-]/g, '')
    .replace(/[\s-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '');
  return normalized ? ('MAT-' + normalized).slice(0, 120).replace(/[.-]+$/g, '') : '';
}
export function validateMaterialSku(sku: string): string {
  const value = sku.trim();
  if (!value || value.length > MATERIAL_SKU_MAX_LENGTH || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value))
    throw Error('Enter a SKU of 1–128 letters, numbers, hyphens, underscores, or periods, starting with a letter or number.');
  return value;
}
