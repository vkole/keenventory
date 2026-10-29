import { db } from "@/lib/db";
import { featureApi } from "@/lib/featureApi";
import { buildReport, reportPermissions } from "@/lib/reporting";
import { exportReport } from "@/lib/reportExport";
export const dynamic = "force-dynamic";
export const GET = featureApi("reporting", "view", async (request, user) => {
  const params = new URL(request.url).searchParams;
  const report = buildReport(db, user, params),
    format = params.get("format");
  if (!format) return Response.json(report);
  reportPermissions(user, report.type, true);
  const output = await exportReport(report, format);
  return new Response(new Uint8Array(output.bytes), {
    headers: {
      "Content-Type": output.type,
      "Content-Disposition": `attachment; filename="keenventory-${report.type}.${output.extension}"`,
    },
  });
});
