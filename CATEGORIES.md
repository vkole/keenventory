Material categories
===================

Create/Edit Material and recipe inline material creation use the shared searchable
Category dropdown. Open it, search existing names, or choose + Create Category.
Save Category persists the category immediately, selects it, and preserves the rest
of the material draft. Categories remain even when the draft is cancelled.

Manage Categories is available on the Materials list and inside the form; the full
management page is /materials/categories. Authorized users can rename categories,
edit descriptions, archive/restore them, and reassign materials to another active
category. Deletion requires zero assigned materials, including archived materials.
Both the API transaction and a database deletion guard enforce this rule.

material_categories stores a stable integer ID, organization_id, display name,
normalized unique name_key, description, archive state, and timestamps. Uniqueness
uses trimmed/collapsed whitespace, Unicode NFKC normalization, and lowercase names.
Case-insensitive duplicate creation selects the existing category instead of making
another. Archived duplicate names must be restored before reuse.

Materials reference material_categories through category_id. Existing category
strings migrate to shared IDs without changing material IDs, SKUs, quantities,
costs, inventory ledger entries, supplier relationships, or registered codes.
Case variants share one canonical category; uncategorized records use Miscellaneous
Materials. Existing preset category names are persisted once. Startup never restores
archived categories or recreates deleted presets simply because they were defaults.

The existing materials.category text column is retained for compatibility with
reports, inventory views, and existing integrations. A rename trigger updates that
cache across every associated material. Reads and saves resolve the stable ID,
so saving a stale form after a rename cannot recreate the old category name.
Legacy material creation requests that supply only a category name register/reuse
that category in the same transaction as saving the material. Product-to-component
conversion also attaches the category ID without replacing an existing association.

Archived categories remain visible on materials already assigned to them, and those
materials can still be edited. Archived categories are hidden from new assignments.
Categories are stored in the existing persistent SQLite database and shared by the
current organization, not kept in browser state or tied to an individual login.

Permissions follow Materials: view for listing, create or edit for registration,
edit for changes/archive/reassignment, and delete for deleting unused categories.
All mutation routes retain authentication, origin validation, and audit logging.

Verification:
  npm test
  npm run build
  node --import tsx scripts/check-barcode-ui.mjs

Coverage includes migration, concurrent duplicate registration, case-insensitive
reuse, persistence through a separate database connection and reinitialization,
rename propagation and stale forms, archive/restore, reassignment, deletion guards,
authorization, and browser creation/search/reuse after cancelling a material draft.
