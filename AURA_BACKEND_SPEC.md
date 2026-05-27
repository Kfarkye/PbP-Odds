# Aura Engine Orchestrator: Backend Reconstruction Specification

This document outlines the architecture, API endpoints, core logic, and deployment details necessary to rebuild the Aura Engine Orchestrator backend.

## I. Project Overview & Goals
The Aura Engine Orchestrator is the intelligent core of the Aura application. Its primary goal is to interpret natural language queries from the user, determine the most appropriate action (either a conversational response or a tool invocation), execute that action, and return structured AuraArtifacts for the frontend to render.

Key Capabilities:
- **Natural Language Understanding:** Process user messages, including multimodal input (text + image).
- **Intelligent Tool Delegation:** Dynamically select and invoke specialized backend tools (e.g., Sports, Workspace, Markets).
- **Conversational AI:** Generate fluent, context-aware text responses when no tool is suitable.
- **Artifact Generation:** Produce structured, typed data (AuraArtifacts) for rich UI rendering.
- **Security & Control:** Enforce authentication, authorization, and rate limits on critical operations.

## II. Technology Stack
- **Backend Language/Framework:** Node.js with Express.js
- **AI Model:** Google Gemini (via @google/generative-ai SDK or direct REST API)
- **Authentication:** Firebase Admin SDK (for verifying client-side Firebase tokens)
- **External APIs:** ESPN, Google Workspace APIs, Kalshi, etc. 
- **Deployment:** Google Cloud Run
- **Secrets Management:** Google Secret Manager
- **Logging/Monitoring:** Google Cloud Logging, Google Cloud Monitoring

## III. Backend API Endpoints (Express.js)
The backend exposes the following RESTful API endpoints:

1. **POST `/api/chat`**
   - Purpose: Primary interaction endpoint for user queries.
   - Auth: Optional Firebase ID Token.
   - Security: Rate limiting, 2MB size limit, API Key check.

2. **GET `/api/feed`**
   - Purpose: Provides the initial content feed for the Aura dashboard.
   - Auth: None (public).

3. **POST `/api/workspace/normalize`**
   - Purpose: Triggers live normalization for Google Workspace data.
   - Auth: Required Firebase ID Token.

4. **POST `/api/mcp/deploy`**
   - Purpose: Initiates a Cloud Build pipeline for a Model Context Protocol (MCP) microservice.
   - Auth: Required Authorization: `Bearer <AURA_ADMIN_SECRET>`.

5. **POST `/api/mcp/kalshi/execute`**
   - Purpose: Executes actions on Kalshi prediction markets.
   - Auth: Required Authorization: `Bearer <AURA_ADMIN_SECRET>`.

6. **GET `/api/health`**
   - Purpose: Standard health check endpoint.
   - Auth: None.

## IV. Core Orchestration Logic (`/api/chat` Detailed Flow)
1. Request Reception & Initial Validation (Auth, Rate Limits).
2. Construct LLM Prompt (System Instruction, Tool Definitions, History, Context).
3. Gemini API Call.
4. Parse Gemini's Response (Detect conversational content vs tool invocation).
5. Tool Invocation (Dynamic dispatch, Argument validation, Artifact mapping).
6. Return AuraArtifacts back to the frontend.

## V. Tool Integrations (Backend Functions)
- `delegate_sports_query`: ESPN stats and sports data.
- `delegate_work_query`: Workspace API integrations.
- `delegate_markets_query`: Kalshi market parsing.
- `delegate_crypto_query`: Blockchain actions.
- `schedule_automation_query`: Recurring triggers.
- `generate_react_app`: UI generation.
- `propose_codebase_modification`: Code modifications.

## VI. Security & Observability 
- **Firebase Token Verification** for User Identity.
- **AURA_ADMIN_SECRET** for System Operations.
- **Express-Rate-Limit** for spam protection.
- **Cloud Run Logging** and **Monitoring Metrics**.
