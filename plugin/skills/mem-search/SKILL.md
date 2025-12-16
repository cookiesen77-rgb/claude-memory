# Memory Search Skill

This skill allows Claude to search through past work stored by the claude-memory plugin.

## When to Use This Skill

Use this skill when:
- User asks about past work on this project
- User references something done in previous sessions
- You need to recall implementation details, decisions, or learnings
- User mentions "remember", "previously", "last time", "before"

## The Workflow

1. **Check context index first** - Review the injected context for relevant observation IDs
2. **Search if needed** - Use `/search` endpoint if context is insufficient
3. **Fetch full details** - Use `/observations/:id` to get complete observation

## Search Parameters

### GET /api/search
```
Query Parameters:
- q: Search query (required)
- project: Filter by project name (optional)
- limit: Max results (default: 20)
```

### GET /api/observations/:id
```
Path Parameters:
- id: Observation ID (from context index or search results)
```

## Examples

### Find work on authentication
```bash
curl "http://127.0.0.1:37778/api/search?q=authentication&limit=10"
```

### Get full observation by ID
```bash
curl "http://127.0.0.1:37778/api/observations/42"
```

### Search within specific project
```bash
curl "http://127.0.0.1:37778/api/search?q=bug%20fix&project=my-app"
```

## Response Format

### Search Response
```json
{
  "results": [
    {
      "id": 42,
      "type": "bugfix",
      "title": "Fixed authentication timeout",
      "subtitle": "Increased token refresh interval to prevent premature logouts",
      "project": "my-app",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "count": 1
}
```

### Observation Response
```json
{
  "id": 42,
  "session_id": "abc123",
  "project": "my-app",
  "type": "bugfix",
  "title": "Fixed authentication timeout",
  "subtitle": "Increased token refresh interval to prevent premature logouts",
  "narrative": "The auth service was using a 5-minute token refresh interval...",
  "facts": "[\"Token refresh changed from 5min to 15min\", \"Added retry logic\"]",
  "concepts": "[\"how-it-works\", \"problem-solution\"]",
  "files_modified": "[\"src/auth/token.js\"]",
  "created_at": "2024-01-15T10:30:00Z"
}
```

## Why This Workflow

This progressive disclosure approach saves tokens:
1. Context index (~50 tokens per observation) is usually sufficient
2. Full observations (~200-500 tokens each) only fetched when needed
3. Avoids re-reading source files when memory already captured the learning

## Tips

- Trust the context index for understanding what was done
- Fetch full details only for complex decisions or debugging
- Use specific search terms related to the problem domain
- Filter by type (bugfix, feature, decision) when relevant

