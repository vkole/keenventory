import { secured } from '@/lib/access';
import { NextResponse } from 'next/server';
import { getDashboardData } from '@/lib/data';
export const dynamic = 'force-dynamic';
async function handleGET() {
  return NextResponse.json(await getDashboardData());
}

export const GET = secured('dashboard', handleGET);
