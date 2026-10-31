export function resolveListenHost(host: string | undefined): string {
  return host?.trim() || '127.0.0.1';
}
