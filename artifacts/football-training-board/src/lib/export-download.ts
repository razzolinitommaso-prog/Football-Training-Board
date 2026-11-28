export type DownloadArtifact = {url:string;filename:string;previewUrl?:string;expiresAt?:string;local?:boolean};
export const DOWNLOAD_EVENT = "ftb-export-download";
export function mobileDownload() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1 || window.matchMedia?.("(max-width: 767px)").matches;
}
function publish(detail:{artifact?:DownloadArtifact;error?:string;loading?:boolean}) {
  window.dispatchEvent(new CustomEvent(DOWNLOAD_EVENT,{detail}));
}
export function showDownloadError(error:unknown){publish({error:error instanceof Error?error.message:"Download non riuscito. Riprova."});}
export async function prepareExportDownload(blob:Blob,filename:string):Promise<DownloadArtifact> {
  if(!blob.size)throw Error("Il file generato è vuoto.");
  if(!mobileDownload()){
    const url=URL.createObjectURL(blob);
    return {url,filename,local:true,previewUrl:/\.pdf$/i.test(filename)?url:undefined};
  }
  const {withApi}=await import("./api-base");
  const {getAuthToken}=await import("./auth-token");
  const token=getAuthToken();
  const response=await fetch(withApi("/api/export-downloads"),{method:"POST",credentials:"include",headers:{"Content-Type":"application/octet-stream","X-Export-Filename":encodeURIComponent(filename)},body:blob});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw Error(data?.error??"Impossibile preparare il download. Riprova.");
  if(token!==getAuthToken())throw Error("Il profilo è cambiato durante la generazione. Ripeti l’esportazione.");
  if(typeof data?.url!=="string"||!/^\/api\/export-downloads\/[a-f0-9]{64}$/.test(data.url))throw Error("Il server non ha restituito un file scaricabile.");
  const url=withApi(data.url);
  return {url,filename:data.filename,expiresAt:data.expiresAt,previewUrl:/\.pdf$/i.test(filename)?url+"?disposition=inline":undefined};
}
export function releaseExport(artifact?:DownloadArtifact){if(artifact?.local)URL.revokeObjectURL(artifact.url);}
export function activateLocalExport(artifact:DownloadArtifact){
  const a=document.createElement("a");a.href=artifact.url;a.download=artifact.filename;a.style.display="none";document.body.append(a);a.click();a.remove();
}
/** A real user tap follows generation on mobile; no hidden blob link or print dialog. */
export async function downloadExport(blob:Blob,filename:string):Promise<DownloadArtifact|undefined> {
  publish({loading:true});
  try{
    const artifact=await prepareExportDownload(blob,filename);
    if(artifact.local){
      activateLocalExport(artifact);
    }
    publish({artifact});
    return artifact;
  }catch(error){publish({error:error instanceof Error?error.message:"Download non riuscito. Riprova."});return undefined;}
}
