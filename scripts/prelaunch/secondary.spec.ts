import { test, expect } from "@playwright/test";
import { inspectLayout } from "./responsive-audit.mjs";
import { createRequire } from "node:module";
const XLSX = createRequire(process.cwd()+"/artifacts/football-training-board/package.json")("xlsx");
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
  if(width<640) await page.getByLabel('Sezione',{exact:true}).selectOption('schieramenti');
  else await page.getByRole('button',{name:'Schieramenti',exact:true}).click();
  await expect(page.getByRole('heading',{name:"L'app non ha completato il caricamento"})).toHaveCount(0);
  await test.info().attach('schieramenti-mobile',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
});
