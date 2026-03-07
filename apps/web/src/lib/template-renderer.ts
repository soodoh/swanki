/**
 * Renders Anki-compatible card templates by substituting field values.
 */

type RenderOptions = {
  cardOrdinal?: number;
  frontSide?: string;
  showAnswer?: boolean;
};

/**
 * Replace all matches of a global regex using a callback, returning a typed string.
 * Avoids the ES2017 typing gap where `String.prototype.replaceAll` returns `any`.
 */
function replaceAllMatches(
  input: string,
  pattern: RegExp,
  replacer: (match: RegExpExecArray) => string,
): string {
  // Ensure we use a fresh regex to avoid stale lastIndex
  const re = new RegExp(pattern.source, pattern.flags);
  const parts: string[] = [];
  let lastIndex = 0;
  let m = re.exec(input);

  while (m !== undefined && m !== null) {
    parts.push(input.slice(lastIndex, m.index));
    parts.push(replacer(m));
    lastIndex = m.index + m[0].length;
    m = re.exec(input);
  }

  parts.push(input.slice(lastIndex));
  return parts.join("");
}

export function renderTemplate(
  template: string,
  fields: Record<string, string>,
  options?: RenderOptions,
): string {
  let result = template;

  // 1. Handle {{FrontSide}} — replace with options.frontSide if provided
  const frontSide = options?.frontSide;
  if (frontSide !== undefined) {
    result = result.split("{{FrontSide}}").join(frontSide);
  }

  // 2. Handle conditionals {{#Field}}...{{/Field}} — support nesting
  result = processConditionals(result, fields);

  // 3. Handle {{cloze:FieldName}}
  result = replaceAllMatches(result, /\{\{cloze:(\w+)\}\}/g, (m) => {
    const fieldName = m[1];
    const fieldValue = fields[fieldName];
    if (fieldValue === undefined) {
      return "";
    }
    return processCloze(
      fieldValue,
      options?.cardOrdinal ?? 1,
      options?.showAnswer ?? false,
    );
  });

  // 4. Handle basic {{FieldName}} — replace with field value or empty string
  result = replaceAllMatches(
    result,
    /\{\{(\w+)\}\}/g,
    (m) => fields[m[1]] ?? "",
  );

  return result;
}

function processConditionals(
  template: string,
  fields: Record<string, string>,
): string {
  // Process from innermost to outermost by repeatedly replacing
  // until no more conditional blocks remain.
  const conditionalPattern = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;

  let result = template;
  let previous = "";

  // Iterate until stable (handles nesting)
  while (result !== previous) {
    previous = result;
    result = replaceAllMatches(result, conditionalPattern, (m) => {
      const fieldName = m[1];
      const content = m[2];
      const value = fields[fieldName];
      if (value !== undefined && value !== "") {
        return content;
      }
      return "";
    });
  }

  return result;
}

function processCloze(
  fieldValue: string,
  cardOrdinal: number,
  showAnswer: boolean,
): string {
  // Pattern: {{cN::answer}} or {{cN::answer::hint}}
  const clozePattern = /\{\{c(\d+)::([^}:]+)(?:::([^}]+))?\}\}/g;

  return replaceAllMatches(fieldValue, clozePattern, (m) => {
    const ordinal = Number.parseInt(m[1], 10);
    const answer = m[2];
    const hint: string | undefined = m[3];

    if (ordinal === cardOrdinal) {
      if (showAnswer) {
        // Show the answer, wrapped in a span for styling
        return `<span class="cloze">${answer}</span>`;
      }
      // Question side: show [...] or [hint]
      return hint ? `[${hint}]` : "[...]";
    }

    // Not the active cloze — show as plain text
    return answer;
  });
}
