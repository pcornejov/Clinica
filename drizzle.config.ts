import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: [".dev.vars", ".env"], quiet: true });

export default defineConfig({
  dialect: "postgresql",
  schema: "./app/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
