// Server-only environment. Never import from client components.
import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const env = {
  get supabaseUrl() { return required("SUPABASE_URL"); },
  get supabaseAnonKey() { return required("SUPABASE_ANON_KEY"); },
  get redisUrl() { return process.env.REDIS_URL ?? ""; },
  get appUrl() { return process.env.APP_URL ?? ""; },
};
