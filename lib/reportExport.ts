import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { stringify } from "csv-stringify/sync";
import sharp from "sharp";
import type { ReportResult } from "./reportTypes";
const safe = (value: unknown) =>
  typeof value === "string" && /^[=+\-@\t\r]/.test(value)
    ? "'" + value
    : (value ?? "");
export async function exportReport(report: ReportResult, format: string) {
  const columns = [
    "Label",
    "Value",
    "Previous Period",
    ...(report.rows.some((r) => r.revenue !== undefined)
      ? ["Revenue", "Production Cost"]
      : []),
  ];
  const metadata = [
    ["Report Title", report.title],
    ["Date Range", report.start + " to " + report.end],
    ["Timezone", report.timezone],
    ["Generation Date", report.generated_at],
    ["Applied Filters", JSON.stringify(report.filters)],
    ["Grouping", report.grouping],
    ["Summary", report.summary.value ?? "Unavailable"],
    ["Previous Summary", report.summary.previous ?? "Unavailable"],
    ["Warnings", report.warnings.join("; ")],
  ];
  const rows = report.rows.map((r) => [
    r.label,
    r.value ?? "Unavailable",
    r.previous ?? "",
    ...(columns.length > 3 ? [r.revenue ?? "", r.production_cost ?? ""] : []),
  ]);
  if (format === "csv")
    return {
      bytes: Buffer.from(
        stringify([...metadata, [], columns, ...rows].map((r) => r.map(safe))),
      ),
      type: "text/csv",
      extension: "csv",
    };
  if (format === "xlsx") {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Report");
    metadata.forEach((r) => sheet.addRow(r));
    sheet.addRow([]);
    const heading = sheet.addRow(columns);
    heading.font = { bold: true, color: { argb: "FFFFFFFF" } };
    heading.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF000E2D" },
    };
    rows.forEach((r) => sheet.addRow(r.map(safe)));
    sheet.columns.forEach((c, i) => {
      c.width = i === 0 ? 36 : 24;
    });
    sheet.views = [{ state: "frozen", ySplit: metadata.length + 2 }];
    const data = report.rows.slice(0, 12).filter((r) => r.value !== null),
      max = Math.max(1, ...data.map((r) => Math.abs(r.value!)));
    const escape = (s: string) =>
      s.replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&apos;",
          })[c]!,
      );
    if (data.length) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${data.length * 32 + 40}"><rect width="100%" height="100%" fill="white"/>${data.map((r, i) => `<text x="10" y="${i * 32 + 25}" font-size="12">${escape(r.label.slice(0, 32))}</text><rect x="270" y="${i * 32 + 10}" width="${(Math.abs(r.value!) / max) * 450}" height="19" fill="#868f9e"/><text x="730" y="${i * 32 + 25}" font-size="11">${r.value}</text>`).join("")}</svg>`;
      const image = book.addImage({
        buffer: await sharp(Buffer.from(svg)).png().toBuffer(),
        extension: "png",
      });
      const chart = book.addWorksheet("Chart");
      chart.addImage(image, {
        tl: { col: 0, row: 0 },
        ext: { width: 800, height: data.length * 32 + 40 },
      });
    }
    return {
      bytes: Buffer.from(await book.xlsx.writeBuffer()),
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: "xlsx",
    };
  }
  if (format !== "pdf") throw Error("Choose CSV, Excel or PDF.");
  const doc = new PDFDocument({ margin: 36, size: "A4" }),
    chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.fillColor("#000e2d").fontSize(19).text(report.title);
  doc.moveDown();
  doc.fontSize(9);
  metadata.slice(1).forEach(([k, v]) => doc.text(`${k}: ${v}`));
  doc.moveDown();
  const chartRows = report.rows.slice(0, 10).filter((r) => r.value !== null),
    max = Math.max(1, ...chartRows.map((r) => Math.abs(r.value!)));
  for (const row of chartRows) {
    if (doc.y > 700) doc.addPage();
    const y = doc.y;
    doc.text(row.label.slice(0, 34), 36, y, { width: 180 });
    doc
      .save()
      .fillColor("#868f9e")
      .rect(220, y, (Math.abs(row.value!) / max) * 220, 11)
      .fill()
      .restore();
    doc.text(String(row.value), 450, y, { width: 100 });
    doc.y = y + 20;
  }
  doc.moveDown();
  doc.fontSize(10).text(columns.join(" | "));
  doc.moveDown(0.5);
  for (const row of rows) {
    if (doc.y > 740) doc.addPage();
    doc.fontSize(8).text(row.join(" | "));
    doc.moveDown(0.4);
  }
  doc.end();
  return { bytes: await finished, type: "application/pdf", extension: "pdf" };
}
