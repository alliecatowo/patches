import { CommunityRole } from '@patches/proto/nest';
import { describe, expect, it } from 'vitest';

import { roleFromProto } from './community.mapper.js';

describe('community.mapper role mapping', () => {
  it('maps the only two writable roles', () => {
    expect(roleFromProto(CommunityRole.COMMUNITY_ROLE_MEMBER)).toBe('MEMBER');
    expect(roleFromProto(CommunityRole.COMMUNITY_ROLE_MODERATOR)).toBe('MODERATOR');
  });

  it('rejects unspecified and unrecognized roles at the service boundary', () => {
    expect(() => roleFromProto(CommunityRole.COMMUNITY_ROLE_UNSPECIFIED)).toThrow(
      'role must be MEMBER or MODERATOR',
    );
    expect(() => roleFromProto(CommunityRole.UNRECOGNIZED)).toThrow(
      'role must be MEMBER or MODERATOR',
    );
  });
});
