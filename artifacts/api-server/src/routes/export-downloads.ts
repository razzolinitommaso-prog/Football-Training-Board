import { randomBytes } from "node:crypto";
import { Router, raw, type Request } from "express";
import { requireAuth } from "../lib/auth";

// A short-lived HTTP attachment, as with callup PDFs. No documents on disk.
const files = new Map<string, {owner:string;filename:string;type:string;bytes:Buffer;expires:number}>();
const TTL = 10 * 60_000, MAX_FILE = 20 * 1024 * 1024, MAX_TOTAL = 100 * 1024 * 1024;
const types:Record<string,string> = {pdf:"application/pdf",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",csv:"text/csv;charset=utf-8",json:"application/json",gz:"application/gzip",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",heic:"image/heic",heif:"image/heif"};
const owner = (req:Request) => JSON.stringify([req.session.clubId,req.session.userId,req.session.role,req.session.section,req.session.parentPlayerId,req.session.parentDelegateId]);
function clean() { for(const [key,file] of files) if(file.expires <= Date.now()) files.delete(key); }
setInterval(clean,60_000).unref();
const router = Router();
router.post("/export-downloads", requireAuth, (req,res,next)=>{
  if(!req.session.clubId){res.status(403).json({error:"Seleziona una società prima di esportare."});return;}
  raw({type:"application/octet-stream",limit:MAX_FILE})(req,res,error=>{
    if(error){res.status(413).json({error:"Il file supera il limite di 20 MB."});return;}
    next();
  });
}, (req,res)=>{
  clean();
  let filename:string;
  try{filename=decodeURIComponent(String(req.headers["x-export-filename"]??""));}catch{res.status(400).json({error:"Nome file non valido."});return;}
  filename=Array.from(filename.split(/[/\\]/).at(-1)!.replace(/[\x00-\x1f\x7f]/g,"").trim()).slice(0,160).join("");
  const ext=filename.split(".").at(-1)?.toLowerCase()??"",type=types[ext];
  const bytes=req.body;
  if(!filename||!type||!Buffer.isBuffer(bytes)||!bytes.length){res.status(400).json({error:"File vuoto o formato di esportazione non supportato."});return;}
  if(ext==="pdf"&&bytes.subarray(0,5).toString()!=="%PDF-" || ext==="xlsx"&&bytes.subarray(0,2).toString()!=="PK" || ext==="gz"&&(bytes[0]!==31||bytes[1]!==139)){res.status(400).json({error:"Il contenuto non corrisponde al formato del file."});return;}
  const identity=owner(req);
  const owned=[...files].filter(([,file])=>file.owner===identity);
  while(owned.length>=3)files.delete(owned.shift()![0]);
  let total=[...files.values()].reduce((sum,file)=>sum+file.bytes.length,0);
  while(total+bytes.length>MAX_TOTAL&&files.size){const [key,file]=files.entries().next().value!;total-=file.bytes.length;files.delete(key);}
  const token=randomBytes(32).toString("hex"),expires=Date.now()+TTL;
  files.set(token,{owner:identity,filename,type,bytes,expires});
  res.setHeader("Cache-Control","no-store");
  res.status(201).json({url:`/api/export-downloads/${token}`,filename,expiresAt:new Date(expires).toISOString()});
});
router.get("/export-downloads/:token",requireAuth,(req,res)=>{
  clean();
  const file=files.get(String(req.params.token));
  if(!file||file.owner!==owner(req)){res.status(404).json({error:"File non disponibile o scaduto: genera nuovamente l’esportazione."});return;}
  res.setHeader("Content-Type",file.type);
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Cache-Control","private, no-store");
  res.setHeader("Referrer-Policy","no-referrer");
  const disposition=req.query.disposition==="inline"&&file.type==="application/pdf"?"inline":"attachment";
  res.setHeader("Content-Disposition",`${disposition}; filename="${file.filename.replace(/[^a-zA-Z0-9._-]/g,"_")}"; filename*=UTF-8''${encodeURIComponent(file.filename).replace(/['()*]/g,c=>"%"+c.charCodeAt(0).toString(16))}`);
  res.send(file.bytes);
});
export default router;
