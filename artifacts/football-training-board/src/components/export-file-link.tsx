import type {AnchorHTMLAttributes} from "react";
import {downloadDocument} from "@/lib/document-files";
import {showDownloadError} from "@/lib/export-download";
/** HTTP links already download natively; embedded documents need the shared transport. */
export function ExportFileLink({href,download,onClick,...props}:AnchorHTMLAttributes<HTMLAnchorElement>){
  return <a {...props} href={href} download={download} onClick={event=>{
    onClick?.(event);
    if(event.defaultPrevented||!href?.startsWith("data:"))return;
    event.preventDefault();
    try{void downloadDocument(href,typeof download==="string"?download:"documento");}catch(error){showDownloadError(error);}
  }}/>;
}
