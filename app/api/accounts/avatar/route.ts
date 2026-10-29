import { db } from "@/lib/db";
import { viewer, sameOrigin, audit } from "@/lib/access";
import { storeImage, readImage, deleteImage } from "@/lib/imageStorage";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await viewer(request.headers);
  if (!user) return new Response("Authentication required", { status: 401 });
  const image = db
    .prepare("SELECT object_key FROM profile_images WHERE user_id=?")
    .get(user.id) as { object_key: string } | undefined;
  if (!image) return new Response("No profile image", { status: 404 });
  try {
    return new Response(await readImage(image.object_key), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Image storage unavailable", { status: 503 });
  }
}
export async function POST(request: Request) {
  let key: string | undefined;
  try {
    sameOrigin(request);
    const user = await viewer(request.headers);
    if (!user)
      return Response.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) throw Error("Choose a profile image.");
    key = await storeImage(file);
    const previous = db
      .prepare("SELECT object_key FROM profile_images WHERE user_id=?")
      .get(user.id) as { object_key: string } | undefined;
    db.transaction(() => {
      db.prepare(
        "INSERT INTO profile_images(user_id,object_key) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET object_key=excluded.object_key",
      ).run(user.id, key);
      db.prepare("UPDATE user SET image=? WHERE id=?").run(
        "/api/accounts/avatar",
        user.id,
      );
      audit(user, "Profile image updated", user.id, true);
    }).immediate();
    key = undefined;
    if (previous) await deleteImage(previous.object_key).catch(() => {});
    return Response.json({ ok: true });
  } catch (e) {
    if (key) await deleteImage(key).catch(() => {});
    return Response.json(
      { error: e instanceof Error ? e.message : "Image upload failed." },
      { status: 400 },
    );
  }
}
export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    const user = await viewer(request.headers);
    if (!user)
      return Response.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    const p = await request.json();
    if (p.confirm !== true) throw Error("Confirm image removal.");
    const previous = db
      .prepare("SELECT object_key FROM profile_images WHERE user_id=?")
      .get(user.id) as { object_key: string } | undefined;
    db.transaction(() => {
      db.prepare("DELETE FROM profile_images WHERE user_id=?").run(user.id);
      db.prepare("UPDATE user SET image=NULL WHERE id=?").run(user.id);
      audit(user, "Profile image removed", user.id, true);
    }).immediate();
    if (previous) await deleteImage(previous.object_key).catch(() => {});
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Image removal failed." }, { status: 400 });
  }
}
