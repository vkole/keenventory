# Keenventory enhancements

Content Calendar is available in the sidebar. Calendar entries, content plans, attachments, and import reviews persist in the existing workspace database. Content scheduling tracks team activity; it does not automatically publish to social platforms.

Business calendars link to the existing record. Rescheduling an order updates its planning date without changing its sales date. Removing a linked item from a calendar preserves the original business record and inventory history. **Open Original Record** opens the record in its module.

Recipes opens the searchable, paginated library. Create recipes at `/recipes/new`; view and edit them at `/recipes/:id` and `/recipes/:id/edit`. Duplicates retain image references safely. Recipes with manufacturing history must be archived instead of deleted. Costs and pricing continue to use the existing production formulas.

## Imports

Use **Import Products** or **Import Orders**, upload a document, map its columns, correct the preview, validate, and confirm. CSV templates are available in each dialog. Files are limited to 10 MB and 5,000 rows; Excel imports use the first worksheet. Product imports support CSV and XLSX. Orders also support PDF text extraction. Scanned PDFs require manual entry in the editable review; extracted text is never automatically treated as a validated sale.

Product updates preserve existing quantities and unit costs. Opening quantities apply only to new products when explicitly selected. Order numbers are unique within their sales channel, ignoring letter case. A repeated confirmation returns the original result. Qualifying fulfilled orders deduct stock once; pending orders reserve stock; draft and cancelled orders do neither. Discounts are line amounts, while shipping and tax apply once per order. Headers repeated across lines must agree. Original documents, validation errors, importing user, and results are retained in import history. Documents remain protected by account permissions.

## Reports

Reports offers 25 report types, 13 date presets, custom ranges, daily through yearly grouping, previous-period comparisons, compatible chart choices, and CSV, XLSX, and PDF exports. Excel and PDF exports include a chart preview. Every report uses stored transactions; no sample chart values are used.

Inventory reporting begins with a dated migration snapshot and follows recorded ledger movements. Historical periods without recorded quantities or costs show empty or unavailable results with an explanation. Legacy sales without historical unit costs are excluded from profit calculations and identified in the report warning. Historical imported sales do not acquire today's cost as a substitute for an unknown historical cost. Manufacturing history without cost snapshots shows unavailable costs. Inventory balances are as of the selected end date; movement and sales reports use the full selected range. Historical costs cannot be reconstructed from current prices.

## Deployment and permissions

The database changes are additive and run automatically at startup. Keep the existing SQLite database on the Render persistent disk specified by `KEENVENTORY_DATA_DIR`. Do not replace that database or reseed the service.

Product and recipe images and content media use the existing private S3-compatible storage configured in `.env.example`. Images support JPG, PNG, and WebP up to 8 MB. Content videos support MP4 and WebM up to 40 MB. Uploads are disabled until persistent object storage is configured. Files are served through authenticated routes, never a temporary Render filesystem directory.

Owners can assign **Calendars** and **Content Calendar** permissions in User Management. Existing standard role defaults gain the new permissions; customized permission sets are preserved. Report viewing and exports also check the underlying module and financial permissions. No financial access is added to a role by these migrations.

Validation commands:

```text
npm test
npm run build
node --import tsx scripts/check-enhancements-ui.mjs
```

The browser check uses an isolated temporary database and Microsoft Edge. It checks calendar navigation, content persistence, reports, imports, recipe navigation, and mobile layout without using production accounts or sending email.
