export class ApplicationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode = 500,
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}
