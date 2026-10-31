export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isBcryptPasswordLengthValid(password: string): boolean {
  return Buffer.byteLength(password, 'utf8') <= 72;
}
