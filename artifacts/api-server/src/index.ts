import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

console.log("[env-debug] DATABASE_URL =", process.env.DATABASE_URL);
console.log("[env-debug] PORT =", process.env.PORT);

const port = Number(process.env.PORT) || 3001;

const { default: app } = await import("./app");

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});