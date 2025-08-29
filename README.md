# Overleaf LaTeX MCP Server

TypeScript/Node.js MCP server that brokers between LLM clients and Overleaf compilation and Git surfaces. See ROADMAP.md, ARCHITECTURE.md, API.md, PRD.md, DEVELOPMENT.md, and global_rules.md for details.

Status: 0.1.0 (scaffold)

## Configuration

The server is configured via the `overleaf-mcp-server/projects.json` file. This file contains a list of your Overleaf projects that you want the server to be able to access.

### Example `projects.json`

```json
{
  "your-project-id": {
    "gitUrl": "http://localhost/git/your-project-id"
  }
}
```

-   `your-project-id`: Replace this with the actual ID of your Overleaf project.
-   `gitUrl`: This is the Git URL for your project.

### For Commercial Overleaf

If you are using a commercial Overleaf subscription, you will need to add a `gitToken` to your project configuration:

```json
{
  "your-project-id": {
    "gitUrl": "https://git.overleaf.com/your-project-id",
    "gitToken": "your-git-token"
  }
}
```

-   `gitToken`: You can get this from your Overleaf project settings under "Git Integration".

## Running the Server

To start the server, run the following command from the root of the project:

```bash
cd overleaf-mcp-server && node server.js
```

The server will start on port 8080.
