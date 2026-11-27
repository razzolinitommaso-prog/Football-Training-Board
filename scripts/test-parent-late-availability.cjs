const assert=require('node:assert/strict');
module.exports=async({pg,base,call})=>{
  const RealDate=Date;let clock=RealDate.parse('2026-11-27T12:00:00Z');
  global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
  try{
    await pg.exec("INSERT INTO matches(id,club_id,team_id,opponent,date,home_away,competition) VALUES(9001,1,11,'Test avversario','2026-11-28T15:00:00Z','home','Campionato'),(9002,1,11,'Passata','2026-11-26T15:00:00Z','home','Campionato'),(9003,1,12,'Altra squadra','2026-11-28T15:00:00Z','home','Campionato'); INSERT INTO call_ups(id,match_id,player_id,status) VALUES(9001,9001,101,'called');");
    const list=await call('/parent/matches');assert.equal(list.status,200,JSON.stringify(list));
    const match=list.data.find(m=>m.id===9001);assert.equal(match.parentAvailabilityLocked,true);assert.equal(match.parentAvailabilityCanWithdraw,true);
    assert.equal(match.parentAvailabilityDeadline,'2026-11-25T22:59:59.999Z');
    const patch=async(id,body,headers={},child=101)=>{const r=await fetch(`${base}/parent/availability/${id}/${child}`,{method:'PATCH',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});return{status:r.status,data:await r.json()};};
    assert.equal((await patch(9001,{status:'available'})).status,409);
    assert.equal((await patch(9001,{status:'unavailable'})).status,400);
    assert.equal((await patch(9001,{status:'unavailable',reason:'other'})).status,400);
    assert.equal((await patch(9001,{status:'unavailable',reason:'illness'},{},102)).status,403);
    assert.equal((await patch(9001,{status:'unavailable',reason:'illness'},{'x-club':'2'})).status,403);
    assert.equal((await patch(9003,{status:'unavailable',reason:'illness'})).status,403);
    let r=await patch(9001,{status:'unavailable',reason:'illness'});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.status,'called');assert.equal(r.data.parentAvailabilityStatus,'unavailable');
    const notifications=(await pg.query("SELECT * FROM club_notifications WHERE title='Disponibilità ritirata dopo la scadenza'")).rows;assert.equal(notifications.length,1);assert.deepEqual(notifications[0].target_user_ids,[1]);assert.equal(notifications[0].club_id,1);
    r=await patch(9001,{status:'unavailable',reason:'illness'});assert.equal(r.status,200,JSON.stringify(r));
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM club_notifications")).rows[0].n,1,'repeat does not send duplicate notification');
    assert.equal((await patch(9002,{status:'unavailable',reason:'illness'})).status,409);
    clock=RealDate.parse('2026-11-25T23:30:00Z');assert.equal((await patch(9001,{status:'available'})).status,409,'Wednesday deadline uses Italian midnight');
    clock=RealDate.parse('2026-11-25T21:30:00Z');assert.equal((await patch(9001,{status:'available'})).status,200,'before deadline remains editable');
    console.log('PASS late parent withdrawal: expired deadline, Italian timezone, reason, retained coach callup, staff notification once, child/club/team isolation, kickoff lock and ordinary replies.');
  }finally{global.Date=RealDate;}
};
