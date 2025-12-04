/**
 * Centralized Error Handling
 * 
 * Provides consistent error handling and logging across all services.
 */

import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Express error handling middleware
 */
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  let statusCode = 500;
  let message = 'Internal Server Error';
  let isOperational = false;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    isOperational = err.isOperational;
  }

  // Log error
  console.error(`❌ Error [${statusCode}]:`, {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    isOperational,
  });

  // Send response
  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Validation error (400)
 */
export function validationError(message: string) {
  return new AppError(400, message);
}

/**
 * Not found error (404)
 */
export function notFoundError(resource: string) {
  return new AppError(404, `${resource} not found`);
}

/**
 * Unauthorized error (401)
 */
export function unauthorizedError(message = 'Unauthorized') {
  return new AppError(401, message);
}

/**
 * Forbidden error (403)
 */
export function forbiddenError(message = 'Forbidden') {
  return new AppError(403, message);
}

/**
 * Conflict error (409)
 */
export function conflictError(message: string) {
  return new AppError(409, message);
}

/**
 * Service unavailable error (503)
 */
export function serviceUnavailableError(message: string) {
  return new AppError(503, message, false);
}

