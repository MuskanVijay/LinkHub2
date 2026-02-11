// tunnel.js
const { exec } = require('child_process');
const fs = require('fs');

console.log('🚀 Starting localhost.run tunnel...');

function startTunnel() {
  console.log('📡 Connecting...');
  
  const tunnel = exec('ssh -o ServerAliveInterval=60 -R 80:localhost:5000 nokey@localhost.run', {
    stdio: 'inherit'
  });

  tunnel.on('close', (code) => {
    console.log(`❌ Tunnel closed. Restarting in 3s...`);
    setTimeout(startTunnel, 3000);
  });
}

// Handle exit
process.on('SIGINT', () => {
  console.log('🛑 Stopping...');
  process.exit(0);
});

startTunnel();