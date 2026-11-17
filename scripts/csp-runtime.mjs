/** Replace two legacy global lookups; keep string evaluation disabled by CSP. */
export function makeCspCompatibleRuntime(source) {
  const replacements = [
    ['Function("return this")()', 'globalThis'],
    ['Function("r","regeneratorRuntime = r")(t)', '(globalThis.regeneratorRuntime=t)'],
  ];
  for (const [before, after] of replacements) {
    const count = source.split(before).length - 1;
    if (count !== 1) throw new Error('Unexpected TensorFlow 4.22.0 bootstrap: ' + before + ' (' + count + ')');
    source = source.replace(before, after);
  }
  return '/* FileForge: CSP-compatible global bootstrap; see THIRD_PARTY.md. */\n' + source;
}
