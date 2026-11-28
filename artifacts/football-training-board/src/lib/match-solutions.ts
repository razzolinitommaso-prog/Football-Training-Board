import {toggleFourthPeriod,type RotationPeriod} from "./match-period-rotation";

export const matchSolutionOptions = [
  {id:"three",label:"Principale · 3 tempi",fourth:false,optional:false},
  {id:"four",label:"Principale · 4 tempi",fourth:true,optional:false},
  {id:"three-alt",label:"Alternativa · 3 tempi",fourth:false,optional:true},
  {id:"four-alt",label:"Alternativa · 4 tempi",fourth:true,optional:true},
] as const;
export type MatchSolutionId = typeof matchSolutionOptions[number]["id"];
export type MatchSolution<T extends RotationPeriod> = {
  periods:T[];fourthTime?:boolean;fourthPeriodDraft?:T;matchGoalkeeperId?:number|null;
};
export type MatchSolutions<T extends RotationPeriod> = {
  activeSolutionId?:MatchSolutionId;
  lineupSolutions?:Partial<Record<MatchSolutionId,MatchSolution<T>>>;
};
const clone = <T,>(value:T):T => JSON.parse(JSON.stringify(value));
export function solutionSnapshot<T extends RotationPeriod>(plan:MatchSolution<T>):MatchSolution<T>{
  return clone({periods:plan.periods,fourthTime:!!plan.fourthTime,
    fourthPeriodDraft:plan.fourthPeriodDraft,matchGoalkeeperId:plan.matchGoalkeeperId??null});
}
function newSolution<T extends RotationPeriod>(plan:MatchSolution<T>,fourth:boolean):MatchSolution<T>{
  const snapshot=solutionSnapshot(toggleFourthPeriod(solutionSnapshot(plan),fourth));
  const detach=(period:RotationPeriod):RotationPeriod=>({...period,boardId:null,boardUrl:null,boardTitle:null,boardSnapshotAt:null,boardConfirmed:false,
    ...(period.secondPart?{secondPart:detach(period.secondPart)}:{}),...(period.additionalParts?{additionalParts:period.additionalParts.map(detach)}:{})} as RotationPeriod);
  return {...snapshot,periods:snapshot.periods.map(p=>detach(p) as T),...(snapshot.fourthPeriodDraft?{fourthPeriodDraft:detach(snapshot.fourthPeriodDraft) as T}:{})};
}
/** The operational root is authoritative, including updates from the tactical board. */
export function hydrateMatchSolutions<T extends RotationPeriod,P extends MatchSolution<T>&MatchSolutions<T>>(plan:P):P{
  const expectedFourth=plan.periods.some(p=>p.key==="t4");
  const canonical={...plan,fourthTime:expectedFourth};
  const active=matchSolutionOptions.find(o=>o.id===plan.activeSolutionId&&o.fourth===expectedFourth)?.id??(expectedFourth?"four":"three");
  const slots={...clone(plan.lineupSolutions??{}),[active]:solutionSnapshot(canonical)};
  for(const id of ["three","four"] as const)if(!slots[id]){
    slots[id]=newSolution(canonical,id==="four");
  }
  return {...canonical,activeSolutionId:active,lineupSolutions:slots};
}
/** Store the open editor before switching. Alternatives do not change the active root on save. */
export function editMatchSolution<T extends RotationPeriod,P extends MatchSolution<T>&MatchSolutions<T>>(plan:P,editing:MatchSolutionId,target:MatchSolutionId):P{
  const slots={...plan.lineupSolutions,[editing]:solutionSnapshot(plan)};
  const option=matchSolutionOptions.find(o=>o.id===target)!;
  const snapshot=slots[target]??newSolution(plan,option.fourth);
  return {...plan,...clone(snapshot),lineupSolutions:{...slots,[target]:clone(snapshot)}};
}
export function activeMatchSolution<T extends RotationPeriod,P extends MatchSolution<T>&MatchSolutions<T>>(plan:P,editing:MatchSolutionId):P{
  const slots={...plan.lineupSolutions,[editing]:solutionSnapshot(plan)};
  const active=plan.activeSolutionId??editing;
  if(!slots[active])throw Error("La soluzione scelta per la partita non è disponibile.");
  return {...plan,...clone(slots[active]),activeSolutionId:active,lineupSolutions:slots};
}
