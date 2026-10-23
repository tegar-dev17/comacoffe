import Fastify from "fastify";
import { describe, expect, it, afterEach } from "vitest";
import { loadEnv, resetEnvCacheForTests } from "../config/env.js";
import dbPlugin from "../plugins/db.plugin.js";
import authPlugin from "../plugins/auth.plugin.js";
import { registerDevRoutes } from "./dev.routes.js";
import { createDb, createDbPool } from "../db/client.js";

describe("dev routes production guard", () => {
  afterEach(() => {
    resetEnvCacheForTests();
  });

  it("does not register dev endpoints when disabled", async () => {
    const env = loadEnv({
      NODE_ENV: "production",
      JWT_SECRET: "super-production-secret-value-32chars-minimum",
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://comacoffe:comacoffe@localhost:5432/comacoffe",
      PAYMENT_ENV: "production",
      MIDTRANS_API_BASE_URL: "https://api.midtrans.com",
      ENABLE_DEV_ROUTES: "false",
    });

    const pool = createDbPool(env.DATABASE_URL);
    const db = createDb(pool);
    const app = Fastify();
    await app.register(dbPlugin, { db });
    await app.register(authPlugin, { jwtSecret: env.JWT_SECRET });
    await registerDevRoutes(app, env);

    const bootstrap = await app.inject({
      method: "POST",
      url: "/api/v1/dev/bootstrap",
    });
    expect(bootstrap.statusCode).toBe(404);

    await app.close();
    await pool.end();
  });
});
