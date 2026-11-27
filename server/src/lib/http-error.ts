export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

// Bad input is a 400 from the error handler (zod), and "not allowed" is reported as 404 so
// ids can't be probed, which is why there are no badRequest/forbidden helpers.
export const unauthorized = (msg = 'Not signed in') => new HttpError(401, msg);
export const notFound = (msg = 'Not found') => new HttpError(404, msg);
export const conflict = (msg = 'Conflict') => new HttpError(409, msg);
