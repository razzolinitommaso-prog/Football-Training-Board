import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {useAuth} from "@/hooks/use-auth";
import {DOWNLOAD_EVENT,releaseExport,type DownloadArtifact} from "@/lib/export-download";
import {Button} from "@/components/ui/button";

export function ExportDownloadReady(){
  const {club,user,role,profileKey,section}=useAuth();
  const scope=JSON.stringify([club?.id,user?.id,role,profileKey,section]);
  const [state,setState]=useState<{artifact?:DownloadArtifact;error?:string;loading?:boolean}>({});
  const current=useRef<DownloadArtifact|undefined>(undefined);
  const [container,setContainer]=useState<HTMLElement|null>(null);
  const panel=useRef<HTMLElement|null>(null);
  useEffect(()=>{panel.current?.scrollIntoView?.({block:"nearest"});},[state,container]);
  useEffect(()=>{
    const reset=()=>{releaseExport(current.current);current.current=undefined;setState({});};
    reset();
    const receive=(event:Event)=>{
      const detail=(event as CustomEvent).detail;
      // Radix makes content outside a modal inert, including global download links.
      const dialogs=Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"],dialog[open]'));
      setContainer(dialogs.at(-1)??null);
      releaseExport(current.current);current.current=detail.artifact;setState(detail);
    };
    window.addEventListener(DOWNLOAD_EVENT,receive);
    return()=>{window.removeEventListener(DOWNLOAD_EVENT,receive);releaseExport(current.current);current.current=undefined;};
  },[scope]);
  if(!state.loading&&!state.artifact&&!state.error)return null;
  const file=state.artifact;
  const content=<aside ref={panel} role={state.error?"alert":"status"} aria-label="Download esportazione" className={container?"sticky bottom-0 z-[100] col-span-full w-full max-h-[70vh] overflow-y-auto rounded-xl border bg-background p-4 shadow-xl":"fixed bottom-3 left-3 right-3 z-[100] max-h-[70vh] overflow-y-auto rounded-xl border bg-background p-4 shadow-xl sm:left-auto sm:w-96"}>
    <div className="flex items-start justify-between gap-3"><p className="font-semibold">{state.loading?"Preparazione del file…":state.error?"Download non riuscito":"File pronto"}</p><Button type="button" size="sm" variant="ghost" onClick={()=>{releaseExport(current.current);current.current=undefined;setState({});}}>Chiudi</Button></div>
    {state.error&&<p className="mt-2 text-sm text-destructive">{state.error}</p>}
    {file&&<><p className="my-2 break-words text-sm">{file.filename}</p><div className="flex flex-wrap gap-2"><a href={file.url} download={file.filename} className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" onClick={event=>{if(!file.local){event.preventDefault();window.location.assign(file.url);}}}>Scarica {file.filename.toLowerCase().endsWith(".pdf")?"PDF":file.filename.toLowerCase().endsWith(".xlsx")?"Excel":"file"}</a>{file.previewUrl&&<a href={file.previewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm">Apri PDF</a>}</div>{file.expiresAt&&<p className="mt-2 text-xs text-muted-foreground">Download disponibile per 10 minuti. Se scade, genera nuovamente il file.</p>}</>}
  </aside>;
  return container?createPortal(content,container):content;
}
