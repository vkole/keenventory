import { secured } from '@/lib/access';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { product, productDetail, products, saveProduct } from '@/lib/productStore';
export const dynamic = 'force-dynamic';
async function handleGET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    return NextResponse.json(
      id ? productDetail(db, Number(id)) : { products: products(db) },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Product query failed.' },
      { status: 400 },
    );
  }
}
async function handlePOST(request: Request) {
  try {
    const body=await request.json();
    const previous=body.id?product(db,Number(body.id)):null;
    const id = saveProduct(db, previous?{
      ...previous,
      attributes:JSON.parse(previous.attributes),
      auto_manufacture:!!previous.auto_manufacture,
      ...body,
    }:body);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Product save failed.' },
      { status: 400 },
    );
  }
}

export const GET = secured('products', handleGET);

export const POST = secured('products', handlePOST);
