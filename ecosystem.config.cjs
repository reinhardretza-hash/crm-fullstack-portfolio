module.exports = {
  apps: [
    {
      name: "rdevolution-crm",
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3000",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      min_uptime: "10s",
      max_restarts: 10,
      exp_backoff_restart_delay: 1000,
      kill_timeout: 15000,
      max_memory_restart: "1G",
      time: true,
      env: { NODE_ENV: "production" },
    },
  ],
};
