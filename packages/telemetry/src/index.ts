import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { trace, SpanStatusCode, Tracer } from '@opentelemetry/api';

export { trace, SpanStatusCode };
export type { Tracer };

let sdk: NodeSDK | null = null;

export function initTelemetry(serviceName = 'ai-workspace-server') {
  if (process.env.OTEL_ENABLED !== 'true') return;

  const exporterUrl = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';

  sdk = new NodeSDK({
    resource: new Resource({ [ATTR_SERVICE_NAME]: serviceName }),
    traceExporter: new OTLPTraceExporter({ url: `${exporterUrl}/v1/traces` }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
  console.log(`[Telemetry] OTel started → ${exporterUrl}`);

  process.on('SIGTERM', async () => {
    await sdk?.shutdown();
  });
}

export function getTracer(name = 'ai-workspace'): Tracer {
  return trace.getTracer(name);
}

export async function withSpan<T>(
  tracerName: string,
  spanName: string,
  fn: () => Promise<T>
): Promise<T> {
  if (process.env.OTEL_ENABLED !== 'true') return fn();
  const tracer = getTracer(tracerName);
  return tracer.startActiveSpan(spanName, async (span) => {
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      throw err;
    } finally {
      span.end();
    }
  });
}
