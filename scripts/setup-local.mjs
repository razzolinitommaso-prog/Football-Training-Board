import { spawnSync } from "node:child_process";

const steps = [
  { log: "[1/3] Push schema", args: ["--filter", "@workspace/db", "push"] },
  { log: "[2/3] Import data", args: ["--filter", "@workspace/api-server", "import-db"] },
  { log: "[3/3] Test login", args: ["--filter", "@workspace/api-server", "test-login"] },
];

function runPnpm(args) {
  const r = spawnSync("pnpm", args, {
    stdio: "inherit",
    shell: true,
  });
  const code = r.status ?? (r.signal ? 1 : 0);
  if (code !== 0) {
    process.exit(code);
  }
}

for (const step of steps) {
  console.log(step.log);
  runPnpm(step.args);
}

console.log("LOCAL SETUP OK");
