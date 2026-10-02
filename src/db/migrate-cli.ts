import { runMigrations } from "./migrate";

async function main() {
  await runMigrations();
  console.info("Database migrations are up to date.");
}

void main().catch((error: unknown) => {
  console.error("Database migration failed.", error);
  process.exitCode = 1;
});
