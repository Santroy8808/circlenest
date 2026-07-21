/**
 * Secrets are referenced by environment-variable name rather than persisted in
 * application configuration records. Implementations are responsible for reading
 * the environment and must never serialize resolved values into API responses,
 * logs, diagnostics, or audit metadata.
 */
export type EnvironmentSecretReference = {
  provider: "environment";
  environmentVariable: string;
};

export type SecretReference = EnvironmentSecretReference;

export type SecretDescriptor = {
  reference: SecretReference;
  configured: boolean;
  source: "environment" | "missing";
};

export interface SecretStore {
  describe(reference: SecretReference): Promise<SecretDescriptor>;
  resolve(reference: SecretReference): Promise<string | null>;
}
