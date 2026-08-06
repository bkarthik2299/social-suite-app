/** Repairs UTF-8 text that was accidentally decoded as Windows-1252. */
export function repairMojibake(value: string) {
  let repaired = value;
  for (let pass = 0; pass < 2; pass += 1) {
    let changed = false;
    let next = '';
    for (let index = 0; index < repaired.length;) {
      if (!/[ÃÂâðï]/.test(repaired[index])) {
        next += repaired[index];
        index += 1;
        continue;
      }

      let replacement = '';
      let consumed = 0;
      for (let length = 2; length <= 4 && index + length <= repaired.length; length += 1) {
        const candidate = repaired.slice(index, index + length);
        const bytes = windows1252Bytes(candidate);
        if (!bytes) continue;
        try {
          const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
          if (decoded && mojibakeScore(decoded) < mojibakeScore(candidate)) {
            replacement = decoded;
            consumed = length;
            break;
          }
        } catch {
          // Try the next candidate length.
        }
      }

      if (replacement) {
        next += replacement;
        index += consumed;
        changed = true;
      } else {
        next += repaired[index];
        index += 1;
      }
    }
    repaired = next;
    if (!changed) break;
  }
  return repaired;
}

const windows1252CodePoints = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);

function windows1252Bytes(value: string) {
  const bytes: number[] = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0) || 0;
    if (codePoint <= 0xff) bytes.push(codePoint);
    else if (windows1252CodePoints.has(codePoint)) bytes.push(windows1252CodePoints.get(codePoint)!);
    else return null;
  }
  return Uint8Array.from(bytes);
}

function mojibakeScore(value: string) {
  return (value.match(/[ÃÂâðï�]/g) || []).length;
}
