export type SuccessResponse<T> = {
	success: true;
	data: T;
	message?: string;
};

export type ErrorResponse = {
	success: false;
	message: string;
};

export const success = <T>(data: T, message?: string): SuccessResponse<T> => {
	if (message === undefined) {
		return { success: true, data };
	}

	return { success: true, data, message };
};

export const error = (message: string): ErrorResponse => {
	return {
		success: false,
		message,
	};
};
