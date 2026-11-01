import { createHash } from 'node:crypto'
export const digest = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
export function frozenByteIdentity(bytes, expected, identity) {
  const actual = digest(bytes)
  if (actual === expected) return { matched: true, kind: 'EXACT_RAW', actual }
  // Only precomputed complete-file byte forms anchored to the reviewed Git blob qualify.
  // No trimming, parsing/reserialization, BOM removal or ad hoc normalization is accepted.
  if (identity?.originalRawDigest === expected && identity.strictRuntimeBytes === false &&
      identity.reviewedCheckoutDigests?.includes(actual))
    return { matched: true, kind: 'REVIEWED_CHECKOUT_EOL', actual }
  return { matched: false, kind: 'MISMATCH', actual }
}
