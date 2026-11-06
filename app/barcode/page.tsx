import {WorkspaceShell} from '@/components/WorkspaceNavigation';
import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import Link from 'next/link';
import {viewer,requirePermission} from '@/lib/access';
import {BarcodeWorkspace} from '@/components/BarcodeWorkspace';
export const dynamic='force-dynamic';
export default async function BarcodePage(){const user=await viewer(new Headers(await headers()));if(!user)redirect('/login');requirePermission(user,'materials','view');return <WorkspaceShell user={user}><main className="mx-auto min-h-screen max-w-7xl space-y-5 p-4 md:p-8"><nav className="flex gap-5"><Link href="/">? Keenventory</Link><Link href="/materials">Materials</Link><Link href="/barcode">Barcode</Link></nav><BarcodeWorkspace user={user}/></main></WorkspaceShell>;}
