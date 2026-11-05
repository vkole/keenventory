Material management and barcode scanning
========================================

Materials is integrated into the existing dashboard and is also available at /materials.
The main Barcode navigation opens /barcode. Existing material IDs, balances, recipes,
manufacturing records, purchasing records, accounts, and permissions are preserved.
Migrations are additive and run with the existing database initialization.

Material images reuse the existing image storage service and its S3 configuration.
For persistent cloud storage, set KEENVENTORY_MEDIA_STORAGE=s3 and configure S3_BUCKET,
S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION and, for compatible services,
S3_ENDPOINT / S3_FORCE_PATH_STYLE. No public bucket is necessary: authenticated API
routes serve the images. The existing disk mode is also supported; on Render it
requires KEENVENTORY_DATA_DIR on a persistent disk. Uploads accept JPEG, PNG and WebP,
up to 8 MB each and 12 images per material. Image bytes are validated and re-encoded.
Cloud credentials and deployment configuration are not modified by this change.

Barcode numbers remain strings, with unique assignments across all materials,
including archived materials. UPC-A, UPC-E, EAN-13, EAN-8, Code 128 and Code 39 are
supported using ZXing. Camera and image decodes require the user to confirm the value.
Manual entry accepts keyboard scanners ending with Enter. Failed decodes never
create material records. Recent scans suppress repeat events for ten seconds.

Camera access needs HTTPS (localhost is supported for development), browser camera
permission, and a working camera. Camera streams stop on detection, stop, navigation,
or component removal. Physical phone cameras and USB/Bluetooth scanners require
acceptance testing on the target devices.

Available inventory subtracts existing manufacturing reservations. Detail cards show
on-hand, reserved, and available quantities. Stock status uses available quantity.
Material edits never overwrite stock balances. Tracking unit and location are locked
once a ledger exists. Use Adjust Inventory for add/remove/physical counts. Adjustments
require an explicit confirmation, a reason, and adjustments/create permission. They
use an atomic ledger update, an audit entry, an idempotency key, and a stale-balance
check. Stock reserved for manufacturing cannot be removed by a quick adjustment.

Receive Purchase requires purchases/create and materialCosts/edit. Quantities and
unit cost are entered in the material's tracking unit. It can link to an existing
purchase order ID or create a received purchase order. Receiving adds a material
receipt, increases inventory, recalculates weighted unit cost, and records the ledger
and audit entry atomically. A linked existing order's overall status and header total
are retained because other lines may still be outstanding. Manufacturing continues
to deduct actual consumption through the existing workflow and ledger.

Supplier links accept public HTTPS URLs without credentials and open in a new tab.
The app does not fetch supplier pages, follow redirects server-side, or place orders.
Material cost fields follow materialCosts permissions. Archiving retains all history.
Deleting materials with quantities or historical dependencies is blocked; archive
those materials instead. Duplicate Material copies metadata with zero stock and
without copying barcode assignments or images.

Verification:
  npm test
  npm run lint
  npm run build
  node --import tsx scripts/check-barcode-ui.mjs

The browser check uses an isolated temporary database and an actual generated EAN-13
image to verify browser decoding. It uses installed Microsoft Edge via Playwright.

QR codes and fractional unit costs
---------------------------------
The Barcode sidebar label is unchanged. The scanner heading is now Barcode & QR
Code Scanner. QR Code, ITF and Data Matrix join the original barcode formats.
Scans are opaque lookup values; URLs in a scan are never automatically opened.

Save a material, then Edit Material > Generate QR Code. The authenticated server
creates and immediately registers a random KEENVENTORY:<UUID> identifier. Preview,
Download QR Image and Print QR Label are available on the edit and detail screens.
No supplier, account or secret data is encoded. Print opens an authenticated label
page with a Print Label button. To replace a label, deactivate its old code and
generate another. Clearing Active Code (or removing a saved row) and saving
invalidates lookup and label downloads without losing its identifier or history.
Existing code IDs now survive material edits. Deactivated codes remain reserved to
the original material to prevent accidental reassignment of old physical labels.

Cost inputs keep string drafts, including '.', '0.', and trailing zeros, while
editing. Final save rejects blank, negative, nonnumeric, or excessive precision
values. UNIT_COST_PRECISION in lib/unitCosts.ts sets the UI precision (six by default).
The supported cost range is 0 through 999999999.999999 per tracking unit.

SQLite does not provide an enforced fixed-decimal type just by declaring NUMERIC.
New material costs therefore additionally persist exact integer micro-dollar values
in cost_per_unit_micros (one dollar = 1,000,000 micros). The existing REAL column is
retained for compatibility with inventory, historical snapshots, and existing queries.
Existing material costs are not rewritten. Older workflows that change the REAL cost
invalidate the extra micro-dollar value through a trigger, preventing stale costs.
New material edits and material receipts update both values in their transaction.
Decimal.js handles multiplication, weighted purchase costs, recipes, manufacturing,
pricing calculations, and inventory valuation. Unit costs retain up to six decimal
places; final currency totals round to cents. The 108 oz x $0.1875 example is covered
by tests for both recipe estimates and completed manufacturing ($20.25).

Browser verification now covers actual EAN-13 and QR image decoding, QR generation,
live QR decoding with a synthetic Chromium camera video, decimal editing and reload,
and an unknown untrusted URL. Physical phone permissions/camera quality and real
USB/Bluetooth scanner hardware still require acceptance testing on target devices.
