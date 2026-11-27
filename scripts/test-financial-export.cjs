const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { createRequire } = require("node:module");
const root = path.resolve(__dirname, ".."),
  web = createRequire(
    path.join(root, "artifacts/football-training-board/package.json"),
  ),
  esbuild = createRequire(web.resolve("vite"))("esbuild");
const entry = path.join(root, ".tools/financial-export-test.ts"),
  out = entry.replace(".ts", ".cjs");
fs.mkdirSync(path.dirname(entry), { recursive: true });
fs.writeFileSync(
  entry,
  `export {createExcelWorkbook,createExcelFile} from '../artifacts/football-training-board/src/lib/excel-export';export {financialExportSheets} from '../artifacts/football-training-board/src/lib/financial-reconciliation';export * as XLSX from 'xlsx';`,
);
esbuild.buildSync({
  entryPoints: [entry],
  outfile: out,
  bundle: true,
  platform: "node",
  format: "cjs",
  alias: { xlsx: web.resolve("xlsx") },
});
const { createExcelWorkbook, createExcelFile, financialExportSheets, XLSX } = require(out);
const income = [
  {
    id: 1,
    playerId: 101,
    playerName: "Atleta di collaudo",
    amount: 190,
    status: "paid",
    paymentDate: "2026-09-15",
    paymentMethod: "cash",
  },
  {
    id: 2,
    playerId: 101,
    amount: 180,
    status: "pending",
    dueDate: "2027-01-30",
  },
];
const details = {
  title: "Incarico test",
  allocations: [{ teamId: 11, amountCents: 10000 }],
};
const costs = {
  dues: [
    {
      id: 1,
      name: "Membro test",
      amountCents: 10000,
      paidCents: 3000,
      dueDate: "2026-12-31",
      details,
    },
  ],
  receipts: [
    {
      id: "receipt-1",
      dueId: 1,
      name: "Membro test",
      amountCents: 3000,
      paidDate: "2026-11-21",
      method: "cash",
    },
  ],
};
const wb = createExcelWorkbook(
  financialExportSheets(
    income,
    costs,
    { dues: [], receipts: [] },
    "2026-11-21",
  ),
);
const bytes = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }),
  read = XLSX.read(bytes, { type: "buffer" });
assert.equal(read.SheetNames.length, 7);
const totals = XLSX.utils.sheet_to_json(read.Sheets.Quadrature);
assert.equal(totals.find((r) => r.Voce === "Entrate registrate").Importo, 370);
assert.equal(totals.find((r) => r.Voce === "Membri · pagato").Importo, 30);
assert.equal(totals.find((r) => r.Voce === "Membri · residuo").Importo, 70);
assert.equal(XLSX.utils.sheet_to_json(read.Sheets.Entrate).length, 2);
assert.equal(read.Sheets.Quadrature.B2.t, "n");
fs.writeFileSync(
  path.join(root, ".tools/controllo-contabile-collaudo.xlsx"),
  bytes,
);
console.log(
  "PASS financial XLSX: seven sheets, round trip, numeric totals, source ledger and partial expense receipts",
);
const supplierWorkbook=createExcelWorkbook(financialExportSheets(income,costs,{dues:[],receipts:[]},"2026-11-21",costs));
const supplierRead=XLSX.read(XLSX.write(supplierWorkbook,{type:"buffer",bookType:"xlsx"}),{type:"buffer"});
assert.equal(supplierRead.SheetNames.length,9);
assert.equal(XLSX.utils.sheet_to_json(supplierRead.Sheets.Quadrature).find(r=>r.Voce==="Fornitori KIT · pagato").Importo,30);
assert.equal(XLSX.utils.sheet_to_json(supplierRead.Sheets["Fornitori KIT rate"])[0].Residuo,70);
assert.equal(XLSX.utils.sheet_to_json(supplierRead.Sheets["Fornitori KIT ricevute"])[0].Importo,30);
console.log("PASS supplier KIT XLSX: nine sheets, real workbook round trip, supplier residual and partial payment.");
const downloadFile=createExcelFile(financialExportSheets(income,costs,{dues:[],receipts:[]},"2026-11-21"),"controllo-download");
assert.equal(downloadFile.filename,"controllo-download.xlsx");
assert.equal(downloadFile.blob.type,"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
downloadFile.blob.arrayBuffer().then(bytes=>{
  const downloaded=XLSX.read(bytes,{type:"array"});
  assert.equal(downloaded.SheetNames.length,7);
  assert.equal(XLSX.utils.sheet_to_json(downloaded.Sheets.Quadrature).find(row=>row.Voce==="Entrate registrate").Importo,370);
  console.log("PASS retained Excel download: actual Blob round trip and source totals");
}).catch(error=>{console.error(error);process.exitCode=1;});
