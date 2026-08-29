/** B-182 — Web Vitals ingest. A validated payload is at most a handful of short fields plus
 * up to `WEB_VITALS_MAX_SAMPLES_PER_PAYLOAD` (`@patches/domain`) small sample objects; 8 KiB
 * is generous headroom over the largest payload the client can legitimately construct, while
 * still small next to `MAX_INBOUND_BODY_BYTES` (1 MiB) the federation inbox allows for a
 * whole ActivityPub object. */
export const WEB_VITALS_MAX_BODY_BYTES = 8 * 1024;
