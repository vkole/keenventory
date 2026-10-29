import { InvitationSetup } from "@/components/InvitationSetup";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Set Up Your Account | Keenventory",
  referrer: "no-referrer" as const,
};
export default function Page() {
  return <InvitationSetup />;
}
