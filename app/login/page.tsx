import fs from "node:fs";
import path from "node:path";
import { LoginForm } from "@/components/LoginForm";
export const dynamic = "force-dynamic";
export default function LoginPage() {
  const name = ["keen-scents-logo-a.png", "keen-scents-logo.jpg"].find((name) =>
    fs.existsSync(path.join(process.cwd(), "public", name)),
  );
  return <LoginForm logo={name ? "/" + name : null} />;
}
