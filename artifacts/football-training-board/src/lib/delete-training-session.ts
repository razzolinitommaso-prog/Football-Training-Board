export async function confirmDeleteTrainingSession(id:number,request:(url:string,options?:RequestInit)=>Promise<any>):Promise<boolean>{
  const summary=await request(`/api/training-sessions/${id}/deletion-summary`);
  const date=new Date(summary.scheduledAt).toLocaleString("it-IT");
  const message=`Eliminare la seduta "${summary.title}"?\n${summary.teamName??"Senza squadra"} · ${date}\n\n${summary.exerciseCount} esercitazioni collegate · ${summary.attendanceCount} presenze registrate.\nLe presenze collegate verranno eliminate. Le esercitazioni in libreria rimangono disponibili.\nQuesta operazione non è annullabile.`;
  if(!window.confirm(message))return false;
  await request(`/api/training-sessions/${id}`,{method:"DELETE",body:JSON.stringify({confirmation:summary})});return true;
}
