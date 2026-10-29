import { redirect } from "next/navigation";
export default function Page() {
  redirect("/?module=recipes");
}
