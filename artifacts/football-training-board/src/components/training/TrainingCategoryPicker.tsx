import { TRAINING_CATEGORIES, trainingCategories, encodeTrainingCategories, trainingCategoryLabel } from "@workspace/api-zod";
import { useAuth } from "@/hooks/use-auth";
export function TrainingCategoryPicker({value,onChange,section}:{value:string|null;onChange:(value:string)=>void;section?:string|null}) {
 const {section:active}=useAuth(); const selected=trainingCategories(value);
 return <fieldset className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2"><legend className="px-1 text-xs text-muted-foreground">Puoi scegliere più caratteristiche</legend>
 {[...new Set([...TRAINING_CATEGORIES,...selected])].map(key=><label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(key)} onChange={e=>onChange(encodeTrainingCategories(e.target.checked?[...selected,key]:selected.filter(x=>x!==key)))}/>{trainingCategoryLabel(key,section??active)}</label>)}
 </fieldset>;
}
