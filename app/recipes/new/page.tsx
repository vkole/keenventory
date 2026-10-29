import { RecipePage } from "@/components/RecipePage";
import { recipePageData } from "@/lib/recipePageData";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ copy?: string; product_id?: string }>;
}) {
  const query = await searchParams,
    id = Number(query.copy) || undefined,
    props = await recipePageData("create", id);
  return (
    <RecipePage
      {...props}
      id={id}
      editor
      copy={!!id}
      productId={Number(query.product_id) || undefined}
    />
  );
}
