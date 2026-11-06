Editable material tracking units
================================

Saved materials now offer an editable Tracking Unit field. Choose a known weight,
volume or count unit (or retain/type a custom unit), then Review Unit Change.
The confirmation dialog shows original/converted stock and unit cost, inventory
values and rounding difference, recipe ingredient count and affected open batches.
Confirm Unit Change saves the conversion separately; Cancel/Escape changes nothing.
Other material form fields remain drafts and are not discarded by a unit conversion.

Known unit identifiers cover mg, g, kg, oz, lb, ml, L, U.S. fl oz, U.S. gal, Each,
Pieces, Packs, Boxes, Bags, Bottles and Rolls. Each/Pieces share individual-count
meaning; packages such as packs, bags and bottles have distinct meanings. Existing
custom unit labels are preserved. Ounces by mass never automatically convert to
fluid ounces, and mass/volume/count changes require a positive material-specific
factor. For example, Bottles -> fl oz with factor 16 explicitly means one bottle
contains 16 U.S. fluid ounces. Confirmed factors and their inverses are reusable
for future purchasing and subsequent tracking-unit changes for that material only.

The conversion updates current stock, low-stock threshold, unit cost, stable unit_id
and unit_version atomically. Preferred reorder quantities without a purchase/package
unit are converted as tracking-unit quantities; packaged reorder counts stay counts.
Supplier purchase quantities, package units, prices, supplier SKUs, reorder URLs,
registered barcode/QR package quantities and material IDs remain intact.

Recipe ingredients referencing the material convert to the new tracking unit while
retaining their physical measurement. Draft/Scheduled/In Progress manufacturing
snapshots and reservations convert too, and both original and converted snapshots
are retained in the unit-change audit record. Completed batches and their consumption
are not rewritten. Purchase receipt quantities and unit costs are not rewritten.

Unit changes create a material_unit_changes record, an audit log, a zero-delta Unit
change ledger entry and an inventory snapshot in one transaction. An idempotency
key prevents repeat conversions on retry. The preview token binds stock, costs,
recipes, open snapshots, supplier packaging and ledger state; changes after preview
require another review. Stale manufacturing, receiving and adjustment screens are
rejected using unit_version rather than accepting quantities in obsolete units.

Material costs now accept twelve decimal places and persist an exact decimal text
representation alongside the existing numeric column. The old integer micro-dollar
cache is populated only when the value is exactly representable there. Existing
costs are preserved. Converted costs retain up to twelve fractional digits and fifteen significant digits
so the compatibility numeric field matches the reviewed cost. Quantity conversion
retains the existing six-decimal inventory
precision. The preview explicitly discloses the resulting value rounding difference;
conversions that would reduce nonzero quantities or costs to zero are rejected.

Ledger/snapshot/receipt recorded_unit columns retain the unit at transaction time.
The additive migration labels pre-conversion material history with its existing
tracking unit (tracking-unit changes were previously blocked). Future inserts record
units automatically. Stock History displays original units and original unit costs;
material-cost permissions still apply. Manufacturing history displays snapshot units.
Historical reports convert material quantities into current units and show a warning,
while original database transactions remain unchanged. A zero-delta Unit change entry
is never counted as received or consumed physical stock.

Permissions: materials/edit, materialCosts/edit and adjustments/create. Recipe edits
and manufacturing edits are additionally required when affected recipes/open batches
exist. View-only users see the unit without editing controls.

Validation:
  npm test
  npm run lint
  npm run build
  node --import tsx scripts/check-unit-change-ui.mjs

Tests cover conversions, original history preservation, recipe and reservation
meaning, completed manufacturing costs, retries, stale previews and clients,
registered barcode lookup, custom package factors, purchase receiving and roles.
Browser checks cover review/cancel/confirm, displayed balances/costs, history unit
labels, persistence, barcode results and explicit incompatible-unit factors.
