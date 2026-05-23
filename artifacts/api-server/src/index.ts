import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

console.log("[env] DATABASE_URL configured:", Boolean(process.env.DATABASE_URL));
console.log("[env] PORT =", process.env.PORT ?? "(default)");

const port = Number(process.env.PORT) || 3001;

const { default: app } = await import("./app");

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
