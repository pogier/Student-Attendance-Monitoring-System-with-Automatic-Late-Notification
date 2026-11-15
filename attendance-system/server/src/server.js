'use strict';

require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const config = require('./config');
const { createApp } = require('./app');
const User = require('./models/User');
const { autoSeed } = require('./seed');
const { registerAllListeners } = require('./events');
const { setIO } = require('./services/realtime');

let memoryServer = null;

async function connectDatabase() {
  if (config.mongoUri) {
    await mongoose.connect(config.mongoUri);
    console.log(`[db] connected to MongoDB at ${config.mongoUri.replace(/\/\/[^@]*@/, '//***@')}`);
    return;
  }
  // No MONGODB_URI -> boot a throwaway in-memory MongoDB so the demo just works.
  console.log('[db] MONGODB_URI not set -> starting in-memory MongoDB...');
  const { MongoMemoryServer } = require('mongodb-memory-server-core');
  memoryServer = await MongoMemoryServer.create({
    binary: { version: config.memoryDbVersion },
    instance: config.dbPath ? { dbPath: config.dbPath, storageEngine: 'wiredTiger' } : {}
  });
  await mongoose.connect(memoryServer.getUri(), { dbName: 'attendance' });
  console.log('[db] in-memory MongoDB ready. NOTE: data resets when the server stops.');
}

async function ensureAdminUser() {
  const existing = await User.findOne({ username: config.admin.username });
  if (existing) return existing;
  const user = await User.create({
    name: config.admin.name,
    username: config.admin.username,
    passwordHash: await bcrypt.hash(config.admin.password, 10),
    role: 'admin'
  });
  console.log(
    `[auth] created default account -> username: ${config.admin.username} / password: ${config.admin.password}`
  );
  return user;
}

async function start() {
  await connectDatabase();
  await ensureAdminUser();
  try {
    await autoSeed();
  } catch (err) {
    console.error('[seed] skipped:', err.message);
  }

  // Register every event listener ONCE, before the server accepts requests.
  registerAllListeners();

  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
  });
  setIO(io);

  io.on('connection', (socket) => {
    console.log(`[socket] client connected (${socket.id})`);
    socket.on('disconnect', () => console.log(`[socket] client disconnected (${socket.id})`));
  });

  server.listen(config.port, '0.0.0.0', () => {
    console.log(`\n  Attendance API listening on http://0.0.0.0:${config.port}`);
    console.log(`  Health check: http://localhost:${config.port}/api/health\n`);
  });

  const shutdown = async (signal) => {
    console.log(`\n[server] ${signal} received, shutting down...`);
    io.close();
    server.close();
    await mongoose.connection.close();
    if (memoryServer) await memoryServer.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});
