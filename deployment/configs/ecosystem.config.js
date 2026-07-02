module.exports = {
  apps: [{
    name: 'gene-synthesis-platform',
    script: './dist/index.js',
    instances: 'max',  // 使用所有CPU核心
    exec_mode: 'cluster',  // 集群模式
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // 自动重启配置
    watch: false,  // 生产环境不建议开启watch
    max_memory_restart: '1G',  // 内存超过1G自动重启
    
    // 优雅重启
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,
    
    // 自动重启策略
    min_uptime: '10s',  // 最小运行时间
    max_restarts: 10,  // 最大重启次数
    autorestart: true,  // 自动重启
    
    // 环境变量从.env文件加载
    env_file: '.env'
  }]
};
