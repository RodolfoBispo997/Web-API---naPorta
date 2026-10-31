export const JWT_SETTINGS = Symbol('JWT_SETTINGS');
export const JWT_ISSUER = 'naporta-api';
export const JWT_AUDIENCE = 'naporta-api';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export interface JwtSettings {
  secret: Uint8Array;
}

export function loadJwtSettings(): JwtSettings {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.trim().length === 0) {
    throw new Error('JWT_SECRET must be configured before starting the API.');
  }

  const secretBytes = new TextEncoder().encode(secret);
  if (secretBytes.byteLength < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes.');
  }

  return { secret: secretBytes };
}
