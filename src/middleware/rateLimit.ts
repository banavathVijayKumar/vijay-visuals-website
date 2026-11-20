import type { NextFunction, Request, Response } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Periodically prune expired buckets to avoid memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}, 60_000).unref?.();

export function createApiRateLimiter(options?: { windowMs?: number; maxRequests?: number }) {
  const windowMs = options?.windowMs ?? 60_000;
  const maxRequests = options?.maxRequests ?? 240;

  return function apiRateLimiter(req: Request, res: Response, next: NextFunction) {
    // Do not rate-limit webhook deliveries or health probes
    if (req.path === '/api/health' || req.path.startsWith('/api/webhooks/')) {
      return next();
    }

    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const clientKey = forwarded || req.ip || 'local';
    const now = Date.now();

    let bucket = buckets.get(clientKey);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(clientKey, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, maxRequests - bucket.count);
    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > maxRequests) {
      return res.status(429).json({
        error: 'Too many requests in a short time. Please wait a moment and try again.',
      });
    }

    return next();
  };
}
