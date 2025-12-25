/**
 * 认证中间件
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { JWTPayload } from '@secure-notebook/shared';

const JWT_SECRET = process.env.JWT_SECRET;

// 生产环境必须设置 JWT_SECRET
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable must be set in production');
}

const EFFECTIVE_JWT_SECRET = JWT_SECRET || 'dev-secret-only-for-development';

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}

/**
 * JWT认证中间件
 */
export function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }
  
  const token = authHeader.substring(7);
  
  try {
    const payload = jwt.verify(token, EFFECTIVE_JWT_SECRET) as JWTPayload;
    req.user = payload;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * 生成JWT令牌
 */
export function generateToken(payload: Omit<JWTPayload, 'exp' | 'iat'>): string {
  return jwt.sign(payload, EFFECTIVE_JWT_SECRET, { expiresIn: '7d' });
}

/**
 * 验证JWT令牌
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, EFFECTIVE_JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}
