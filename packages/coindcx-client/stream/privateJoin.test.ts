import { describe, expect, it } from 'vitest';
import { buildPrivateStreamJoinFields } from './privateJoin';

describe('buildPrivateStreamJoinFields', () => {
  it('returns stable hex signature for fixed credentials and channel', () => {
    const j = buildPrivateStreamJoinFields('api-key', 'secret', 'coindcx');
    expect(j.channelName).toBe('coindcx');
    expect(j.apiKey).toBe('api-key');
    expect(j.authSignature).toMatch(/^[a-f0-9]{64}$/);
    expect(j.authSignature).toBe(
      buildPrivateStreamJoinFields('api-key', 'secret', 'coindcx').authSignature,
    );
  });

  it('uses channel name in signed body', () => {
    const a = buildPrivateStreamJoinFields('k', 's', 'coindcx').authSignature;
    const b = buildPrivateStreamJoinFields('k', 's', 'other').authSignature;
    expect(a).not.toBe(b);
  });
});
