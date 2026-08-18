import { randomUUID } from 'node:crypto';

import { credentials, Metadata, type ServiceError } from '@grpc/grpc-js';
import {
  createSystemClient,
  DEADLINES_MS,
  type GetServerInfoResponse,
  METADATA_KEYS,
  type PingResponse,
  type SystemGrpcClient,
} from '@patches/proto';

import { CLIENT_NAME, TUI_VERSION } from '../version.js';

export interface ClientOptions {
  /** `host:port` of the Patches server. */
  target: string;
  /** Skip TLS. Only sensible against a local development server. */
  insecure: boolean;
}

/**
 * The TUI's single door to the network.
 *
 * Everything here is promise-based and always carries a deadline (spec §44) —
 * no call in the TUI may wait forever. React components never touch this
 * directly; they go through `hooks/`.
 */
export class PatchesApi {
  readonly target: string;

  private readonly system: SystemGrpcClient;

  constructor(options: ClientOptions) {
    this.target = options.target;
    this.system = createSystemClient(
      options.target,
      options.insecure ? credentials.createInsecure() : credentials.createSsl(),
    );
  }

  async getServerInfo(): Promise<GetServerInfoResponse> {
    return unary<Record<string, never>, GetServerInfoResponse>(
      this.system.getServerInfo.bind(this.system),
      {},
      DEADLINES_MS.unary,
    );
  }

  async ping(nonce: string): Promise<PingResponse> {
    return unary(this.system.ping.bind(this.system), { nonce }, DEADLINES_MS.unary);
  }

  close(): void {
    this.system.close();
  }
}

/** Per-call metadata required on every RPC (spec §44). */
function callMetadata(): Metadata {
  const metadata = new Metadata();
  metadata.set(METADATA_KEYS.requestId, randomUUID());
  metadata.set(METADATA_KEYS.client, CLIENT_NAME);
  metadata.set(METADATA_KEYS.clientVersion, TUI_VERSION);
  return metadata;
}

type UnaryMethod<Request, Response> = (
  request: Request,
  metadata: Metadata,
  options: { deadline: Date },
  callback: (error: ServiceError | null, response?: Response) => void,
) => unknown;

async function unary<Request, Response>(
  method: UnaryMethod<Request, Response>,
  request: Request,
  deadlineMs: number,
): Promise<Response> {
  const deadline = new Date(Date.now() + deadlineMs);
  return new Promise<Response>((resolve, reject) => {
    method(request, callMetadata(), { deadline }, (error, response) => {
      if (error !== null) {
        reject(error);
        return;
      }
      if (response === undefined) {
        reject(new Error('The server replied with nothing at all.'));
        return;
      }
      resolve(response);
    });
  });
}
