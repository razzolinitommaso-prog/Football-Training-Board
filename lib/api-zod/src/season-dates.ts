import {z} from "zod/v4";

/** Validate real calendar dates before any activation or persistence. */
export function seasonDateError(startDate:unknown,endDate:unknown):string|null{
  if(!z.iso.date().safeParse(startDate).success)return "Indica una data di inizio valida.";
  if(!z.iso.date().safeParse(endDate).success)return "Indica una data di fine valida.";
  return (endDate as string)<(startDate as string)?"La data di fine non può precedere la data di inizio.":null;
}
