const PLACEHOLDER_VALUES = new Set([
  '',
  'REPLACE_ME',
  'replace-me',
  'changeme',
  'change-me',
  'your-secret-here',
  'your-jwt-secret',
]);

function readRuntimeValue(name: string): string {
  const value = process.env[name]?.trim() || '';
  return PLACEHOLDER_VALUES.has(value) ? '' : value;
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function assertRuntimeConfig(): void {
  const isProduction = readRuntimeValue('NODE_ENV') === 'production';
  if (!isProduction) {
    return;
  }

  const missing: string[] = [];
  const invalid: string[] = [];

  const databaseUrl = readRuntimeValue('DATABASE_URL');
  const hasDatabaseParts = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'].every(
    (name) => Boolean(readRuntimeValue(name)),
  );
  if (!databaseUrl && !hasDatabaseParts) {
    missing.push('DATABASE_URL or DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME');
  }

  if (!readRuntimeValue('AUTH_JWT_SECRET') && !readRuntimeValue('NEXTAUTH_SECRET')) {
    missing.push('AUTH_JWT_SECRET or NEXTAUTH_SECRET');
  }

  const webAppUrl = readRuntimeValue('FIDUX_WEB_APP_URL');
  if (!webAppUrl) {
    missing.push('FIDUX_WEB_APP_URL');
  } else if (!isValidUrl(webAppUrl)) {
    invalid.push('FIDUX_WEB_APP_URL');
  }

  const apiPublicUrl = readRuntimeValue('FIDUX_API_PUBLIC_URL');
  if (apiPublicUrl && !isValidUrl(apiPublicUrl)) {
    invalid.push('FIDUX_API_PUBLIC_URL');
  }

  const verifyLinkUrl = readRuntimeValue('AUTH_VERIFY_LINK_BASE_URL');
  if (verifyLinkUrl && !isValidUrl(verifyLinkUrl)) {
    invalid.push('AUTH_VERIFY_LINK_BASE_URL');
  }

  const corsOrigins = readRuntimeValue('CORS_ALLOWED_ORIGINS');
  if (corsOrigins && corsOrigins !== '*') {
    const invalidOrigin = corsOrigins
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .find((value) => !isValidUrl(value));

    if (invalidOrigin) {
      invalid.push(`CORS_ALLOWED_ORIGINS (${invalidOrigin})`);
    }
  }

  if (missing.length === 0 && invalid.length === 0) {
    return;
  }

  const issues = [
    ...(missing.length > 0 ? [`missing ${missing.join(', ')}`] : []),
    ...(invalid.length > 0 ? [`invalid ${invalid.join(', ')}`] : []),
  ];

  throw new Error(`Invalid production runtime configuration: ${issues.join('; ')}`);
}
