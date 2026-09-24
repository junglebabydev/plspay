// pm2 process for the pilot. Env comes from .env.local (loaded by Next.js).
module.exports = {
  apps: [{
    name: "plspay",
    cwd: "/Users/plspay/plspay",
    script: "node_modules/next/dist/bin/next",
    args: "start -H 127.0.0.1 -p 3000",   // loopback only; Cloudflare Tunnel is the only way in
    instances: 1,
    max_memory_restart: "512M",
    env: { NODE_ENV: "production" },
  }],
};
