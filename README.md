# System Specification Tool

## High-level description

This is a tool for authoring and maintaining specifications of complex systems. The system is described hierarchically. Each node at each level of the hierarchy may include claims. A claim is a verifiable statement of fact about the system.

## Technical details

System specification tool is a web application. The user interface is a React application written in Typescript.

The server side is a node.js web application written in Typescript. Data persistence is accomplished by writing to text files intended to be part of a git repository, so that the evolution of the specification can be tracked and managed in Git, alongside the system being developed. Because the data storage is managed in Git it is better if it uses many small files rather than a small number of large text files.

## Specification

System Specification Tool is specified in the same style as is intended to be created with System Specification Tool. The levels of the specification hierarchy are represented by markdown headings, and claims are bullet list items. The specification is in `specification.md`.