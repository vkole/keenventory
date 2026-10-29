import { getDashboardData } from '@/lib/data';
import { InventoryWorkspace } from '@/components/InventoryWorkspace';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const data = await getDashboardData();
  return <InventoryWorkspace initialData={data} />;
}
