/**
 * Centralised, validated access to BFF secrets/config.
 */

/**
 * The issuer pepper mixed into every nullifier hash.
 *
 * A nullifier's privacy (whether an attacker can brute-force the low-entropy
 * identity — e.g. an email — behind the hash) rests on this value being a strong,
 * secret pepper. We therefore refuse to start nullifier computation with a
 * missing, empty, placeholder, or weak salt rather than silently falling back to
 * a default. Throwing here is the intended behaviour: a misconfigured deployment
 * must fail loudly, not emit guessable nullifiers.
 */
export function getIssuerSalt(): string {
  const salt = process.env.SURVEY_PASS_ISSUER_SALT
  if (!salt || salt.trim().length === 0) {
    throw new Error(
      'SURVEY_PASS_ISSUER_SALT is not set. Configure a high-entropy random secret; ' +
        'there is no default fallback (nullifier privacy depends on it).'
    )
  }
  if (salt === 'default_salt') {
    throw new Error('SURVEY_PASS_ISSUER_SALT must not be the placeholder "default_salt".')
  }
  if (salt.length < 12) {
    throw new Error(
      'SURVEY_PASS_ISSUER_SALT is too short; use at least 12 characters of high entropy.'
    )
  }
  return salt
}
