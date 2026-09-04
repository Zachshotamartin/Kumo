import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from "web-vitals";
import { authenticatedFetch } from "../services/apiClient";

let started = false;

const sensitiveQueryParameter = /(?:token|password|secret|invite|share|openSession)/i;
/**
 * Matches one `?name=value` or `&name=value` pair. The leading separator, the name and the value
 * are drawn from disjoint character sets — the name can contain neither `?`, `&` nor `=`, and the
 * `=` between name and value is mandatory — so no repetition in the pattern overlaps another and
 * the match stays linear even on a hostile error message. The server-side redaction in
 * `server/api/handlers/telemetry.ts` mirrors this shape.
 */
const queryParameterPattern = /[?&][^?=&#\s]*=[^&#\s)\]}]*/g;

export const redactTelemetryText = (value: string) => value.replace(queryParameterPattern, (parameter) => {
  const separator = parameter.indexOf("=");
  return sensitiveQueryParameter.test(parameter.slice(1, separator))
    ? `${parameter.slice(0, separator + 1)}[redacted]`
    : parameter;
});

export const telemetryRoute = (href: string) => {
  const url = new URL(href);
  for (const key of url.searchParams.keys()) {
    if (sensitiveQueryParameter.test(key)) url.searchParams.set(key, "[redacted]");
  }
  return `${url.pathname}${url.search}`.slice(0, 500);
};

const context = () => ({
  boardId: new URL(window.location.href).searchParams.get("board") ?? undefined,
  route: telemetryRoute(window.location.href),
  release: import.meta.env.VITE_RELEASE ?? import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA ?? "local",
});

export const reportWebVital = (metric: Pick<Metric, "name" | "value" | "rating" | "delta" | "id">) => authenticatedFetch<{ accepted: true }>("/api/telemetry", {
  method: "POST",
  body: JSON.stringify({ kind: "performance", ...context(), metric: metric.name, value: metric.value, rating: metric.rating, metadata: { delta: metric.delta, id: metric.id } }),
}).catch(() => undefined);

export const reportClientError = (error: Error) => authenticatedFetch<{ accepted: true }>("/api/telemetry", {
  method: "POST",
  body: JSON.stringify({ kind: "error", ...context(), message: redactTelemetryText(error.message), stack: error.stack ? redactTelemetryText(error.stack) : undefined }),
}).catch(() => undefined);

export const startObservability = () => {
  if (started || typeof window === "undefined") return () => undefined;
  started = true;
  [onCLS, onFCP, onINP, onLCP, onTTFB].forEach((observe) => observe((metric) => { void reportWebVital(metric); }));
  const onError = (event: ErrorEvent) => { void reportClientError(event.error instanceof Error ? event.error : new Error(event.message)); };
  const onRejection = (event: PromiseRejectionEvent) => { void reportClientError(event.reason instanceof Error ? event.reason : new Error(String(event.reason))); };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  const observer = typeof PerformanceObserver !== "undefined" ? new PerformanceObserver((list) => {
    list.getEntries().filter((entry) => entry.duration >= 1000
      && !entry.name.includes("/api/telemetry")
      && (entry.name.includes("/api/") || entry.entryType === "longtask")).forEach((entry) => {
      void authenticatedFetch<{ accepted: true }>("/api/telemetry", { method: "POST", body: JSON.stringify({ kind: "performance", ...context(), metric: entry.entryType === "longtask" ? "long_task" : "api_latency", value: entry.duration, rating: entry.duration >= 3000 ? "poor" : "needs-improvement", metadata: { name: redactTelemetryText(entry.name).slice(0, 500), type: entry.entryType } }) }).catch(() => undefined);
    });
  }) : null;
  try { observer?.observe({ entryTypes: ["resource", "longtask"] }); } catch { observer?.observe({ entryTypes: ["resource"] }); }
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    observer?.disconnect();
    started = false;
  };
};
