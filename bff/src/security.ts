const FORBIDDEN_ENV_VARS = ['ADMIN_PRIVATE_KEY', 'SESSION_SECRET', 'DATABASE_URL'] as const

export function assertSecureEnv(): void {
  for (const key of FORBIDDEN_ENV_VARS) {
    if (process.env[key]) {
      throw new Error(
        `BFF security violation: ${key} must not be set. BFF is stateless and holds no sensitive keys.`,
      )
    }
  }
}
