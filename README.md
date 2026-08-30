# System Specification Tool

## High-level description

This is a tool for authoring and maintaining specifications of complex systems. The system is described hierarchically. Each node at each level of the hierarchy may include claims. A claim is a verifiable statement of fact about the system.

## Technical details

System specification tool is a web application. The user interface is a React application written in Typescript.

The server side is a node.js web application written in Typescript. Data persistence is accomplished by writing to text files intended to be part of a git repository, so that the evolution of the specification can be tracked and managed in Git, alongside the system being developed. Because the data storage is managed in Git it is better if it uses many small files rather than a small number of large text files.

## Specification

System Specification Tool is specified in the same style as is intended to be created with System Specification Tool. The levels of the specification hierarchy are represented by markdown headings, and claims are bullet list items. The specification is in `specification.md`.

## Usage

Install dependencies with `npm install`, then start the application in development mode:

```sh
npm run dev
```

The application treats the selected project directory as the specification itself. If that directory is empty, it is initialized with a root node. Existing files must contain a valid specification.

To open a project directly, use the command-line argument:

```sh
npx system-specification-tool -- --project=/path/to/project
```

The path may be absolute or relative to the directory where the command is run. If `--project` is omitted, set `SYSTEM_SPECIFICATION_TOOL_PROJECT` or the current directory is used:

```sh
SYSTEM_SPECIFICATION_TOOL_PROJECT=./my-specification npm run dev
```

For local development before publishing, use `npm link` and then run `system-specification-tool`, or run `node bin/system-specification-tool.mjs` directly.

Test-result JSON, XUnit XML, MSTest TRX, TAP, and captured Cargo test output files can be uploaded on the top-level node. Press **Verify** to match test names containing claim short identifiers; matching claims and their containing nodes are marked verified or failed accordingly.

Run the test suite with:

```sh
npm test
```

This also writes a machine-readable report to `test-results.json`.

The `--port` argument and `SYSTEM_SPECIFICATION_TOOL_PORT` environment variable select the front-end (Vite) port. Use `--api-port` or `SYSTEM_SPECIFICATION_TOOL_API_PORT` to select the API port:

```sh
npx system-specification-tool -- --port=4000 --api-port=4001
```
