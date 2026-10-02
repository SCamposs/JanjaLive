type LogFields = Record<string, boolean | number | string | null | undefined>;

const BLOCKED_KEYS = /candidate|cookie|invite|ip|oauth|sdp|secret|token/i;

function sanitize(fields: LogFields = {}): LogFields {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, BLOCKED_KEYS.test(key) ? "[redacted]" : value]),
  );
}

export const logger = {
  info(message: string, fields?: LogFields) {
    console.info(JSON.stringify({ level: "info", message, ...sanitize(fields) }));
  },
  warn(message: string, fields?: LogFields) {
    console.warn(JSON.stringify({ level: "warn", message, ...sanitize(fields) }));
  },
  error(message: string, fields?: LogFields) {
    console.error(JSON.stringify({ level: "error", message, ...sanitize(fields) }));
  },
};
