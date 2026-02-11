// keep-tunnel-alive.js
const { spawn } = require('child_process');

console.log('🚀 Starting localhost.run tunnel...');

function startTunnel() {
  console.log('🔗 Connecting to localhost.run...');
  
  const tunnel = spawn('ssh', [
    '-o', 'ServerAliveInterval=60',
    '-o', 'ServerAliveCountMax=3',
    '-R', '80:localhost:5000',
    'nokey@localhost.run'
  ], {
    stdio: 'inherit',
    shell: true
  });

  tunnel.on('close', (code) => {
    console.log(`🔄 Tunnel closed. Restarting in 3 seconds...`);
    setTimeout(startTunnel, 3000);
  });
}

// Handle exit
process.on('SIGINT', () => {
  console.log('🛑 Stopping tunnel...');
  process.exit(0);
});

startTunnel();