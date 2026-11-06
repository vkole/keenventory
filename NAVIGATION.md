Sidebar navigation
==================

Existing desktop menu items are Next.js links to section landing pages. Active
items remain links and carry aria-current=page. The original icons, labels, order,
colors and permission-dependent menu variants are retained. The same sidebar is
available on standalone material, category, recipe, supplier, barcode and settings
pages, so the section landing page remains reachable from their subpages.

Section roots use the application's actual routes:
  Dashboard: /
  Materials: /materials
  Recipes: /recipes
  Suppliers: /suppliers
  Barcode: /barcode
  Products, Components, Manufacturing, Orders, Purchases, Content Calendar,
  Reports, Settings and other existing dashboard modules: /?module=<section>

Customer information remains part of the existing Orders workflow. No separate
Customers page or new menu item is introduced. Existing query-based entry points,
including /?module=recipes and material ?new=1 / ?id=...&edit=1 links, still work.
The /recipes route now renders the primary recipe list directly.

Active highlighting follows URL prefixes on standalone subpages and the selected
module on dashboard pages. Each navigation drops record/edit/new parameters. An
already-active item also resets inline detail/edit state even when its URL has not
changed. Same-URL section resets refresh server data while preserving the document;
changed URLs use the Next.js router. Browser history and deep links remain supported.

Mobile retains the Module selector. Open returns to the selected section's landing
page even when the selector already has that value (native selects do not emit a
change event when reselecting an unchanged option).

A shared draft guard protects material, product, recipe and supplier editors. Plain
in-app links and section navigation ask before discarding changed drafts. Cancel
retains the current page and values; confirming discards the draft and navigates.
Successful saves clear their guard. Native document exits use beforeunload. Opening
a new tab or downloading/printing an image does not discard the current draft.

Read-only record detail overlays keep main navigation accessible. The original
record card and close/Escape controls are retained; read-only record details no
longer mark the rest of the application as an inaccessible modal.

Verification:
  npm test
  npm run lint
  npm run build
  node --import tsx scripts/check-navigation-ui.mjs

Browser coverage includes material create/edit resets, query cleanup, unsaved draft
accept/cancel, recipe creation-to-list, product detail-to-list, order record closing,
active highlighting, same-document navigation, mobile roots and restricted roles.
No database schema or stored records are changed by navigation.
