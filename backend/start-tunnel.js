// start-tunnel.js
const { spawn } = require('child_process');

let tunnelProcess = null;

function startTunnel() {
  console.log('🚀 Starting LocalTunnel on port 5000...');
  
  tunnelProcess = spawn('lt', [
    '--port', '5000',
    '--subdomain', 'linkhub-backend',
    '--local-host', 'localhost'
  ], {
    stdio: 'inherit',
    shell: true
  });

  tunnelProcess.on('close', (code) => {
    console.log(`❌ Tunnel closed. Restarting in 5 seconds...`);
    setTimeout(startTunnel, 5000);
  });
}

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('🛑 Stopping LocalTunnel...');
  if (tunnelProcess) tunnelProcess.kill();
  process.exit(0);
});

startTunnel();