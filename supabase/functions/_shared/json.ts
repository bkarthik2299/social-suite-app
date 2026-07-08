export function parseJsonContent<T>(content: string): T {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim();
  const candidate = cleanJsonCandidate(fenced || trimmed);

  try {
    return JSON.parse(candidate) as T;
  } catch {
    for (const value of jsonCandidates(candidate)) {
      const cleaned = cleanJsonCandidate(value);
      for (const variant of [cleaned, repairCommonJsonIssues(cleaned)]) {
        try {
          return JSON.parse(variant) as T;
        } catch {
          // Continue trying other JSON-looking sections before failing.
        }
      }
    }
  }

  throw new Error('OpenRouter returned invalid JSON');
}

function cleanJsonCandidate(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function repairCommonJsonIssues(value: string) {
  return value
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
}

function jsonCandidates(value: string) {
  const candidates: string[] = [];
  for (const start of [value.indexOf('{'), value.indexOf('[')].filter((index) => index >= 0).sort((a, b) => a - b)) {
    const end = balancedJsonEnd(value, start);
    if (end > start) candidates.push(value.slice(start, end + 1));
  }

  const objectStart = value.indexOf('{');
  const objectEnd = value.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(value.slice(objectStart, objectEnd + 1));

  const arrayStart = value.indexOf('[');
  const arrayEnd = value.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) candidates.push(value.slice(arrayStart, arrayEnd + 1));

  return Array.from(new Set(candidates));
}

function balancedJsonEnd(value: string, start: number) {
  const open = value[start];
  const close = open === '{' ? '}' : ']';
  const stack: string[] = [close];
  let inString = false;
  let escaped = false;

  for (let index = start + 1; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') stack.push('}');
    if (char === '[') stack.push(']');
    if (char === '}' || char === ']') {
      if (stack.pop() !== char) return -1;
      if (!stack.length) return index;
    }
  }

  return -1;
}
