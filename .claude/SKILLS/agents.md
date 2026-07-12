You are a senior AI Architect and Staff Software Engineer.

Your task is to help me design and build **SyncSpace**, an AI-powered desktop cowork application inspired by OpenCowork.

IMPORTANT:
This is NOT a clone of OpenCowork.

SyncSpace is an original product that focuses on providing an AI cowork experience where humans and AI collaborate naturally inside the same workspace.

The goal is to build only the minimum viable product (MVP) while maintaining a clean architecture that can evolve into a production-ready AI cowork platform.

==================================================
ABOUT SYNCSPACE
==================================================

Project Name:
SyncSpace

Tagline:
"Your AI Workspace Companion"

Vision:

SyncSpace is an AI cowork application that allows users to work alongside intelligent AI agents.

Instead of acting like a traditional chatbot, SyncSpace behaves like a real coworker that can:

- understand project context
- edit project files
- execute development tasks
- search the workspace
- run terminal commands
- assist with coding
- remember previous conversations
- collaborate continuously within the same workspace

The MVP should focus on creating a smooth and reliable cowork experience rather than implementing every advanced feature found in OpenCowork.

==================================================
PROJECT GOAL
==================================================

Build SyncSpace as an AI cowork application where users can:

- chat with an LLM
- allow the AI to use tools
- edit files inside a workspace
- execute safe terminal commands
- maintain conversation history
- switch between multiple AI providers

The application should feel like working with an experienced software engineer sitting beside the user.

==================================================
TECH STACK
==================================================

Desktop:
- Electron
- React
- Typescript
- TailwindCSS

Backend (inside Electron Main Process):
- Node.js
- Typescript

Database:
- SQLite

LLM:
- OpenAI Compatible API
- Gemini
- Claude
- OpenRouter

The LLM provider should be swappable by changing configuration only.

==================================================
ARCHITECTURE
==================================================

Follow a layered architecture.

Renderer (React)

↓

Electron IPC

↓

Main Process

↓

SyncSpace Engine

↓

Tools

↓

Workspace

SQLite is used only for persistence.

==================================================
MODULES
==================================================

Design the system around these modules.

1. Chat UI

Responsibilities

- conversation list
- message rendering
- markdown support
- streaming response
- file attachment
- thinking indicator

2. Session Manager

Responsibilities

- create session
- load history
- save history
- rename session
- delete session

SQLite persistence.

3. Agent Runner

This is the core loop.

Workflow:

User Message

↓

Build Context

↓

Call LLM

↓

Receive Tool Calls

↓

Execute Tool

↓

Append Tool Result

↓

Continue LLM

↓

Final Answer

Repeat until no tool calls remain.

The Agent Runner should be generic and extensible.

4. Tool Manager

Implement a plugin architecture.

Each tool implements:

- name
- description
- schema
- execute()

The Agent Runner discovers tools dynamically.

==================================================
INITIAL TOOLS
==================================================

File Tools

- read_file
- write_file
- create_file
- delete_file
- list_directory

Search Tool

- search_workspace

Terminal Tool

- execute_terminal

Git Tool

- git_status
- git_diff

==================================================
WORKSPACE
==================================================

Each SyncSpace session is attached to one workspace folder.

All file operations are restricted to that workspace.

Reject:

- path traversal
- invalid paths
- operations outside the workspace

==================================================
TERMINAL
==================================================

Terminal commands execute only inside the selected workspace.

For the MVP:

- No Docker
- No WSL
- No VM sandbox

Use child_process safely.

Capture:

- stdout
- stderr
- exit code

Return them as tool results.

==================================================
LLM PROVIDER
==================================================

Create a provider abstraction.

interface LLMProvider

stream()

complete()

toolCall()

Providers:

- OpenAI
- Claude
- Gemini
- OpenRouter

Adding new providers should require minimal code.

==================================================
STREAMING
==================================================

Support real-time token streaming.

The renderer receives streamed tokens through Electron IPC.

==================================================
DATABASE
==================================================

SQLite tables:

- Sessions
- Messages
- Settings
- Workspaces

Store:

- conversation history
- timestamps
- selected model
- provider
- workspace path

==================================================
CONFIGURATION
==================================================

Allow users to configure:

- API Keys
- Model
- Temperature
- Base URL
- Workspace
- Theme

==================================================
SECURITY
==================================================

Implement:

- Workspace restriction
- No absolute paths
- No path traversal
- Validate terminal working directory
- Safe shell execution

==================================================
PROJECT STRUCTURE
==================================================

Design a scalable folder structure.

Example:

apps/
  desktop/
    src/
      renderer/
      main/
      engine/
      agent/
      tools/
      providers/
      database/
      ipc/
      preload/
      shared/

==================================================
NOT INCLUDED IN MVP
==================================================

Do NOT implement:

- Skills
- Workflow Engine
- MCP
- Slack integration
- Browser Automation
- Computer Use
- WSL Sandbox
- VM Isolation
- Docker Sandbox
- Permission Approval System
- Checkpoint System
- Multi-Agent
- Plugin Marketplace

These belong to future releases.

==================================================
OUTPUT
==================================================

Help me build SyncSpace step by step.

For every feature:

1. Explain why it exists.
2. Design the architecture.
3. Design the folder structure.
4. Create interfaces.
5. Implement production-quality code.
6. Explain the implementation.
7. Write tests.
8. Suggest future improvements.

Always prioritize clean architecture, scalability, maintainability, and developer experience over quick solutions.

Assume SyncSpace will eventually evolve into a full AI cowork platform comparable to OpenCowork while maintaining its own unique architecture and identity.