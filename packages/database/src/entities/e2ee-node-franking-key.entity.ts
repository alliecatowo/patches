import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * This node's own symmetric franking keys (ADR 0020 §9, §12.7), one row per rotation era.
 *
 * `era` increases by exactly 1 each rotation and is never reused or reassigned —
 * `E2eeLogicalMessage.frankingKeyEra` and `AttachReportEvidence`'s reconstructed transcript pin
 * every accepted message to the era that signed its node tag, forever. Rows are therefore never
 * updated or deleted, only appended: rotating in a new era must never invalidate a tag issued
 * under an older one (`apps/server/src/modules/e2ee/node-franking-key-ring.ts` is the reader).
 *
 * `key_material` is this node's own secret, not a user secret, so ordinary Postgres storage plus
 * the operator's existing disk/backup encryption is the accepted control for v0 — the same trust
 * boundary the node already holds for TLS/session-signing keys. It must never be logged, returned
 * over gRPC, or placed in an error/metric (§101, §183.1); `E2eeNodeFrankingKey` rows are read only
 * by `apps/server`'s key-ring provider and `apps/worker`'s rotation handler.
 */
@Entity({ name: 'e2ee_node_franking_keys' })
@Index(['era'], { unique: true })
@Check('chk_e2ee_node_franking_keys_era', '"era" > 0')
@Check('chk_e2ee_node_franking_keys_key_length', 'octet_length("key_material") = 32')
export class E2eeNodeFrankingKey {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'integer' })
  declare era: number;

  @Column({ type: 'bytea' })
  declare keyMaterial: Buffer;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
