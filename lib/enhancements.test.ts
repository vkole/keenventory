import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { TestRequest as Request, setupTestOwner } from "./authTestSupport";
import { saveProduct, product } from "./productStore";
import { instant } from "./calendarDates";
import { defaults, type Viewer } from "./permissions";
test("persistent calendars, content, document review, atomic imports, actual reports and protected recipe history", async () => {
  const folder = mkdtempSync(path.join(tmpdir(), "keenventory-enhancements-"));
  process.env.KEENVENTORY_DATA_DIR = folder;
  const { db } = await import("./db");
  await setupTestOwner();
  const { viewer } = await import("./access");
  const user = (await viewer(new Request("http://localhost").headers))!;
  const call = async (
    route: { [key: string]: any },
    method: string,
    url: string,
    body?: unknown,
  ) => {
    const r = await route[method](
      new Request("http://localhost/api/" + url, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
    const data = await r.json();
    assert.equal(r.status, 200, JSON.stringify(data));
    return data;
  };
  try {
    const id = saveProduct(db, {
      name: "Import candle",
      sku: "IMPORT-CANDLE",
      stock_quantity: 20,
      cost_per_unit: 4,
      retail_price: 12,
    });
    const calendar = await import("../app/api/calendar/route"),
      content = await import("../app/api/content/route");
    const draft = {
      title: "Launch",
      date: "2026-11-07",
      time: "09:30",
      timezone: "America/New_York",
      status: "Scheduled",
      description: "Test launch",
      notes: "Bring candles",
    };
    const event = await call(calendar, "POST", "calendar", draft);
    assert.ok(
      (await call(calendar, "GET", "calendar")).events.some(
        (e: any) => e.id === "event:" + event.id,
      ),
    );
    await call(calendar, "PATCH", "calendar", {
      ...draft,
      id: event.id,
      date: "2026-11-08",
    });
    assert.equal(
      (
        db
          .prepare("SELECT starts_at FROM calendar_events WHERE id=?")
          .get(event.id) as any
      ).starts_at,
      "2026-11-08T14:30:00.000Z",
    );
    const entry = await call(content, "POST", "content", {
      ...draft,
      platform: "Instagram",
      content_type: "Photo",
      product_ids: [id],
      assigned_user: user.id,
    });
    await call(content, "PATCH", "content", {
      ...draft,
      id: entry.id,
      platform: "Instagram",
      content_type: "Photo",
      product_ids: [id],
      status: "Published",
    });
    assert.equal(
      (await call(content, "GET", "content")).events.find(
        (e: any) => e.id === "content:" + entry.id,
      ).status,
      "Published",
    );
    assert.throws(
      () => instant("2026-03-08", "02:30", "America/New_York"),
      /exist|valid/i,
    );
    assert.equal(
      instant("2026-11-01", "09:00", "America/New_York"),
      "2026-11-01T14:00:00.000Z",
    );
    const imports = await import("../app/api/imports/route");
    const upload = async (kind: string, filename: string, bytes: BlobPart) => {
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", new File([bytes], filename));
      const r = await imports.POST(
        new Request("http://localhost/api/imports", {
          method: "POST",
          body: form,
        }),
      );
      const result = await r.json();
      assert.equal(r.status, 200, JSON.stringify(result));
      return result;
    };
    const document = await upload(
      "products",
      "products.csv",
      "Product Name,SKU,Stock Quantity,Cost Price,Scent\nLavender,IMPORTED-NEW,7,3,Lavender\n",
    );
    const rows = document.rows;
    const preview = await call(imports, "POST", "imports", {
      id: document.id,
      rows,
      opening: true,
      timezone: "America/New_York",
    });
    assert.equal(preview.failed, 0);
    const result = await call(imports, "POST", "imports", {
      id: document.id,
      rows,
      opening: true,
      timezone: "America/New_York",
      confirm: true,
      preview_hash: preview.hash,
    });
    assert.equal(result.created, 1);
    const imported = db
      .prepare("SELECT * FROM products WHERE sku=?")
      .get("IMPORTED-NEW") as any;
    assert.equal(imported.stock_quantity, 7);
    assert.equal(imported.scent, "Lavender");
    const again = await call(imports, "POST", "imports", {
      id: document.id,
      rows,
      opening: true,
      timezone: "America/New_York",
      confirm: true,
      preview_hash: preview.hash,
    });
    assert.equal(again.created, 1);
    assert.equal(product(db, imported.id).stock_quantity, 7);
    const csv =
      "Order Number,Order Date,Customer Name,Sales Channel,Product SKU,Quantity,Unit Price,Payment Status,Fulfillment Status\nORDER-A,2026-10-29,Customer,Direct,IMPORT-CANDLE,2,12,Paid,Fulfilled\nORDER-B,2026-10-29,Customer,Direct,IMPORT-CANDLE,3,12,Unpaid,Draft\nORDER-C,2026-10-29,Customer,Direct,IMPORT-CANDLE,1,12,Unpaid,Cancelled\n";
    const sales = await upload("orders", "orders.csv", csv);
    const checked = await call(imports, "POST", "imports", {
      id: sales.id,
      rows: sales.rows,
      timezone: "America/New_York",
    });
    assert.equal(checked.failed, 0);
    await call(imports, "POST", "imports", {
      id: sales.id,
      rows: sales.rows,
      timezone: "America/New_York",
      confirm: true,
      preview_hash: checked.hash,
    });
    assert.equal(product(db, id).stock_quantity, 18);
    assert.equal(product(db, id).reserved, 0);
    await call(imports, "POST", "imports", {
      id: sales.id,
      rows: sales.rows,
      timezone: "America/New_York",
      confirm: true,
      preview_hash: checked.hash,
    });
    assert.equal(product(db, id).stock_quantity, 18);
    const other = await upload("orders", "duplicate.csv", csv);
    const dup = await call(imports, "POST", "imports", {
      id: other.id,
      rows: other.rows,
      timezone: "America/New_York",
    });
    assert.ok(dup.rows.every((r: any) => r.action === "skip"));
    const { buildReport } = await import("./reporting");
    const legacyDateOrder = Number(
      db
        .prepare(
          "INSERT INTO sales_orders(customer,status,total,channel,order_date) VALUES('Date-only customer','Pending',5,'DateOnly','2026-10-29')",
        )
        .run().lastInsertRowid,
    );
    assert.equal(
      buildReport(
        db,
        user,
        new URLSearchParams({
          type: "revenue",
          start: "2026-10-29",
          end: "2026-10-29",
          channel: "DateOnly",
          timezone: "America/New_York",
        }),
      ).summary.value,
      5,
    );
    const { calendarItems } = await import("./calendarStore");
    const allDay = calendarItems(db, user).find(
      (e) => e.record_type === "order" && e.record_id === legacyDateOrder,
    );
    assert.equal(allDay?.all_day, true);
    assert.equal(allDay?.source_date, "2026-10-29");
    const openingId = (
      db
        .prepare(
          "SELECT id FROM inventory_ledger WHERE product_id=? AND kind='Opening'",
        )
        .get(id) as { id: number }
    ).id;
    db.prepare(
      "UPDATE inventory_ledger SET created_at='2026-10-20T12:00:00Z' WHERE id=?",
    ).run(openingId);
    db.prepare(
      "INSERT INTO inventory_snapshots(item_type,item_id,location,quantity,unit_cost,recorded_at,ledger_id) VALUES('product',?,?,20,4,'2026-10-21T12:00:00Z',?)",
    ).run(id, product(db, id).location, openingId);
    db.prepare(
      "UPDATE inventory_ledger SET created_at='2026-10-22T12:00:00Z' WHERE product_id=? AND kind='Sale'",
    ).run(id);
    assert.equal(
      buildReport(
        db,
        user,
        new URLSearchParams({
          type: "stock",
          start: "2026-10-21",
          end: "2026-10-21",
          product_id: String(id),
          timezone: "UTC",
        }),
      ).summary.value,
      20,
    );
    assert.equal(
      buildReport(
        db,
        user,
        new URLSearchParams({
          type: "stock",
          start: "2026-10-22",
          end: "2026-10-22",
          product_id: String(id),
          timezone: "UTC",
        }),
      ).summary.value,
      18,
    );
    const report = buildReport(
      db,
      user,
      new URLSearchParams({
        type: "revenue",
        start: "2026-10-29",
        end: "2026-10-29",
        timezone: "America/New_York",
      }),
    );
    assert.equal(report.summary.value, 29);
    const historic = buildReport(
      db,
      user,
      new URLSearchParams({
        type: "stock",
        start: "1900-01-01",
        end: "1900-01-01",
      }),
    );
    assert.equal(historic.rows.length, 0);
    const { exportReport } = await import("./reportExport");
    for (const format of ["csv", "xlsx", "pdf"]) {
      const output = await exportReport(report, format);
      assert.ok(output.bytes.length > 100);
      if (format === "pdf")
        assert.equal(output.bytes.toString("ascii", 0, 5), "%PDF-");
      if (format === "xlsx") assert.equal(output.bytes.readUInt16LE(0), 0x4b50);
      if (format === "pdf") {
        const parsed = await upload(
          "orders",
          "review.pdf",
          new Uint8Array(output.bytes),
        );
        assert.match(parsed.extracted_text, /Revenue/);
        assert.equal(parsed.rows[0]["Fulfillment Status"], "Draft");
      }
    }
    const ExcelJS = (await import("exceljs")).default,
      book = new ExcelJS.Workbook();
    book.addWorksheet("Products").addRows([
      ["Product Name", "SKU"],
      ["Excel candle", "EXCEL-CANDLE"],
    ]);
    const sheet = await upload(
      "products",
      "products.xlsx",
      new Uint8Array(await book.xlsx.writeBuffer()),
    );
    assert.equal(sheet.rows[0].SKU, "EXCEL-CANDLE");
    const { importPreview } = await import("./importStore");
    const restricted = {
      ...user,
      role: "View Only",
      permissions: defaults("View Only"),
    } as Viewer;
    assert.throws(
      () =>
        buildReport(db, restricted, new URLSearchParams({ type: "revenue" })),
      /permission|access/i,
    );
    assert.throws(
      () =>
        importPreview(
          db,
          "products",
          [
            {
              "Product Name": "No cost access",
              SKU: "HIDDEN",
              "Cost Price": "5",
            },
          ],
          "skip",
          restricted,
          false,
          "UTC",
        ),
      /permission|access/i,
    );
    const order = db
      .prepare("SELECT id FROM sales_orders WHERE order_number='ORDER-A'")
      .get() as any;
    await call(calendar, "POST", "calendar", {
      ...draft,
      record_type: "order",
      record_id: order.id,
    });
    assert.equal(product(db, id).stock_quantity, 18);
    assert.equal(
      (
        db
          .prepare("SELECT scheduled_at FROM sales_orders WHERE id=?")
          .get(order.id) as any
      ).scheduled_at,
      "2026-11-07T14:30:00.000Z",
    );
    await call(calendar, "DELETE", "calendar", {
      id: "order:" + order.id,
      confirm: true,
    }).catch(async () => {
      const entries = await call(calendar, "GET", "calendar");
      const linked = entries.events.find(
        (e: any) => e.record_type === "order" && e.record_id === order.id,
      );
      await call(calendar, "DELETE", "calendar", {
        id: linked.id,
        confirm: true,
      });
    });
    assert.ok(
      db.prepare("SELECT id FROM sales_orders WHERE id=?").get(order.id),
    );
    await call(content, "DELETE", "content", { id: entry.id, confirm: true });
    assert.ok(
      !(await call(content, "GET", "content")).events.some(
        (e: any) => e.id === "content:" + entry.id,
      ),
    );
    // A stale stock preview must fail atomically, leaving neither orders nor deductions.
    const shortage = await upload(
      "orders",
      "shortage.csv",
      csv
        .replaceAll("ORDER-A", "ATOMIC-A")
        .replaceAll("ORDER-B", "ATOMIC-B")
        .replaceAll("ORDER-C", "ATOMIC-C")
        .replace("IMPORT-CANDLE,2,", "IMPORT-CANDLE,200,"),
    );
    const invalid = await call(imports, "POST", "imports", {
      id: shortage.id,
      rows: shortage.rows,
      timezone: "America/New_York",
    });
    assert.ok(invalid.failed > 0);
    const rejected = await imports.POST(
      new Request("http://localhost/api/imports", {
        method: "POST",
        body: JSON.stringify({
          id: shortage.id,
          rows: shortage.rows,
          timezone: "America/New_York",
          confirm: true,
          preview_hash: invalid.hash,
        }),
      }),
    );
    assert.equal(rejected.status, 400);
    assert.equal(product(db, id).stock_quantity, 18);
    assert.ok(
      !db
        .prepare("SELECT id FROM sales_orders WHERE order_number='ATOMIC-A'")
        .get(),
    );
    const recipes = await import("../app/api/recipes/route");
    const material = db
      .prepare("SELECT * FROM materials ORDER BY id LIMIT 1")
      .get() as any;
    const recipe = await call(recipes, "POST", "recipes", {
      name: "Protected recipe",
      product_id: id,
      version: 1,
      batch_yield: 2,
      batch_minutes: 10,
      hourly_labor_rate: 12,
      status: "Active",
      description: "Stored description",
      preparation_notes: "Prepare carefully",
      safety_notes: "Wear protection",
      ingredients: [
        {
          material_id: material.id,
          item_name: material.name,
          quantity: 1,
          unit: material.unit,
          item_type: "material",
        },
      ],
    });
    assert.equal(
      (
        db
          .prepare("SELECT description FROM recipes WHERE id=?")
          .get(recipe.id) as any
      ).description,
      "Stored description",
    );
    const { createBatch } = await import("./manufacturing");
    createBatch(db, {
      recipe_id: recipe.id,
      product_id: id,
      planned_quantity: 1,
      request_key: randomUUID(),
    });
    const blocked = await recipes.DELETE(
      new Request("http://localhost/api/recipes", {
        method: "DELETE",
        body: JSON.stringify({ id: recipe.id }),
      }),
    );
    assert.equal(blocked.status, 400);
    assert.ok(db.prepare("SELECT id FROM recipes WHERE id=?").get(recipe.id));
    await call(recipes, "PATCH", "recipes", {
      id: recipe.id,
      action: "archive",
    });
    db.prepare(
      "UPDATE organization_memberships SET role=?,permissions=? WHERE user_id=?",
    ).run("View Only", JSON.stringify(defaults("View Only")), user.id);
    const denied = await content.POST(
      new Request("http://localhost/api/content", {
        method: "POST",
        body: JSON.stringify({
          ...draft,
          platform: "Instagram",
          content_type: "Photo",
        }),
      }),
    );
    assert.equal(denied.status, 403);
    assert.equal(
      (
        await imports.GET(
          new globalThis.Request("http://localhost/api/imports?kind=orders"),
        )
      ).status,
      401,
    );
    db.prepare(
      "UPDATE organization_memberships SET role=?,permissions=? WHERE user_id=?",
    ).run("Manager", JSON.stringify(defaults("Manager")), user.id);
    const copied = await call(recipes, "POST", "recipes", {
      name: "Copy without financial access",
      product_id: id,
      copy_from: recipe.id,
      version: 2,
      batch_yield: 2,
      batch_minutes: 10,
      status: "Draft",
      ingredients: [
        {
          material_id: material.id,
          item_name: material.name,
          quantity: 1,
          unit: material.unit,
          item_type: "material",
        },
      ],
    });
    assert.equal(
      (
        db
          .prepare("SELECT hourly_labor_rate FROM recipes WHERE id=?")
          .get(copied.id) as { hourly_labor_rate: number }
      ).hourly_labor_rate,
      12,
    );
    assert.equal("hourly_labor_rate" in copied, false);
  } finally {
    db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
