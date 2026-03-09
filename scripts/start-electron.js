const { spawn } = require("child_process");

const electronBinary = require("electron");
const env = { ...process.env };

delete env.ELECTRON_RUN_AS_NODE;
if (!env.POS_DATA_SOURCE) {
  env.POS_DATA_SOURCE = "local";
}

const child = spawn(electronBinary, ["."], {
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
