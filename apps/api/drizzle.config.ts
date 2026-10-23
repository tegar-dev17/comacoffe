import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: [
    "./src/db/schema/enums.ts",
    "./src/db/schema/core.ts",
    "./src/db/schema/payment.ts",
  ],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://comacoffe:comacoffe@localhost:5432/comacoffe",
  },
});
