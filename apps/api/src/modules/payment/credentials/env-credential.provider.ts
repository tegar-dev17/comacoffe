import type { CredentialProvider } from "./types.js";

/**
 * Resolves credential references without storing secrets in the database.
 * Supported refs:
 * - env:VAR_NAME — reads process.env.VAR_NAME
 * - env:DEFAULT_MIDTRANS_SERVER_KEY — alias handled by caller
 */
export class EnvCredentialProvider implements CredentialProvider {
  async resolve(ref: string | null | undefined): Promise<string | undefined> {
    if (!ref) return undefined;
    if (!ref.startsWith("env:")) {
      throw new Error(`Unsupported credential ref prefix for EnvCredentialProvider: ${ref.split(":")[0]}`);
    }
    const varName = ref.slice("env:".length);
    if (!varName || !/^[A-Z0-9_]+$/.test(varName)) {
      throw new Error("Invalid env credential reference");
    }
    return process.env[varName];
  }
}
