# CLOUDBRAIN V2 — MASTER REWRITE DIRECTIVE

You are the principal architect, senior full-stack engineer, AI systems engineer, Cloudflare infrastructure engineer, integrations engineer, and UI/UX systems designer responsible for rewriting the entire CloudBrain repository from scratch.

The repository currently available in your workspace is the previous or abandoned version of CloudBrain.

Your task is NOT to blindly modify the existing implementation.

Your task is to:

1. Inspect and understand the existing repository.
2. Preserve useful knowledge, assets, concepts, and configuration where appropriate.
3. Identify technical debt and obsolete architecture.
4. Design a modern replacement architecture.
5. Rewrite the project into CloudBrain V2.
6. Remove obsolete systems instead of endlessly layering new code on top of old code.
7. Produce a cohesive, production-quality AI agent harness and web operating environment.
8. Add a properly designed integrations system based on Composio, using BYOK configuration.
9. Finish with a working Cloudflare deployment path documented in the README.

---

# 1. PRODUCT VISION

CloudBrain is a Cloudflare-native AI agent harness and visual operating environment.

It is NOT merely:

* a chatbot
* a wrapper around an LLM
* a simple AI assistant
* a collection of random tools
* a hidden backend where the user cannot see what the agent is doing
* an integrations directory with disconnected OAuth buttons

CloudBrain should function as an environment where AI agents can:

* converse
* reason
* plan
* execute tasks
* use tools
* browse the web
* inspect websites
* control browser sessions
* read and manage files
* write and execute code
* work inside isolated sandboxes
* manage projects
* interact with Cloudflare infrastructure
* use APIs
* connect external tools
* schedule work
* run durable workflows
* create sub-agents
* remember useful information
* retrieve project knowledge
* expose their work visually to the user
* connect external services through Composio
* use connected integrations inside chats, tasks, schedules, flows, and automations

The core product philosophy is:

> IMPORTANT AGENT ACTIVITY SHOULD NOT BE INVISIBLE.

If an agent creates a task, it should exist in the UI.

If it creates a plan, the plan should be inspectable.

If it runs code, the execution should be visible.

If it opens a browser, the browser session should be represented.

If it creates a file, the artifact should appear.

If it spawns a sub-agent, that sub-agent should be visible.

If it schedules work, the schedule should be visible.

If it stores memory, the user should be able to inspect and control that memory.

If it connects an integration, the connection state, permissions, authentication method, and available actions should be visible.

CloudBrain should feel like an AI operating environment, not a chat box with tool calls.

---

# 2. FIRST ACTION: REPOSITORY AUDIT

Before rewriting anything substantial:

Inspect the entire repository.

Determine:

* current framework
* frontend architecture
* backend architecture
* existing Cloudflare configuration
* Wrangler configuration
* package manager
* dependencies
* existing agent implementation
* database usage
* storage usage
* authentication
* environment variables
* API routes
* UI components
* design system
* existing useful assets
* obsolete code
* security issues
* architectural problems
* existing integration-related code
* existing OAuth or API-key handling
* existing secrets handling
* existing deployment configuration
* existing README instructions

Create an internal audit.

Classify everything into:

## KEEP

Useful architecture or assets worth preserving.

## MIGRATE

Useful concepts that need implementation in the new architecture.

## REPLACE

Systems that are outdated or architecturally unsuitable.

## REMOVE

Dead code, abandoned features, duplicate implementations, hacks, and unnecessary dependencies.

Do not start randomly rewriting files before understanding the repository.

---

# 3. REWRITE STRATEGY

This is a rewrite.

Do not preserve bad architecture simply because it already exists.

Prefer:

CLEAN ARCHITECTURE

over

BACKWARD COMPATIBILITY

unless compatibility is genuinely valuable.

Avoid:

* giant monolithic files
* god components
* god agent classes
* one enormous system prompt
* hundreds of permanently loaded tools
* entire conversation history in every model call
* hidden state that cannot be inspected
* duplicated data sources
* fake abstractions
* unnecessary microservices
* unnecessary dependencies
* generic AI SaaS architecture
* hardcoded integration-specific logic throughout the application
* storing provider secrets in client-side code
* pretending every integration uses the same authentication flow

The architecture should be modular but practical.

Do not split systems into separate services unless there is a real architectural reason.

---

# 4. PRIMARY ARCHITECTURE

CloudBrain should be built around the Cloudflare platform.

Use the following architecture as the default direction.

## AGENT RUNTIME

Use:

* Cloudflare Workers
* Cloudflare Agents SDK
* Durable Objects

The agent runtime must support:

* durable identity
* persistent state
* sessions
* real-time communication
* WebSockets
* recoverable execution
* scheduling
* long-running agent work
* sub-agent communication

Evaluate and use `@cloudflare/think` where its capabilities provide value.

Do not reimplement features already well provided by the platform.

However:

Do not couple the entire application architecture blindly to Think internals.

CloudBrain must retain its own domain architecture around:

* projects
* tasks
* agents
* permissions
* infrastructure
* artifacts
* automations
* memory
* integrations
* connections
* flows

Use the Cloudflare Agents runtime as infrastructure.

Use the CloudBrain architecture as the product layer.

---

# 5. AGENT ARCHITECTURE

The system should have a clear hierarchy.

## MAIN AGENT

The primary CloudBrain agent.

Responsibilities:

* understand user intent
* determine execution mode
* assemble context
* create plans when needed
* select capabilities
* select relevant integrations
* delegate work
* coordinate sub-agents
* track execution
* verify important outcomes
* communicate with the user

The main agent should NOT directly become a giant class containing every capability.

Capabilities must be modular.

Integration actions must be exposed through a controlled capability layer rather than injecting every connected application and every action into every model request.

---

# 6. SPECIALIST AGENTS

Support specialist agents such as:

## Research Agent

Responsible for:

* research
* documentation analysis
* source collection
* comparison
* knowledge extraction

## Code Agent

Responsible for:

* repository inspection
* coding
* debugging
* testing
* refactoring
* code execution

## Cloudflare Agent

Responsible for:

* Workers
* D1
* R2
* KV
* Queues
* Durable Objects
* Workflows
* AI Gateway
* Workers AI
* Vectorize
* Browser infrastructure
* deployments
* configuration

## Browser Agent

Responsible for:

* rendered web pages
* browser inspection
* screenshots
* DOM inspection
* debugging
* extraction

## File Agent

Responsible for:

* documents
* uploads
* workspace files
* transformations
* indexing

## Automation Agent

Responsible for:

* schedules
* recurring tasks
* triggers
* durable workflows
* integration-backed automations

## Integration Agent

Responsible for:

* discovering relevant connected applications
* inspecting available Composio actions
* validating connection state
* selecting appropriate integration actions
* preparing authentication or reconnection flows
* executing integration actions through the approved integration gateway
* reporting external side effects
* handling integration errors and rate limits

Do not require every request to use specialist agents.

Simple tasks should remain cheap and direct.

Use specialists when complexity justifies them.

---

# 7. EXECUTION MODES

CloudBrain should support explicit execution modes.

## QUICK

For:

* simple questions
* direct responses
* small tool calls
* simple read-only integration lookups

Flow:

User
→ Agent
→ Answer

No unnecessary planning.

---

## AGENT

For:

* multi-step tasks
* tool use
* coding
* browsing
* infrastructure actions
* integration actions

Flow:

User
→ Understand
→ Plan
→ Execute
→ Verify
→ Respond

---

## DEEP

For:

* complex research
* major engineering work
* multi-agent tasks
* large repository analysis
* infrastructure projects
* multi-application integration workflows

Flow:

User
→ Analyze
→ Decompose
→ Plan
→ Delegate
→ Execute
→ Verify
→ Iterate
→ Finalize

The agent should not expose unnecessary chain-of-thought.

Instead expose useful execution summaries, plans, steps, tool activity, integration actions, approvals, and results.

---

# 8. CONTEXT AND PROMPT ARCHITECTURE

DO NOT create one giant permanent system prompt.

Use a layered context architecture.

The model context should be assembled dynamically.

## LAYER A — CORE IDENTITY

Stable CloudBrain behavior.

Short and durable.

## LAYER B — SECURITY

Permissions.

Authorization.

Destructive action rules.

Approval requirements.

External side-effect rules.

## LAYER C — CURRENT MODE

Quick.

Agent.

Deep.

## LAYER D — CURRENT TASK

The user's actual objective.

## LAYER E — RELEVANT MEMORY

Only retrieve memory relevant to the current task.

## LAYER F — PROJECT CONTEXT

Relevant:

* project information
* files
* architecture
* instructions
* decisions

## LAYER G — CAPABILITIES

Only provide relevant tools, skills, and integration actions.

## LAYER H — CONNECTED SERVICES

Only provide relevant connected applications and action summaries.

Do not inject every connected application into every request.

## LAYER I — CURRENT EXECUTION STATE

Plan.

Subtasks.

Results.

Failures.

Artifacts.

Approvals.

Never inject everything.

Build a Context Assembler responsible for selecting the smallest useful context.

---

# 9. SKILLS SYSTEM

Skills are a first-class feature.

DO NOT treat skills as merely another system prompt.

A skill should be a packaged capability containing instructions and optional resources.

A skill can contain:

* metadata
* description
* activation rules
* instructions
* tool requirements
* resources
* examples
* scripts
* workflows
* constraints

Use the Cloudflare Think skills capability where appropriate, including skill activation and resources.

However, CloudBrain should also have a proper product-level Skill Registry.

A skill should conceptually resemble:

skills/
cloudflare/
SKILL.md
resources/
scripts/

coding/
SKILL.md
resources/
scripts/

research/
SKILL.md

browser/
SKILL.md

deployment/
SKILL.md

integrations/
SKILL.md

automation/
SKILL.md

Skills should be dynamically activated.

Do not load all skill instructions into every request.

---

# 10. DEFAULT SKILLS

CloudBrain should initially support high-quality skills such as:

## Cloudflare Infrastructure

Knowledge and workflows for:

* Workers
* Wrangler
* D1
* R2
* KV
* Queues
* Durable Objects
* Workflows
* bindings
* deployments
* configuration

## Software Engineering

Capabilities for:

* repository analysis
* implementation
* debugging
* testing
* refactoring
* architecture

## Browser Intelligence

Capabilities for:

* web inspection
* CDP
* DOM analysis
* screenshots
* network debugging

## Research

Capabilities for:

* source collection
* comparison
* summarization
* evidence tracking

## File Intelligence

Capabilities for:

* PDF analysis
* documents
* spreadsheets
* code files
* structured data

## Deployment

Capabilities for:

* Wrangler
* configuration validation
* deployment planning
* staging
* verification

## Automation

Capabilities for:

* schedules
* triggers
* recurring execution
* workflows

## Integrations

Capabilities for:

* discovering Composio applications
* inspecting application metadata
* identifying authentication requirements
* connecting accounts
* reconnecting expired accounts
* selecting actions
* executing actions
* handling external side effects
* displaying integration activity
* using integrations in schedules and flows

Skills should be dynamically activated.

Do not load all skill instructions into every request.

---

# 11. TOOL ARCHITECTURE

Create a Tool Registry.

Tools should have metadata such as:

* id
* name
* description
* category
* risk level
* required permissions
* input schema
* output schema
* availability
* associated skills
* provider
* authentication requirements
* side-effect classification

Tool categories:

## WORKSPACE

* read
* write
* edit
* find
* grep
* delete

## EXECUTION

* shell
* sandbox
* code execution

## BROWSER

* navigate
* inspect
* execute
* screenshot
* extract

## CLOUDFLARE

* Workers
* D1
* R2
* KV
* Queues
* Workflows
* deployments

## KNOWLEDGE

* search
* retrieve
* index

## INTEGRATIONS

* discover applications
* list connected accounts
* inspect application actions
* connect account
* reconnect account
* disconnect account
* execute action
* inspect action result

## EXTERNAL

* MCP
* APIs
* connected services

The agent should receive a filtered capability set.

Do not expose hundreds of irrelevant tools.

Do not expose raw provider credentials to the model.

---

# 12. COMPOSIO INTEGRATIONS AND BYOK

CloudBrain must include a complete architectural plan for Composio as an integrations provider.

The repository currently provides only the TypeScript SDK as the available Composio implementation path.

Before implementing the integration layer:

1. Inspect the installed or available Composio TypeScript SDK.
2. Read its official TypeScript documentation and type definitions.
3. Determine the current supported initialization pattern.
4. Determine how Composio expects the API key to be configured.
5. Determine how users, entities, connected accounts, apps, auth configurations, triggers, actions, and tool execution are represented.
6. Determine which authentication methods are supported by each application.
7. Determine how OAuth authorization URLs are created and completed.
8. Determine how API-key or token-based connections are created.
9. Determine how applications requiring no user authentication are represented.
10. Determine how connection status, expiration, revocation, and reconnection are handled.
11. Determine how actions are discovered and executed.
12. Determine how triggers and event subscriptions are represented.
13. Determine how errors, rate limits, retries, and provider failures are surfaced.
14. Determine whether the SDK supports server-side Workers execution directly or requires an adapter.
15. Determine whether any Node-specific APIs, dynamic imports, filesystem access, or unsupported runtime features must be isolated.
16. Determine the correct way to keep the Composio API key server-side.
17. Determine whether the SDK supports multiple users or entities safely under one CloudBrain deployment.
18. Determine how to avoid leaking one user's connected accounts or credentials to another user.

Do not guess the Composio API.

Use the actual SDK types and documented behavior.

If the SDK version in the repository differs from current documentation, treat the installed version and its type definitions as authoritative for implementation, while documenting any version-specific constraints.

## BYOK REQUIREMENT

CloudBrain must support Bring Your Own Key for Composio.

The CloudBrain operator should configure the Composio API key themselves.

The Composio API key must be stored only in server-side secrets or an equivalent secure Cloudflare configuration.

Never:

* expose the Composio API key to the browser
* place it in public environment variables
* serialize it into frontend state
* include it in logs
* include it in model context
* store it in D1 as plaintext
* return it from an API route

Support a clear configuration path such as:

* Wrangler secret
* Cloudflare dashboard secret
* local development `.dev.vars`
* documented environment variable name

Use the exact configuration approach appropriate for the SDK and Cloudflare runtime.

If the application supports multiple CloudBrain deployments, each deployment may provide its own Composio key.

## COMPOSIO CLIENT BOUNDARY

Create a server-only Composio adapter.

The rest of CloudBrain must not import the Composio SDK throughout arbitrary files.

Use a boundary such as:

* `ComposioClientFactory`
* `ComposioIntegrationProvider`
* `ComposioRepository`
* `IntegrationGateway`

The adapter should be responsible for:

* client initialization
* API-key access
* user/entity scoping
* application discovery
* connection discovery
* auth configuration discovery
* OAuth initiation
* OAuth callback completion
* API-key connection flows
* connection status
* reconnection
* disconnection
* action discovery
* action execution
* trigger discovery
* trigger registration
* trigger removal
* error normalization
* rate-limit handling
* audit events

Do not allow UI components or generic agent code to call Composio directly.

## USER AND ENTITY ISOLATION

Define a deterministic mapping between CloudBrain users or workspaces and Composio entities.

The mapping must be:

* stable
* non-secret
* collision-resistant
* documented
* scoped correctly

Do not use a single global Composio entity for all CloudBrain users.

If CloudBrain supports organizations or workspaces, decide whether connections belong to:

* a user
* a workspace
* a project
* a combination of workspace and user

Document the decision and enforce it consistently.

## AUTHENTICATION METHODS

The integration system must not assume every application uses OAuth.

Each application may require:

* OAuth
* API key
* access token
* personal token
* username and password
* custom credentials
* OAuth plus additional fields
* no user authentication
* an existing connection
* an administrator-managed connection

The UI and backend must inspect the application's actual authentication requirements before presenting a connection flow.

Represent authentication requirements with a normalized internal model such as:

* auth method
* required fields
* field labels
* secret field indicators
* OAuth authorization URL
* redirect state
* scopes
* connection status
* expiration
* reconnect requirement
* administrator approval requirement

Do not hardcode a single generic “Connect with OAuth” button.

## OAUTH FLOW

Implement OAuth as a secure server-mediated flow.

Requirements:

* generate a cryptographically secure state value
* bind state to the authenticated CloudBrain user or workspace
* bind state to the selected application and auth configuration
* store state server-side with expiration
* validate state on callback
* prevent replay
* handle cancellation
* handle provider errors
* redirect safely after completion
* never expose provider secrets to the browser
* never trust arbitrary return URLs
* show the resulting connection status in the UI

Use the correct Composio SDK flow after inspecting the SDK.

Do not invent callback behavior.

## API KEY AND TOKEN FLOW

For applications requiring API keys or tokens:

* render provider-specific fields based on discovered metadata
* mark secret fields clearly
* submit credentials only to the server
* never persist plaintext credentials in the browser
* never log submitted values
* use Composio's supported connection mechanism
* show validation errors without echoing secrets
* support reconnect and replacement
* support disconnect and revocation where available

If Composio stores the credential, CloudBrain should store only non-secret metadata and the Composio connection identifier.

If CloudBrain must store any credential itself, use an appropriate encryption strategy and document the key-management requirements. Prefer avoiding local credential storage when Composio provides secure storage.

## NO-AUTH APPLICATIONS

Some applications or actions may require no user authentication.

Represent these as available integrations or actions without forcing a connection flow.

Still apply:

* permission checks
* rate limits
* action risk classification
* audit logging

## CONNECTION STATES

Normalize connection states such as:

* NOT_CONNECTED
* CONNECTING
* CONNECTED
* EXPIRED
* REAUTH_REQUIRED
* ERROR
* DISCONNECTED
* PENDING_APPROVAL
* UNKNOWN

The UI must clearly distinguish these states.

## ACTION DISCOVERY

Do not load every Composio action into every model request.

Implement progressive discovery:

1. Discover relevant applications.
2. Discover connected accounts.
3. Search or list relevant actions for the current task.
4. Load only the selected action schemas.
5. Execute through the Integration Gateway.
6. Record the action and result.

Support action metadata such as:

* application
* action name
* description
* input schema
* output schema
* risk level
* required connection
* authentication state
* side effects
* idempotency behavior
* associated skill

## ACTION EXECUTION

Every Composio action execution must:

* validate input against the action schema
* verify user and workspace scope
* verify connection state
* verify permissions
* classify side effects
* request approval when required
* execute server-side
* normalize the result
* record an audit event
* expose progress and result in the UI
* handle provider errors
* handle retries safely
* avoid duplicate side effects where possible

Do not automatically retry non-idempotent actions without a clear safety strategy.

## INTEGRATION TOOL EXPOSURE

Expose Composio actions to agents through CloudBrain's Tool Registry.

Do not expose the entire Composio catalog as raw tools.

Use:

* application search
* action search
* dynamic action loading
* scoped tool wrappers
* action schemas
* permission metadata

The model should understand:

* which application is being used
* which account is being used
* what the action will do
* whether the action has external side effects
* whether approval is required

## INTEGRATION ACTIVITY

Every integration operation should produce visible activity.

Show:

* application
* action
* connected account label
* task
* status
* input summary with secrets redacted
* output summary
* timestamps
* errors
* approval state

Do not expose sensitive credentials or unnecessary private data.

---

# 13. COMPOSIO INTEGRATIONS UI

The integrations experience should be a first-class product area.

Add an INTEGRATIONS section to the primary navigation or settings navigation, depending on the final information architecture.

The experience should use layered pages rather than one overwhelming directory.

## INTEGRATIONS OVERVIEW

Show:

* connected applications
* recently used applications
* recommended applications
* connection issues
* available categories
* search
* filters
* setup status
* Composio provider status

If the Composio BYOK key is not configured, show a clear operator configuration state rather than a broken catalog.

## APPLICATION DIRECTORY

Show applications in categories and searchable layers.

Examples:

* communication
* productivity
* project management
* CRM
* storage
* databases
* developer tools
* marketing
* finance
* support
* calendars
* social
* analytics
* automation

Do not assume the catalog is static.

Use Composio discovery where appropriate and cache metadata safely.

## APPLICATION DETAIL PAGE

Show:

* application name
* icon
* description
* category
* connection status
* supported authentication methods
* connected accounts
* available actions
* available triggers
* recent activity
* permissions
* connect button
* reconnect button
* disconnect button

## CONNECTION FLOW

The connect experience must adapt to the application's actual authentication method.

Possible states:

* choose account
* OAuth redirect
* API key form
* token form
* custom credential form
* administrator approval
* no connection required
* connection completed
* connection failed
* reconnect required

Do not show irrelevant fields.

## CONNECTED ACCOUNTS

Show:

* account label
* provider
* owner
* workspace or user scope
* status
* last used
* last validated
* expiration if available
* reconnect
* disconnect

Do not show secrets.

## ACTION EXPLORER

Allow users to inspect available actions.

Show:

* action name
* description
* required connection
* input fields
* side-effect level
* associated skills
* recent usage

Allow safe testing only when appropriate.

Dangerous actions must require approval.

## TRIGGER EXPLORER

If Composio supports triggers for the selected application, show:

* trigger name
* event description
* required connection
* configuration fields
* active subscriptions
* recent events
* enable
* disable

---

# 14. COMPOSIO INTEGRATIONS IN TASKS, SCHEDULES, AND FLOWS

Composio integrations must not be limited to chat.

They should be usable in:

* agent tasks
* scheduled automations
* durable workflows
* visual flows
* project actions
* webhooks
* event-driven triggers
* sub-agent execution
* approval workflows

## TASKS

A task may use one or more integration actions.

The task detail should show:

* selected applications
* selected accounts
* actions
* permissions
* approvals
* results
* failures
* artifacts

## SCHEDULES

A scheduled automation may:

* read from an integration
* transform data
* call an AI agent
* write to another integration
* notify a user
* create a task
* generate an artifact

The schedule editor must validate:

* connection availability
* action schemas
* permissions
* required fields
* secret references
* retry behavior
* timezone
* failure handling

Do not store plaintext credentials in schedule definitions.

## FLOWS

Design a flow model that can represent:

TRIGGER
→ FETCH
→ TRANSFORM
→ AGENT
→ APPROVAL
→ ACTION
→ VERIFY
→ NOTIFY

Integration nodes should be typed and validated.

Examples:

* Gmail trigger
* Slack action
* GitHub lookup
* Notion write
* Linear task creation
* Calendar event creation

Do not hardcode only a few providers.

Use a provider-neutral node model backed by Composio metadata.

## DURABLE EXECUTION

Use Cloudflare Workflows or equivalent durable execution for long-running integration flows.

Support:

* retries
* backoff
* pause for approval
* resume
* cancellation
* partial failure
* compensation where possible
* visible execution history

## INTEGRATION FAILURE HANDLING

Handle:

* expired OAuth
* revoked access
* invalid API key
* provider downtime
* rate limits
* malformed input
* permission denial
* duplicate action risk
* partial completion

The user should receive a clear recovery path.

---

# 15. TOOL ARCHITECTURE

Create a Tool Registry.

Tools should have metadata such as:

* id
* name
* description
* category
* risk level
* required permissions
* input schema
* output schema
* availability
* associated skills
* provider
* authentication requirements
* side-effect classification

Tool categories:

## WORKSPACE

* read
* write
* edit
* find
* grep
* delete

## EXECUTION

* shell
* sandbox
* code execution

## BROWSER

* navigate
* inspect
* execute
* screenshot
* extract

## CLOUDFLARE

* Workers
* D1
* R2
* KV
* Queues
* Workflows
* deployments

## KNOWLEDGE

* search
* retrieve
* index

## INTEGRATIONS

* discover applications
* list connected accounts
* inspect application actions
* connect account
* reconnect account
* disconnect account
* execute action
* inspect action result

## EXTERNAL

* MCP
* APIs
* connected services

The agent should receive a filtered capability set.

Do not expose hundreds of irrelevant tools.

---

# 16. CODE MODE

Use code-based orchestration where it provides a real advantage.

For complex tool composition, allow the agent to write code that orchestrates tools.

This is preferable to forcing the model through dozens of sequential tool calls when it needs to:

* loop
* transform data
* combine APIs
* inspect multiple resources
* process structured output
* coordinate multiple integrations

Use Code Mode or equivalent Cloudflare-native execution patterns where appropriate.

Ensure:

* execution is auditable
* side effects are visible
* dangerous actions require approval
* failures are recoverable
* integration credentials remain inaccessible to generated code unless explicitly mediated
* generated code cannot bypass CloudBrain permissions

---

# 17. WORKSPACE AND FILE SYSTEM

CloudBrain needs multiple file concepts.

## AGENT WORKSPACE

Temporary or durable files used by an agent.

## PROJECT FILES

Files belonging to a project.

## USER FILES

Uploaded documents and assets.

## ARTIFACTS

Generated outputs.

Examples:

* reports
* code
* screenshots
* generated files
* archives

The UI must distinguish these concepts clearly.

Do not dump everything into one fake filesystem.

---

# 18. SANDBOX ARCHITECTURE

Use Cloudflare Sandbox or Containers for workloads requiring real isolated execution.

Examples:

* running repositories
* installing dependencies
* running tests
* servers
* Python workloads
* package installation
* development environments

Use lightweight execution when possible.

Do not launch expensive environments unnecessarily.

The agent must understand the difference between:

LIGHTWEIGHT EXECUTION

and

FULL SANDBOX EXECUTION

Use the cheapest sufficient execution environment.

Integration actions should normally execute through the server-side Integration Gateway, not by placing provider credentials inside a sandbox.

---

# 19. BROWSER ARCHITECTURE

Use Cloudflare Browser capabilities for real browser tasks.

Support:

* rendered page inspection
* DOM access
* JavaScript execution
* screenshots
* network inspection
* console inspection
* performance analysis
* extraction

Browser sessions should become first-class UI objects.

A browser task should not disappear into logs.

Support:

* temporary sessions
* durable sessions where appropriate
* session cleanup

---

# 20. MEMORY ARCHITECTURE

Do not use conversation history as the entire memory system.

Implement multiple memory layers.

## WORKING MEMORY

Current task.

Short-lived.

## SESSION MEMORY

Conversation-level information.

Use:

* recent messages
* rolling summaries
* important decisions

## LONG-TERM MEMORY

Persistent useful information.

Must be:

* inspectable
* editable
* deletable

## PROJECT MEMORY

Project-specific knowledge.

Examples:

* architecture decisions
* technical preferences
* repository knowledge

## EPISODIC MEMORY

Compressed records of important completed events.

Examples:

* deployment failed due to missing binding
* previous architecture decision
* recurring problem
* integration connection expired
* external action completed

## SEMANTIC MEMORY

Searchable knowledge.

Use appropriate retrieval infrastructure.

Never blindly inject all memory.

Retrieve.

Rank.

Compress.

Inject only what is relevant.

Do not store provider secrets or raw sensitive integration payloads as memory.

---

# 21. STORAGE ARCHITECTURE

Use the correct Cloudflare service for the correct workload.

## DURABLE OBJECT STORAGE

Use for:

* live agent state
* agent sessions
* active execution state
* durable coordination

## D1

Use for relational product data.

Examples:

* users
* projects
* tasks
* automation metadata
* permissions
* connections
* integration metadata
* artifact metadata
* flow definitions
* audit records

Do not store provider secrets in plaintext.

## R2

Use for large objects.

Examples:

* files
* artifacts
* screenshots
* uploads
* generated outputs

## AI SEARCH / VECTOR SYSTEM

Use for:

* semantic retrieval
* knowledge
* documents
* memory retrieval

## KV

Use primarily for:

* caching
* lightweight configuration
* feature flags
* short-lived OAuth state only when appropriate

Do not turn KV into the main database.

## QUEUES

Use for:

* asynchronous processing
* ingestion
* events
* notifications
* integration event processing

## WORKFLOWS

Use for:

* durable multi-step work
* long-running processes
* retryable automation
* integration flows
* approval pauses

---

# 22. TASK SYSTEM

Tasks are first-class domain objects.

A task should contain:

* id
* title
* status
* mode
* project
* parent task
* subtasks
* assigned agent
* plan
* progress
* logs
* artifacts
* integrations used
* approvals
* timestamps

Statuses:

QUEUED

RUNNING

WAITING_APPROVAL

BLOCKED

FAILED

COMPLETED

CANCELLED

Every major agent operation should map to visible tasks.

---

# 23. SUB-AGENT SYSTEM

Support parent-child execution.

Example:

Main Agent
├── Research Agent
├── Code Agent
├── Browser Agent
├── Integration Agent
└── Verification Agent

Requirements:

* visible hierarchy
* status tracking
* streaming progress
* artifact passing
* cancellation
* error propagation

Do not spawn sub-agents for trivial tasks.

Use them when parallelism or specialization provides real value.

---

# 24. SCHEDULING AND AUTOMATION

CloudBrain should support autonomous execution.

Triggers:

* one-time schedule
* recurring schedule
* webhook
* event
* manual trigger
* Composio-supported application trigger

Automations should be visible and manageable.

Each automation should show:

* trigger
* agent
* instructions
* permissions
* tools
* integrations
* connected accounts
* recent runs
* failures

Long-running multi-step automation should use durable execution patterns.

Do not allow an automation to silently use a connection that has expired or changed scope.

---

# 25. CLOUDFLARE CONTROL SYSTEM

This is a major differentiator.

CloudBrain should eventually provide native visibility and agent control for:

* Workers
* Pages where relevant
* D1
* R2
* KV
* Queues
* Durable Objects
* Workflows
* AI Gateway
* Workers AI
* Vector systems
* deployments
* bindings
* configuration
* logs

IMPORTANT:

Do not automatically use Wrangler CLI for everything.

Choose the appropriate mechanism.

## NATIVE BINDINGS

For runtime access.

## CLOUDFLARE APIs

For account-level management.

## SDKS

Where appropriate.

## WRANGLER

For project-oriented CLI workflows and repository development.

The agent should understand which mechanism is appropriate.

---

# 26. PERMISSION SYSTEM

The agent must not receive unlimited destructive access.

Every capability should have a risk level.

Examples:

READ

SAFE

WRITE

DESTRUCTIVE

EXTERNAL COMMUNICATION

SENSITIVE

For dangerous actions:

Require approval.

Examples:

* deleting production resources
* deploying production changes
* modifying DNS
* deleting databases
* sending external messages
* sending emails
* posting publicly
* creating or deleting external records
* modifying CRM data
* creating calendar events
* changing project permissions

The UI must clearly explain:

WHAT THE AGENT WANTS TO DO

WHAT RESOURCE WILL CHANGE

WHAT THE CONSEQUENCE IS

WHICH CONNECTED ACCOUNT WILL BE USED

Actions:

DENY

ALLOW ONCE

ALWAYS ALLOW

Approval policies must be scoped and revocable.

---

# 27. CHAT SYSTEM

The chat system is the primary entry point.

Features:

* streaming
* sessions
* branching conversations
* editing messages
* regeneration
* attachments
* model selection
* execution mode
* tool visibility
* task links
* artifact rendering
* integration action visibility
* connection prompts
* approval prompts

The user should be able to see:

* agent activity
* tool calls
* plans
* task progress
* generated artifacts
* integration actions
* connected application used
* external side effects
* failures and recovery options

Do not expose raw internal reasoning.

Expose useful execution information.

---

# 28. CONVERSATION BRANCHING

Support branching.

A user should be able to:

* edit an old message
* regenerate
* branch from a point
* compare branches

Conversation state should preserve ancestry.

Do not duplicate the entire conversation unnecessarily.

Use references and shared history where practical.

---

# 29. FRONTEND INFORMATION ARCHITECTURE

The application should feel like an operating environment.

PRIMARY NAVIGATION:

CHAT

AGENTS

TASKS

WORKSPACE

BROWSER

TOOLS

SKILLS

INTEGRATIONS

AUTOMATIONS

INFRASTRUCTURE

MEMORY

SETTINGS

Do not turn every small feature into a top-level page.

Use pages for major persistent concepts.

Use panels and drawers for contextual detail.

---

# 30. CHAT PAGE

The chat page should be the primary workspace.

Structure:

LEFT SIDEBAR

* New Chat
* search
* sessions
* pinned conversations
* recent conversations

MAIN AREA

* conversation
* agent responses
* artifact cards
* execution summaries
* integration activity

RIGHT CONTEXT PANEL

Contextual and collapsible.

Can show:

* task
* plan
* active agents
* files
* artifacts
* connected applications
* selected accounts
* approvals

BOTTOM COMPOSER

Support:

* text
* files
* mode
* model
* capabilities
* optional integration selection

Do not overload the composer.

---

# 31. AGENTS PAGE

Show:

* system agents
* custom agents
* active agents

Each agent should show:

* purpose
* status
* allowed tools
* skills
* model
* permissions
* integration access

Support custom agents later.

Custom agent configuration:

* name
* behavior
* skills
* tools
* model
* permissions
* allowed integrations
* allowed accounts
* approval policy

---

# 32. TASKS PAGE

Provide:

RUNNING

QUEUED

WAITING

COMPLETED

FAILED

Each task opens a detailed execution view.

Tabs:

OVERVIEW

PLAN

ACTIVITY

AGENTS

INTEGRATIONS

ARTIFACTS

LOGS

---

# 33. WORKSPACE PAGE

This should provide a development environment.

Possible layout:

FILES

EDITOR

AGENT ACTIVITY

TERMINAL

Do not build a fake VS Code clone if the functionality is weak.

Build a focused workspace optimized for AI-assisted work.

---

# 34. BROWSER PAGE

Represent active browser sessions.

Show:

* browser viewport
* URL
* session state
* screenshots
* agent actions

Do not pretend a static screenshot is a live browser.

Clearly distinguish:

LIVE

SNAPSHOT

CLOSED

---

# 35. TOOLS PAGE

The Tool Registry UI.

Categories:

Cloudflare

Workspace

Browser

Code

Knowledge

Integrations

External

MCP

Each tool should display:

* description
* permissions
* status
* associated skill
* provider
* authentication requirements
* side-effect level

---

# 36. SKILLS PAGE

Skills should have their own interface.

Show:

* installed skills
* active skills
* custom skills

A skill detail page should show:

OVERVIEW

INSTRUCTIONS

RESOURCES

TOOLS

SCRIPTS

ACTIVITY

Support importing custom skills in a structured format.

---

# 37. INTEGRATIONS PAGE

Create a layered integrations experience.

## OVERVIEW

Show:

* Composio configuration status
* connected applications
* applications needing reconnection
* recently used integrations
* recommended integrations
* categories
* search

## DIRECTORY

Show dynamically discovered applications.

Use layered navigation:

* category
* application
* authentication
* connected accounts
* actions
* triggers
* activity

## APPLICATION DETAIL

Show:

* application metadata
* connection state
* authentication methods
* connected accounts
* actions
* triggers
* permissions
* recent activity

## CONNECTION DETAIL

Show:

* account label
* owner
* scope
* status
* expiration
* last used
* reconnect
* disconnect

## ACTION DETAIL

Show:

* action description
* input schema
* output schema
* risk level
* required connection
* associated skills
* recent executions

The UI must adapt to OAuth, API key, token, custom credential, no-auth, and administrator-managed flows.

---

# 38. AUTOMATIONS PAGE

Visual but not overdesigned.

An automation contains:

TRIGGER

↓

AGENT

↓

LOGIC

↓

ACTION

Show:

* next run
* previous runs
* failures
* execution history
* integrations used
* connected accounts
* approval requirements

Support integration-backed nodes without hardcoding provider-specific flow logic.

---

# 39. INFRASTRUCTURE PAGE

This is the Cloudflare control center.

Provide:

OVERVIEW

RESOURCES

ACTIVITY

LOGS

DEPLOYMENTS

Do not make it a meaningless dashboard.

Every number should lead somewhere useful.

---

# 40. MEMORY PAGE

Memory must be user-visible.

Sections:

PERSONAL

PROJECTS

SESSIONS

KNOWLEDGE

Each memory entry should show:

* content
* source
* confidence
* last used

Actions:

EDIT

DELETE

FORGET

Do not display secrets or raw provider credentials.

---

# 41. DESIGN SYSTEM

CloudBrain should NOT look like generic AI SaaS.

Use a white/orange or black/orange visual system based on the active theme, with a visual direction inspired by Cloudflare's technical clarity and orange accent language without copying Cloudflare branding or assets.

Avoid:

* excessive gradients
* excessive glassmorphism
* glowing purple everything
* random floating blobs
* cyberpunk nonsense
* cards inside cards inside cards
* generic blue SaaS styling
* unstructured dashboard decoration

The visual direction should be:

TECHNICAL

PRECISE

CALM

DENSE WHEN NECESSARY

MINIMAL

HIGH-QUALITY

Think:

developer infrastructure

*

AI operating environment

*

modern technical software

Use:

* light theme: white, warm gray, black, orange accent
* dark theme: near-black, charcoal, white, orange accent
* restrained orange highlights for actions, status, focus, and branding
* clear borders and strong hierarchy
* high contrast
* technical density without visual noise

Potential typography:

Geist or Inter for UI.

Geist Mono or equivalent for technical content.

Use Hugeicons or another consistent high-quality icon system.

Do not mix icon libraries randomly.

Do not use Cloudflare logos or trademarks in a way that implies official affiliation.

---

# 42. DESIGN TOKENS

Create a proper design token system.

Include:

* background
* surface
* elevated surface
* border
* text primary
* text secondary
* muted text
* accent orange
* accent foreground
* success
* warning
* danger
* focus ring
* code background

Support both light and dark themes.

Do not hardcode random colors across components.

---

# 43. COMPONENT SYSTEM

Create reusable primitives.

Examples:

Button

IconButton

Input

CommandPalette

Sidebar

Panel

Sheet

Dialog

Tabs

DataTable

ActivityItem

TaskStatus

AgentStatus

ToolCall

IntegrationAction

ConnectionStatus

ApplicationCard

AccountCard

ArtifactCard

FileCard

PermissionRequest

FlowNode

Do not create giant page-specific components when reusable primitives make sense.

---

# 44. REAL-TIME ARCHITECTURE

The frontend must receive real-time updates for:

* agent streaming
* task progress
* tool calls
* sub-agent status
* approvals
* artifacts
* integration action execution
* connection completion
* automation runs

Use the Cloudflare agent real-time infrastructure appropriately.

Do not poll aggressively when durable real-time connections exist.

---

# 45. OBSERVABILITY

Every important execution should be traceable.

Track:

* agent runs
* model calls
* tool calls
* integration actions
* execution time
* failures
* retries
* approvals
* task outcomes
* connection events
* automation runs

Provide a useful audit trail.

Do not expose sensitive information in logs.

Redact:

* API keys
* OAuth tokens
* access tokens
* refresh tokens
* passwords
* secret form fields
* sensitive provider payloads

---

# 46. MODEL ARCHITECTURE

CloudBrain should be provider-flexible.

Do not hardwire the product around one LLM provider.

Support an abstraction for models.

Possible providers:

* Workers AI
* OpenAI
* Anthropic
* Gemini
* other compatible providers

Model selection should consider:

* capability
* latency
* cost
* context size
* task type

Do not build an unnecessarily complex automatic model router in the first implementation.

Create the abstraction first.

---

# 47. EFFICIENCY RULES

Always consider:

TOKEN COST

LATENCY

TOOL COUNT

CONTEXT SIZE

EXECUTION COST

INTEGRATION API COST

Rules:

Do not send full history.

Do not send all tools.

Do not send all skills.

Do not send all memories.

Do not send all Composio applications.

Do not send all Composio actions.

Do not read entire repositories when targeted inspection is sufficient.

Do not use deep agent mode for trivial tasks.

Use progressive context loading.

Use summaries.

Use retrieval.

Use specialist agents selectively.

Cache safe integration metadata where appropriate.

Do not cache secrets.

---

# 48. REPOSITORY STRUCTURE

Design a clean repository structure.

Prefer logical domains.

For example:

apps/
web/

packages/
agent-core/
agent-runtime/
tools/
skills/
memory/
cloudflare/
integrations/
ui/
shared/

This is only a conceptual example.

Inspect the repository and choose the simplest architecture that remains scalable.

Do not create a monorepo purely because monorepos are fashionable.

The Composio SDK should be isolated behind a server-only integrations package or equivalent boundary.

---

# 49. IMPLEMENTATION PHASES

Rewrite systematically.

## PHASE 0

Repository audit.

Architecture document.

Migration/removal plan.

Composio SDK investigation.

Cloudflare runtime compatibility investigation.

BYOK configuration plan.

Integration data model.

Deployment plan.

## PHASE 1

Foundation.

* project structure
* configuration
* design system
* light and dark themes
* routing
* authentication foundation if needed
* server-side secret configuration
* README foundation

## PHASE 2

Core agent runtime.

* agent
* sessions
* streaming
* context assembler
* capability filtering

## PHASE 3

Chat.

* sessions
* streaming
* activity
* execution visibility
* approval prompts

## PHASE 4

Tasks and agent execution.

* plans
* task state
* sub-agents
* durable execution

## PHASE 5

Workspace.

* files
* artifacts
* execution

## PHASE 6

Skills and tools.

* registry
* activation
* permissions
* dynamic capability loading

## PHASE 7

Composio integration foundation.

* inspect and install the correct TypeScript SDK
* create server-only adapter
* configure BYOK
* define user/workspace entity mapping
* define integration database schema
* implement provider health status
* implement application discovery
* implement connection discovery
* implement normalized connection states
* implement error normalization
* implement audit events

## PHASE 8

Composio authentication flows.

* OAuth initiation
* secure callback
* state validation
* API-key connection flow
* token connection flow
* custom credential flow where supported
* no-auth application handling
* reconnect
* disconnect
* connection status UI

## PHASE 9

Composio action and trigger system.

* action discovery
* action schema loading
* action execution
* permission checks
* approval checks
* result normalization
* trigger discovery
* trigger registration
* trigger removal
* integration activity

## PHASE 10

Browser and Sandbox.

## PHASE 11

Memory and knowledge.

## PHASE 12

Automations and flows.

* schedules
* integration-backed actions
* Composio triggers
* durable workflows
* approvals
* retries
* failure recovery

## PHASE 13

Cloudflare infrastructure control.

## PHASE 14

Observability and production hardening.

## PHASE 15

Deployment documentation.

* validate production configuration
* validate Wrangler configuration
* validate secrets documentation
* add Cloudflare deploy button
* add GitHub repository link
* test README deployment instructions

---

# 50. QUALITY REQUIREMENTS

Every implementation must be:

* typed
* modular
* understandable
* maintainable
* secure
* production-oriented

Use TypeScript wherever appropriate.

Avoid `any`.

Validate external input.

Validate tool arguments.

Use schemas.

Handle failures.

Handle cancellation.

Handle retries where appropriate.

Do not silently swallow errors.

Do not expose secrets.

Do not trust client-provided workspace or user identifiers.

Do not trust client-provided integration connection identifiers without server-side authorization.

---

# 51. TESTING

Create a practical testing strategy.

Test:

* context assembly
* permission checks
* task transitions
* tool routing
* memory retrieval
* skill activation
* critical Cloudflare operations
* Composio client initialization
* BYOK configuration behavior
* user/workspace entity isolation
* application discovery
* connection state normalization
* OAuth state validation
* API-key connection validation
* action schema validation
* action permission checks
* action execution error handling
* trigger registration
* integration activity redaction
* schedule execution with integrations
* flow retries and cancellation

Do not waste time writing meaningless tests merely to increase coverage numbers.

Test critical behavior.

---

# 52. DOCUMENTATION

Maintain documentation for:

ARCHITECTURE

AGENTS

SKILLS

TOOLS

MEMORY

TASKS

PERMISSIONS

CLOUDFLARE INTEGRATION

COMPOSIO INTEGRATION

BYOK CONFIGURATION

AUTHENTICATION FLOWS

INTEGRATION SECURITY

AUTOMATIONS

FLOWS

FRONTEND ARCHITECTURE

DEPLOYMENT

The codebase should remain understandable to future engineers and agents.

The README must clearly explain:

* what CloudBrain is
* local development
* required environment variables
* Cloudflare bindings
* Composio BYOK configuration
* OAuth callback configuration
* deployment steps
* production security considerations
* how to deploy from GitHub

---

# 53. CLOUDFLARE DEPLOYMENT LINK

At the end of the rewrite, create or update the README with a Cloudflare deploy-to-Cloudflare link using the repository:

`https://github.com/truehannan/cloudbrain`

Use Cloudflare's current supported deploy button or deploy-link format after verifying the correct syntax.

The README should include a prominent section such as:

## Deploy to Cloudflare

[Deploy to Cloudflare](THE_CORRECT_CLOUDFLARE_DEPLOY_LINK)

The deployment link must point to:

`github.com/truehannan/cloudbrain`

Do not invent an invalid URL.

Verify the current Cloudflare deploy button format from official Cloudflare documentation or an existing valid Cloudflare example.

The README must also explain which secrets and configuration values the user must add after deployment, including:

* model provider keys where applicable
* Composio API key
* OAuth callback configuration
* Cloudflare bindings
* authentication configuration
* any required external provider credentials

Do not place real secrets in the repository.

---

# 54. IMPORTANT PRODUCT PRINCIPLES

Follow these principles throughout development.

## VISIBLE EXECUTION

Important work should be visible.

## PROGRESSIVE DISCLOSURE

Do not overwhelm the user with complexity.

## CAPABILITY ON DEMAND

Load tools, skills, applications, and actions when needed.

## HUMAN CONTROL

Dangerous actions require approval.

## DURABLE STATE

Long-running work should survive interruptions.

## PROVIDER FLEXIBILITY

Avoid unnecessary vendor lock-in at the model layer.

## CLOUDFLARE NATIVE

Use Cloudflare primitives intelligently.

Do not recreate infrastructure Cloudflare already provides.

## COMPOSIO AS A PROVIDER BOUNDARY

Keep Composio behind a clean server-side adapter.

Do not spread provider-specific assumptions throughout the product.

## BYOK SECURITY

The operator supplies the Composio API key.

The key remains server-side.

## USER ISOLATION

Connected accounts and integration actions must be scoped correctly.

## NO FAKE FEATURES

Do not create UI for functionality that does not actually work.

## NO PLACEHOLDER ARCHITECTURE

Do not create fake implementations that pretend to support future systems.

Either implement the foundation properly or clearly isolate the future extension point.

## NO UNIVERSAL AUTH ASSUMPTION

OAuth, API keys, tokens, custom credentials, no-auth applications, and administrator-managed connections must be handled according to actual provider metadata.

## NO SECRET LEAKS

Never expose credentials in frontend state, logs, model context, artifacts, or error messages.

---

# 55. HOW TO WORK

Work iteratively.

Before major implementation:

1. Inspect.
2. Plan.
3. Explain the architectural decision briefly.
4. Implement.
5. Validate.
6. Continue.

Do not repeatedly ask the user for permission for every small implementation decision.

Make strong engineering decisions.

Ask only when the decision materially changes the product direction or requires unavailable credentials or access.

When working with Composio:

1. Inspect the actual TypeScript SDK.
2. Confirm the supported API.
3. Confirm Cloudflare Workers compatibility.
4. Implement the server-side adapter.
5. Add tests for isolation and authentication.
6. Add the UI only after the backend contract is clear.
7. Never guess provider behavior.

When working with deployment:

1. Inspect the final repository configuration.
2. Validate Wrangler configuration.
3. Validate required bindings.
4. Validate README instructions.
5. Verify the Cloudflare deploy link format.
6. Ensure the link references `github.com/truehannan/cloudbrain`.

---

# 56. FINAL SUCCESS CRITERIA

CloudBrain V2 should eventually become a cohesive system where a user can:

Start a conversation.

↓

Give an agent a task.

↓

Watch the task become visible.

↓

Inspect the plan.

↓

See tools being used.

↓

See sub-agents when appropriate.

↓

Open generated files.

↓

Inspect browser activity.

↓

Approve dangerous actions.

↓

Connect an external application through OAuth, API key, token, custom credentials, or no-auth flow as appropriate.

↓

See the connected application and account represented in the UI.

↓

Allow the agent to use a relevant integration action.

↓

Inspect the action, permissions, side effects, and result.

↓

Use integrations inside a schedule or flow.

↓

Pause for approval when necessary.

↓

Recover from expired connections or provider failures.

↓

Review artifacts.

↓

Schedule future work.

↓

Return later and continue from durable context.

↓

Deploy the project to Cloudflare from the README using the repository deploy link.

The product should feel like a real AI operating environment running on Cloudflare infrastructure.

Do not optimize for producing the most code.

Optimize for building the correct foundation.

Start by auditing the repository now.