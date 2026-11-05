Supplier IDs, lookup, and purchase conversions
=============================================

Use the existing Suppliers & Contacts navigation or /suppliers to create and edit
suppliers. New supplier names generate SUP-NAME IDs immediately. Edit Supplier ID
Manually overrides the preview; automatic duplicates receive -002, -003, etc.
Allocation and insertion use one immediate SQLite transaction and a unique index
on organization_id + case-insensitive Supplier ID.

Suppliers now have an immutable application-assigned UUID for relationships and a
separate human-readable supplier_code. Existing numeric IDs and purchase supplier
name snapshots remain for compatibility. Additive migrations backfill UUIDs and
business IDs and migrate explicit materials.supplier_id links. Existing stock,
costs, recipes, ledger records, purchase totals, and unrelated records are retained.
Free-text supplier names are not automatically matched or registered as companies.

In Create/Edit Material, Supplier & Reordering supports ID lookup, name search,
and dropdown selection. A selected supplier supplies its current name, website,
and contact information. + Create Supplier opens an inline editor and selects the
saved supplier without resetting the material draft. Supplier creation and editing
respect vendors/create and vendors/edit permissions. The material lookup directory
requires materials/view; the Suppliers workspace requires vendors/view.

Supplier SKU is optional and always manually supplied. It is separate from the
company's Supplier ID and the material's SKU. material_suppliers stores each
material's supplier UUID, catalog SKU, direct product URL, packaging information,
purchase price, reorder quantity, and lead time. One supplier can be primary;
alternates retain independent details. Switching a primary supplier in the form
preserves the previous primary as an alternate. Legacy material columns remain as
compatibility caches; registered company names/websites come from the supplier table
when loading material details and barcode scan results.

Purchase Unit offers Each, Bottle, Bag, Box, Pack, Case, Jar, Roll, Pallet, and Other.
Quantity per Purchase Unit and Quantity Unit describe package contents. The preview
converts compatible mass, volume, or count units using Decimal.js. oz is a mass unit;
fl oz is explicitly a U.S. volume unit. No mass/volume conversion is made without
density. Custom matching tracking units can retain a 1:1 conversion.

Example: Bag, 10 lb, $32, tracked in oz -> 160 oz at $0.20/oz. Apply Calculated Unit
Cost explicitly fills the editable material unit cost without changing stock. Purchase
price and unit costs keep decimal input drafts; unit costs retain six decimal places.

Receive Purchase can receive tracking units or configured purchase units. The server
recalculates packaging quantity and cost from the saved material-supplier relation,
then updates the inventory, weighted unit cost, purchase receipt, ledger and audit
inside one transaction. Receipts retain the supplier UUID and the historical supplier
name at receipt time. Repeated receipt submissions use the existing idempotency key.

Reorder Material always opens the direct product URL when saved. Otherwise the
clearly labeled Visit Supplier Website link opens the supplier's main HTTPS website.
Supplier updates change future material displays without rewriting purchase history.

Verification: npm test; npm run build; node --import tsx scripts/check-barcode-ui.mjs.
The browser check covers inline creation, lookup errors, fractional package entry,
cost conversion, supplier edits, and reorder fallback alongside the scanner checks.

Unit-factor references:
https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors
https://www.nist.gov/system/files/documents/2025/12/30/appc-26-HB44-20251222.pdf
