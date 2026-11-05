import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import Link from 'next/link';
import {viewer,requirePermission} from '@/lib/access';
import {SuppliersWorkspace} from '@/components/SuppliersWorkspace';
export const dynamic='force-dynamic';
export default async function SuppliersPage(){const user=await viewer(new Headers(await headers()));if(!user)redirect('/login');requirePermission(user,'vendors','view');return <main className="mx-auto min-h-screen max-w-7xl space-y-5 p-4 md:p-8"><nav className="flex gap-5"><Link href="/">Keenventory</Link><Link href="/materials">Materials</Link><Link href="/suppliers">Suppliers</Link></nav><SuppliersWorkspace user={user}/></main>;}
