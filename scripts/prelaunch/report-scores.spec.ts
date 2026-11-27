import {test,expect} from "@playwright/test";
import {inspectLayout} from "./responsive-audit.mjs";
for(const width of [390,1024]){
  test(`Report goal flags and aggregate ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:900});
    await page.goto('/__report-editor?role=coach');
    const first=page.getByRole('checkbox',{name:'Giocatore con nome e cognome molto lungo, 1° tempo, gol 1',exact:true});
    const second=page.getByRole('checkbox',{name:'Giocatore con nome e cognome molto lungo, 1° tempo, gol 2',exact:true});
    await page.getByRole('spinbutton',{name:'Gol nostra squadra',exact:true}).nth(0).fill('2');
    await first.check();await second.check();
    await expect(page.getByText('Risultato finale:',{exact:false})).toContainText('2 – 0');
    await first.uncheck();await expect(second).toBeChecked();await expect(first).not.toBeChecked();
    await expect(page.getByRole('heading',{name:'Marcatori · 1 gol',exact:true})).toBeVisible();
    await page.getByRole('checkbox',{name:'Giocatore in panchina, 1° tempo, gol 1',exact:true}).click();
    await expect(page.getByRole('alert').filter({hasText:"registra prima l'ingresso"})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Marcatori · 1 gol',exact:true})).toBeVisible();
    const layout=await inspectLayout({playwright:page});expect(layout.renderError).toBe(false);expect(layout.documentWidth).toBeLessThanOrEqual(width+2);
  });
  test(`Championship sector and year filters ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:900});
    await page.goto('/scuola-calcio/campionati?role=technical_director&scenario=championship-scope');
    await page.getByRole('combobox',{name:'Annata di lavoro',exact:true}).click();
    await page.getByRole('option',{name:'Esordienti di collaudo',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Campionato Esordienti di collaudo',exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:/Campionato Primi Calci/})).toHaveCount(0);
    await expect(page.getByRole('region',{name:'Prossima partita della società',exact:true})).toContainText('BORGO SAN LORENZO');
    await page.getByRole('combobox',{name:'Settore di lavoro',exact:true}).click();
    await page.getByRole('option',{name:'Settore Giovanile',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Campionato Allievi di collaudo',exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Campionato Esordienti di collaudo',exact:true})).toHaveCount(0);
    const layout=await inspectLayout({playwright:page});expect(layout.renderError).toBe(false);expect(layout.documentWidth).toBeLessThanOrEqual(width+2);
  });
}
