import type { FastifyInstance } from "fastify";
import { ReportsForbiddenError, ReportsService } from "../modules/pos/reports.service.js";

export async function registerReportRoutes(app: FastifyInstance) {
  const reports = new ReportsService(app.db);

  app.get(
    "/api/v1/reports/sales-summary",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const qs = request.query as { from?: string; to?: string; outletId?: string };
      if (!qs.from || !qs.to) {
        return reply.status(400).send({ error: "from and to (ISO date) required" });
      }
      const from = new Date(qs.from);
      const to = new Date(qs.to);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return reply.status(400).send({ error: "Invalid date range" });
      }
      try {
        const data = await reports.salesSummary(request.auth!, {
          from,
          to,
          outletId: qs.outletId,
        });
        return { data };
      } catch (err) {
        if (err instanceof ReportsForbiddenError) {
          return reply.status(403).send({ error: err.message });
        }
        throw err;
      }
    },
  );
}
