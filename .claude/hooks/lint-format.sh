#!/bin/bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ -z "$FILE_PATH" || ! -f "$FILE_PATH" ]]; then
  exit 0
fi

# Only process JS/TS files
case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs)
    npx oxlint --fix "$FILE_PATH" 2>/dev/null
    npx prettier --write "$FILE_PATH" 2>/dev/null
    ;;
  *.json|*.css|*.md|*.html)
    npx prettier --write "$FILE_PATH" 2>/dev/null
    ;;
esac

exit 0
