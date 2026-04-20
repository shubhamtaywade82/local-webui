import { createHmac } from 'crypto';

/**
 * Build fields for authenticated `join` on the private `coindcx` channel.
 * Body signed must match CoinDCX stream docs: `{ channel: "<name>" }`.
 */
export function buildPrivateStreamJoinFields(
  apiKey: string,
  apiSecret: string,
  channelName = 'coindcx',
): { channelName: string; authSignature: string; apiKey: string } {
  const body = { channel: channelName };
  const payload = JSON.stringify(body);
  const authSignature = createHmac('sha256', apiSecret)
    .update(payload, 'utf8')
    .digest('hex');
  return { channelName, authSignature, apiKey };
}
