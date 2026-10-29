# Keenventory

Inventory, recipes, manufacturing, and product management backed by SQLite.

Account setup is required before accessing business data. Follow [ACCOUNTS.md](ACCOUNTS.md)
to configure authentication/email and send the secure one-time owner activation.

On Render (`RENDER=true`), authentication uses the edge-provided `CF-Connecting-IP` header, with `True-Client-IP` as a fallback, to separate rate limits by client. Other hosts retain Better Auth's default IP handling. No additional Render environment settings are needed for this configuration.

Run `npm install`, then `npm run dev`. Use `npm test` for automated checks and `npm run build` for production. On Windows PowerShell with script execution disabled, use `npm.cmd` in place of `npm`.

Copy `.env.example` to `.env.local` and fill in the integrations you use. Keep the SQLite data directory on persistent storage and back it up before deploying updates. `KEENVENTORY_DATA_DIR` defaults to the project's `data` directory. Product migrations preserve existing records and carry stock into location balances and baseline ledger entries.

Profile images, product images, and attachments can use the same persistent disk as SQLite. On Render, attach a disk, set `KEENVENTORY_DATA_DIR` to its mount path (for example `/var/data`), and set `KEENVENTORY_MEDIA_STORAGE=disk`. Files are stored privately under `/var/data/uploads` and served through authenticated application routes. Keep your existing data directory if already configured; changing it opens a different database. Back up the entire directory, including uploads and SQLite, together.

Disk storage is the default when S3 credentials are absent. Existing S3 installations continue using S3 unless disk storage is explicitly selected. To use a private S3-compatible bucket instead, set `KEENVENTORY_MEDIA_STORAGE=s3` and configure the `S3_*` settings in `.env.example`. Existing S3 files still require their credentials to read or delete after switching new uploads to disk; files are not automatically migrated.

Image uploads are validated, resized, and stored as WebP files; video attachments retain their validated MP4 or WebM format. The database keeps associations. Copied products share image references only when requested. Removing one association preserves images used by other products.

Configure the Shopify shop domain and Admin API token to enable mapping, inventory previews, pushes, and explicit SKU reconciliation. Select the permanent variant ID and local/remote locations in the Listings tab. Stock Push updates available inventory only. Live storage and Shopify access must be checked with configured services; automated integration tests use local mock servers.

Product imports require validation and confirmation. Matches use case-insensitive SKU, including archived records. Updates preserve omitted fields, SKU casing, inventory balances, and unit costs. Blank CSV cells are omitted values; use the edit form to clear a description. Starting quantities apply only to new records when explicit opening inventory import is selected. Changing import options or product matches requires another preview.

Use inventory actions for stock changes after creation. Cancelled orders and purchases cannot move inventory. Merging requires compatible products without open source manufacturing, reservations, purchases, or consignment, and preserves history. Products with protected references must be archived instead of permanently deleted.
