export type DeckNode = { type: "deck"; value: string };
export type TagNode = { type: "tag"; value: string };
export type NoteTypeNode = { type: "notetype"; value: string };
export type StateNode = { type: "state"; value: "due" | "new" | "review" };
export type TextNode = { type: "text"; value: string };
export type NegateNode = { type: "negate"; child: SearchNode };
export type AndNode = { type: "and"; children: SearchNode[] };
export type OrNode = { type: "or"; children: SearchNode[] };

export type SearchNode =
  | DeckNode
  | TagNode
  | NoteTypeNode
  | StateNode
  | TextNode
  | NegateNode
  | AndNode
  | OrNode;

type Token =
  | { kind: "filter"; prefix: string; value: string; negated: boolean }
  | { kind: "text"; value: string }
  | { kind: "or" }
  | { kind: "lparen" }
  | { kind: "rparen" };

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t";
}

function isWordBreak(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "(" || ch === ")";
}

function readWord(query: string, from: number): number {
  let pos = from;
  while (pos < query.length && !isWordBreak(query[pos])) {
    pos += 1;
  }
  return pos;
}

function readQuotedValue(
  query: string,
  openQuotePos: number,
): { value: string; endPos: number } | undefined {
  const closeQuote = query.indexOf('"', openQuotePos + 1);
  if (closeQuote === -1) {
    return undefined;
  }
  return {
    value: query.slice(openQuotePos + 1, closeQuote),
    endPos: closeQuote + 1,
  };
}

function parseFilterValue(
  query: string,
  word: string,
  wordStart: number,
  colonIndex: number,
  negated: boolean,
): { token: Token; endPos: number } {
  const prefix = word.slice(0, colonIndex);
  let value = word.slice(colonIndex + 1);
  let endPos = wordStart + word.length;

  // Handle quoted filter values like deck:"My Deck"
  if (value.startsWith('"')) {
    const quoted = readQuotedValue(query, wordStart + colonIndex + 1);
    if (quoted) {
      value = quoted.value;
      endPos = quoted.endPos;
    } else {
      value = value.slice(1);
    }
  }

  return {
    token: { kind: "filter", prefix, value, negated },
    endPos,
  };
}

function tokenize(query: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < query.length) {
    // Skip whitespace
    if (isWhitespace(query[i])) {
      i += 1;
      continue;
    }

    // Check for OR keyword
    if (
      query[i] === "O" &&
      query[i + 1] === "R" &&
      (i + 2 >= query.length || query[i + 2] === " " || query[i + 2] === "(")
    ) {
      tokens.push({ kind: "or" });
      i += 2;
      continue;
    }

    // Parentheses
    if (query[i] === "(") {
      tokens.push({ kind: "lparen" });
      i += 1;
      continue;
    }
    if (query[i] === ")") {
      tokens.push({ kind: "rparen" });
      i += 1;
      continue;
    }

    // Check for negation prefix
    const negated = query[i] === "-";
    const start = negated ? i + 1 : i;

    // Quoted string
    if (query[start] === '"') {
      const quoted = readQuotedValue(query, start);
      if (quoted) {
        tokens.push({ kind: "text", value: quoted.value });
        i = quoted.endPos;
        continue;
      }
    }

    // Read a word (until space, paren, or end)
    const end = readWord(query, start);
    const word = query.slice(start, end);

    // Check if it's a filter (prefix:value)
    const colonIndex = word.indexOf(":");
    if (colonIndex === -1) {
      const textValue = negated ? `-${word}` : word;
      tokens.push({ kind: "text", value: textValue });
      i = end;
    } else {
      const result = parseFilterValue(query, word, start, colonIndex, negated);
      tokens.push(result.token);
      i = result.endPos;
    }
  }

  return tokens;
}

function filterToNode(
  prefix: string,
  value: string,
): DeckNode | TagNode | NoteTypeNode | StateNode | TextNode {
  switch (prefix) {
    case "deck":
      return { type: "deck", value };
    case "tag":
      return { type: "tag", value };
    case "notetype":
      return { type: "notetype", value };
    case "is":
      return { type: "state", value: value as "due" | "new" | "review" };
    default:
      return { type: "text", value: `${prefix}:${value}` };
  }
}

function combineAsAnd(nodes: SearchNode[]): SearchNode {
  if (nodes.length === 0) {
    return { type: "text", value: "" };
  }
  if (nodes.length === 1) {
    return nodes[0];
  }
  return { type: "and", children: nodes };
}

function splitByOr(nodes: SearchNode[]): SearchNode[][] {
  const groups: SearchNode[][] = [[]];

  for (const node of nodes) {
    if (node.type === "text" && node.value === "__OR__") {
      groups.push([]);
    } else {
      // oxlint-disable-next-line unicorn/prefer-at -- .at() returns any, causing unsafe-call lint error
      groups[groups.length - 1].push(node);
    }
  }

  return groups;
}

function resolveParenGroups(tokens: Token[]): SearchNode[] {
  const nodes: SearchNode[] = [];
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];

    if (token.kind === "lparen") {
      // Find matching rparen
      let depth = 1;
      let j = i + 1;
      while (j < tokens.length && depth > 0) {
        if (tokens[j].kind === "lparen") {
          depth += 1;
        }
        if (tokens[j].kind === "rparen") {
          depth -= 1;
        }
        j += 1;
      }
      // tokens[i+1..j-2] are the inner tokens (excluding parens)
      const innerTokens = tokens.slice(i + 1, j - 1);
      nodes.push(parseTokens(innerTokens));
      i = j;
      continue;
    }

    if (token.kind === "rparen") {
      // Shouldn't happen at top level, skip
      i += 1;
      continue;
    }

    if (token.kind === "or") {
      // Push a sentinel OR node
      nodes.push({ type: "text", value: "__OR__" });
      i += 1;
      continue;
    }

    if (token.kind === "filter") {
      const baseNode = filterToNode(token.prefix, token.value);
      if (token.negated) {
        nodes.push({ type: "negate", child: baseNode });
      } else {
        nodes.push(baseNode);
      }
      i += 1;
      continue;
    }

    if (token.kind === "text") {
      nodes.push({ type: "text", value: token.value });
      i += 1;
      continue;
    }

    i += 1;
  }

  return nodes;
}

function parseTokens(tokens: Token[]): SearchNode {
  if (tokens.length === 0) {
    return { type: "text", value: "" };
  }

  // First, handle parenthesized groups by recursive parsing
  const resolved = resolveParenGroups(tokens);

  // Then handle OR operators
  const orGroups = splitByOr(resolved);

  if (orGroups.length > 1) {
    const children = orGroups.map((group) => combineAsAnd(group));
    return { type: "or", children };
  }

  return combineAsAnd(resolved);
}

export function parseSearchQuery(query: string): SearchNode {
  const trimmed = query.trim();
  if (trimmed === "") {
    return { type: "text", value: "" };
  }

  const tokens = tokenize(trimmed);
  return parseTokens(tokens);
}
