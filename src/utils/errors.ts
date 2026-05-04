export type EgovErrorPayload = {
	code: number | string;
	message: string;
	retryable: boolean;
};

export class EgovApiError extends Error {
	readonly code: number | string;
	readonly retryable: boolean;

	constructor(code: number | string, message: string, retryable: boolean) {
		super(message);
		this.name = "EgovApiError";
		this.code = code;
		this.retryable = retryable;
	}

	toPayload(): EgovErrorPayload {
		return { code: this.code, message: this.message, retryable: this.retryable };
	}
}

export class EgovRateLimitError extends EgovApiError {
	readonly retryAfterSeconds: number | null;

	constructor(retryAfterSeconds: number | null, message = "e-Gov API rate limit exceeded") {
		super(429, message, true);
		this.name = "EgovRateLimitError";
		this.retryAfterSeconds = retryAfterSeconds;
	}
}

export class EgovNetworkError extends EgovApiError {
	constructor(message: string) {
		super(0, message, true);
		this.name = "EgovNetworkError";
	}
}

export class EgovNotFoundError extends EgovApiError {
	readonly law_id: string;

	constructor(law_id: string, message = `Law not found: ${law_id}`) {
		super("law_not_found", message, false);
		this.name = "EgovNotFoundError";
		this.law_id = law_id;
	}

	toPayload(): EgovErrorPayload & { law_id: string } {
		return { ...super.toPayload(), law_id: this.law_id };
	}
}

export function isRetryableHttpStatus(status: number): boolean {
	return status === 408 || status === 425 || status === 500 || status === 502 || status === 503 || status === 504;
}
