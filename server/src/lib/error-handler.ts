import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ApiError } from '@party-sheets/shared';
import { HttpError } from './http-error';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const body: ApiError = {
      error: 'Validation failed',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
    res.status(400).json(body);
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message } satisfies ApiError);
    return;
  }

  // Malformed JSON bodies from express.json()
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Malformed JSON body' } satisfies ApiError);
    return;
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' } satisfies ApiError);
};
