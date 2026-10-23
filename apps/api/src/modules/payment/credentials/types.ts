export interface ResolvedProviderCredentials {
  serverKey?: string;
  clientKey?: string;
  webhookToken?: string;
  apiBaseUrl?: string;
}

export interface CredentialProvider {
  resolve(ref: string | null | undefined): Promise<string | undefined>;
}
