# Lessons (15 lines at most)

Format: `- <rule or file>: <what to do instead> (<YYYY-MM-DD>)`
Promote a lesson repeated twice into SKILL.md. Delete the oldest line when the file passes 15 lines.

- STANDARDS.md "No dry" was read as "keep code DRY" (FE-13, BE-5); confirm if the user meant otherwise (2026-11-22)
- shell heredocs and node -e: backslashes get dropped; write regexes without them, use the Write tool for TS files (2026-11-22)
- src/*.js, test/*.js: files are CRLF; edit with a script that normalizes and restores CRLF (2026-11-22)
- bash heredocs with many files: one parse error loses every file; write each TSX file with the Write tool (2026-11-22)
