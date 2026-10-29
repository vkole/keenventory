import type Database from "better-sqlite3";
import { deleteImage } from "./imageStorage";
export function detachMedia(db: Database.Database, type: string, id: number) {
  const rows = db
    .prepare(
      "SELECT object_key FROM attachments WHERE owner_type=? AND owner_id=?",
    )
    .all(type, id) as { object_key: string }[];
  db.prepare("DELETE FROM attachments WHERE owner_type=? AND owner_id=?").run(
    type,
    id,
  );
  return rows
    .map((r) => r.object_key)
    .filter(
      (key) =>
        !db.prepare("SELECT id FROM attachments WHERE object_key=?").get(key),
    );
}
export async function removeDetachedMedia(keys: string[]) {
  for (const key of new Set(keys)) await deleteImage(key).catch(() => {});
}
