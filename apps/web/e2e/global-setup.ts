import { execSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");

export default async function globalSetup() {
  const env = {
    ...process.env,
    DATABASE_URL:
      process.env.DATABASE_URL ??
      "postgresql://comacoffe:comacoffe@127.0.0.1:5432/comacoffe",
    JWT_SECRET: process.env.JWT_SECRET ?? "e2e-test-jwt-secret-key-minimum-32-chars",
  };

  execSync("npm run build -w @comacoffe/api", { cwd: root, stdio: "inherit", env });
  execSync("npm run build -w @comacoffe/web", {
    cwd: root,
    stdio: "inherit",
    env: {
      ...env,
      NEXT_PUBLIC_API_BASE_URL: `http://127.0.0.1:${process.env.E2E_API_PORT ?? 3011}`,
    },
  });
  execSync("npm run db:migrate -w @comacoffe/api", { cwd: root, stdio: "inherit", env });
  execSync("ALLOW_DEMO_SEED=1 npm run db:seed-demo -w @comacoffe/api", {
    cwd: root,
    stdio: "inherit",
    env: { ...env, ALLOW_DEMO_SEED: "1", DEMO_SEED_PASSWORD: "demo1234" },
  });
}
