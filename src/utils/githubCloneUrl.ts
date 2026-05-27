/**
 * Normalizes user input into a URL or SCP-style string suitable for `git clone`.
 * Accepts `owner/repo`, full https URLs, and `git@github.com:owner/repo.git`.
 */
export function parseGithubCloneUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  if (s.startsWith("git@")) {
    return s;
  }

  const githubShorthand = /^([\w.-]+)\/([\w.-]+)$/;
  const shortMatch = githubShorthand.exec(s);
  if (shortMatch && !s.includes("://") && !s.includes(" ")) {
    return `https://github.com/${shortMatch[1]}/${shortMatch[2]}.git`;
  }

  const withProtocol = /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`;

  try {
    const u = new URL(withProtocol);
    const path = u.pathname.replace(/^\//, "").replace(/\.git$/i, "");
    const segments = path.split("/").filter(Boolean);
    if (segments.length < 2) return null;
    const repoPath = `${segments[0]}/${segments[1]}`;
    return `${u.origin}/${repoPath}.git`;
  } catch {
    return null;
  }
}
