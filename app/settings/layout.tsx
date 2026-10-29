import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { viewer } from "@/lib/access";
import { AccountMenu } from "@/components/AccountMenu";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await viewer(new Headers(await headers())).catch(() => null);
  if (!user) redirect("/login");
  return (
    <main className="min-h-screen bg-[#F4EAE8] p-4 text-[#000E2D] sm:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="font-serif text-2xl">
            Keenventory
          </Link>
          <AccountMenu user={user} />
        </header>
        {children}
      </div>
    </main>
  );
}
