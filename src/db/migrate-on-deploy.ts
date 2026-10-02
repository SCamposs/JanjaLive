import { runMigrations } from "./migrate";

async function main() {
  if (process.env.VERCEL && process.env.DATABASE_URL) {
    await runMigrations();
    console.info("Database migrations are up to date.");
  } else {
    console.info("Skipping deployment migration outside a configured Vercel build.");
  }
}

void main().catch((error: unknown) => {
  console.error("Deployment migration failed.", error);
  process.exitCode = 1;
});
