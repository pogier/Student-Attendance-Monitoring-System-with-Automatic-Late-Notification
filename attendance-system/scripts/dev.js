#!/usr/bin/env node
'use strict';

/**
 * Cross-platform dev runner — starts the API and the Vite dev server together.
 *
 * Uses only Node built-ins, so `npm run dev` works without installing any
 * extra dependency (no concurrently, no root node_modules needed).
 *
 *   node scripts/dev.js        -> API + web app
 *   node scripts/dev.js api    -> API only
 *   node scripts/dev.js web    -> web app only
 */

const { spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';

const RESET = '\x1b[0m';
const TARGETS = {
  api: { name: 'API', color: '\x1b[36m', dir: 'server', args: ['start'] },
  web: { name: 'WEB', color: '\x1b[35m', dir: 'client', args: ['run', 'dev'] }
};

const requested = process.argv.slice(2).filter((a) => TARGETS[a]);
const selected = requested.length ? requested : ['api', 'web'];

const children = [];
let shuttingDown = false;

function prefixStream(stream, prefix) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) process.stdout.write(`${prefix}${line}\n`);
  });
  stream.on('end', () => {
    if (buffer.trim()) process.stdout.write(`${prefix}${buffer}\n`);
  });
}

function start(key) {
  const target = TARGETS[key];
  const prefix = `${target.color}[${target.name}]${RESET} `;
  const cwd = path.join(ROOT, target.dir);

  // shell:true is what makes `npm.cmd` resolvable on Windows.
  const child = spawn(npm, target.args, { cwd, shell: isWindows, env: process.env });

  prefixStream(child.stdout, prefix);
  prefixStream(child.stderr, prefix);

  child.on('error', (err) => {
    console.error(`${prefix}failed to start: ${err.message}`);
    shutdown(1);
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.log(`${prefix}exited (${signal || code})`);
    // If one side dies, stop the other so you don't end up with a half-running stack.
    shutdown(code || 1);
  });

  children.push(child);
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    if (isWindows) {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }
  setTimeout(() => process.exit(code), 400);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('\n  Starting: ' + selected.map((k) => TARGETS[k].name).join(' + '));
console.log('  Web app : http://localhost:5173   (login: admin / admin123)');
console.log('  API     : http://localhost:5000/api/health');
console.log('  Press Ctrl+C to stop both.\n');

selected.forEach(start);
