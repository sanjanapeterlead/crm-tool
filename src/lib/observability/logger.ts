/**
 * Structured JSON logging with correlation ids and secret redaction.
 *
 * One line of JSON per event so any log platform (Vercel, Datadog, CloudWatch)
 * can index it. Redaction is by key name and by value pattern, because the
 * mistake this guards against is someone logging "the whole response" and
 * shipping an access token to a third party.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  /** A logger that stamps every line with extra fixed fields (requestId, orgId, provider…). */
  child(bindings: LogFields): Logger;
}

export type LogSink = (line: string, level: LogLevel) => void;

const SECRET_KEY = /token|secret|password|passwd|authorization|api[-_]?key|signature|cookie|credential/i;
const MAX_STRING = 500;
const MAX_DEPTH = 5;
export const REDACTED = "[REDACTED]";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function scrubString(value: string): string {
  const scrubbed = value
    .replace(/(access_token|client_secret|fb_exchange_token|refresh_token)=[^&\s"']+/gi, "$1=" + REDACTED)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer " + REDACTED);
  return scrubbed.length > MAX_STRING ? `${scrubbed.slice(0, MAX_STRING)}…[truncated]` : scrubbed;
}

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return scrubString(value);
  if (typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[MaxDepth]";

  if (value instanceof Error) {
    return { name: value.name, message: scrubString(value.message) };
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY.test(key) ? REDACTED : redact(inner, depth + 1);
  }
  return out;
}

const consoleSink: LogSink = (line, level) => {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

export function createLogger(
  bindings: LogFields = {},
  options: { sink?: LogSink; minLevel?: LogLevel } = {}
): Logger {
  const sink = options.sink ?? consoleSink;
  const minLevel = options.minLevel ?? (process.env.LOG_LEVEL as LogLevel | undefined) ?? "info";

  function write(level: LogLevel, event: string, fields?: LogFields) {
    if (LEVEL_ORDER[level] < (LEVEL_ORDER[minLevel] ?? LEVEL_ORDER.info)) return;
    const line = JSON.stringify({
      time: new Date().toISOString(),
      level,
      event,
      ...(redact({ ...bindings, ...fields }) as LogFields),
    });
    sink(line, level);
  }

  return {
    debug: (event, fields) => write("debug", event, fields),
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields),
    child: (extra) => createLogger({ ...bindings, ...extra }, { sink, minLevel }),
  };
}

const REQUEST_ID_PATTERN = /^[\w-]{8,64}$/;

/** Reuses a sane inbound `x-request-id`, otherwise mints one. */
export function getRequestId(headers: Pick<Headers, "get">): string {
  const inbound = headers.get("x-request-id");
  return inbound && REQUEST_ID_PATTERN.test(inbound) ? inbound : crypto.randomUUID();
}

/** The app-wide root logger. Prefer `.child({ requestId, orgId })` per request. */
export const logger = createLogger({ service: "crm" });
