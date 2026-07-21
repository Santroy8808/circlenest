import type {
  EnvironmentSecretReference,
  SecretDescriptor,
  SecretStore
} from "@/modules/billing/secret-store.contract";

const ENVIRONMENT_VARIABLE_PATTERN = /^[A-Z][A-Z0-9_]{1,127}$/;

export function isValidSecretEnvironmentVariable(value: string) {
  return ENVIRONMENT_VARIABLE_PATTERN.test(value);
}

export class EnvironmentSecretStore implements SecretStore {
  async describe(reference: EnvironmentSecretReference): Promise<SecretDescriptor> {
    const value = await this.resolve(reference);
    return {
      reference,
      configured: Boolean(value),
      source: value ? "environment" : "missing"
    };
  }

  async resolve(reference: EnvironmentSecretReference) {
    if (!isValidSecretEnvironmentVariable(reference.environmentVariable)) {
      throw new Error("Invalid secret environment-variable reference.");
    }
    const value = process.env[reference.environmentVariable]?.trim();
    return value || null;
  }
}

export const environmentSecretStore = new EnvironmentSecretStore();
