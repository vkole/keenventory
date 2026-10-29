import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import type { ImportRow } from "./importTypes";
export { productImportFields, orderImportFields } from "./importTypes";
export type { ImportRow } from "./importTypes";
export function csvRows(text: string): ImportRow[] {
  const first = text.split(/\r?\n/)[0] ?? "";
  const delimiter = ["\t", ";", ","].sort(
    (a, b) => first.split(b).length - first.split(a).length,
  )[0];
  const rows = parse(text, {
    bom: true,
    skip_empty_lines: true,
    trim: true,
    delimiter,
    columns: (names: string[]) => {
      if (new Set(names.map((n) => n.toLowerCase())).size !== names.length)
        throw Error("Spreadsheet column names must be unique.");
      return names;
    },
  }) as ImportRow[];
  if (rows.length > 5000) throw Error("Import at most 5,000 rows at a time.");
  return rows;
}
function zipLimit(bytes: Buffer) {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw Error("Invalid Excel file.");
  const count = bytes.readUInt16LE(eocd + 10);
  let offset = bytes.readUInt32LE(eocd + 16),
    size = 0;
  if (count > 20000) throw Error("Workbook contains too many entries.");
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50)
      throw Error("Invalid Excel directory.");
    size += bytes.readUInt32LE(offset + 24);
    if (size > 50 * 1024 * 1024)
      throw Error("Expanded workbook exceeds 50 MB.");
    offset +=
      46 +
      bytes.readUInt16LE(offset + 28) +
      bytes.readUInt16LE(offset + 30) +
      bytes.readUInt16LE(offset + 32);
  }
}
export async function parseImportFile(file: File, kind: string) {
  if (file.size > 10 * 1024 * 1024)
    throw Error("Import files must be 10 MB or smaller.");
  const bytes = Buffer.from(await file.arrayBuffer()),
    ext = file.name.split(".").at(-1)?.toLowerCase();
  let rows: ImportRow[] = [],
    text = "";
  if (ext === "csv") rows = csvRows(bytes.toString("utf8"));
  else if (ext === "xlsx") {
    zipLimit(bytes);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes as never);
    const sheet = book.worksheets[0];
    if (!sheet || sheet.rowCount > 5001 || sheet.columnCount > 100)
      throw Error(
        "Use a worksheet with at most 5,000 data rows and 100 columns.",
      );
    const headers = (sheet.getRow(1).values as ExcelJS.CellValue[])
      .slice(1)
      .map((v, i) => String(v ?? "Column " + (i + 1)));
    if (new Set(headers).size !== headers.length)
      throw Error("Spreadsheet column names must be unique.");
    sheet.eachRow((row, i) => {
      if (i === 1) return;
      const result: ImportRow = {};
      headers.forEach((h, c) => {
        const cell = row.getCell(c + 1);
        const value = cell.value;
        result[h] =
          value instanceof Date
            ? value.toISOString().slice(0, 10)
            : typeof value === "object" && value && "formula" in value
              ? String(value.result ?? "")
              : cell.text;
      });
      rows.push(result);
    });
  } else if (ext === "pdf" && kind === "orders") {
    if (bytes.toString("ascii", 0, 5) !== "%PDF-")
      throw Error("Invalid PDF file.");
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: true,
    });
    const doc = await task.promise;
    try {
      if (doc.numPages > 100)
        throw Error("PDF imports are limited to 100 pages.");
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i),
          items = await page.getTextContent();
        const lines = new Map<number, { x: number; s: string }[]>();
        for (const item of items.items) {
          if (!("str" in item)) continue;
          const y = Math.round(item.transform[5] / 3) * 3;
          const line = lines.get(y) ?? [];
          line.push({ x: item.transform[4], s: item.str });
          lines.set(y, line);
        }
        text +=
          [...lines]
            .sort(([a], [b]) => b - a)
            .map(([, items]) =>
              items
                .sort((a, b) => a.x - b.x)
                .map((i) => i.s)
                .join("\t"),
            )
            .join("\n") + "\n";
        if (text.length > 2000000)
          throw Error("Extracted PDF text is too large.");
      }
    } finally {
      await task.destroy();
    }
    const header = text
      .split("\n")
      .findIndex((l) => /Order Number/i.test(l) && /Product SKU/i.test(l));
    if (header >= 0) {
      try {
        rows = csvRows(text.split("\n").slice(header).join("\n"));
      } catch {
        rows = [];
      }
    }
    if (!rows.length) {
      const order =
          text.match(
            /(?:Order|Invoice)\s*(?:Number|No\.?|#)\s*[:#]?\s*([A-Za-z0-9._-]+)/i,
          )?.[1] ?? "",
        email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "",
        date = text.match(/\b20\d\d-\d\d-\d\d\b/)?.[0] ?? "";
      rows = [
        {
          "Order Number": order,
          "Order Date": date,
          "Customer Name": "",
          "Customer Email": email,
          "Sales Channel": "Document",
          "Product SKU": "",
          Quantity: "",
          "Unit Price": "",
          "Fulfillment Status": "Draft",
          "Payment Status": "Unpaid",
        },
      ];
    }
  } else throw Error("Choose CSV or Excel; Orders also accept PDF.");
  if (!rows.length) throw Error("The document has no data rows.");
  for (const row of rows)
    for (const [k, v] of Object.entries(row)) {
      if (String(v).length > 10000)
        throw Error("A spreadsheet cell exceeds 10,000 characters.");
      row[k] = String(v);
    }
  return {
    bytes,
    rows,
    text,
    contentType:
      ext === "pdf"
        ? "application/pdf"
        : ext === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "text/csv",
  };
}
