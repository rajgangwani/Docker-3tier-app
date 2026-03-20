'use strict';
const http = require('http');
const mysql = require('mysql2/promise');

const PORT = 3000;
const DB_HOST = process.env.DB_HOST || 'db';
const DB_PORT = parseInt(process.env.DB_PORT || '3306', 10);
const DB_USER = process.env.DB_USER || 'appuser';
const DB_PASSWORD = process.env.DB_PASSWORD || 'apppassword';
const DB_NAME = process.env.DB_NAME || 'appdb';

// ── DB pool ───────────────────────────────────────────────────────────────────
let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });
  }
  return pool;
}

// ── Request router ────────────────────────────────────────────────────────────
async function handler(req, res) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', service: 'backend-api', timestamp: new Date().toISOString() }));
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    let dbStatus = 'error';
    let dbError = null;
    try {
      const conn = await getPool().getConnection();
      await conn.ping();
      conn.release();
      dbStatus = 'ok';
    } catch (err) {
      dbError = err.message;
      console.error(`[health] DB ping failed: ${err.message}`);
      pool = null; // reset pool so next attempt reconnects
    }

    const httpStatus = dbStatus === 'ok' ? 200 : 503;
    res.writeHead(httpStatus);
    res.end(JSON.stringify({
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      database: dbStatus,
      ...(dbError && { db_error: dbError }),
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'not found' }));
}

// ── Server ────────────────────────────────────────────────────────────────────
const server = http.createServer(handler);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[${new Date().toISOString()}] Backend API listening on port ${PORT}`);
  console.log(`  DB host: ${DB_HOST}:${DB_PORT}  DB: ${DB_NAME}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM — shutting down gracefully');
  server.close(() => process.exit(0));
});
