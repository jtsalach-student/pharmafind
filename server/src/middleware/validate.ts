import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

export const validate =
  <T>(schema: ZodType<T>, source: 'body' | 'query' | 'params' = 'body') =>
  (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          message: 'Validation failed',
          issues: parsed.error.flatten(),
          requestId: req.requestId
        }
      });
      return;
    }
    (req as Request & Record<string, unknown>)[source] = parsed.data;
    next();
  };
