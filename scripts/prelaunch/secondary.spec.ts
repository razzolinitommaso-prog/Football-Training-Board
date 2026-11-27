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
  const pdfDownload=page.waitForEvent('download');
  await page.getByRole('link',{name:'Scarica di nuovo PDF',exact:true}).click();
  const pdfFile=await (await pdfDownload).path();expect(pdfFile).toBeTruthy();
  const pdfBytes=await readFile(pdfFile!);expect(pdfBytes.subarray(0,5).toString()).toBe('%PDF-');expect(pdfBytes.length).toBeGreaterThan(1000);
  const layout=await inspectLayout({playwright:page});expect(layout.documentWidth).toBeLessThanOrEqual(width+2);expect(layout.renderError).toBe(false);
});
import { createRequire } from "node:module";
import {readFile} from "node:fs/promises";
const XLSX = createRequire(process.cwd()+"/artifacts/football-training-board/package.json")("xlsx");
for(const width of [320,390,768,1024])test(`Season date correction is explicit ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await page.goto('/seasons?role=admin&scenario=season-invalid');
  await expect(page.getByRole('alert')).toContainText('Date da correggere');
  await page.getByRole('button',{name:'Modifica date stagione 2026/2027',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Modifica date stagione',exact:true});
  await expect(dialog.getByRole('button',{name:'Salva date',exact:true})).toBeDisabled();
  await dialog.getByLabel('Data fine',{exact:true}).fill('2028-06-30');
  await expect(dialog.getByRole('button',{name:'Salva date',exact:true})).toBeEnabled();
  const layout=await inspectLayout({playwright:page});expect(layout.documentWidth).toBeLessThanOrEqual(width+2);expect(layout.renderError).toBe(false);
});
for(const width of [320,390,768,1024])test(`Complete club audit shows missing registries ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await page.goto('/seasons?role=admin');
  const panel=page.getByRole('region',{name:'Verifica completa dati società',exact:true});
  await panel.getByRole('button',{name:'Verifica dati completi',exact:true}).click();
  await expect(panel).toContainText('12 tabelle');await expect(panel).toContainText('Registro non disponibile: verifica incompleta');
  await expect(panel).toContainText('File scaricato sul dispositivo: integrità non verificata');
  const layout=await inspectLayout({playwright:page});expect(layout.documentWidth).toBeLessThanOrEqual(width+2);expect(layout.renderError).toBe(false);
});
test('Complete club audit reports a server failure',async({page})=>{
  await page.goto('/seasons?role=admin&scenario=audit-failure');const panel=page.getByRole('region',{name:'Verifica completa dati società',exact:true});
  await panel.getByRole('button',{name:'Verifica dati completi',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('Verifica non disponibile');
});
for(const width of [390,1024])test(`Backup retains explicit download link ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto('/seasons?role=admin&scenario=backup-download');
  await page.getByRole('button',{name:'Scarica backup società',exact:true}).click();
  const link=page.getByRole('link',{name:'Salva backup generato',exact:true});
  await expect(link).toBeVisible();await expect(link).toHaveAttribute('download',/\.ndjson\.gz$/);
  await expect(link).toHaveAttribute('href',/^blob:/);
  const download=page.waitForEvent('download');await link.click();
  const result=await download;const file=await result.path();expect(file).toBeTruthy();const bytes=await readFile(file!);
  expect([...bytes.subarray(0,2)]).toEqual([31,139]);
  const layout=await inspectLayout({playwright:page});expect(layout.documentWidth).toBeLessThanOrEqual(width+2);
});
test('Retained reconciliation Excel contains source totals',async({page})=>{
  await page.goto('/secretary/payments?role=admin');
  await page.getByRole('button',{name:'Registro e grafici',exact:true}).click();
  await page.locator('summary').filter({hasText:'Controllo quadrature e dati mancanti'}).click();
  await page.getByRole('button',{name:'Esporta controllo Excel',exact:true}).click();
  const link=page.getByRole('link',{name:'Scarica Excel generato',exact:true});await expect(link).toBeVisible();
  const download=page.waitForEvent('download');await link.click();
  const result=await download;const file=await result.path();expect(file).toBeTruthy();
  const workbook=XLSX.read(await readFile(file!),{type:'buffer'});
  expect(workbook.SheetNames).toHaveLength(7);
  expect(XLSX.utils.sheet_to_json(workbook.Sheets.Quadrature).find((row:any)=>row.Voce==='Entrate registrate').Importo).toBe(370);
});
test('Invalid backup body does not become a downloadable archive',async({page})=>{
  await page.goto('/seasons?role=admin&scenario=backup-invalid');
  const region=page.getByRole('region',{name:'Backup dati società',exact:true});
  await region.getByRole('button',{name:'Scarica backup società',exact:true}).click();
  await expect(region.getByRole('alert')).toContainText('gzip');
  await expect(region.getByRole('link',{name:'Salva backup generato',exact:true})).toHaveCount(0);
});
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

for(const width of [320,390,768]) test(`Bilateral observations stay readable ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto('/player-performance?role=fitness_coach&scenario=motor-multiday');
  await page.getByRole('button',{name:'Apri sessione',exact:true}).click();
  await page.getByRole('button',{name:'Presenze e valutazioni',exact:true}).click();
  await page.getByRole('combobox',{name:'Giocatore da valutare',exact:true}).click();
  await page.getByRole('option',{name:'Nuovo presente della seconda giornata · Test da eseguire (0/9)',exact:true}).click();
  await page.getByRole('combobox',{name:'Esercizio da rilevare',exact:true}).click();
  await page.getByRole('option',{name:'7. Equilibrio monopodalico',exact:true}).click();
  const right=page.getByRole('group',{name:'Controlla la postura del tronco · destra',exact:true});
  const left=page.getByRole('group',{name:'Controlla la postura del tronco · sinistra',exact:true});
  await expect(right).toBeVisible();await expect(left).toBeVisible();
  const sizes=await page.locator('.motor-bilateral-observations > div').evaluateAll(nodes=>nodes.map(el=>el.getBoundingClientRect().width));
  expect(Math.min(...sizes)).toBeGreaterThan(140);
  const layout=await inspectLayout({playwright:page});expect(layout.documentWidth).toBeLessThanOrEqual(width+2);expect(layout.renderError).toBe(false);
});
for(const width of [320,768])test(`Board equipment and animation panels ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await page.goto('/tactical-board?role=coach');
  await page.getByRole('button',{name:'Strumenti · Giocatore 1',exact:true}).click();
  await page.getByRole('button',{name:'Attrezzatura',exact:true}).click();
  await expect(page.getByRole('button',{name:'Cono',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Animazione',exact:true}).click();
  await expect(page.getByRole('button',{name:'+ Fotogramma',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Riproduci',exact:true})).toBeDisabled();
  const layout=await inspectLayout({playwright:page});expect(layout.documentWidth).toBeLessThanOrEqual(width+2);expect(layout.overflow).toEqual([]);expect(layout.narrow).toEqual([]);
});
for(const width of [320,768])test(`Document attachment survives failed submission ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await page.goto('/secretary/documents?role=secretary');
  await page.getByRole('button',{name:'Aggiungi Documento',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Aggiungi Documento',exact:true});
  await dialog.getByRole('combobox',{name:'Giocatore',exact:true}).click();
  await page.getByRole('option',{name:'Giocatore dal cognome molto lungo Alessandro',exact:true}).click();
  await dialog.getByRole('combobox',{name:'Tipo Documento',exact:true}).click();
  await page.getByRole('option').first().click();
  const bytes=Buffer.from('%PDF-1.4\n% synthetic upload test only\n');
  await dialog.getByLabel('Carica documento da dispositivo',{exact:true}).setInputFiles({name:'certificato-collaudo.pdf',mimeType:'application/pdf',buffer:bytes});
  await expect(dialog.getByRole('status')).toContainText('certificato-collaudo.pdf');
  await expect(dialog.getByLabel('Scatta foto documento',{exact:true})).toHaveAttribute('capture','environment');
  await dialog.getByRole('button',{name:'Salva',exact:true}).click();
  await expect(page.getByText('Impossibile salvare il documento',{exact:true})).toBeVisible();
  await expect(dialog).toBeVisible();await expect(dialog.getByRole('status')).toContainText('certificato-collaudo.pdf');
  await expect(dialog.getByRole('button',{name:'Salva',exact:true})).toBeEnabled();
  const layout=await inspectLayout({playwright:page});expect(layout.documentWidth).toBeLessThanOrEqual(width+2);expect(layout.renderError).toBe(false);
});
