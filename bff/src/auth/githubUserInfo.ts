export type GitHubUserIdentity = {
  sub: string
  email: string | null
}

type GitHubEmailEntry = {
  email: string
  primary: boolean
  verified: boolean
}

async function fetchGitHubEmails(accessToken: string): Promise<GitHubEmailEntry[]> {
  const emailRes = await fetch('https://api.github.com/user/emails', {
    headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'SurveySui' },
  })
  if (!emailRes.ok) {
    throw new Error(`GitHub emails API failed: ${emailRes.status}`)
  }
  return (await emailRes.json()) as GitHubEmailEntry[]
}

function pickVerifiedEmail(emails: GitHubEmailEntry[]): string | null {
  const primaryVerified = emails.find((e) => e.primary && e.verified)
  if (primaryVerified) return primaryVerified.email
  const anyVerified = emails.find((e) => e.verified)
  return anyVerified?.email ?? null
}

/** Validate access_token against GitHub API; return verified email only. */
export async function fetchGitHubUserInfo(accessToken: string): Promise<GitHubUserIdentity> {
  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'SurveySui' },
  })
  if (!userRes.ok) {
    throw new Error(`GitHub userinfo failed: ${userRes.status}`)
  }
  const user = (await userRes.json()) as { id: number; email?: string | null }

  const emails = await fetchGitHubEmails(accessToken)
  const verifiedFromList = pickVerifiedEmail(emails)

  // /user may expose email without verified flag — never trust it without emails API confirmation.
  let email: string | null = verifiedFromList
  if (user.email && emails.some((e) => e.email === user.email && e.verified)) {
    email = user.email
  }

  return { sub: String(user.id), email }
}
