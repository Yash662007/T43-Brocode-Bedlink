export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const notFound = (message: string) => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);
export const badRequest = (message: string) => new HttpError(400, message);
export const unauthorized = (message: string) => new HttpError(401, message);
