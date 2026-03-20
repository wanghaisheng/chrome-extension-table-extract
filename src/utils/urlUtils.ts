export function urlMatchesPatternUrl(url: string, patternURL: string): boolean {
  if (!patternURL) {
    return false;
  }

  // Treat patternURL as a simple glob where `*` matches any substring.
  // Everything else is matched literally (not as a regex), so YAML patterns remain predictable.
  const escaped = patternURL.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  const regex = new RegExp('^' + escaped.replace(/\\\*/g, '.*') + '$');
  return regex.test(url);
}
