import type { NextFunction, Request, Response } from 'express';

export const notFound = (req: Request, res: Response): void => {
  res.status(404).json({ error: { message: 'Not found', requestId: req.requestId } });
};

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const isProd = process.env.NODE_ENV === 'production';
  res.status(500).json({
    error: {
      message: err.message || 'Internal server error',
      requestId: req.requestId,
      ...(isProd ? {} : { stack: err.stack })
    }
  });
};
