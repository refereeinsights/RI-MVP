import { HotelPlannerApiError } from "./hotelPlannerProvider";

export type HotelSearchFailureCategory =
  | "UPSTREAM_REQUEST_FAILURE"
  | "RESPONSE_PARSING_FAILURE"
  | "UNKNOWN";

export type HotelSearchFailureClassification = {
  category: HotelSearchFailureCategory;
  statusCode: number;
  errorCode: string;
  publicMessage: string;
};

function errorText(error: unknown) {
  return error instanceof Error ? error.message.toLowerCase() : "";
}

export function classifyHotelSearchFailure(error: unknown): HotelSearchFailureClassification {
  if (error instanceof HotelPlannerApiError) {
    if (error.message.startsWith("Invalid JSON response")) {
      return {
        category: "RESPONSE_PARSING_FAILURE",
        statusCode: 502,
        errorCode: "response_parsing_failure",
        publicMessage: "Hotel search response could not be processed.",
      };
    }

    if (error.status === 429 || error.code === 429) {
      return {
        category: "UPSTREAM_REQUEST_FAILURE",
        statusCode: 502,
        errorCode: "upstream_rate_limited",
        publicMessage: "Hotel search partner is busy.",
      };
    }

    if (error.status === 401 || error.status === 403 || error.code === 401 || error.code === 403) {
      return {
        category: "UPSTREAM_REQUEST_FAILURE",
        statusCode: 502,
        errorCode: "upstream_auth_failure",
        publicMessage: "Hotel search partner is unavailable.",
      };
    }

    if (error.status === 408 || error.status === 504 || error.code === 408 || error.code === 504) {
      return {
        category: "UPSTREAM_REQUEST_FAILURE",
        statusCode: 502,
        errorCode: "upstream_timeout",
        publicMessage: "Hotel search partner took too long to respond.",
      };
    }

    return {
      category: "UPSTREAM_REQUEST_FAILURE",
      statusCode: 502,
      errorCode: error.status >= 200 && error.status < 300 ? "upstream_rejected_response" : "upstream_request_failure",
      publicMessage: "Hotel search partner is unavailable.",
    };
  }

  const message = errorText(error);
  if (message.includes("timeout") || message.includes("timed out") || message.includes("abort")) {
    return {
      category: "UPSTREAM_REQUEST_FAILURE",
      statusCode: 502,
      errorCode: "upstream_timeout",
      publicMessage: "Hotel search partner took too long to respond.",
    };
  }

  if (error instanceof Error && error.message === "Fallback provider not implemented.") {
    return {
      category: "UPSTREAM_REQUEST_FAILURE",
      statusCode: 502,
      errorCode: "provider_not_configured",
      publicMessage: "Hotel search partner is unavailable.",
    };
  }

  if (error instanceof Error && error.message.startsWith("Missing ")) {
    return {
      category: "UNKNOWN",
      statusCode: 500,
      errorCode: "server_configuration_error",
      publicMessage: "Hotel search is not configured.",
    };
  }

  return {
    category: "UNKNOWN",
    statusCode: 500,
    errorCode: "server_error",
    publicMessage: "Hotel search is unavailable.",
  };
}
