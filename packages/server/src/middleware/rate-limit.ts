/**
 * 速率限制中间件
 */

import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// 配置
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'); // 15分钟
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100');

/**
 * 获取客户端标识符
 */
function getClientId(req: Request): string {
  // 优先使用 X-Forwarded-For（如果在代理后面）
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ips.trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * 通用速率限制中间件
 */
export function rateLimit(options?: { windowMs?: number; max?: number }) {
  const windowMs = options?.windowMs || WINDOW_MS;
  const max = options?.max || MAX_REQUESTS;

  return (req: Request, res: Response, next: NextFunction) => {
    const clientId = getClientId(req);
    const now = Date.now();
    
    let record = rateLimitStore.get(clientId);
    
    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      rateLimitStore.set(clientId, record);
    } else {
      record.count++;
    }
    
    // 设置响应头
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));
    
    if (record.count > max) {
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
      });
      return;
    }
    
    next();
  };
}

/**
 * 严格的速率限制（用于敏感操作如登录）
 */
export function strictRateLimit() {
  // 开发环境放宽限制
  const isDev = process.env.NODE_ENV !== 'production';
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: isDev ? 100 : 10, // 开发环境100次，生产环境10次
  });
}

/**
 * API 速率限制
 */
export function apiRateLimit() {
  return rateLimit({
    windowMs: 60 * 1000, // 1分钟
    max: 60, // 每分钟60次
  });
}

// 定期清理过期记录
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 60 * 1000); // 每分钟清理一次
