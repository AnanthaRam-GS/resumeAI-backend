export type SuccessResponse<T> = {
	success: true;
	data: T;
	message?: string;
};

export type ErrorResponse = {
	success: false;
	message: string;
	code?: string;
};

export const success = <T>(data: T, message?: string): SuccessResponse<T> => {
	if (message === undefined) {
		return { success: true, data };
	}

	return { success: true, data, message };
};

export const error = (message: string, code?: string): ErrorResponse => {
	if (code === undefined) {
		return {
			success: false,
			message,
		};
	}

	return {
		success: false,
		message,
		code,
	};
};
