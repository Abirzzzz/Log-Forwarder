import { spawn, type ChildProcess } from "child_process";
import { join } from "path";
import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

// In production, the selfbot has no separate workflow — spawn and supervise it here.
// In development it runs as its own workflow, so we skip this to avoid duplicates.
if (process.env.NODE_ENV === "production") {
  const selfbotDir = join(process.cwd(), "selfbot");

  function startSelfbot(): ChildProcess {
    logger.info("[selfbot] starting...");

    const child = spawn("node", ["index.mjs"], {
      cwd: selfbotDir,
      env: process.env,
      stdio: "inherit",
    });

    child.on("exit", (code, signal) => {
      logger.warn({ code, signal }, "[selfbot] exited — restarting in 5s");
      setTimeout(startSelfbot, 5_000);
    });

    child.on("error", (err) => {
      logger.error({ err }, "[selfbot] spawn error — restarting in 5s");
      setTimeout(startSelfbot, 5_000);
    });

    return child;
  }

  startSelfbot();
}
