'use client';
import Image from 'next/image';
import {buttonClass} from './ProductForm';
export function QRLabel({id}:{id:number}) {
 const url='/api/materials/codes?id='+id;
 return <div className="space-y-2"><Image unoptimized width={160} height={160} src={url} alt="Inventory QR code preview"/><div className="flex flex-wrap gap-3"><a className={buttonClass} href={url+'&download=1'} download>Download QR Image</a><a className={buttonClass} href={url+'&print=1'} target="_blank" rel="noopener noreferrer">Print QR Label</a></div></div>;
}
