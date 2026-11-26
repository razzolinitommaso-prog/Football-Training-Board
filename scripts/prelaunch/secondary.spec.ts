import { test, expect } from "@playwright/test";
import { inspectLayout } from "./responsive-audit.mjs";
for(const width of [390,1024]) test(`Motor tests retain past results and offer PDF download ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto('/player-performance?role=coach&scenario=motor-multiday');
  if(width>=768)await expect(page.getByRole('link',{name:'Test e crescita',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Consulta',exact:true}).click();
  await page.getByRole('button',{name:'Presenze e valutazioni',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Giocatore da valutare'})).toContainText('Test parziale');
  await expect(page.getByRole('spinbutton',{name:'Statura · cm',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Salva sessione',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Scarica PDF',exact:true}).click();
  await expect(page.getByRole('link',{name:'Scarica di nuovo PDF',exact:true})).toHaveAttribute('download',/\.pdf$/);
  await expect(page.getByRole('link',{name:'Apri PDF e stampa',exact:true})).toBeVisible();
  const layout=await inspectLayout({playwright:page});expect(layout.documentWidth).toBeLessThanOrEqual(width+2);expect(layout.renderError).toBe(false);
});
import { createRequire } from "node:module";
const XLSX = createRequire(process.cwd()+"/artifacts/football-training-board/package.json")("xlsx");
for (const width of [390,1024]) test(`Callup minimum reached can be selected ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto('/calendari/11?role=coach&openMatchId=901&scenario=callup-minimum-reached');
  if(width<640) await page.getByRole('combobox',{name:'Sezione della partita',exact:true}).selectOption('convocati');
  else await page.getByRole('button',{name:'Convocati',exact:true}).click();
  const checkbox=page.getByRole('checkbox',{name:/^Convoca /}).first();
  await expect(checkbox).toBeEnabled();
  await expect(page.getByRole('region',{name:'Convocati',exact:true})).toContainText('minimo richiesto già raggiunto');
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await checkbox.uncheck();
  await expect(checkbox).toBeEnabled();
});
for (const width of [320,390,1024]) for (const scenario of ["backup-server-error","backup-empty"]) test(`Backup error remains visible ${scenario} ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto(`/seasons?role=admin&scenario=${scenario}`);
  const section=page.getByRole('region',{name:'Backup dati società'});
  await section.getByRole('button',{name:'Scarica backup società',exact:true}).click();
  await expect(section.getByRole('alert')).toContainText(scenario==='backup-empty'?'backup vuoto':'BACKUP_PREPARATION_FAILED');
  await expect(section.getByRole('button',{name:'Scarica backup società',exact:true})).toBeEnabled();
  const layout=await inspectLayout({playwright:page});
  expect(layout.documentWidth).toBeLessThanOrEqual(width+2);
  await test.info().attach('backup-error',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
});
const dialogs = [
  {path:"/players",role:"secretary",button:"Importa Excel"},
  {path:"/players",role:"secretary",button:"Aggiungi Giocatore"},
  {path:"/secretary/documents",role:"secretary",button:"Aggiungi Documento"},
  {path:"/secretary/warehouse",role:"secretary",button:"Nuovo articolo"},
  {path:"/seasons",role:"admin",button:"Nuova stagione"},
  {path:"/exercises",role:"coach",button:"Aggiungi Stazione"},
];
for (const item of dialogs) for(const width of [320,390,768,1024,1440]) test(`Modulo ${item.button} ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto(item.path+"?role="+item.role);
  if(item.button==="Importa Excel") {
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{Nome:"Atleta",Cognome:"Collaudo","Data di Nascita":"2019-03-10"}]),"Giocatori");
    await page.locator('input[type="file"][accept=".xlsx,.xls"]').setInputFiles({name:'collaudo.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(wb,{type:'buffer',bookType:'xlsx'})});
  } else await page.getByRole("button",{name:item.button,exact:true}).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect.poll(async()=>{
    const layout=await inspectLayout({playwright:page});
    return layout.documentWidth<=width+2&&!layout.overflow.length&&!layout.narrow.length&&!layout.renderError;
  }).toBe(true);
  await test.info().attach('modulo',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
});
for(const width of [320,390,768,1024]) test(`Titolo partita non sovrapposto ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:800});
  await page.goto('/calendari/11?role=coach&openMatchId=901');
  const header=page.getByTestId('match-workspace-header');await expect(header).toBeVisible();
  const position=await header.evaluate(el=>getComputedStyle(el).position);
  expect(position).toBe(width<1024?'relative':'sticky');
  if(width<640) await page.getByRole('combobox',{name:'Sezione della partita',exact:true}).selectOption('schieramenti');
  else await page.getByRole('button',{name:'Schieramenti',exact:true}).click();
  await expect(page.getByRole('heading',{name:"L'app non ha completato il caricamento"})).toHaveCount(0);
  if(width<1024) {
    await page.locator('main').evaluate(el=>el.scrollTo({top:600}));
    await expect.poll(()=>header.evaluate(el=>el.getBoundingClientRect().bottom)).toBeLessThan(100);
  }
  await test.info().attach('schieramenti-mobile',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
});
