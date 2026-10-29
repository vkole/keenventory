# Recipe planning and manufacturing

In Recipes, select inventory items by name, enter quantities **per finished unit**,
and choose a batch yield. Unit costs come from the inventory record's current
`cost_per_unit`; recipe editing cannot override inventory costs. Tracking units
must match; the planner does not silently convert ounces to grams.

Labor can be a fixed batch estimate, minutes per unit, or an estimate scaled from
a reference batch yield. Overhead is a fixed batch amount. Pricing guidance is
an estimate and never writes product or Shopify prices. Wholesale guidance uses
a clearly labeled 100% markup on manufacturing cost.

Save and reopen recipes from the library. Duplicate creates a new recipe record.
Product recipes are listed under their associated product in Products. Saving
or previewing a recipe never changes stock.

Create Manufacturing Batch opens Add Manufacture with the recipe and quantity.
Creating a draft reserves its requirements without deducting stock. Record actual
consumption, output, minutes, and labor rate, then complete the batch. Completion
atomically deducts all consumed materials/components and adds finished units;
retrying completion does not move inventory a second time. Zero output can record
a failed batch. Other drafts' reservations are protected.

Each draft stores its recipe version, ingredient requirements, inventory unit
costs, and estimated costs. Completed batches retain actual consumption and cost,
even if the saved recipe or inventory cost changes later. Legacy batches without
snapshots remain visible and cannot be completed through the new workflow.

Quantities use six decimal places; currency totals round to cents. Calculations
use decimal arithmetic before storage. Recipe and manufacturing writes validate
inventory identity and units on the server.

Run `npm test` for calculation and database transaction tests, and `npm run build`
for production validation. Tests create and remove an isolated temporary database.

SQLite storage defaults to `data/keenventory.db`. Set `KEENVENTORY_DATA_DIR` to a
persistent disk directory when deploying on Render. Use one service instance with
this SQLite database. Existing tables receive additive migrations automatically.
