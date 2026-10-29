import { RecipePage } from "@/components/RecipePage";
import { recipePageData } from "@/lib/recipePageData";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  return <RecipePage {...await recipePageData("view", id)} id={id} />;
}
