import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
const root = dirname(fileURLToPath(import.meta.url));
if (!existsSync(resolve(root, 'node_modules/three/build/three.min.js')) || !existsSync(resolve(root, 'node_modules/chart.js/dist/chart.umd.js'))) {
  console.log('Installing local visualization libraries (first launch only)…');
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status || 1);
}
const vendor = { '/vendor/three.js': 'three/build/three.min.js', '/vendor/OrbitControls.js': 'three/examples/js/controls/OrbitControls.js', '/vendor/chart.js': 'chart.js/dist/chart.umd.js' };
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png' };
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    if (path === '/__bioguard_health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ app: 'bioguard-studio', root }));
      return;
    }
    const base = resolve(root, 'frontend');
    const file = vendor[path] ? resolve(root, 'node_modules', vendor[path]) : resolve(base, '.' + (path === '/' ? '/simulation.html' : path));
    if (!vendor[path] && !file.startsWith(base + sep)) { res.writeHead(403).end(); return; }
    const data = readFileSync(file);
    res.writeHead(200, { 'Content-Type': (types[extname(file)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control':'no-cache' });
    res.end(data);
  } catch { res.writeHead(404).end('Not found'); }
});
function openBrowser(url) {
  if (process.platform === 'win32' && !process.env.BIOGUARD_NO_OPEN) {
    const browser = spawn('powershell.exe', ['-NoProfile','-WindowStyle','Hidden','-Command', `Start-Process '${url}'`], { windowsHide:true, stdio:'ignore' });
    browser.on('error', () => console.log(`Open ${url} in your browser.`));
    browser.unref();
  }
}
let port = Number(process.env.PORT || 4173);
let retries = 0;
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be a number between 1 and 65535.');
  process.exit(1);
}
async function isThisApp(url) {
  try {
    const response = await fetch(`${url}/__bioguard_health`, { signal: AbortSignal.timeout(1500) });
    if (response.ok) {
      const identity = await response.json();
      return identity.app === 'bioguard-studio' && identity.root === root;
    }
    // Recognize the previous launcher, which had no health endpoint.
    const page = await fetch(`${url}/simulation.html`, { signal: AbortSignal.timeout(1500) });
    return page.ok && await page.text() === readFileSync(resolve(root, 'frontend/simulation.html'), 'utf8');
  } catch { return false; }
}
server.on('error', async error => {
  if (error.code !== 'EADDRINUSE') { console.error(error.message); process.exitCode = 1; return; }
  const url = `http://127.0.0.1:${port}`;
  if (await isThisApp(url)) {
    console.log(`BioGuard is already running: ${url}\nOpening the existing app.`);
    openBrowser(url);
    return;
  }
  if (++retries > 10 || port === 65535) {
    console.error('No available port found. Set PORT to another number and retry.');
    process.exitCode = 1;
    return;
  }
  console.log(`Port ${port} belongs to another app; trying ${port + 1}…`);
  server.listen(++port, '127.0.0.1');
});
server.on('listening', () => {
  const url = `http://127.0.0.1:${server.address().port}`;
  console.log(`BioGuard Studio ready: ${url}\nLocal profiles, 3D simulation and reports. Ctrl+C to stop.`);
  openBrowser(url);
});
server.listen(port, '127.0.0.1');
