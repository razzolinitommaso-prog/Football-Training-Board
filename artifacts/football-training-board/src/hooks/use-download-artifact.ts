import { useCallback, useEffect, useRef, useState } from "react";

/** Keep an explicit retry link until navigation or a change of account/society. */
export function useDownloadArtifact(scope: string) {
  const [artifact,setArtifact]=useState<{url:string;filename:string;scope:string}>();
  const active=useRef(false),currentScope=useRef(scope);currentScope.current=scope;
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  useEffect(()=>()=>{if(artifact)URL.revokeObjectURL(artifact.url);},[artifact]);
  useEffect(()=>setArtifact(undefined),[scope]);
  const prepare=useCallback((blob:Blob,filename:string)=>{
    if(!active.current||currentScope.current!==scope)throw new Error("Il profilo è cambiato durante la generazione.");
    if(!blob.size)throw new Error("Il file generato è vuoto.");
    const url=URL.createObjectURL(blob);
    setArtifact({url,filename,scope});
    const link=document.createElement("a");
    link.href=url;link.download=filename;link.style.display="none";
    document.body.appendChild(link);
    try{link.click();}finally{link.remove();}
  },[scope]);
  const clear=useCallback(()=>setArtifact(undefined),[]);
  return {artifact:artifact?.scope===scope?artifact:undefined,prepare,clear};
}
