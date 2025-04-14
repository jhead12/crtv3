import { NextRequest, NextResponse } from 'next/server';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { createClient } from 'redis';
import { readFileSync } from 'fs';
import path from 'path';

// Ensure dynamic execution for middleware
export const dynamic = 'force-dynamic';

// Validate environment variables
const redisConfig = {
  password: process.env.REDIS_PASSWORD,
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  certPath: process.env.REDIS_CERT_PATH ?? './certs',
};

if (!redisConfig.password || !redisConfig.host) {
  throw new Error('REDIS_PASSWORD and REDIS_HOST are required');
}

// Initialize Redis client with TLS for redis@2.x
const redisClient = createClient({
  host: redisConfig.host,
  port: redisConfig.port,
  password: redisConfig.password,
  tls: {
    key: readFileSync(
      path.join(redisConfig.certPath, 'redis_user_private.key'),
    ),
    cert: readFileSync(path.join(redisConfig.certPath, 'redis_user.crt')),
    ca: [readFileSync(path.join(redisConfig.certPath, 'redis_ca.pem'))],
  },
});

// Initialize RateLimiterRedis
const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  points: parseInt(process.env.RATE_LIMIT_POINTS ?? '100', 10), // Max requests
  duration: parseInt(process.env.RATE_LIMIT_DURATION ?? '60', 10), // Seconds
  keyPrefix: 'ratelimit',
});

// Handle Redis errors
redisClient.on('error', (err) => {
  console.error('Redis client error:', err);
});

// Log connection status
redisClient |
  redisClient.on('connect', () => {
    console.log('Redis client connected');
  });

// Middleware for rate limiting
export async function middleware(req: NextRequest) {
  // Extract client IP (consider proxies)
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.ip ??
    '127.0.0.1';

  try {
    // Ensure Redis is connected
    if (!redisClient.connected) {
      // redis@2.x connects implicitly, but ping ensures readiness
      await new Promise((resolve, reject) => {
        redisClient.ping((err) => (err ? reject(err) : resolve(null)));
      });
    }

    // Consume rate limit points
    const result = await rateLimiter.consume(ip);

    // Set rate limit headers
    const headers = new Headers({
      'Cache-Control': 'no-store',
      'X-RateLimit-Limit': rateLimiter.points.toString(),
      'X-RateLimit-Remaining': result.remainingPoints.toString(),
      'X-RateLimit-Reset': Math.ceil(result.msBeforeNext / 1000).toString(),
    });

    return NextResponse.next({ headers });
  } catch (error) {
    // Handle rate limit exceeded
    if (error instanceof Error && error.name === 'RateLimiterRes') {
      const rateLimitData = await rateLimiter.get(ip);
      const headers = new Headers({
        'Cache-Control': 'no-store',
        'X-RateLimit-Limit': rateLimiter.points.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': Math.ceil(
          (rateLimitData?.msBeforeNext ?? rateLimiter.duration * 1000) / 1000,
        ).toString(),
      });

      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers },
      );
    }

    // Log unexpected errors and allow request as fallback
    console.error('Rate limit check failed:', error);
    return NextResponse.next();
  }
}

// Graceful shutdown
const shutdown = async () => {
  try {
    if (redisClient.connected) {
      await new Promise((resolve, reject) => {
        redisClient.quit((err) => (err ? reject(err) : resolve(null)));
      });
      console.log('Redis client disconnected');
    }
  } catch (err) {
    console.error('Redis shutdown failed:', err);
  }
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
