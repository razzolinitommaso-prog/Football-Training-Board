import { SESSION_OBJECTIVES, normalizePrincipleSection, sessionObjectiveLabel, trainingPrincipleLabel } from "@workspace/api-zod";
import { ScrollableSelect } from "@/components/ui/scrollable-select";
import { useAuth } from "@/hooks/use-auth";
export function SessionObjectivePicker({value,onChange,section}:{value:string;onChange:(value:string)=>void;section?:string|null}) {
  const {section:active}=useAuth();
  const school=normalizePrincipleSection(section??active)==="scuola_calcio";
  const historical=!!value&&!sessionObjectiveLabel(value);
  return <div className="space-y-2"><ScrollableSelect className="w-full" aria-label="Obiettivo prevalente della seduta" value={value} onValueChange={onChange}>
    <option value="">Scegli obiettivo</option>
    {historical&&<option value={value}>{trainingPrincipleLabel(value)} (salvato)</option>}
    {SESSION_OBJECTIVES.filter(([id])=>!school||id!=="transitions"||value==="goal1:transitions").map(([id,label])=><option key={id} value={`goal1:${id}`}>{label}</option>)}
  </ScrollableSelect><p className="text-xs text-muted-foreground">Un obiettivo generale per la seduta. I principi specifici si scelgono nelle attività.</p></div>;
}
