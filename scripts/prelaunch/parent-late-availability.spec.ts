import {test,expect} from "@playwright/test";
import {inspectLayout} from "./responsive-audit.mjs";
for(const width of [390,1024]) test(`Parent can withdraw after deadline ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto('/parent/matches?role=parent&scenario=late-parent');
  await page.getByText('Disponibilità e dettagli',{exact:true}).click();
  await expect(page.getByRole('button',{name:'Disponibile',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Non più disponibile',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Indisponibilità registrata.'})).toBeVisible();
  await expect(page.getByText('Motivo: malattia',{exact:true})).toBeVisible();
  const layout=await inspectLayout({playwright:page});expect(layout.renderError).toBe(false);expect(layout.documentWidth).toBeLessThanOrEqual(width+2);
});
