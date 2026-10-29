import { normalizePrincipleSection } from "./training-principles";
export const TRAINING_CATEGORIES = ["technique","physical","tactical","warmup","shooting","passing","defending","attacking","with_ball","without_ball"] as const;
export function trainingCategories(value:string|null|undefined):string[] {
  return value?.startsWith("cats1:") ? value.slice(6).split("|").filter(Boolean) : value ? [value] : [];
}
export function encodeTrainingCategories(values:string[]):string {
  const unique=[...new Set(values)]; return unique.length>1?`cats1:${unique.join("|")}`:unique[0]??"";
}
export function trainingCategoryLabel(value:string|null|undefined,section?:string|null):string {
  const school=normalizePrincipleSection(section)==="scuola_calcio";
  const labels:Record<string,string>={technique:"Tecnica individuale",physical:school?"Motoria e coordinativa":"Preparazione fisica/atletica",tactical:school?"Tecnica collettiva e collaborazione":"Tecnica collettiva e tattica",warmup:"Attivazione",shooting:"Finalizzazione",passing:"Trasmissione palla",defending:school?"Atteggiamenti e gesti di difesa":"Principi difensivi",attacking:school?"Atteggiamenti e gesti di attacco":"Principi offensivi",with_ball:"Con la palla",without_ball:"Senza palla"};
  return trainingCategories(value).map(key=>labels[key]??key).join(" · ");
}
