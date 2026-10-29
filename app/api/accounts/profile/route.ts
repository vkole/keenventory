import { z } from "zod";
import { db } from "@/lib/db";
import { viewer, sameOrigin, audit } from "@/lib/access";
import { authentication } from "@/lib/auth";
import { imageStorageReady } from '@/lib/imageStorage';
export async function GET(request: Request) {
  const user = await viewer(request.headers);
  if (!user)
    return Response.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const profile = db
    .prepare("SELECT notifications FROM user_profiles WHERE user_id=?")
    .get(user.id) ?? { notifications: 1 };
  return Response.json(
    { user, profile,storage:imageStorageReady() },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    const user = await viewer(request.headers);
    if (!user)
      return Response.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    const p = z
      .object({
        name: z.string().trim().min(1).max(150),
        notifications: z.boolean(),
      })
      .parse(await request.json());
    const auth = await authentication();
    await auth.api.updateUser({
      headers: request.headers,
      body: { name: p.name },
    });
    db.prepare(
      "INSERT INTO user_profiles(user_id,notifications) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET notifications=excluded.notifications",
    ).run(user.id, p.notifications ? 1 : 0);
    audit(user, "Profile updated", user.id, true);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Profile update failed." }, { status: 400 });
  }
}
