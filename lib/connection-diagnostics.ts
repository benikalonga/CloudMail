export type ConnectionTestStage = "settings" | "admin";

export type ConnectionDiagnosticCode =
  | "site_password_rejected"
  | "admin_password_rejected"
  | "unsupported_backend"
  | "network_timeout"
  | "network_unreachable"
  | "rate_limited"
  | "worker_error"
  | "request_rejected";

export type ConnectionDiagnostic = {
  code: ConnectionDiagnosticCode;
  title: string;
  message: string;
  suggestion: string;
};

type ErrorLike = {
  message?: string;
  status?: number;
  path?: string;
};

export function describeConnectionError(
  error: unknown,
  stage: ConnectionTestStage
): ConnectionDiagnostic {
  const candidate = (error || {}) as ErrorLike;
  const status = Number(candidate.status || 0);
  const message = String(candidate.message || "");
  const lowerMessage = message.toLowerCase();

  if ([404, 405, 501].includes(status)) {
    return {
      code: "unsupported_backend",
      title: "Incompatible backend API",
      message: "The Worker is reachable but is missing the compatible endpoints CloudMail needs.",
      suggestion: "Check the Worker version and deployment source, and redeploy a version compatible with this client.",
    };
  }

  if (status === 401 || status === 403) {
    if (stage === "settings") {
      return {
        code: "site_password_rejected",
        title: "Site password rejected",
        message: "The Worker rejected the request while reading public settings.",
        suggestion: "If the Worker has PASSWORDS configured, enter the site password; otherwise leave it empty.",
      };
    }
    return {
      code: "admin_password_rejected",
      title: "Admin password rejected",
      message: "Public settings loaded, but the Worker rejected admin authentication.",
      suggestion: "Make sure this profile's admin password exactly matches the Worker's ADMIN_PASSWORDS.",
    };
  }

  if (status === 429) {
    return {
      code: "rate_limited",
      title: "Too many requests",
      message: "The Worker is temporarily rate-limiting connection tests.",
      suggestion: "Wait a moment and try again; avoid tapping Test connection repeatedly.",
    };
  }

  if (
    lowerMessage.includes("timeout") ||
    lowerMessage.includes("timed out") ||
    lowerMessage.includes("aborted")
  ) {
    return {
      code: "network_timeout",
      title: "Connection timed out",
      message: "No response from the Worker within the time limit.",
      suggestion: "Check the network, the Worker domain and Cloudflare status, then try again.",
    };
  }

  if (status >= 500) {
    return {
      code: "worker_error",
      title: "Worker error",
      message: `The Worker returned HTTP ${status}; the request reached the server but did not complete normally.`,
      suggestion: "Check recent Worker deployments, D1/KV bindings and Cloudflare logs.",
    };
  }

  if (!status) {
    return {
      code: "network_unreachable",
      title: "Cannot reach the Worker",
      message: "The client did not receive a valid HTTP response.",
      suggestion: "Check the Worker URL, HTTPS certificate, network and DNS.",
    };
  }

  return {
    code: "request_rejected",
    title: "Connection test failed",
    message: `The Worker returned HTTP ${status}.`,
    suggestion: "Check the Worker configuration and version, then try again.",
  };
}
