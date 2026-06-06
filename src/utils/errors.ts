export class AppError extends Error {
	readonly statusCode: number;

	constructor(message: string, statusCode: number) {
		super(message);
		this.name = new.target.name;
		this.statusCode = statusCode;
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

export class ValidationError extends AppError {
	constructor(message: string) {
		super(message, 422);
	}
}

export class UnauthorizedError extends AppError {
	constructor(message = 'Unauthorized') {
		super(message, 401);
	}
}

export class ForbiddenError extends AppError {
	constructor(message = 'Forbidden') {
		super(message, 403);
	}
}

export class NotFoundError extends AppError {
	constructor(message = 'Not Found') {
		super(message, 404);
	}
}

export class ConflictError extends AppError {
	constructor(message = 'Conflict') {
		super(message, 409);
	}
}
