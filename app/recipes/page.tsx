import {recipePageData} from '@/lib/recipePageData';
import {WorkspaceShell} from '@/components/WorkspaceNavigation';
import {RecipeLibrary} from '@/components/RecipeLibrary';
export const dynamic='force-dynamic';
export default async function RecipeListPage(){const {user,data}=await recipePageData();return <WorkspaceShell user={user}><main className="min-w-0 flex-1 p-4 md:p-6 xl:p-8"><RecipeLibrary data={data} user={user}/></main></WorkspaceShell>;}
