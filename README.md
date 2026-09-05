# System Specification Tool

[![Test](https://github.com/liammclennan/system-specification-tool/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/liammclennan/system-specification-tool/actions/workflows/test.yml)

This project is a web application that you run locally to develop and verify your system specification. Verification is done by linking claims about sub systems to the results of automated tests.

There is also a non-interactive mode (--print) to be used in automated testing and continuous integration scenarios.

## CLI help

```sh
System Specification Tool

Usage:
  system-specification-tool [options]

Options:
  --project <path>       Specification directory (defaults to the current directory)
  --test-results <path>  Test result file or directory (enables verification)
  --port <number>        Web server port (default: 5173)
  --print                Verify, print a claim report, and exit without starting the server
  --help                 Show this help message

Environment:
  SYSTEM_SPECIFICATION_TOOL_PROJECT
  SYSTEM_SPECIFICATION_TOOL_TEST_RESULTS
  SYSTEM_SPECIFICATION_TOOL_PORT
```

## Usage

Install globally:

```sh
npm install -g system-specification-tool
```

Navigate to a directory to contain your specification, then:

```sh
system-specification-tool --test-results=<directory containing test output files>
```

Create your specification, including verifiable claims. Copy the short identifier next to each claim and include it in the name of a test that verifies that claim. Press the 'Verify' button.

## Usage within CI

For non-interactive verification, use `--print`. This regenerates `specification.md`, prints claim totals and details for failing or unverified claims, and does not start the web server. It exits with code 0 when every claim is verified or ignored, and code 1 otherwise:

## Test output file support

Supported formats are JSON, JUnit/XUnit XML, MSTest TRX, TAP, captured Cargo test output, and Go `test -json`. Files are read from the configured test-results path. Press **Verify** to match test names containing claim short identifiers; matching claims and their containing nodes are marked verified or failed accordingly.

## Usage with AI agents

Each time that the claims are verified `system-specification-tool` writes an AI agent friendly markdown specification (`specification.md`) into your project directory.
