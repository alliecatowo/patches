import type { Actor } from '@patches/proto/es';
import { useEffect, useState } from 'react';

import { getCurrentActor, subscribeSession } from '../api/session.js';

/** The signed-in actor, or `null` when signed out. Re-renders on `establishSession`/
 * `restoreSession`/`signOut`. */
export function useSession(): Actor | null {
  const [actor, setActor] = useState<Actor | null>(getCurrentActor());
  useEffect(() => subscribeSession(setActor), []);
  return actor;
}
