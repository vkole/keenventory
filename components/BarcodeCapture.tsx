'use client';
import Image from 'next/image';
import {useEffect,useRef,useState} from 'react';
import type {IScannerControls} from '@zxing/browser';
import {buttonClass,inputClass} from './ProductForm';
export function BarcodeCapture({onDetected}:{onDetected:(value:string,type:string)=>void}) {
 const video=useRef<HTMLVideoElement>(null),controls=useRef<IScannerControls>(),generation=useRef(0),locked=useRef(false);
 const [active,setActive]=useState(false),[error,setError]=useState(''),[devices,setDevices]=useState<MediaDeviceInfo[]>([]),[device,setDevice]=useState(''),[preview,setPreview]=useState(''),[candidate,setCandidate]=useState<{value:string;type:string}|null>(null);
 function stop(){generation.current++;controls.current?.stop();controls.current=undefined;const stream=video.current?.srcObject;if(stream instanceof MediaStream)stream.getTracks().forEach(t=>t.stop());setActive(false);}
 useEffect(()=>()=>{generation.current++;controls.current?.stop();},[]);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
 async function reader(){const {BrowserMultiFormatReader}=await import('@zxing/browser');const {BarcodeFormat,DecodeHintType}=await import('@zxing/library');return new BrowserMultiFormatReader(new Map([[DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.UPC_A,BarcodeFormat.UPC_E,BarcodeFormat.EAN_13,BarcodeFormat.EAN_8,BarcodeFormat.CODE_128,BarcodeFormat.CODE_39]]]));}
 async function start(selected=device){
  stop();const token=generation.current;locked.current=false;setError('');setCandidate(null);setActive(true);
  try {
   if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('Camera access requires HTTPS and a supported browser.');
   const r=await reader();if(token!==generation.current)return;
   const result=await r.decodeFromConstraints({audio:false,video:selected?{deviceId:{exact:selected}}:{facingMode:{ideal:'environment'}}},video.current!,async(result,_error,c)=>{
    if(result&&!locked.current&&token===generation.current){locked.current=true;c.stop();const {BarcodeFormat}=await import('@zxing/library');setCandidate({value:result.getText(),type:BarcodeFormat[result.getBarcodeFormat()]});setActive(false);}
   });
   if(token!==generation.current){result.stop();return;}controls.current=result;
   setDevices((await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput'));
  }catch(e){if(token===generation.current){stop();setError(e instanceof Error?e.message:'Camera unavailable. Check camera permissions or upload a photo.');}}
 }
 async function upload(file?:File){
  if(!file)return;stop();setCandidate(null);setError('');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024){setError('Choose a JPG, PNG, or WebP up to 8 MB.');return;}
  const url=URL.createObjectURL(file);setPreview(url);
  try{const r=await reader();const result=await r.decodeFromImageUrl(url);const {BarcodeFormat}=await import('@zxing/library');setCandidate({value:result.getText(),type:BarcodeFormat[result.getBarcodeFormat()]});}
  catch{setError('No barcode could be decoded. Try a sharper, well-lit photo or enter the printed number manually.');}
 }
 return <div className="space-y-3 rounded-2xl border border-[#E2E1E2] p-4">
  <div className="flex flex-wrap gap-3"><button type="button" className={buttonClass} onClick={()=>void start()}>Scan with Camera</button><label className={buttonClass+' cursor-pointer'}>Upload Barcode Image<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/></label>{active&&<button type="button" className={buttonClass} onClick={stop}>Stop Scanner</button>}</div>
  {devices.length>1&&<label className="block">Camera<select className={inputClass} value={device} onChange={e=>{setDevice(e.target.value);if(active)void start(e.target.value);}}><option value="">Rear camera (preferred)</option>{devices.map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||`Camera ${i+1}`}</option>)}</select></label>}
  <div hidden={!active} className="relative max-w-xl overflow-hidden rounded-xl bg-black"><video ref={video} muted playsInline className="w-full"/><div className="pointer-events-none absolute inset-x-[10%] inset-y-[30%] rounded-lg border-2 border-white"/><p className="absolute bottom-2 w-full text-center text-white">Place the barcode inside the guide</p></div>
  {preview&&<Image unoptimized width={320} height={160} src={preview} alt="Uploaded barcode preview" className="max-h-40 w-auto rounded-xl object-contain"/>}
  {candidate&&<div className="space-y-2"><label>Confirm or correct barcode<input className={inputClass} value={candidate.value} onChange={e=>setCandidate({...candidate,value:e.target.value})}/></label><p>{candidate.type}</p><button type="button" className={buttonClass} disabled={!candidate.value.trim()} onClick={()=>{onDetected(candidate.value.trim(),candidate.type);setCandidate(null);setPreview('');}}>Use This Barcode</button></div>}
  {error&&<p role="alert">{error}</p>}
 </div>;
}
