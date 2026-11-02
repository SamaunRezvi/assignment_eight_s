import { createApp } from "./app.js";
import { closeDatabase, connectDatabase } from "./config/db.js";
import { env } from "./config/env.js";

async function main() {
  await connectDatabase();
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    console.info(`StudioSpace API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal: string) => {
    console.info(`${signal} received, shutting down`);
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
