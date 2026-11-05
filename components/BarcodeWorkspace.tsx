'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {type Viewer,can} from '@/lib/permissions';
import {BarcodeCapture} from './BarcodeCapture';
import {MaterialDetail,MaterialForm,type MaterialRecord} from './MaterialsWorkspace';
import {buttonClass,inputClass,jsonRequest} from './ProductForm';
export function BarcodeWorkspace({user}:{user:Viewer}){
 const [value,setValue]=useState(''),[result,setResult]=useState<MaterialRecord|null>(null),[notFound,setNotFound]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[editing,setEditing]=useState(false),[session,setSession]=useState(0),[scans,setScans]=useState<Record<string,unknown>[]>([]),[register,setRegister]=useState(false),[materials,setMaterials]=useState<MaterialRecord[]>([]),[materialId,setMaterialId]=useState('');
 async function recent(){setScans((await jsonRequest('/api/barcode')).scans);}
 useEffect(()=>{void recent().catch(e=>setMessage(e.message));},[]);
 async function lookup(code:string){if(busy)return;setBusy(true);setMessage('');setNotFound(false);try{setValue(code);const data=await jsonRequest('/api/barcode',{value:code});setResult(data.material);setNotFound(!data.material);await recent();}catch(e){setMessage(e instanceof Error?e.message:'Lookup failed.');}finally{setBusy(false);}}
 async function refresh(){if(result)setResult((await jsonRequest('/api/materials?id='+result.id)).material);}
 function reset(){setResult(null);setNotFound(false);setValue('');setRegister(false);setSession(s=>s+1);}
 return <div className="space-y-5"><h1 className="text-3xl font-semibold">Barcode Scanner</h1><p>Scan a barcode to instantly view inventory details, stock availability, and supplier reorder information.</p>{message&&<p role="alert">{message}</p>}
 {editing&&result?<MaterialForm material={result} user={user} onCancel={()=>setEditing(false)} onSaved={()=>{setEditing(false);void refresh();}}/>:result?<><MaterialDetail m={result} user={user} onRefresh={refresh} onEdit={()=>setEditing(true)} onClose={reset}/><button className={buttonClass} onClick={reset}>Scan Another Item</button></>:<>
 <BarcodeCapture key={session} onDetected={code=>void lookup(code)}/>
 <form className="flex flex-wrap gap-3 rounded-2xl bg-white p-4" onSubmit={e=>{e.preventDefault();void lookup(value.trim());}}><label className="min-w-0 flex-1">Enter Barcode Manually<input autoFocus required autoComplete="off" className={inputClass} value={value} onChange={e=>setValue(e.target.value)} placeholder="Type, paste, or use a USB / Bluetooth scanner"/></label><button disabled={busy} className={buttonClass}>{busy?'Searching�':'Search'}</button></form>
 {notFound&&<div className="space-y-4 rounded-2xl bg-white p-5"><p>No inventory item was found for this barcode.</p><p className="font-mono">{value}</p><div className="flex flex-wrap gap-3"><Link className={buttonClass} href="/materials">Search Inventory Manually</Link>{can(user,'materials','edit')&&<button className={buttonClass} onClick={()=>{setRegister(true);void jsonRequest('/api/materials').then(d=>setMaterials(d.materials)).catch(e=>setMessage(e.message));}}>Register Barcode to Existing Material</button>}{can(user,'materials','create')&&<Link className={buttonClass} href={'/materials?new=1&barcode='+encodeURIComponent(value)}>Create New Material</Link>}<button className={buttonClass} onClick={reset}>Scan Again</button></div>
 {register&&<div className="space-y-3"><label>Existing Material<select className={inputClass} value={materialId} onChange={e=>setMaterialId(e.target.value)}><option value="">Choose a material</option>{materials.map(m=><option key={m.id} value={m.id}>{m.name} � {m.sku}</option>)}</select></label>{materialId&&<Link className={buttonClass} href={'/materials?id='+materialId+'&edit=1&barcode='+encodeURIComponent(value)}>Review and Register Barcode</Link>}</div>}</div>}
 </>}
 <section className="rounded-2xl bg-white p-4"><h2 className="mb-3 text-xl font-semibold">Recent Scans</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Date and Time','Material','Barcode','Stock Status at Scan','User','Action'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{scans.map(s=><tr key={String(s.id)}>{['created_at','name','value','stock_status','user_name','action'].map(k=><td key={k} className="p-2">{k==='name'?<Link className="flex items-center gap-2 underline" href={'/materials?id='+s.material_id}>{!!s.image_id&&<img src={'/api/materials/images?id='+s.image_id} alt="" className="h-10 w-10 rounded-lg object-cover"/>}{String(s[k])}</Link>:String(s[k])}</td>)}</tr>)}</tbody></table></div>{!scans.length&&<p>No recent scans.</p>}</section>
 </div>;
}
