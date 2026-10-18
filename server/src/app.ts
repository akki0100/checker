import express from 'express';
import cors from 'cors';
import { initDatabase } from './db';
import { authMiddleware } from './auth';
import { idempotencyMiddleware } from './idempotency';
import { startOutboxWorker } from './outbox';
import itemsRouter from './routes/items';
import metaRouter from './routes/meta';
import simulationRouter from './routes/simulation';
import jobsRouter from './routes/jobs';

export const app = express();

// Enable CORS for frontend dev server
app.use(
  cors({
    origin: '*',
    exposedHeaders: ['X-Idempotent-Replay', 'X-Idempotency-Key']
  })
);

app.use(express.json());

// Initialize database schema and seeds
initDatabase();

// Global health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'HEALTHY',
    system: 'Newtonite OpsPulse API',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Middleware pipeline:
// 1. Authenticate user persona
app.use(authMiddleware as any);

// 2. Idempotency middleware for POST/PATCH
app.use(idempotencyMiddleware as any);

// Mount API routes
app.use('/api/work-items', itemsRouter);
app.use('/api/meta', metaRouter);
app.use('/api/simulation', simulationRouter);
app.use('/api/jobs', jobsRouter);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled API Error:', err);
  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: err.message || 'An unexpected server error occurred.'
  });
});

// Start background worker when running directly
if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`[Newtonite OpsPulse] Server running on http://localhost:${PORT}`);
    startOutboxWorker(5000);
  });
}
