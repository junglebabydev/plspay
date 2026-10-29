// Server-only environment. Never import from client components.
import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const env = {
  /** PocketBase as this server reaches it, e.g. http://plspay-pb:8090 on the Coolify network. Never sent to the browser. */
  get pbUrl() { return required("PB_INTERNAL_URL").replace(/\/+$/, ""); },
  get appUrl() { return process.env.APP_URL ?? ""; },
};
