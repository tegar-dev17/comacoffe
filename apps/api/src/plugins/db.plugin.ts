import fp from "fastify-plugin";
import type { AppDatabase } from "../db/client.js";

declare module "fastify" {
  interface FastifyInstance {
    db: AppDatabase;
  }
}

export default fp(async (app, opts: { db: AppDatabase }) => {
  app.decorate("db", opts.db);
});
