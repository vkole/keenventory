'use client';
import {createContext,useCallback,useContext,useEffect,useId,useMemo,useRef,useState} from 'react';
const GuardContext=createContext<{set:(id:string,dirty:boolean)=>void;forget:(id:string)=>void;leave:()=>boolean}|null>(null);
export function NavigationGuardProvider({children}:{children:React.ReactNode}){
 const dirty=useRef(new Map<string,boolean>());
 const guard=useMemo(()=>({set:(id:string,value:boolean)=>{dirty.current.set(id,value);},forget:(id:string)=>{dirty.current.delete(id);},leave:()=>{if([...dirty.current.values()].some(Boolean)&&!window.confirm('You have unsaved changes. Discard them and leave this page?'))return false;dirty.current.clear();return true;}}),[]);
 useEffect(()=>{
 const unload=(e:BeforeUnloadEvent)=>{if([...dirty.current.values()].some(Boolean)){e.preventDefault();e.returnValue='';}};
 const click=(e:MouseEvent)=>{if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;if(!(e.target instanceof Element))return;const link=e.target.closest<HTMLAnchorElement>('a[href]');if(!link||link.target==='_blank'||link.hasAttribute('download'))return;const url=new URL(link.href,location.href);if(url.origin!==location.origin||url.hash&&url.pathname===location.pathname&&url.search===location.search)return;if(!guard.leave()){e.preventDefault();e.stopPropagation();}};
 window.addEventListener('beforeunload',unload);document.addEventListener('click',click,true);return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',click,true);};
 },[guard]);
 return <GuardContext.Provider value={guard}>{children}</GuardContext.Provider>;
}
export function useLeavePage(){const guard=useContext(GuardContext);return useCallback(()=>guard?.leave()??true,[guard]);}
export function useDraftGuard(value:unknown){
 const guard=useContext(GuardContext),id=useId(),serialized=JSON.stringify(value),baseline=useRef(serialized),latest=useRef(serialized);latest.current=serialized;const [revision,setRevision]=useState(0);
 useEffect(()=>{guard?.set(id,serialized!==baseline.current);return()=>guard?.forget(id);},[guard,id,serialized,revision]);
 return Object.assign((nextValue?:unknown)=>{baseline.current=nextValue===undefined?latest.current:JSON.stringify(nextValue);guard?.forget(id);setRevision(n=>n+1);},{isDirty:serialized!==baseline.current});
}
