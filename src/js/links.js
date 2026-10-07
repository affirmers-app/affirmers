// Link rule: store the URL, derive everything else from it.
function parse(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

export function deriveX(url) {
  const u = parse(url);
  if (!u || !/^(www\.)?(x|twitter)\.com$/.test(u.hostname)) return null;
  const handle = u.pathname.split('/').filter(Boolean)[0];
  return handle ? { href: u.href, handle } : null;
}

export function deriveGithub(url) {
  const u = parse(url);
  if (!u || !/^(www\.)?github\.com$/.test(u.hostname)) return null;
  const [owner, repo] = u.pathname.split('/').filter(Boolean);
  return owner ? { href: u.href, handle: repo ? `${owner}/${repo}` : owner } : null;
}
