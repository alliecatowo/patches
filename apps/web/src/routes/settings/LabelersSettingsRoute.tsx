import { LabelAction } from '@patches/proto/es';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type JSX } from 'react';

import { api } from '../../api/client.js';
import { humanizeEnumValue } from '../../lib/enumLabels.js';
import styles from '../AuthForm.module.css';

const ACTIONS = [LabelAction.IGNORE, LabelAction.WARN, LabelAction.COLLAPSE, LabelAction.HIDE];

/**
 * `/settings/labelers` (P14-018, spec §200) — subscribe/unsubscribe to labelers and set
 * a per-value action override. `LabelService` has no "list my subscriptions" RPC yet
 * (only `SubscribeLabeler`/`UnsubscribeLabeler`/`SetLabelerSubscriptionAction`), so this
 * screen can fire those actions but can't show which labelers are currently subscribed —
 * flagged as a follow-up rather than guessed at.
 */
export function LabelersSettingsRoute(): JSX.Element {
  const [justSubscribed, setJustSubscribed] = useState<Set<string>>(new Set());

  const labelersQuery = useQuery({
    queryKey: ['labelers'],
    queryFn: () => api.labels.listLabelers({ cursor: '', limit: 50 }),
  });

  const subscribeMutation = useMutation({
    mutationFn: (labelerId: string) => api.labels.subscribeLabeler({ labelerId }),
    onSuccess: (_data, labelerId) =>
      setJustSubscribed((current) => new Set(current).add(labelerId)),
  });
  const unsubscribeMutation = useMutation({
    mutationFn: (labelerId: string) => api.labels.unsubscribeLabeler({ labelerId }),
    onSuccess: (_data, labelerId) =>
      setJustSubscribed((current) => {
        const next = new Set(current);
        next.delete(labelerId);
        return next;
      }),
  });
  const actionMutation = useMutation({
    mutationFn: (vars: { labelerId: string; value: string; action: LabelAction }) =>
      api.labels.setLabelerSubscriptionAction(vars),
  });

  return (
    <div className={styles['wrap']} style={{ margin: 0, maxWidth: 'none' }}>
      <h1>Labelers</h1>
      <p style={{ color: 'var(--fg-muted)' }}>
        A labeler applies labels within its own authority only — subscribing to one never grants it
        power over anyone else, and you can override any non-mandatory value to ignore it.
      </p>
      {labelersQuery.isPending ? <p>Loading…</p> : null}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {labelersQuery.data?.labelers.map((labeler) => {
          const label = labeler.isNodeLabeler
            ? 'This node'
            : (labeler.actor?.handle ?? labeler.community?.name ?? labeler.id);
          const subscribed = justSubscribed.has(labeler.id);
          return (
            <li
              key={labeler.id}
              style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--border)' }}
            >
              <strong>@{label}</strong>{' '}
              {subscribed ? (
                <button type="button" onClick={() => unsubscribeMutation.mutate(labeler.id)}>
                  Unsubscribe
                </button>
              ) : (
                <button type="button" onClick={() => subscribeMutation.mutate(labeler.id)}>
                  Subscribe
                </button>
              )}
              <ul style={{ marginTop: '0.4rem' }}>
                {labeler.vocabulary.map((entry) => (
                  <li key={entry.value}>
                    {entry.value}
                    {entry.mandatory ? ' (mandatory)' : ''} — {entry.description}
                    {!entry.mandatory ? (
                      <select
                        style={{ marginLeft: '0.5rem' }}
                        defaultValue={entry.defaultAction}
                        onChange={(e) =>
                          actionMutation.mutate({
                            labelerId: labeler.id,
                            value: entry.value,
                            action: Number(e.target.value),
                          })
                        }
                      >
                        {ACTIONS.map((a) => (
                          <option key={a} value={a}>
                            {humanizeEnumValue(a, LabelAction)}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
