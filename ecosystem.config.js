module.exports = {
  apps: [
    {
      name: 'yiqikan',
      script: 'production-final.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        HOSTNAME: '0.0.0.0',
        PORT: '3000',
        WS_PORT: '3001',

        USERNAME: 'admin',
        PASSWORD: 'orange',
        NEXT_PUBLIC_SITE_NAME: '一起看',
        NEXT_PUBLIC_STORAGE_TYPE: 'redis',
        REDIS_URL: 'redis://127.0.0.1:6379',
        NEXT_PUBLIC_REQUIRE_DEVICE_CODE: 'false',

        NEXT_PUBLIC_DOUBAN_PROXY_TYPE: 'cmliussss-cdn-tencent',
        NEXT_PUBLIC_DOUBAN_IMAGE_PROXY_TYPE: 'cmliussss-cdn-tencent',
        NEXT_PUBLIC_FLUID_SEARCH: 'true',
      },
    },
  ],
};
