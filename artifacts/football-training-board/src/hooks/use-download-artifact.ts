import { useCallback, useEffect, useRef, useState } from "react";
import {prepareExportDownload,activateLocalExport,releaseExport,mobileDownload,type DownloadArtifact} from "@/lib/export-download";

/** Keep an explicit retry link until navigation or a change of account/society. */
export function useDownloadArtifact(scope: string) {
  const [artifact,setArtifact]=useState<DownloadArtifact & {scope:string}>();
  const active=useRef(false),currentScope=useRef(scope);currentScope.current=scope;
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  useEffect(()=>()=>releaseExport(artifact),[artifact]);
  useEffect(()=>setArtifact(undefined),[scope]);
  const prepare=useCallback(async(blob:Blob,filename:string,options?:{serverUrl:string})=>{
    if(!active.current||currentScope.current!==scope)throw new Error("Il profilo è cambiato durante la generazione.");
    if(!blob.size)throw new Error("Il file generato è vuoto.");
    const file:DownloadArtifact=options?.serverUrl&&mobileDownload()?{url:options.serverUrl,filename}:await prepareExportDownload(blob,filename);
    if(!active.current||currentScope.current!==scope){releaseExport(file);throw new Error("Il profilo è cambiato durante la generazione.");}
    setArtifact({...file,scope});
    if(file.local)activateLocalExport(file);
  },[scope]);
  const clear=useCallback(()=>setArtifact(undefined),[]);
  return {artifact:artifact?.scope===scope?artifact:undefined,prepare,clear};
}
