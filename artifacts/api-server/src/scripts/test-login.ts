import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function main(): Promise<void> {
  const { default: app } = await import("../app");
  const server = app.listen(3101);

  try {
    const res = await fetch("http://localhost:3101/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "test@gavinana.it",
        password: "123456",
      }),
    });

    const body = await res.text();
    console.log(`[login-test] login status: ${res.status}`);
    console.log(`[login-test] login body: ${body}`);

    const rawCookies =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : [];
    const cookieHeader = rawCookies.length
      ? rawCookies.map((c) => c.split(";")[0]).join("; ")
      : "";
    const meRes = await fetch("http://localhost:3101/api/auth/me", {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
    });
    const meBody = await meRes.text();
    console.log(`[login-test] /api/auth/me status: ${meRes.status}`);
    console.log(`[login-test] /api/auth/me body: ${meBody}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

main().catch((error) => {
  console.error("[login-test] errore:", error?.message ?? error);
  process.exitCode = 1;
});
