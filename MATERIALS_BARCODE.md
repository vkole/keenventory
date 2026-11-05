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
