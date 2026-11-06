import {WorkspaceShell} from '@/components/WorkspaceNavigation';
﻿import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import Link from 'next/link';
import {viewer,requirePermission} from '@/lib/access';
import {CategoryManager} from '@/components/CategoryManager';
export const dynamic='force-dynamic';
export default async function CategoryPage(){const user=await viewer(new Headers(await headers()));if(!user)redirect('/login');requirePermission(user,'materials','view');return <WorkspaceShell user={user}><main className="mx-auto min-h-screen max-w-5xl space-y-5 p-4 md:p-8"><nav className="flex gap-5"><Link href="/">Keenventory</Link><Link href="/materials">Materials</Link></nav><CategoryManager user={user}/></main></WorkspaceShell>;}
