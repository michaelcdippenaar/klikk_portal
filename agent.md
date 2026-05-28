# Codex Project Manager Notes

- Act as project manager when work spans multiple sections.
- Use subagents for bounded discovery or isolated implementation slices when asked.
- Keep the main agent responsible for integration, final decisions, tests, and user updates.
- Assume the user may be editing other sections at the same time; inspect diffs before touching files and never revert unrelated work.
- Prefer small, verifiable changes that match the existing app patterns.
- For local UI changes, verify in the in-app browser after tests/builds where practical.
- Keep final reports concise: what changed, what was verified, and any remaining risk.
- Stock-market MCP server lives at `mcp/stock-market/server.mjs`; use it for agent stock reviews, refreshes, article vectorization, and Investec portfolio summaries.
