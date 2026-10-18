// Ejecuta las pruebas de punta a punta, cada una sobre una base de datos recién cargada.
// Requisitos: la app corriendo (npm run build && npx vite preview --port 4173),
// Postgres local, psql y Chromium (npx playwright-core install chromium).
// Uso: npm run e2e            (todas)
//      npm run e2e -- fase5   (solo una)
import { execSync, spawnSync } from "node:child_process";

const todas = ["fase1", "fase2", "fase34", "fase5", "fase6", "fase7"];
const elegidas = process.argv.slice(2).length ? process.argv.slice(2) : todas;
let fallidas = 0;

for (const nombre of elegidas) {
  execSync("npm run db:reset", { stdio: "ignore" });
  console.log(`\n══ ${nombre} ══`);
  const r = spawnSync(process.execPath, [`e2e/${nombre}.mjs`], { stdio: "inherit" });
  if (r.status !== 0) fallidas++;
}
process.exit(fallidas ? 1 : 0);
