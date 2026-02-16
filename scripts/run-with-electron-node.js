const { spawn } = require("child_process");

const electronBinary = require("electron");
const scriptPath = process.argv[2];
const scriptArgs = process.argv.slice(3);

if (!scriptPath) {
  console.error("Usage: node scripts/run-with-electron-node.js <script> [...args]");
  process.exit(1);
}

const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1" };

const child = spawn(electronBinary, [scriptPath, ...scriptArgs], {
  stdio: "inherit",
  env
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

