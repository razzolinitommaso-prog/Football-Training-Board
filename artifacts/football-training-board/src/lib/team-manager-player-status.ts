export type ManagerPlayer = {id:number;firstName:string;lastName:string;jerseyNumber:number|null;position:string|null;registered:boolean|null;registrationNumber:string|null;medicalCertificateExpiry:string|null};
import { differenceInCalendarDays, format, isValid, parseISO, startOfDay } from "date-fns";
export function managerPlayerStatus(player:ManagerPlayer,now=new Date()) {
  const raw=player.medicalCertificateExpiry;
  const date=raw&&/^\d{4}-\d{2}-\d{2}$/.test(raw)?parseISO(raw):null;
  const valid=Boolean(date&&isValid(date));
  const days=valid?differenceInCalendarDays(date!,startOfDay(now)):null;
  const certificate=days===null?{label:raw?"Scadenza da verificare":"Scadenza non registrata",tone:"muted",expiry:null}:days<0?{label:"Scaduto",tone:"red",expiry:format(date!,"dd/MM/yyyy")}:days<=60?{label:"In scadenza",tone:"amber",expiry:format(date!,"dd/MM/yyyy")}:{label:"Valido",tone:"green",expiry:format(date!,"dd/MM/yyyy")};
  const number=player.registrationNumber?.trim()||null;
  return {certificate,number,registration:player.registered===true?"Tesserato":player.registered===false?"Da completare":"Da verificare",needsReview:player.registered!==true||!number||certificate.tone!=="green"};
}
