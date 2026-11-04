export type ErrorCode = 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT';

export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
export class ValidationError extends DomainError {
  constructor(message: string) {
    super('VALIDATION', message);
  }
}
export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super('NOT_FOUND', `${entity} not found: ${id}`);
  }
}
/** Business-rule conflict (double booking, bed occupied, insufficient stock...). */
export class ConflictError extends DomainError {
  constructor(message: string) {
    super('CONFLICT', message);
  }
}
