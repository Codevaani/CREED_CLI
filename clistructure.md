The Gemini CLI application is a command-line tool that enables AI agents to interact with the local file system, execute shell commands, and fetch external content. It provides a terminal-based interface for interacting with Gemini models, facilitating code understanding, generation, and automation.

The software comprises several key components:

CLI Application Framework: Manages the application's lifecycle, from startup and configuration to command execution. It supports both interactive user interface and non-interactive command modes, handling authentication, session management, and configuration via settings.json. The interactive interface uses ink and React. Gemini CLI Application
AI Agent Core Functionality: Orchestrates the lifecycle of AI agents, including their discovery, loading, and execution. This system manages model availability and fallback strategies, facilitates AI content generation, and enforces policies for tool use and user confirmation. It also integrates code assistance features for an enhanced developer experience. AI Agent Core Functionality
Extensions and Tools: Provides a modular system for expanding capabilities through extensions, skills, and built-in tools. Extensions bundle prompts, Model Context Protocol (MCP) servers, custom commands, and agent skills. Skills offer specialized instructions, while built-in tools allow interaction with the local environment and web content. A VS Code extension integrates the CLI with the IDE. Extensions and Tools
Pluggable Hook System: Enables external code to inject custom logic and modify behavior at various lifecycle events without altering the core CLI source. It manages hook registration, execution planning, and result aggregation. Pluggable Hook System
Experimental A2A Server: Standardizes interactive workflows, tool execution, and command management for Agent-to-Agent communication via an HTTP API. Experimental A2A Server
Behavioral Evaluations: A framework validates the agent's behavior against prompts, providing a feedback loop for refining system prompts and tool definitions. Behavioral Evaluations
Project Orchestration and Automation: Automates project-wide operations, including builds, GitHub workflows for issues and pull requests, release management, documentation generation, and quality assurance. Project Orchestration and Automation
Third-Party Dependencies: Manages the acquisition and integration of external binaries, such as ripgrep, ensuring their availability and correct configuration. Third-Party Dependencies
Gemini CLI Application
The Gemini Command Line Interface (CLI) application provides a terminal-based interface for interacting with Gemini models, facilitating code understanding, generation, and automation. The application supports both interactive and non-interactive modes, enabling flexible use for developers and automated workflows. Its architecture, documented in docs/architecture.md, separates concerns between the user-facing CLI and core backend logic, promoting extensibility and maintainability.

The application's lifecycle begins with startup and configuration, where user and workspace settings are loaded. This includes parsing command-line arguments, validating DNS resolution, and determining whether to operate in an interactive UI mode or a non-interactive command mode. Essential to its operation is the sandboxing mechanism, which can relaunch the application in a controlled environment to enhance security. CLI Application Lifecycle and Architecture provides further details on these initial processes.

Authentication is a core component, managing various methods such as Google OAuth, Gemini API keys, and Vertex AI, which ensures secure access to Gemini models. This authentication process is integrated into the application's initialization and includes token refreshing and validation. Session management features allow users to list, delete, and resume previous interactions, providing continuity in their workflow.

For non-interactive scenarios, the CLI processes commands efficiently, supporting various types like slash commands and at-commands. It incorporates prompt processors to inject content or execute shell commands, and it can output structured data in formats like JSON, which is crucial for scripting and automation. For more information, refer to Non-Interactive Command Execution.

The interactive user interface is built using ink and React, offering a rich terminal experience. This UI framework manages application layouts, dialogs, and custom hooks for user interactions, including keyboard and mouse input. Interactive UI Components and Framework delves deeper into these aspects.

The CLI's extensibility is a key feature, supported by a comprehensive extension management system. This system allows users to install, update, enable, and disable extensions, customizing the CLI's capabilities to suit specific needs. Extensions can define custom commands, integrate with MCP servers, and contribute agent skills. More details on extension development and management can be found in Extension Development and Management. Configuration of both commands and settings is managed through yargs for argument parsing and settings.json for persistent configurations, which also defines key bindings and policy engine rules. This is further elaborated in Command and Setting Configuration.

The project includes extensive testing utilities and a framework for robust quality assurance, covering asynchronous assertions, mocking components, and simulating UI interactions. These testing mechanisms are vital for maintaining the stability and reliability of the CLI application. For an in-depth understanding, see Testing Utilities and Framework.

CLI Application Lifecycle and Architecture
The Gemini CLI application manages its operational flow through a structured lifecycle that encompasses initialization, configuration, and execution in both interactive and non-interactive environments, along with robust mechanisms for authentication, sandboxing, and graceful shutdown. The core application logic resides in packages/cli and is orchestrated primarily by the main function in packages/cli/src/gemini.tsx.

The application's startup involves several key phases. Upon launch, it handles global error management, such as suppressing known node-pty race conditions on Windows, as defined in packages/cli/index.ts. Following this, initializeApp in packages/cli/src/core/initializer.ts centralizes critical startup tasks. This includes loading user and workspace settings via loadSettings and loadCliConfig, parsing command-line arguments using parseArguments, and validating DNS resolution order. Authentication is a critical early step, with performInitialAuth in packages/cli/src/core/auth.ts handling the initial authentication flow, including token refreshing and specific error handling for cases requiring further validation. UI theme validation is also performed through validateTheme in packages/cli/src/core/theme.ts.

A fundamental aspect of the CLI's architecture is its ability to operate in distinct modes. The application dynamically determines whether to run as an interactive terminal UI or in a non-interactive command execution mode. If an interactive UI is required, startInteractiveUI renders a React-based interface using ink. Conversely, for non-interactive execution, commands are processed by runNonInteractive.

Security and resource management are integrated throughout the lifecycle. The CLI supports sandboxing, where loadSandboxConfig determines if and how the application should be relaunched in a sandboxed environment for isolation. For system cleanliness and stability, the application employs a comprehensive cleanup mechanism. Functions registered with registerCleanup and registerSyncCleanup in packages/cli/src/utils/cleanup.ts ensure that resources are properly released upon exit, encompassing telemetry shutdown and the removal of temporary checkpoint directories. Deferred command execution, managed by packages/cli/src/deferred.ts, allows for administrative blocking of specific commands related to features like MCP, extensions, or skills, enhancing security and policy enforcement before a command's side effects are executed. This mechanism uses defer to wrap yargs command modules, storing the command's handler for later execution by runDeferredCommand after administrative checks.

Non-Interactive Command Execution
The Gemini CLI application supports a non-interactive mode for executing commands without direct user interaction, enabling scripting and automation. The primary entry point for this mode is handled by the runNonInteractive function in packages/cli/src/nonInteractiveCli.ts. This function manages the entire lifecycle of a non-interactive command, from processing user input to generating output and handling errors.

In this mode, the CLI processes various types of commands, including natural language queries, slash commands, and at-commands. Input starting with a / is identified as a slash command and delegated to handleSlashCommand in packages/cli/src/nonInteractiveCli.ts. Otherwise, handleAtCommand in the same file processes potential @ commands, which might involve injecting file content.

The handleSlashCommand function, specifically detailed in packages/cli/src/nonInteractiveCliCommands.ts, is responsible for parsing and executing these commands. It initializes a CommandService (located in packages/cli/src/services), which aggregates commands from various loaders: BuiltinCommandLoader for core commands, McpPromptLoader for Model Context Protocol (MCP) related prompts, and FileCommandLoader for user-defined commands from .toml files. This command loading and aggregation process, including conflict resolution and renaming strategies, is central to how the CLI manages its extensible command set. See Command and Setting Configuration for more details on command loading and management.

Once a command is identified and its action is triggered, prompt processors may be engaged to dynamically modify the prompt content before it is sent to the AI model. These processors are located within the packages/cli/src/services/prompt-processors directory. For example, the AtFileProcessor in packages/cli/src/services/prompt-processors/atFileProcessor.ts replaces @{...} triggers with file content, respecting .gitignore rules and providing UI feedback. The ShellProcessor in packages/cli/src/services/prompt-processors/shellProcessor.ts executes shell commands specified by !{...} injections, incorporating security checks such as argument interpolation and policy enforcement through a PolicyEngine. If shell commands require user confirmation, a FatalInputError is thrown, as non-interactive mode does not support such prompts. The DefaultArgumentProcessor in packages/cli/src/services/prompt-processors/argumentProcessor.ts ensures that raw command arguments are appended to the prompt if no explicit {{args}} placeholder is used, allowing the model to interpret them.

The output of non-interactive commands can be formatted in various ways, including TEXT, JSON, and STREAM_JSON. The StreamJsonFormatter in packages/cli/src/nonInteractiveCli.ts is used for structured, real-time output, emitting events such as INIT, MESSAGE, TOOL_USE, TOOL_RESULT, ERROR, and RESULT. This structured output is particularly useful for programmatic consumption of the CLI's results. The system also includes robust error handling mechanisms, distinguishing between different error types and providing specific handlers for each to ensure graceful degradation and informative user feedback. Additionally, support for user-initiated cancellation (Ctrl+C) is implemented through setupStdinCancellation and cleanupStdinCancellation in packages/cli/src/nonInteractiveCli.ts to abort long-running operations.

Interactive UI Components and Framework
The Gemini Command Line Interface (CLI) application features an interactive terminal user interface built using ink and React. This interface orchestrates various UI components, manages application state, processes user input, and integrates with backend services.

The primary UI entry point is the App component, located at packages/cli/src/ui/App.tsx. It acts as a dispatcher, rendering different layouts and displays based on the application's state, such as whether it's in a quitting phase, if an alternate screen buffer is in use, or if a screen reader is enabled. It provides real-time streaming data to its child components through a React Context.

The AppContainer component, defined in packages/cli/src/ui/AppContainer.tsx, initializes and manages the application's overall state, user input, and command processing. It provides a unified context to its child components, making application state and actions globally accessible. This component integrates with backend services and IDEs, managing UI states like authentication, streaming, input processing, and dialog visibility. It dynamically measures terminal dimensions and handles global keyboard input for commands like quitting or toggling UI elements.

UI layouts are defined in the packages/cli/src/ui/layouts directory. For example, packages/cli/src/ui/layouts/DefaultAppLayout.tsx coordinates the rendering of sub-components based on the current UI state, while packages/cli/src/ui/layouts/ScreenReaderAppLayout.tsx provides an accessible alternative.

The packages/cli/src/ui/components directory contains a collection of React components for rendering various UI elements, including:

Informational Displays: These components present status, headers, banners, and spinners, such as the AppHeader and CliSpinner. They also handle rendering ANSI-formatted text output using AnsiOutputText.
Interactive Dialogs: These components manage user input for tasks like configuring agents, asking multi-choice questions, or accepting API keys. Examples include AdminSettingsChangedDialog, AgentConfigDialog, and AskUserDialog.
Main UI Orchestration: The Composer component within this directory orchestrates the display of status, messages, and the input prompt, integrating various mode indicators and relying on application-wide contexts for state management.
Background Shell Management: The BackgroundShellDisplay component provides a shell-like display for managing background processes, including interactive features for process selection and output display.
Authentication-related UI components, such as ApiAuthDialog for API key input and AuthDialog for authentication method selection, are managed in the packages/cli/src/ui/auth directory. A central hook, useAuthCommand (packages/cli/src/ui/auth/useAuth.ts), manages authentication state transitions and integrates with the overall application configuration.

The packages/cli/src/ui/commands directory defines built-in slash commands that enable various functionalities, such as /about for system information, /agents for agent management, /auth for authentication, and /extensions for managing CLI extensions. These commands adhere to a consistent interface, often including subcommands and autocompletion features.

Centralized state management is achieved through the packages/cli/src/ui/contexts directory. Contexts like UIStateContext and UIActionsContext provide a comprehensive object of the current UI state and callable functions to modify it, respectively. Other contexts include KeypressContext for keyboard input, MouseContext for mouse events, and SettingsContext for application settings.

Custom React hooks in the packages/cli/src/ui/hooks directory encapsulate specific UI and core functionalities, such as useAtCompletion for @ command suggestions, useSlashCommandProcessor for managing and executing slash commands, and useShellCommandProcessor for shell command execution.

For examples of interactive UI components, refer to packages/cli/examples. These examples demonstrate how components like AskUserDialog and ScrollableList are built using ink and leverage context providers for input handling.

Keyboard and mouse input are managed centrally. useKeypress and useInput hooks capture keyboard events, while MouseContext handles mouse events. The keyMatchers utility (packages/cli/src/ui/keyMatchers.ts) is used with useKeypress for mapping key presses to specific actions and commands.

Command and Setting Configuration
The Gemini CLI application relies on a structured approach to manage its commands and various settings, ensuring a consistent and extensible user experience. At its core, the yargs library is utilized for parsing command-line arguments and orchestrating command execution. This allows for the definition of top-level commands, such as extensions, hooks, and mcp, each serving as a dispatcher to a set of subcommands that handle specific functionalities. For instance, the extensionsCommand in packages/cli/src/commands/extensions.tsx registers subcommands like install, uninstall, list, and configure for managing CLI extensions. Similarly, hooksCommand in packages/cli/src/commands/hooks.tsx provides functionality for hook management, such as migration. The mcpCommand in packages/cli/src/commands/mcp.ts organizes commands for managing Model Context Protocol (MCP) servers, including add, list, enable, and disable. This hierarchical command structure facilitates clear organization and user interaction.

The application's configuration is managed through a centralized system that handles settings across user, workspace, and command-line scopes. The config directory, specifically packages/cli/src/config, is responsible for loading and merging these settings. It processes authentication methods, defines tool exclusions, and manages memory and context loading. For example, loadCliConfig in packages/cli/src/config/config.ts integrates various configuration sources to build a comprehensive Config object that guides the CLI's behavior.

Key bindings, which define keyboard shortcuts for various actions, are explicitly managed in packages/cli/src/config/keyBindings.ts. This file enumerates all available commands, maps them to default key combinations, and provides human-readable descriptions, facilitating user customization and documentation.

Policy engine rules, critical for governing AI agent behavior and interactions, are configured through packages/cli/src/config/policy.ts. This file translates application-specific settings and approval modes into a PolicyEngineConfig, which is then used by the core policy engine library. This ensures that agent actions, particularly sensitive operations like shell commands, adhere to defined rules and potentially require user confirmation. For a deeper understanding of how these policies are enforced and user confirmations are managed, refer to AI Agent Policy Enforcement and User Confirmation.

Testing Utilities and Framework
The Gemini CLI application utilizes a comprehensive testing framework to ensure the reliability and correct behavior of its components, particularly focusing on asynchronous operations, mocking dependencies, and simulating user interactions within its ink-based user interface. The foundation of this framework is established in packages/cli/vitest.config.ts, which configures Vitest as the test runner, defining test file patterns, environment settings, and extensive coverage reporting.

A key aspect of the testing framework is its ability to handle asynchronous processes in React components. The custom waitFor utility in packages/cli/src/test-utils/async.ts ensures that asynchronous assertions are properly wrapped in act calls, preventing React warnings and accurately reflecting component state changes over time. This is crucial for verifying that UI updates and side effects occur as expected following asynchronous operations. The test setup in packages/cli/test-setup.ts further reinforces this by aggressively detecting and failing tests that produce act warnings, enforcing strict adherence to React's testing guidelines.

To facilitate isolated and controlled testing, the framework provides robust mocking capabilities for various components. The createMockCommandContext function in packages/cli/src/test-utils/mockCommandContext.ts generates deep mocks of the CommandContext, with all its functions pre-mocked using vi.fn(). This allows tests to override specific behaviors, such as services or ui interactions, while retaining default mocked implementations for other parts of the context. Similarly, createMockConfig and createMockSettings in packages/cli/src/test-utils/mockConfig.ts enable the creation of tailored mock configuration and settings objects. For persistent state management, FakePersistentState in packages/cli/src/test-utils/persistentStateFake.ts offers an in-memory test double that allows inspection of get and set calls without actual disk I/O. For extensions, createExtension in packages/cli/src/test-utils/createExtension.ts generates mock extension directories and configuration files, simplifying the setup for extension-related tests.

Interactive UI components, built with ink and React, are tested using a specialized set of rendering utilities found in packages/cli/src/test-utils/render.tsx. The render function acts as a wrapper around ink-testing-library's inkRender, ensuring all rendering operations are enclosed within act. renderWithProviders is particularly significant, as it renders components within a comprehensive set of React Contexts, simulating the entire application UI environment. This allows testing of components that depend on shared application state, settings, or actions. For simulating user input, simulateClick generates VT100 mouse events, enabling interaction testing with UI elements. The framework also supports testing custom React hooks using renderHook and renderHookWithProviders, allowing hooks to be tested in isolation or within the full application context. Furthermore, custom Vitest matchers, such as toHaveOnlyValidCharacters in packages/cli/src/test-utils/customMatchers.ts, extend assertion capabilities to validate specific UI output characteristics, such as the absence of invalid characters in a TextBuffer.

AI Agent Core Functionality
The Gemini Command Line Interface (CLI) application integrates AI-powered capabilities, providing mechanisms for interacting with AI agents, managing AI-related configurations, enhancing the developer experience through IDE and code assist features, and enabling extensibility. This includes managing the lifecycle of agents, from their discovery and loading to their execution and interaction.

At the core of the system, the packages/core directory houses the foundational functionalities. It orchestrates the various components necessary for AI operations, exposing a unified interface for external consumption. The Config class, defined in packages/core/src/config/config.ts, centralizes the application's configuration, including settings related to AI agents, tools, and models. This class also handles security aspects, such as path allowances, and policy enforcement via the PolicyEngine.

AI agents are managed through the packages/core/src/agents directory. This subsystem is responsible for the complete lifecycle of AI agents. It handles agent discovery, loading agent definitions from various sources (such as built-in agents, user-defined agents, project-specific agents, and extensions), and parsing their Markdown-based definitions. The AgentRegistry, located in packages/core/src/agents/registry.ts, is crucial for registering discovered agents, applying configuration overrides, and integrating with the PolicyEngine to define execution rules. This ensures that agents adhere to defined policies, with decisions ranging from allowing execution to requiring user confirmation for sensitive operations. The system supports both locally executed agents and remote Agent-to-Agent (A2A) services, providing a unified framework for their management and interaction.

The application also prioritizes secure configuration and API key management, handled by packages/core/src/config and packages/core/src/core/apiKeyCredentialStorage.ts. This ensures that sensitive information, such as API keys and model settings, is securely stored, retrieved, and managed. Additionally, the packages/core/src/mcp directory provides comprehensive authentication for Model Context Protocol (MCP) servers, supporting OAuth 2.0 and Google Application Default Credentials to secure interactions with external services.

For an enhanced developer experience, the system offers features for code assistance and IDE integration. The packages/core/src/code_assist directory centralizes logic for interacting with a Code Assist backend, providing functionalities like content generation, user authentication, and experiment management. The packages/core/src/ide directory manages IDE detection, connection, and context synchronization, allowing the CLI to integrate seamlessly with various development environments. This includes utilities for opening files, handling selection contexts, and supporting native diffing capabilities, bridging the CLI's AI capabilities with the developer's workflow.

Extensibility is a key aspect, achieved through a pluggable hook system and support for various extensions and tools. The hook system allows external code to inject custom logic and modify behavior at different lifecycle events within the CLI. This dynamic control enhances the CLI's capabilities without altering its core source. Further details on this system can be found in Pluggable Hook System. The CLI also supports extensions, skills, and tools, which are integral to expanding its functionality beyond basic text generation. Extensions and Tools provides an in-depth explanation of how these mechanisms are developed, managed, and integrated.

Overall, the AI Agent Core Functionality aims to provide a robust and extensible foundation for building intelligent CLI applications, emphasizing agent lifecycle management, secure configuration, and developer-centric features.

AI Agent Lifecycle and Execution
AI agents in the system follow a defined lifecycle, from discovery and loading to execution and interaction, for both local and remote Agent-to-Agent (A2A) agents.

The AgentRegistry plays a central role in managing this lifecycle, scanning various sources—including built-in definitions, user-defined configurations, project-specific settings, and extensions—to discover and load agent definitions. This process involves parsing agent configurations, often from Markdown files, and incorporating AgentOverride settings from the application's configuration. The registry integrates with the policy system to establish execution rules for agents, such as PolicyDecision.ALLOW for local agents or PolicyDecision.ASK_USER for remote agents, and registers agent-specific model configurations. For agents requiring explicit user approval, the AcknowledgedAgentsService tracks which agents have been acknowledged for specific projects, preventing repeated prompts for approved agents.

Agent execution is handled differently depending on whether the agent is local or remote.

Local agents are executed by the LocalAgentExecutor, which orchestrates a turn-based interaction loop. This loop involves communicating with a generative model, processing its responses, executing tool calls, and feeding the tool results back to the model. The LocalAgentExecutor manages an isolated ToolRegistry for each agent, ensuring that agents only access authorized tools and preventing recursive subagent calls. It handles various termination conditions, including reaching a maximum number of turns or a timeout, and implements recovery mechanisms to allow agents a final attempt to complete their tasks if they encounter a non-goal termination state. Chat history compression is also integrated to manage token limits. Telemetry is logged throughout the agent's lifecycle, from start to finish, including recovery attempts, to provide insights into its behavior and performance.

Remote A2A agents are invoked through the RemoteAgentInvocation, which proxies tool calls to a remote service. This process involves the A2AClientManager, a singleton that manages instances of A2A Clients and AgentCards, facilitating agent loading, caching, message sending, and task management. Authentication for remote agents is handled through various providers, including Google Application Default Credentials, with A2AAuthProviderFactory validating and creating these providers. The system also maintains session state across invocations, persisting contextId and taskId to support continuous conversations with remote agents. Utility functions are used to extract human-readable text and conversational IDs from A2A messages and tasks, aiding in user interaction and state management. For further details on the authentication mechanism, refer to AI Agent Core Functionality - AI Agent Lifecycle and Execution.

Model Availability, Fallback, and Selection
The system manages the availability and selection of AI models, defining how the application responds to API failures and user preferences. This involves classifying API errors, tracking the health of individual models, and orchestrating fallback strategies through predefined policy chains.

API errors are categorized into specific failure kinds, such as 'terminal' for unrecoverable issues like persistent quota errors, 'transient' for temporary problems that might resolve on retry, and 'not_found' when a requested model is unavailable. This classification is performed by the classifyFailureKind utility in packages/core/src/availability/errorClassification.ts, enabling distinct responses based on the nature of the failure.

Model health is tracked by the ModelAvailabilityService (packages/core/src/availability/modelAvailabilityService.ts). This service can mark a model as permanently terminal (e.g., due to 'quota' or 'capacity' issues) or temporarily sticky_retry, meaning it can be retried once per turn before becoming unavailable. The service monitors whether a sticky_retry attempt has been "consumed" within a turn and provides methods to reset these states for subsequent operations or turns.

Fallback strategies are defined through ModelPolicyChain objects, which are ordered lists of ModelPolicy instances. Each ModelPolicy specifies a model, actions to take for different failure kinds (e.g., 'silent' fallback or 'prompt' for user interaction), and how the model's health state transitions upon failure. Standard policy chains, such as DEFAULT_CHAIN and PREVIEW_CHAIN, are managed by the policyCatalog module in packages/core/src/availability/policyCatalog.ts, which also validates the integrity of these chains.

The system dynamically selects the most suitable model using functions defined in packages/core/src/availability/policyHelpers.ts. It resolves the active ModelPolicyChain based on the application's configuration and any preferred models. When a model fails, buildFallbackPolicyContext identifies potential fallback candidates from the policy chain. The selectModelForAvailability function then consults the ModelAvailabilityService to choose the first available model, potentially selecting a designated "last resort" model if no others are viable. Once a model is selected, applyModelSelection updates the application's active model configuration and consumes any transient retry attempts.

User interaction during fallback scenarios is managed by the handleFallback function in packages/core/src/fallback/handler.ts. This function determines the appropriate response—such as activating a persistent fallback mode, prompting the user for an upgrade, or simply retrying the current request—based on the classified failure, the selected policy, and the user's authentication type. It can also invoke an external handler (defined by FallbackModelHandler in packages/core/src/fallback/types.ts) to gather user intent, allowing for choices like retry_always, retry_once, or upgrade. This integration enables a robust and user-aware approach to managing model availability and failure within the application.

AI Content Generation and Chat Orchestration
The Gemini CLI application utilizes a layered approach to abstract interactions with AI models and orchestrate conversational chat sessions. This system enables the generation of various content types, including free-form text, structured JSON, and numerical embeddings.

At its core, the system defines a ContentGenerator interface, which provides a consistent API for generating content, streaming responses, and counting tokens. This abstraction allows for different backend implementations, such as direct interaction with the Gemini API, integration with Vertex AI, or the use of a FakeContentGenerator (packages/core/src/core/fakeContentGenerator.ts) for testing and development. The creation and configuration of these generators are handled by createContentGenerator in packages/core/src/core/contentGenerator.ts, which manages authentication types and integrates logging and recording capabilities via a decorator pattern. The LoggingContentGenerator (packages/core/src/core/loggingContentGenerator.ts) specifically wraps other ContentGenerator instances to add telemetry, error handling, and API request/response logging without altering their core functionality.

For more generalized, stateless LLM calls, the BaseLlmClient (packages/core/src/core/baseLlmClient.ts) provides utilities for generating JSON responses with schema guidance, free-form content, and embeddings. This client incorporates robust retry mechanisms with exponential backoff and dynamic model selection, including fallback strategies based on model availability and error conditions.

Conversational chat sessions are orchestrated by the GeminiChat class (packages/core/src/core/geminiChat.ts), which manages the entire chat lifecycle. This includes maintaining conversational history, handling streaming responses from the model, and implementing sophisticated retry logic for transient API errors or malformed model outputs. The GeminiChat class also integrates with various services to support the conversation, such as managing tool declarations, compressing chat history to stay within token limits, and recording session details for telemetry and debugging. It also leverages a pluggable hook system to allow for custom logic injection before and after model calls, enabling advanced agent behaviors and response modification.

The GeminiClient (packages/core/src/core/client.ts) acts as a central orchestrator for a Gemini agent's chat session, building upon GeminiChat to handle broader contextual concerns. It manages the full lifecycle of a chat session, from initialization and resumption to resetting, and provides the primary interface (sendMessageStream) for real-time, multi-turn interactions. This client integrates IDE context, detects and prevents conversational loops, and further refines token management through chat compression and masking of verbose tool outputs. It also incorporates mechanisms for model selection, ensuring the most suitable model is used based on availability and configured policies. The client also provides safe mechanisms for executing custom logic before and after agent turns via the hook system.

Secure Configuration and API Key Management
Application configurations, including model settings, tool registrations, and file system paths, are centrally managed through the Config class, defined in packages/core/src/config/config.ts. This class orchestrates the setup and access to various core components like tool registries, prompt registries, and the Gemini client, utilizing parameters passed during its initialization to customize behavior. It also provides mechanisms for dynamic updates to runtime settings such as disabled skills and agents.

Secure storage and retrieval of API keys are handled by functions in packages/core/src/core/apiKeyCredentialStorage.ts. This module leverages a HybridTokenStorage instance, which abstracts platform-specific secure storage mechanisms (e.g., system keychains) to persist the API key. Functions are provided to load, save, and clear the API key, ensuring it is securely managed and errors during storage operations are gracefully handled.

Project identification and storage migration are managed through the ProjectRegistry and Storage classes. The ProjectRegistry in packages/core/src/config/projectRegistry.ts assigns and persists short, unique identifiers (slugs) to project paths. These slugs are used to create project-specific temporary directories and to manage ownership markers on the file system, ensuring consistent identification even if the primary registry file is corrupted. The Storage class, located in packages/core/src/config/storage.ts, is responsible for managing global and project-specific file system paths. Its initialization process includes migrating legacy hash-based directories to the new slug-based naming scheme using the StorageMigration utility from packages/core/src/config/storageMigration.ts. This ensures that file system paths, particularly for temporary and historical data, are consistently managed across different versions of the application.

AI Agent Policy Enforcement and User Confirmation
The Gemini CLI employs a robust policy management system to govern the execution of tools and to ensure user safety, particularly when interacting with sensitive operations like shell commands. This system evaluates FunctionCalls (tool invocations) against a predefined set of rules to determine whether an action should be ALLOWed, DENYed, or require ASK_USER confirmation.

The core of this system is the PolicyEngine, which processes PolicyRules and SafetyCheckerRules. These rules can be defined based on the tool name (supporting wildcards for broader application), and can include regular expressions (argsPattern) to match the arguments of a FunctionCall. Rules are assigned a priority, ensuring that more specific or critical rules take precedence over general ones. The engine also supports different ApprovalModes, such as DEFAULT, AUTO_EDIT, YOLO, and PLAN, which can modify the decision-making process. For example, in a non-interactive environment, an ASK_USER decision might automatically downgrade to DENY to prevent indefinite blocking.

A key aspect of the policy engine is its specialized handling of shell commands via the run_shell_command tool. It parses complex shell commands, including those with compound operators (&&, ;, ||) and various forms of command substitution, to evaluate each sub-command individually. If any part of a compound command is denied, the entire command is denied. The system also includes logic to manage output redirection (>) in shell commands, potentially requiring user confirmation if not explicitly allowed by policy. The policies themselves are loaded from various sources, including default, user-specific, and administrative TOML files (.toml). A tiered system ensures that policies from higher tiers (e.g., admin) override those from lower tiers (e.g., user or default).

Integral to this policy enforcement is an event-driven MessageBus for inter-component communication. This bus facilitates the dynamic update of policies and orchestrates user confirmation requests for tool executions. When a tool call requires confirmation (ASK_USER decision), the MessageBus publishes a TOOL_CONFIRMATION_REQUEST. Components can subscribe to these messages to present the request to the user and then publish a TOOL_CONFIRMATION_RESPONSE with the user's decision. This architecture decouples the policy enforcement logic from the user interface and other operational components. The MessageBus also handles UPDATE_POLICY messages, allowing for the dynamic addition and persistence of new ALLOW rules (e.g., when a user confirms an action and chooses to "always allow" it), which are then saved to a user-specific TOML file.

The definitions of messages and types for the message bus are in packages/core/src/confirmation-bus/types.ts. The implementation of the MessageBus itself, including its integration with the policy engine for confirmation requests, can be found in packages/core/src/confirmation-bus/message-bus.ts. The core policy engine logic is within packages/core/src/policy/policy-engine.ts. The overall configuration and loading of policies from various sources are managed by packages/core/src/policy/config.ts, while the parsing of TOML policy files is handled by packages/core/src/policy/toml-loader.ts. To provide consistent argsPattern matching, tool arguments are transformed into a deterministic JSON string representation using stableStringify before evaluation; see packages/core/src/policy/stable-stringify.ts.

Code Assistance and Developer Experience
The Gemini CLI enhances the developer experience by integrating with a Code Assist backend, providing features such as AI-powered content generation, user authentication, experiment management, and administrative controls. This integration allows the CLI to offer intelligent assistance directly within the development workflow. Additionally, the system provides core commands for managing user memory and restoring agent states, and integrates with Integrated Development Environments (IDEs) to detect the active IDE, manage connections, and synchronize context.

The interaction with the Code Assist backend is managed primarily by the CodeAssistServer (packages/core/src/code_assist/server.ts), which acts as a client for API interactions. This server handles streaming AI responses, single content generation requests, and token counting. A crucial aspect of this interaction involves packages/core/src/code_assist/converter.ts, which translates between generic @google/genai library types and the specific request/response formats expected by the Vertex AI backend.

User authentication is a key component, with packages/core/src/code_assist/oauth2.ts orchestrating various OAuth2 flows, including interactive web-based login, user code input for non-browser environments, and Application Default Credentials (ADC) for Cloud Shell. Credentials are securely stored and managed by OAuthCredentialStorage (packages/core/src/code_assist/oauth-credential-storage.ts), which also handles migration from older storage mechanisms. After successful authentication, packages/core/src/code_assist/setup.ts manages user onboarding and determines eligibility for different service tiers, communicating with the CodeAssistServer to retrieve necessary project and user information.

Experiment management allows the system to deliver and evaluate new features. The experiments directory (packages/core/src/code_assist/experiments) handles the retrieval and caching of client metadata and experimental flags. This includes support for local overrides via environment variables and fallback mechanisms to fetch experiment data from the CodeAssistServer. Administrative controls, located in the admin directory (packages/core/src/code_assist/admin), are responsible for fetching, sanitizing, and polling for administrative settings. This ensures policies are applied, for instance, by enforcing allowlists for MCP (Micro-Credential Provider) server configurations and providing user-friendly messages for features blocked by administrative rules.

Core commands enhance the CLI's utility beyond AI interactions. The commands directory (packages/core/src/commands) contains implementations for:

Extension management: Listing available extensions.
Project initialization: Creating a GEMINI.md file to provide context for AI agents.
Memory management: Allowing users to show, add, refresh, and list facts stored as user memory.
State restoration: Enabling the restoration of an agent's conversational history and reverting Git repositories to specific commits.
IDE integration is provided by the ide directory (packages/core/src/ide), which facilitates seamless interaction between the CLI and various IDEs. This includes:

IDE detection: Identifying the specific IDE in use, such as VS Code or JetBrains products.
Connection management: Establishing and maintaining a connection between the CLI and the IDE, supporting both HTTP and standard I/O, and enabling functionalities like displaying diffs directly within the IDE.
Context synchronization: Managing IdeContextStore to keep track of open files and selected text within the IDE, ensuring the AI has relevant context.
Extension installation: Providing mechanisms to install necessary companion extensions, such as the VS Code extension for deeper integration. See VS Code Extension for IDE Integration for more details.
Tool Execution Orchestration
Tool execution within the system is managed by a centralized scheduler that orchestrates the invocation of various tools, ensuring proper sequencing, policy adherence, and user interaction. The CoreToolScheduler in packages/core/src/core/coreToolScheduler.ts is responsible for handling the complete lifecycle of tool calls, from their initial request to their final execution and result processing.

When a tool call is initiated, the CoreToolScheduler first validates the call against defined policies using a PolicyEngine. This allows the system to determine if a tool can be executed automatically, requires user confirmation, or should be denied altogether. If user confirmation is required, the scheduler integrates with a message bus to prompt the user for approval, offering options such as proceeding, canceling, or modifying the tool's arguments. This interactive mechanism allows for human oversight on sensitive operations.

Before and after the actual execution of a tool, the system integrates a pluggable hook system, managed by the executeToolWithHooks function in packages/core/src/core/coreToolHookTriggers.ts. BeforeTool hooks can modify the tool's input parameters, inject additional context, or even block the tool's execution based on custom logic. Similarly, AfterTool hooks can process the tool's output, append further contextual information, or handle errors. This hook mechanism provides a flexible way to extend and customize tool behavior without altering the core logic.

The scheduler ensures that tool calls are executed sequentially, preventing conflicts and maintaining a clear operational flow. It also tracks the status of each tool call through various stages, providing updates on its progress. Upon completion, the scheduler logs the tool call for telemetry purposes, contributing to system observability.

Overall, this orchestration system allows for robust and controlled interaction with various tools, ensuring that they operate within defined policies, integrate seamlessly with user workflows, and can be extended to meet evolving requirements.

Extensions and Tools
The Gemini CLI extends its capabilities beyond core text generation through a modular system comprising extensions, skills, and various tools. This architecture enables dynamic interaction with the local environment, external services, and web content, allowing the CLI to adapt and expand its functionalities as needed.

Extensions serve as comprehensive packages that bundle various components such as prompts, Model Context Protocol (MCP) servers, custom commands, hooks, sub-agents, and agent skills. These are designed for easy installation and sharing, enabling users to augment the CLI's features. The core configuration for an extension is defined in a gemini-extension.json file, which specifies metadata, settings, MCP servers, and tool exclusions. Extensions are managed via a set of CLI commands, including install, uninstall, update, link (for local development), enable, disable, and config. These commands facilitate the full lifecycle of an extension, from initial setup to ongoing management. Best practices for developing extensions emphasize a structured directory layout, the use of TypeScript for type safety, bundling dependencies, and utilizing GEMINI.md for providing high-level context to the model. Security considerations are paramount, advocating for minimal permissions, input validation for tools, and secure storage for sensitive settings. Extensions can be released through Git repositories, allowing for distinct release channels, or via GitHub Releases, which supports pre-built, platform-specific archives for faster installation. For more comprehensive details on extension management and development, refer to Extension Development and Management.

Skills represent specialized instructions and workflows that the model can activate to perform specific tasks. They are defined using a SKILL.md file, which includes YAML frontmatter for metadata (name and description) and a Markdown body for instructions. Skills can also bundle resources such as executable scripts, reference documentation, and assets. A key design principle for skills is progressive disclosure, which optimizes context window management by loading only necessary information at each stage of interaction, minimizing token costs. The SkillManager in packages/core/src/skills/skillManager.ts handles the discovery, loading, and state management of skills, establishing a clear precedence order (built-in < extension < user < workspace) to resolve conflicts. Tooling exists within packages/core/src/skills/builtin/skill-creator/scripts to scaffold new skills, package them into distributable .skill files, and validate their structure and content. Further information on skill definitions and management can be found in Skill Definition, Loading, and Management.

Tools are the mechanisms through which the Gemini CLI interacts with its environment and external services. These include a diverse set of built-in tools that provide functionalities such as file system operations (list_directory, read_file, write_file, glob, grep_search, replace), shell command execution (run_shell_command), web content fetching (web_fetch), web search (google_web_search), memory persistence (save_memory), and task management (write_todos). Security is a critical aspect, with many tools requiring user confirmation for sensitive operations and operating within sandboxed environments. Beyond built-in tools, the system supports integration with external tools via Model Context Protocol (MCP) servers. These servers, either defined within extensions or configured explicitly, expose external tools and resources to the Gemini CLI, facilitating richer interactions. The CLI manages the discovery, validation, and registration of MCP tools, handling authentication via OAuth 2.0 and supporting various transport mechanisms. Control over tool availability is managed through includeTools and excludeTools configurations. For a detailed breakdown of available tools, refer to Built-in Tools for Local Interaction and Web Content and Model Context Protocol (MCP) Server Integration.

The VS Code extension, located in packages/vscode-ide-companion, further integrates the Gemini CLI with the developer's environment. This extension provides features like open file and selection context to the CLI, native diffing capabilities for applying code changes, and an IDE server for secure communication. It enhances the developer experience by bridging the gap between the CLI's AI capabilities and the rich context of an Integrated Development Environment. The utility scripts within packages/vscode-ide-companion/scripts also handle extension updates and license compliance. More details are available in VS Code Extension for IDE Integration.

Extension Development and Management
The Gemini CLI is designed to be extensible, allowing users and developers to add new functionalities, custom commands, and integrate with external tools and services. These extensions package various components, including prompts, Model Context Protocol (MCP) servers, custom commands, hooks, sub-agents, and agent skills. The complete lifecycle of an extension, from development to release, is managed through a set of CLI commands and configuration files.

Extensions are configured using a gemini-extension.json file, which defines metadata such as the extension's name and version, and specifies the configuration for components like mcpServers. This file also supports variable substitution (e.g., ${extensionPath}) for dynamic path resolution, ensuring portability. Extensions can define custom commands by placing TOML files in a commands/ subdirectory. These commands integrate with the CLI, and conflicts are resolved by prioritizing user-defined commands or by prefixing extension commands. Hooks, defined in hooks/hooks.json, allow extensions to intercept and customize CLI behavior at specific lifecycle events. Agent skills are bundled as SKILL.md files in a skills/ directory, exposing them to the model.

For local development, the gemini extensions link . command creates a symbolic link, allowing immediate reflection of changes without requiring frequent reinstallation. New extensions can be bootstrapped from templates using gemini extensions new, which sets up the initial directory structure and manifest file.

Security is a key consideration in extension development, emphasizing minimal permissions and robust input validation. Developers are encouraged to use excludeTools in gemini-extension.json to restrict powerful tools like run_shell_command and to validate inputs to prevent arbitrary code execution or unauthorized filesystem access. Sensitive configuration settings, such as API keys, can be marked as sensitive: true in gemini-extension.json for secure storage in the system keychain.

Extensions can be released through Git repositories or GitHub Releases. Releasing via Git repositories (gemini extensions install <your-repo-uri>) offers flexibility, allowing developers to manage different release channels (e.g., stable, preview, dev) using branches or tags. GitHub Releases provide faster and more reliable initial installations by using single archives, which can be pre-built and platform-specific. These archives must be attached as assets to a GitHub release and adhere to specific naming conventions for platform and architecture, containing the gemini-extension.json file at their root. Developers should adhere to Semantic Versioning and ensure release artifacts include only necessary files for efficient distribution. Further details on these processes can be found in Developing and Releasing Extensions and Extension Configuration and Commands.

Extension Configuration and Commands
Command	Syntax	Description
install	gemini extensions install <source> [--ref <ref>] [--auto-update] [--pre-release] [--consent]	Installs an extension from a GitHub URL or local path.
uninstall	gemini extensions uninstall <name...>	Uninstalls one or more specified extensions.
disable	gemini extensions disable <name> [--scope <scope>]	Disables an extension globally or for a specific workspace.
enable	gemini extensions enable <name> [--scope <scope>]	Enables an extension globally or for a specific workspace.
update	gemini extensions update <name> or gemini extensions update --all	Updates a specific extension or all installed extensions to their latest versions.
new	gemini extensions new <path> [template]	Creates a new boilerplate extension based on a provided template.
link	gemini extensions link <path>	Creates a symbolic link to a local extension for development and testing.
config	gemini extensions config <extension name> [setting name] [--scope <scope>]	Configures settings for an extension.
The Gemini CLI provides a robust system for extending its functionality through extensions, managed via a set of gemini extensions commands and configured through the gemini-extension.json file. This configuration file, located within an extension's directory, serves as the central manifest for an extension, defining its metadata and capabilities.

The gemini-extension.json file dictates an extension's core attributes such as name, version, and description. It can also specify mcpServers for integrating external services using the Model Context Protocol, allowing extensions to define their own MCP server configurations. Additionally, extensions can declare excludeTools to prevent certain tools from being used within their context. A crucial aspect of extension configuration is the ability to define settings. These settings allow extensions to prompt users for necessary configuration values, such as API keys, during installation. These user-provided settings are securely stored in .env files within the extension's directory, with sensitive information potentially obfuscated and stored in a keychain.

Extensions can also define contextFileName, which specifies a markdown file (defaulting to GEMINI.md) that the model should use for contextual information. The configuration system supports variable substitution, allowing dynamic resolution of paths using variables like ${extensionPath} and ${workspacePath} within the gemini-extension.json and hooks/hooks.json files.

The CLI provides a suite of commands to manage the lifecycle of these extensions:

gemini extensions install <source> [--ref <ref>] [--auto-update] [--pre-release] [--consent]: Installs an extension from a GitHub URL or a local file path. Once installed, extensions are copied locally.
gemini extensions uninstall <name...>: Removes specified extensions from the system.
gemini extensions disable <name> [--scope <scope>]: Deactivates an extension either globally or for a specific workspace.
gemini extensions enable <name> [--scope <scope>]: Re-activates a previously disabled extension.
gemini extensions update <name> or gemini extensions update --all: Updates a specific extension or all installed extensions to their latest versions.
gemini extensions new <path> [template]: Generates a boilerplate extension from a specified template, streamlining the development process.
gemini extensions link <path>: Creates a symbolic link to an extension for local development, which facilitates rapid iteration without frequent reinstallation.
gemini extensions list: Displays a comprehensive list of all installed extensions and their current settings.
gemini extensions config <extension name> [setting name] [--scope <scope>]: Allows for the configuration of specific settings for an installed extension.
Changes made to extensions, such as installations or updates, generally require a restart of the CLI session to take effect. In cases of conflicting commands (e.g., between user-defined commands and extension commands), user and project configurations typically take precedence, with extension commands being appropriately prefixed to resolve ambiguity. Similarly, if mcpServers are defined in both settings.json and gemini-extension.json with the same name, the definition in settings.json takes precedence. For more details on extension development, see Developing and Releasing Extensions.

Developing and Releasing Extensions
Gemini CLI extensions allow for customization and expansion of the CLI's capabilities through various mechanisms like custom commands, Model Context Protocol (MCP) servers, GEMINI.md for context, and agent skills. New extensions can be bootstrapped using the gemini extensions new command, often utilizing templates like mcp-server to provide a starting point. The core configuration for an extension is defined in its gemini-extension.json manifest file, which specifies metadata, settings, MCP servers, and tool exclusions. The ${extensionPath} variable ensures portability within this configuration.

Developing extensions involves creating specialized components that interact with the Gemini CLI. MCP servers, for example, enable external tools and data sources to be exposed to the model. An example MCP server implementation might register a fetch_posts tool, which fetches data from a public API and returns a structured JSON response. Custom commands, defined in TOML files like docs/extensions/writing-extensions.md, automate repetitive tasks by providing shortcuts for predefined prompts or shell commands. For persistent, static context, GEMINI.md files provide instructions and knowledge to the model at the beginning of every session when the extension is active. Agent skills, defined in SKILL.md files, provide specialized instructions and workflows that the model activates only when necessary, optimizing token usage.

Best practices for extension development emphasize a structured directory layout, the use of TypeScript for type safety, and bundling dependencies to streamline installation. For local development, the gemini extensions link . command links a local directory to the Gemini CLI extensions, allowing changes to be immediately reflected. Security considerations include requesting minimal permissions for tools, validating all inputs to prevent arbitrary code execution, and using sensitive: true for API keys in gemini-extension.json to ensure secure storage. More details on best practices can be found in Extension Development and Management.

There are two primary methods for releasing extensions to users. The first method uses Git repositories, providing flexibility in managing release channels through branches or tags (e.g., stable, preview, dev). Users install extensions with gemini extensions install <your-repo-uri>, optionally specifying a ref. Updates are prompted when new commits are pushed to the referenced branch or tag.

The second method involves releasing extensions through GitHub Releases. This approach offers faster and more reliable initial installations by utilizing single archives, which can include pre-built and platform-specific assets. The Gemini CLI checks for the "latest" release on GitHub, or a specific release if a tag is provided, and supports installing pre-releases with the --pre-release flag. Custom pre-built archives must be self-contained and adhere to specific naming conventions for platform and architecture, ensuring the gemini-extension.json file is at the root of the archive. A GitHub Actions workflow can automate the process of building multi-platform extensions and attaching them as assets to a release. This release management process is further detailed in Developing and Releasing Extensions. Regardless of the release method, extensions should follow Semantic Versioning and only include necessary build artifacts to minimize download sizes.

Skill Definition, Loading, and Management
The Gemini CLI incorporates a comprehensive framework for creating, validating, discovering, and managing "skills," which are modular extensions that enhance the CLI's capabilities by providing specialized workflows, tool integrations, and domain expertise. This system transforms the CLI into a more versatile agent, allowing it to adapt to various tasks and knowledge domains. The entire skill management system is located in the packages/core/src/skills directory.

Skill Structure and Progressive Disclosure
A core principle guiding skill design is Progressive Disclosure, a three-level loading system designed to efficiently manage the context window and minimize token cost:

Metadata: The skill's name and description are always available in the CLI's context, allowing the agent to quickly identify relevant skills without loading unnecessary information.
SKILL.md Body: The main body of the SKILL.md file, containing detailed instructions and guidance, is loaded only when the skill is triggered.
Bundled Resources: Additional resources, such as executable scripts, reference documentation, or assets, are loaded only when explicitly needed by the skill's execution.
This hierarchical loading ensures that only the necessary information is brought into context at any given time, preventing context overflow and optimizing token usage.

Skills are primarily defined by a SKILL.md file located within a skill directory, such as those found in packages/core/src/skills/builtin/skill-creator. This file contains YAML frontmatter specifying the skill's name and description, followed by a Markdown body that outlines the skill's functionality. Skills can also include optional bundled resources in subdirectories:

scripts/: For executable code (e.g., CommonJS scripts) that provides deterministic reliability and token efficiency. These scripts are designed for LLM-friendly standard output.
references/: For additional documentation or reference materials that can be loaded on demand to inform the agent's process.
assets/: For files that are part of the skill's output but are not loaded into the CLI's context, such as images or templates.
The SkillDefinition interface, defined in packages/core/src/skills/skillLoader.ts, formalizes this structure, including properties like name, description, location, body, and flags for disabled status and isBuiltin.

Skill Discovery, Loading, and Precedence
The SkillManager class, implemented in packages/core/src/skills/skillManager.ts, is responsible for discovering, loading, and managing the state of all skills within the system. It uses the loadSkillsFromDir function from packages/core/src/skills/skillLoader.ts to scan specified directories for SKILL.md files, parsing their content into SkillDefinition objects.

Skills are discovered from various sources with a defined precedence:

Workspace Skills: Highest precedence, loaded from project-specific directories (e.g., .agents/skills) if the workspace is trusted.
User Skills: Loaded from user-specific directories (e.g., ~/.gemini/skills).
Extension Skills: Provided by installed extensions.
Built-in Skills: Lowest precedence, forming the core set of capabilities.
The addSkillsWithPrecedence method handles conflicts, ensuring that skills from higher-precedence sources override those with the same name from lower-precedence sources. For instance, a user-defined skill will take precedence over a built-in skill with the same name. The SkillManager also provides methods to filter skills (e.g., getSkills for enabled skills, getDisplayableSkills for non-built-in and enabled skills suitable for UI display), manage their disabled state, and track active skills.

Skill Creation and Packaging Tooling
The packages/core/src/skills/builtin/skill-creator/scripts directory contains a suite of utilities to streamline the skill development workflow:

init_skill.cjs: This script scaffolds a new skill directory, creating the necessary SKILL.md file with templated frontmatter and example scripts/, references/, and assets/ subdirectories. This provides a consistent starting point for skill developers.
package_skill.cjs: This script validates a skill directory and then packages its contents into a distributable .skill file (a zip archive). This automates the process of preparing a skill for sharing and installation.
validate_skill.cjs: This script rigorously validates a skill directory against a set of predefined rules. It checks for the existence of SKILL.md, verifies the YAML frontmatter for correct name and description formats (e.g., hyphen-cased names, single-line descriptions under 1024 characters), and scans files for "TODO:" markers, ensuring adherence to quality standards before packaging or deployment.
These tools, together with the SKILL.md guidance, located at packages/core/src/skills/builtin/skill-creator/SKILL.md, provide a robust framework for developing, managing, and distributing skills, significantly enhancing the extensibility and adaptability of the Gemini CLI.

Skill Creation and Packaging Tooling
The Gemini CLI provides a framework for creating, packaging, and validating skills through a set of dedicated scripts located in the packages/core/src/skills/builtin/skill-creator/scripts directory. These scripts streamline the development process by ensuring that skills adhere to structural and content standards.

The init_skill.cjs script initializes a new skill directory by scaffolding a predefined structure. When executed, it creates a dedicated folder for the skill and populates it with templated files, including a SKILL.md definition file and example subdirectories for scripts, references, and assets. This ensures a consistent starting point for new skill development, incorporating placeholders that are automatically replaced with the provided skill name and title.

Once a skill is developed, the package_skill.cjs script is used to bundle the skill folder into a distributable .skill file. This script first validates the skill's structure and content to ensure compliance before compressing its contents. It prioritizes using native zip commands for efficiency and broad compatibility across different operating systems.

The validate_skill.cjs script plays a crucial role in maintaining skill quality by enforcing a set of rules for skill directories and their SKILL.md frontmatter. This validation includes checking for the existence of SKILL.md, verifying the correct format of its YAML frontmatter (including name and description), and ensuring that no 'TODO:' markers remain in the skill's files. While it can be run as a standalone command-line tool, its validateSkill function is also exported for programmatic use, allowing other processes, such as packaging, to integrate validation checks. This validation process helps ensure that skills are well-formed and ready for use within the Gemini CLI environment.

Built-in Tools for Local Interaction and Web Content
Tool Name	Category	Description
list_directory (ReadFolder)	File System	Lists files and subdirectories within a specified path, with optional glob pattern exclusion.
read_file (ReadFile)	File System	Reads content of various file types (text, image, audio, PDF); supports line-range reading for text files.
write_file (WriteFile)	File System	Writes content to a file, overwriting if it exists or creating a new one; requires user confirmation.
glob (FindFiles)	File System	Finds files matching glob patterns within a directory, returning absolute paths sorted by modification time.
grep_search (SearchText)	File System	Searches file contents for a regex pattern within a directory, returning matching lines with file and line numbers.
replace (Edit)	File System	Replaces text within a file, designed for precise changes with context and user confirmation; includes self-correction.
run_shell_command	Shell	Executes shell commands, including interactive ones, with detailed output and configurable security settings.
save_memory	Memory	Saves and recalls specific facts across sessions by storing them in a GEMINI.md file.
write_todos	Todos	Creates and manages a list of subtasks for complex requests, tracking progress and displaying the current task.
web_fetch	Web Interaction	Processes content from URLs (up to 20) based on a natural language prompt, providing summaries and extractions.
google_web_search	Web Interaction	Performs a web search using Google Search via the Gemini API, returning a summary with citations.
The Gemini CLI includes a set of built-in tools that enable the agent to interact with the local environment, external services, and web content, extending its capabilities beyond basic text generation. These tools are managed by the core component, which presents their definitions to the Gemini model, executes them upon request, and processes their results. Security, user confirmation, and sandboxing are emphasized for sensitive operations, as described in the overall documentation for docs/tools.

A variety of file system tools are available to the agent for managing files and directories, as documented in docs/tools/file-system.md. These include:

list_directory: Lists files and subdirectories.
read_file: Reads content from various file types, including text, images, audio, and PDFs.
write_file: Writes content to a specified file, requiring user confirmation due to its sensitive nature.
glob: Searches for files matching a pattern.
grep_search: Performs regular expression searches within file contents.
replace: Replaces text within a file, also requiring user confirmation.
The run_shell_command tool, described in docs/tools/shell.md, allows the execution of shell commands. This tool supports both interactive and non-interactive commands, with interactive sessions leveraging node-pty for pseudo-terminal support. Command execution is subject to validation against allowed and excluded prefixes to maintain security and control.

For interacting with web content, the CLI provides the web_fetch and google_web_search tools. The web_fetch tool, detailed in docs/tools/web-fetch.md, can summarize, compare, or extract information from web pages by processing URLs provided in a natural language prompt. It requires user confirmation before fetching web content. The google_web_search tool, outlined in docs/tools/web-search.md, performs web searches via the Gemini API and returns a summarized response with citations, rather than raw search results.

To facilitate persistent information, the save_memory tool, documented in docs/tools/memory.md, allows the agent to store user-defined facts across sessions. These facts are appended to a Markdown file (~/.gemini/GEMINI.md by default) and loaded as context in subsequent sessions, enabling personalized assistance.

Finally, the write_todos tool, explained in docs/tools/todos.md, provides a mechanism for the Gemini agent to break down complex requests into a list of subtasks. This tool helps in managing and displaying the agent's plan and progress, enhancing transparency during multi-step operations.

Beyond these built-in tools, the Gemini CLI also integrates with Model Context Protocol (MCP) Server Integration to extend capabilities to external tools and resources, further broadening its interaction possibilities.

Model Context Protocol (MCP) Server Integration
The Gemini CLI integrates external tools and resources through the Model Context Protocol (MCP), which enables the CLI to interact with various services and data sources beyond its core functionalities. This integration is handled by a core package, with components for discovery and execution.

The primary function of MCP server integration is tool discovery, where the CLI identifies and registers tools from configured MCP servers. The discoverMcpTools function is central to this process, as described in docs/tools/mcp-server.md. It connects to servers specified in the mcpServers configuration within settings.json, retrieves tool definitions, validates their schemas, and registers them for use. When multiple servers offer tools with the same name, a prefixing strategy (serverName__toolName) is used for conflict resolution.

Once discovered, these tools are executed through DiscoveredMCPTool instances, which manage user confirmations based on server trust settings, execute the tool by interacting with the MCP server, and process the responses for both the underlying large language model (LLM) and user display. MCP servers can also expose contextual resources, which the CLI discovers and allows users to reference in conversations using a specific syntax (e.g., @server://resource/path). Additionally, MCP servers can define prompts that are exposed as slash commands within the CLI, facilitating automated and shared workflows.

The system also handles secure configuration management for MCP servers. The gemini mcp commands allow users to programmatically manage server configurations, including adding, listing, removing, enabling, and disabling servers in settings.json. Global settings within the mcp object in settings.json control server discovery and execution, including allowed and excluded server lists. The /mcp command provides status and details of configured servers, while the /mcp auth command manages OAuth authentication flows, including token management and browser redirects.

Security Considerations are a significant aspect of MCP integration, with an emphasis on cautious use of trust settings, secure handling of access tokens, redacting sensitive environment variables during stdio transport, and warnings against untrusted servers. The system also offers tool filtering through includeTools and excludeTools configurations, providing granular control over which tools from a server are made available, with exclusions taking precedence. Tools can return rich multi-part content (text, image, audio, resource) that adheres to the MCP CallToolResult specification, supporting multimodal responses.

VS Code Extension for IDE Integration
The VS Code extension bridges the Gemini CLI with the Integrated Development Environment (IDE), providing a secure communication channel and context synchronization between the two. This integration enhances developer workflows by allowing the CLI to access and react to the IDE's state, and in turn, enabling the IDE to display and manage changes suggested by the CLI.

The extension provides several key functionalities:

IDE Server for Secure Communication At its core, the extension launches an HTTP server within VS Code, managed by the IDEServer class in packages/vscode-ide-companion/src/ide-server.ts. This server acts as an Agent-to-Agent (A2A) communication hub, allowing the Gemini CLI to interact with the IDE. Communication is secured through cors restrictions, host validation, and a dynamically generated authentication token. The server's address and authentication token are communicated to external processes via VS Code's environment variable collection and an optional temporary file, enabling the CLI to discover and connect securely. The server also registers tools that allow the CLI to trigger IDE-specific actions, such as opening and closing diff views.

IDE Context Synchronization The OpenFilesManager in packages/vscode-ide-companion/src/open-files-manager.ts monitors the VS Code workspace to keep track of open files, the active editor, cursor positions, and selected text. It listens for various VS Code events—such as changes in the active text editor, text editor selections, or document closures—to maintain an IdeContext. This context, representing the current state of the IDE, is then broadcast to connected CLI agents. This allows the Gemini CLI to gain a rich understanding of the user's current work, enhancing its ability to provide relevant assistance.

Native Diffing Capabilities The extension integrates custom diffing capabilities, enabling the Gemini CLI to propose code changes that users can review and apply directly within the IDE. The DiffManager class in packages/vscode-ide-companion/src/diff-manager.ts orchestrates the creation, display, and management of these diff views. It uses a DiffContentProvider to supply content for custom URIs, allowing proposed changes to be displayed without modifying actual files on disk. Users can then accept or reject these proposed changes, with the DiffManager emitting events to notify external listeners of these actions.

Extension Updates and Lifecycle The extension manages its own lifecycle, from activation to deactivation, as defined in packages/vscode-ide-companion/src/extension.ts. During activation, it initializes the IDE server, registers commands, and sets up diff management. It also periodically checks for updates on the VS Code Marketplace and prompts users to install newer versions if available. The extension differentiates between user-installed and IDE-managed extensions, adjusting its update prompts and initial informational messages accordingly. It also integrates several commands into VS Code, allowing users to control diff operations or launch the Gemini CLI directly from the command palette.

For details on how to develop and release extensions, see Extension Development and Management.

VS Code Extension Utilities and Build Process
The VS Code extension utilizes a set of utility scripts to manage its lifecycle, including checks for new releases and generating documentation for license compliance. The script in packages/vscode-ide-companion/scripts/check-vscode-release.js automates the determination of whether a new release of the vscode-ide-companion package is necessary. It achieves this by comparing the version and commit hash of the latest released .vsix file with recent commits and changes within the packages/vscode-ide-companion directory, including dependency updates indicated by changes in NOTICES.txt. This process helps ensure that releases are consistently managed based on code and dependency modifications.

Furthermore, open-source license compliance is handled by the script located at packages/vscode-ide-companion/scripts/generate-notices.js. This script is responsible for generating a NOTICES.txt file that lists the licenses and repository information for all production dependencies of the vscode-ide-companion package. It recursively traverses the dependency tree, collects license information, and formats it into the required text file. This automated generation simplifies the process of maintaining accurate license documentation for the extension.

For logging within the VS Code extension, the createLogger function in packages/vscode-ide-companion/src/utils/logger.ts provides a mechanism to output messages to a VS Code output channel. This logging is conditional, activating either when the extension is in development mode or when a specific VS Code setting for debug logging is enabled, offering flexibility for both developers and users to control log verbosity.

Pluggable Hook System
The Gemini CLI incorporates a pluggable hook system that allows external code to inject custom logic and modify behavior across various lifecycle events. This system provides dynamic control and extensibility without altering the core CLI source. Hooks are configured, executed, and their results aggregated, enabling a flexible approach to customizing the CLI's operations.

The system's architecture centers around the orchestration of several components. A central HookSystem (packages/core/src/hooks/hookSystem.ts) manages hook registration, execution, and result aggregation. This HookSystem coordinates with a HookRegistry (packages/core/src/hooks/hookRegistry.ts) to load and validate hook definitions from various configuration sources (project, user, system, extensions). This ensures that hooks are properly identified and their configurations are sound.

When an event triggers, a HookPlanner (packages/core/src/hooks/hookPlanner.ts) creates an execution plan, selecting relevant hooks based on the event name and context. The HookPlanner can filter hooks using matchers and deduplicate identical configurations to optimize performance. Once a plan is established, a HookRunner (packages/core/src/hooks/hookRunner.ts) executes the command-line hooks, handling environment setup, timeouts, and output parsing. This execution can occur in parallel or sequentially, with sequential execution allowing the output of one hook to modify the input for the next. The HookRunner also incorporates security checks, preventing project-level hooks from executing in untrusted folders.

After execution, a HookAggregator (packages/core/src/hooks/hookAggregator.ts) consolidates results from multiple individual hook executions. This aggregation involves combining success/failure states, accumulating durations, and merging outputs based on specific event types. Different merge strategies are employed depending on the event, allowing for nuanced handling of conflicting or complementary hook outputs. For instance, a "blocking" decision from any hook can halt further processing, or specific fields in an LLM request can be overwritten by a later hook. This ensures that the system processes the collective impact of all relevant hooks.

The HookEventHandler (packages/core/src/hooks/hookEventHandler.ts) acts as an intermediary, processing event-specific data, delegating to the HookPlanner and HookRunner for execution, and finally to the HookAggregator for result consolidation. This component also handles logging and suppresses duplicate warning messages to maintain a clean user experience.

A HookTranslatorGenAIv1 (packages/core/src/hooks/hookTranslator.ts) plays a crucial role in abstracting SDK-specific data formats into a stable, version-independent internal representation. This ensures that hooks remain compatible even if underlying SDK structures change, promoting system stability and ease of development for hook authors.

Hook configuration is managed in settings.json files, allowing users to define hooks by type, command, name, and timeout. The system supports various hook events, such as SessionStart, BeforeAgent, AfterModel, and BeforeTool, each with specific contexts and expected outputs. Communication between the CLI and hooks follows a strict JSON-based protocol via stdin and stdout, with stderr reserved for logging. Exit codes communicate the outcome of a hook, distinguishing between success, system blocks, and warnings. The documentation in the docs/hooks directory provides comprehensive guidance on writing, debugging, and securing hooks, including best practices for performance, security (e.g., managing trusted project-level hooks via TrustedHooksManager in packages/core/src/hooks/trustedHooks.ts), and troubleshooting.

Hook System Architecture and Orchestration
The hook system provides a pluggable framework that allows external logic to influence the behavior of the Gemini CLI at various points in its execution. At its core, the system facilitates the interception and modification of application workflows, such as agent interactions and tool executions. This enables customization and extensibility without directly altering the CLI's codebase.

The central component of this architecture is the HookSystem class, defined in packages/core/src/hooks/hookSystem.ts. It acts as the orchestrator, coordinating other components like the HookRegistry, HookPlanner, HookRunner, and HookAggregator. The HookSystem initializes these components and provides the public API for interacting with the hook framework. This includes methods to dynamically enable or disable hooks and to fire specific events that trigger hook execution.

When an event occurs, such as before an AI model call or after a tool execution, the HookSystem dispatches it through its internal HookEventHandler. This handler, described further in Hook Event Handling and Result Aggregation, is responsible for preparing the context for the hooks and then delegating to the HookPlanner to determine which hooks are relevant. The HookPlanner selects hooks based on the event and its context, such as the name of a tool being invoked. Once an execution plan is established, the HookRunner executes the chosen hooks, which can be custom command-line scripts.

After hooks have executed, their individual results are passed to the HookAggregator. This component, detailed in Hook Event Handling and Result Aggregation, consolidates outputs from multiple hooks into a single, coherent result, applying specific merging strategies depending on the event type. This aggregated result then informs how the application proceeds, potentially modifying subsequent actions, blocking operations, or injecting additional information.

The system supports various lifecycle events, from session startup and shutdown to fine-grained control over AI model interactions and tool usage. For example, fireBeforeModelEvent allows hooks to modify an LLM request before it is sent, or even block it entirely. Similarly, fireBeforeToolSelectionEvent enables hooks to influence which tools are considered for execution. This event-driven approach, combined with dynamic configuration and robust result aggregation, makes the hook system a flexible mechanism for extending and customizing the Gemini CLI.

Hook Lifecycle: Registration, Planning, and Execution
The lifecycle of a hook in the Gemini CLI begins with its registration, moves through planning for execution, and culminates in the actual execution of the command-line hook.

The HookRegistry manages the initial phase by loading, validating, and storing hook definitions from various configuration sources within the application, such as project settings, user configurations, and extensions. It ensures that each hook has a valid type and event name, and it tracks whether a hook is enabled or disabled. This component is also responsible for integrating with a trusted hooks manager to identify and handle untrusted project-level hooks, enhancing security by preventing unauthorized code execution.

Once hooks are registered, the HookPlanner takes over to create an execution plan for specific events. When an event occurs, the HookPlanner retrieves relevant hooks from the HookRegistry, filters them based on contextual information (like tool name or trigger), and deduplicates any redundant hook configurations. This process determines which hooks should run and whether they should execute sequentially or in parallel.

Finally, the HookRunner is responsible for executing the command-line hooks defined in the plan. This involves spawning child processes to run the specified commands, providing them with input, and capturing their output. The HookRunner also implements security checks, particularly for project-level hooks, by ensuring they are only executed in trusted environments. It sanitizes environment variables passed to the child processes, handles command expansion, and enforces timeouts to prevent hooks from running indefinitely. The HookRunner parses the output from these command-line hooks, converting both JSON and plain text into a structured format for further processing, and interprets exit codes to determine the success or failure of the hook execution. The HookRunner also supports modifying input for subsequent hooks in a sequential chain, allowing hooks to influence each other's behavior.

Hook Event Handling and Result Aggregation
The processing of specific events and the consolidation of results from multiple hook executions are managed by two core components: HookEventHandler and HookAggregator.

HookEventHandler in packages/core/src/hooks/hookEventHandler.ts acts as the central coordinator for various hook events throughout the application's lifecycle. These events include actions before and after tool usage, agent interactions, and model calls, as well as session start and end. When an event is triggered, the event handler prepares the necessary context and delegates to the Hook Lifecycle: Registration, Planning, and Execution to determine which hooks should run. After hooks have executed, it passes their individual results to the HookAggregator. The event handler also manages logging and telemetry, providing visibility into hook execution and suppressing redundant warnings for recurring failures within a request context.

The HookAggregator in packages/core/src/hooks/hookAggregator.ts is responsible for taking the outputs from multiple concurrently or sequentially executed hooks and combining them into a single, coherent AggregatedHookResult. This is crucial because different hooks might attempt to modify the same data or influence the same decision. The aggregator employs various merging strategies tailored to the specific type of event (HookEventName). For instance, if any hook decides to block an operation, the aggregated result will also reflect a blocking decision (an "OR" logic). For other events, like those affecting model configurations, the aggregator might use a "last one wins" field replacement strategy, where later hook outputs override earlier ones. For tool selection, the aggregator implements specific logic to prioritize more restrictive modes, such as NONE taking precedence over ANY, and ANY over AUTO, to ensure secure and controlled tool access. This mechanism allows for complex decision-making and dynamic modifications to the application's behavior based on the collective output of multiple hooks.

Data Translation and Core Data Structures
The hook system relies on a consistent data representation to enable custom logic across various lifecycle events. This is achieved through a translation layer that abstracts away the specifics of the underlying Generative AI SDK, ensuring stability and compatibility for hooks even as the SDK evolves. The HookTranslatorGenAIv1 class, defined in packages/core/src/hooks/hookTranslator.ts, plays a crucial role by converting SDK-specific data formats, such as GenerateContentParameters and GenerateContentResponse, into a stable, version-independent internal representation used by the hooks. This internal representation includes LLMRequest for model inputs, LLMResponse for model outputs, and HookToolConfig for tool configurations. This abstraction decouples the hook logic from the nuances of the SDK, allowing hooks to interact with a standardized data structure.

The foundation of the hook system's data structures is established in packages/core/src/hooks/types.ts. This file centralizes the definition of all critical interfaces, enums, and base classes that underpin the entire hook system. Key components defined here include:

HookEventName: An enumeration that lists all supported events within the application's lifecycle where hooks can be triggered, such as BeforeTool, AfterModel, and SessionStart. This provides a clear registry of interception points for developers.
HookInput and HookOutput: Base interfaces that define the common fields for data passed into and received from hooks, respectively. These include contextual information like session_id, transcript_path, and hook_event_name.
CommandHookConfig: A specific configuration interface for hooks that execute external commands, detailing properties such as the command itself, its name, and timeout.
DefaultHookOutput: A base class that provides common utility methods for processing hook results, such as determining if execution should be stopped or applying modifications to LLM requests. Specific event-driven output classes, like BeforeModelHookOutput and BeforeToolSelectionHookOutput, extend this base to handle their unique data and modification needs.
Together, the HookTranslatorGenAIv1 and the comprehensive type definitions in packages/core/src/hooks/types.ts establish a robust and consistent framework for integrating custom logic into the Gemini CLI, facilitating extensibility and maintainability.

Hook Security and Trust Management
The Gemini CLI incorporates mechanisms to ensure the secure execution of hooks, particularly those sourced from user projects. A key component in this system is the TrustedHooksManager defined in packages/core/src/hooks/trustedHooks.ts. This manager is responsible for identifying and managing project-level hooks that have been explicitly trusted by the user.

By default, hooks defined within a project are considered untrusted, preventing arbitrary code execution in potentially insecure environments. When such hooks are detected, the system issues a warning to the user via coreEvents.emitFeedback, prompting them to review and trust these hooks if their origin is verified. Once trusted, their identifiers are stored persistently in a trusted_hooks.json file located in the global Gemini directory, allowing their continued execution across sessions.

The HookRunner in packages/core/src/hooks/hookRunner.ts enforces these security policies by checking if the project folder containing the hook is trusted (config.isTrustedFolder()) before allowing execution of project-sourced command hooks. Hooks originating from system-wide configurations or trusted extensions are generally permitted.

Beyond trust management, mitigation strategies against potential threats like arbitrary code execution, data exfiltration, and prompt injection are considered. For instance, the HookRunner sanitizes the environment variables passed to child processes to prevent sensitive information leakage. Hook input is also validated to avoid misinterpretation of data from LLMs or user prompts. Furthermore, the ability to define timeouts for hook execution in settings.json allows for stricter control over resource consumption and prevents hooks from running indefinitely. For detailed best practices on developing secure hooks, refer to Developing and Releasing Extensions.

Hook Communication, Exit Codes, and Configuration
Exit Code	Label	Behavioral Impact	Information Captured
0	Success	stdout is parsed as JSON. Preferred for all logic, including intentional blocks.	stdout (JSON)
2	System Block	Critical Block. The target action (tool, turn, or stop) is aborted.	stderr (rejection reason)
Other	Warning	Non-fatal failure. A warning is shown, but the interaction proceeds using original parameters.	stderr (warning message)
Field	Type	Required	Description
type	string	Yes	The execution engine. Currently only "command" is supported.
command	string	Yes*	The shell command to execute. (Required when type is "command").
name	string	No	A friendly name for identifying the hook in logs and CLI commands.
timeout	number	No	Execution timeout in milliseconds (default: 60000).
description	string	No	A brief explanation of the hook's purpose.
matcher	string	No	A regex (for tools) or exact string (for lifecycle) to filter when the hook runs.
sequential	boolean	No	If true, hooks in this group run one after another. If false, they run in parallel.
hooks	array	Yes	An array of hook configurations.
The Gemini CLI leverages a strict JSON-based communication protocol for its pluggable hook system. This protocol dictates that hooks receive their input as a JSON object via stdin and must return their output as a JSON object to stdout. Any non-JSON output to stdout will lead to parsing failures within the CLI, effectively breaking the hook's execution. All logging and debugging information from a hook should be directed to stderr, which the CLI captures but does not parse, ensuring a clean communication channel for structured data. This "Golden Rule" is fundamental to the reliable operation of hooks, as detailed in docs/hooks/index.md.

The CLI interprets the outcome of a hook's execution based on its exit code. An exit code of 0 signifies Success, and the CLI proceeds to parse the stdout JSON for its content. An exit code of 2 indicates a System Block, which is a critical signal that the hook intends to halt the ongoing action. In this scenario, the content of stderr is used as the rejection reason. Any other exit code is treated as a Warning, allowing the CLI to continue its operation while displaying a warning message to the user. This strategic use of exit codes enables hooks to control the flow of the CLI's execution, from successful continuation to immediate abortion of an action. Further details on these exit codes and their implications can be found in Hook Lifecycle: Registration, Planning, and Execution and docs/hooks/index.md.

Hooks are configured through settings.json files, offering a flexible mechanism to define and manage their behavior. These configurations are nested within a hooks object, organized by event type (e.g., BeforeTool, AfterModel). Each hook configuration specifies its type (currently only "command" is supported), the command to execute, an optional name for identification, a timeout in milliseconds (defaulting to 60000ms), and a description. A key feature of the configuration is the use of matchers, which allow hooks to define specific conditions under which they should execute. For tool-related events, matchers can be regular expressions to target specific tools, while for lifecycle events, they are exact strings. This granular control over when and how hooks are triggered allows for precise customization of the CLI's behavior. The precedence for settings.json files follows a hierarchy: project-level settings (.gemini/settings.json) override user-level settings (~/.gemini/settings.json), which in turn override system-level settings (/etc/gemini-cli/settings.json), and finally, extension-defined settings. This layered approach allows for both broad and fine-grained control over hook configurations across different contexts. More information on hook configuration is available in docs/hooks/index.md and docs/hooks/reference.md.

Writing and Debugging Hooks
Developers can extend the Gemini CLI's functionality by writing custom scripts as hooks. These scripts, which can be either shell or Node.js, integrate into various stages of the agent's lifecycle. Hooks receive input as a JSON object via stdin and are expected to output a JSON object to stdout. Any logging or debugging information should be directed to stderr.

Hooks primarily communicate their outcome through exit codes. An exit code of 0 signifies success, returning a JSON object that can include a decision to control actions (e.g., allow or deny). A critical error or an immediate halt to an action can be signaled by an exit code of 2, which will block the operation and display an error message from stderr to the user. Other exit codes typically indicate warnings.

For effective debugging, the /hooks panel command within the CLI provides a way to inspect the execution status, success/failure, errors, and timing of hooks. It is also recommended to test hook scripts independently with sample JSON input before integrating them into the CLI. During development, complex background logic can benefit from writing debug information to a dedicated log file, such as .gemini/hooks/debug.log, while stderr is used for immediate error reporting.

To ensure optimal performance, hooks should be designed for speed, leveraging parallel operations with Promise.all for asynchronous tasks and caching expensive computations between invocations. Utilizing appropriate hook events and filtering hook execution with specific matcher patterns (e.g., "matcher": "write_file|replace") can prevent unnecessary overhead. The settings.json file allows for configuring these hooks, including their associated events, matchers, and execution commands. It also permits setting a timeout for stricter control over execution duration.

Considerations for security are paramount when writing hooks. Given that project-level hooks are untrusted by default, it's crucial to validate all inputs, especially those from the LLM or user prompts. The system employs mechanisms like modification detection to prevent silent tampering with commands. Mitigation strategies include sanitizing the environment, such as redacting sensitive environment variables through environmentVariableRedaction in the security configuration, and setting strict timeouts. Minimizing logging of sensitive data and sanitizing outputs are important privacy considerations. For more details on best practices, see Developing and Releasing Extensions and Hook Security and Trust Management.

Experimental A2A Server
The packages/a2a-server directory contains an experimental implementation of an Agent-to-Agent (A2A) server for the Gemini Command Line Interface (CLI). This server is designed to standardize interactive workflows between a client and the Gemini CLI agent, facilitating tool execution and command management. Its primary role is to provide an HTTP API that enables client-agent communication, allowing external systems to interact with the agent's capabilities.

The A2A server defines a development-tool extension, as specified in packages/a2a-server/development-extension-rfc.md, which establishes a communication contract. This contract standardizes how agents are initialized, how real-time updates (including agent thoughts and tool execution progress) are streamed to the client, and how tool calls are managed throughout their lifecycle. It also includes mechanisms for user confirmation before executing actions and methods for clients to discover and execute slash commands.

At its core, the server orchestrates the lifecycle and execution of agent tasks, particularly for code generation. This involves managing task creation, execution, and persistence of state. Configuration management is also a key aspect, with the server loading settings from various sources such as user preferences, workspace files, environment variables, and remote administrative controls.

Interaction with the A2A server is primarily through its HTTP API. This API provides endpoints for tasks such as creating new tasks, retrieving task metadata, and executing CLI commands. It also publishes an agent card at a well-known URI (/.well-known/agent-card.json), which provides discoverable metadata about the agent's capabilities and skills. The full extent of the A2A server's capabilities and its internal workings are detailed in subsequent sections, including A2A Protocol and Communication, Agent Task Management and Execution, and HTTP API and Endpoint Management.

A2A Protocol and Communication
The experimental Agent-to-Agent (A2A) server for the Gemini CLI uses an A2A protocol extension called development-tool to standardize communication between a client and the Gemini CLI agent. This protocol defines the contract for interactive workflows, enabling seamless integration and operation.

The development-tool extension, detailed in packages/a2a-server/development-extension-rfc.md, outlines key communication flows:

Agent Initialization and Configuration: Clients initiate an agent session by providing an AgentSettings object, which includes essential configurations like the workspace_path.
Real-time Agent Updates: Agents stream their state, internal thoughts (AgentThought), and tool execution progress to the client. These updates are conveyed through TaskStatusUpdateEvent messages, which contain Message objects with either plain text (TextPart) or structured data (DataPart). Specific event types, such as TOOL_CALL_CONFIRMATION or THOUGHT, are identified by the DevelopmentToolEventKind enum.
Tool Call Lifecycle Management: The protocol defines a clear lifecycle for tool execution, represented by ToolCall objects. These objects track a tool's status (e.g., PENDING, EXECUTING, SUCCEEDED, FAILED, CANCELLED), name, input parameters, and results. When user intervention is required, the confirmation_request field of a ToolCall is populated with a ConfirmationRequest object.
User Confirmation Mechanisms: The agent can request user permission for sensitive operations via a ConfirmationRequest. This request specifies options (ConfirmationOption) and details such as ExecuteDetails for shell commands, FileDiff for proposed file modifications, McpDetails for Model Context Protocol tools, or GenericDetails for other actions. Clients respond with a ToolCallConfirmation message, indicating the selected option and any modified details, such as ModifiedFileDetails for file content changes.
Command Discovery and Execution: The protocol includes methods for clients to interact with the agent's command-line interface. Clients can discover available slash commands and their arguments using a commands/get method, which returns GetAllSlashCommandsResponse containing SlashCommand and SlashCommandArgument definitions. They can then execute these commands via a command/execute method, providing ExecuteSlashCommandRequest with the command path and arguments. The agent responds with an ExecuteSlashCommandResponse, indicating the initial status of the command's execution.
This extension leverages the existing A2A protocol's task-based and streaming model, ensuring that communication is efficient and well-structured, and it relies on Protocol Buffer schemas for strongly typed messages.

Agent Task Management and Execution
The experimental Agent-to-Agent (A2A) server manages the lifecycle and execution of agent tasks, particularly focusing on code generation. This management includes task creation, execution, cancellation, and state persistence. The core components responsible for this orchestration are located in packages/a2a-server/src/agent.

Task management within the A2A server relies on the CoderAgentExecutor (defined in packages/a2a-server/src/agent/executor.ts). This executor is responsible for creating, retrieving, and storing TaskWrapper instances, which encapsulate an agent-driven Task and its associated settings. When the server restarts or needs to resume work, the CoderAgentExecutor can reconstruct a TaskWrapper from persisted SDKTask data, ensuring continuity.

The Task class itself (found in packages/a2a-server/src/agent/task.ts) is central to the agent's operation. It handles interactions with the Large Language Model (LLM), orchestrates tool execution, and communicates task status and artifacts through an event bus. Key aspects of the Task's functionality include:

Task State Management: The Task tracks its lifecycle through various states (e.g., 'submitted', 'working', 'input-required'). The setTaskStateAndPublishUpdate method updates this state and publishes events, allowing external components to monitor progress.
LLM Communication: The Task integrates with a GeminiClient to send messages to the LLM and process streaming responses, including content, tool requests, thoughts, and citations. The acceptAgentMessage method processes these incoming events, converting them into internal agent messages and publishing updates.
Tool Scheduling and Execution: The Task utilizes a CoreToolScheduler to manage the execution of tools invoked by the LLM. The scheduleToolCalls method initiates tool execution, handling pre-processing of replace tool calls and managing checkpointing for tools that modify files. The system supports a tool confirmation flow, where tool calls can be automatically approved or require user intervention based on the ApprovalMode configuration.
Checkpointing: For tools that modify files, the system integrates with a gitService to create checkpoints before execution. This allows for potential rollbacks and ensures the integrity of the codebase.
Agent Execution Orchestration: The execute method of the CoderAgentExecutor drives the agent's interaction loop. It processes user messages, manages LLM responses, and handles the lifecycle of tool calls, including scheduling, waiting for completion, and feeding results back to the LLM. It also handles client disconnections as a trigger for task cancellation.
The server's configuration system, detailed in Server Configuration and Settings, plays a role in defining agent settings, environment variables, and loading extensions, which in turn influences the available tools and functionalities for the agent.

CLI Command Management
The Agent-to-Agent (A2A) server organizes its functionality around a robust command-line interface (CLI) management system. This system defines, registers, and executes various commands, enabling structured and extensible interactions with the agent. At its core, the command management relies on a CommandRegistry (defined in packages/a2a-server/src/commands/command-registry.ts) which acts as a central catalog for all available commands. This registry allows for efficient lookup and management of commands, including nested subcommands, ensuring that the CLI can support complex hierarchies of operations.

Each command adheres to a standardized structure defined by the Command interface in packages/a2a-server/src/commands/types.ts. This interface specifies essential properties like the command's name, description, optional arguments, and the execute method that encapsulates the command's logic. This structured approach simplifies the development and integration of new commands. When a command is executed, it receives a CommandContext, also defined in packages/a2a-server/src/commands/types.ts. This context provides the command with access to necessary services and configurations, such as the agent's overall config, GitService for repository interactions, AgentExecutor for agentic processing, and an ExecutionEventBus for real-time updates and asynchronous communication.

The system includes several specific command implementations that highlight its capabilities:

Extension Management: The ExtensionsCommand and its subcommand ListExtensionsCommand (found in packages/a2a-server/src/commands/extensions.ts) are responsible for managing the CLI's extensions. The default behavior is to list all installed extensions, demonstrating the system's extensibility.
Project Initialization: The InitCommand (located in packages/a2a-server/src/commands/init.ts) handles the initial setup of a project. It analyzes the project and facilitates the creation of a GEMINI.md file, which is crucial for defining the agent's context. This command can also trigger agentic loops for complex initialization scenarios, leveraging the AgentExecutor to process prompts and generate content.
Memory Operations: Commands like MemoryCommand, ShowMemoryCommand, RefreshMemoryCommand, ListMemoryCommand, and AddMemoryCommand (all defined in packages/a2a-server/src/commands/memory.ts) allow users to interact with the agent's memory. This includes displaying current memory content, refreshing it from its source, listing memory files, and adding new information. The AddMemoryCommand is particularly notable for its ability to intelligently invoke tools if the added memory content suggests a specific action, followed by a memory refresh.
State Restoration: The RestoreCommand and ListCheckpointsCommand (in packages/a2a-server/src/commands/restore.ts) enable the agent to revert to a previous state. This involves loading saved checkpoints, validating their content, and using the performRestore function from the core library to restore the agent's conversation and file history. This functionality is critical for debugging, recovering from errors, or experimenting with different execution paths.
This command management framework prioritizes modularity, allowing individual commands to be developed and tested in isolation. The use of an event-driven architecture, facilitated by the ExecutionEventBus, ensures that commands can communicate asynchronously and provide real-time feedback to the user, enhancing the interactive experience.

Server Configuration and Settings
The A2A server employs a robust configuration management system to initialize and operate the agent. This system consolidates settings from various sources, ensuring flexibility and adaptability across different environments. The core configuration is managed by the loadConfig function located in packages/a2a-server/src/config/config.ts. This function is responsible for assembling the complete Config object, which orchestrates authentication, manages hierarchical memory, and incorporates administrative controls.

Configuration settings are loaded and merged from multiple sources, providing a hierarchical approach where more specific settings can override general ones. User-specific settings are loaded from the user's home directory, while workspace-specific settings are loaded from a .gemini directory within the workspace. These settings are then merged, with workspace settings taking precedence for overlapping keys, as detailed in packages/a2a-server/src/config/settings.ts. Additionally, environment variables can be used to augment or override configuration values, offering a dynamic way to inject values or manage sensitive information without hardcoding. The system also supports comments within the JSON settings files, making them more user-friendly.

Extension management is another key aspect of the configuration system. The loadExtensions function in packages/a2a-server/src/config/extension.ts handles the discovery and loading of GeminiCLIExtension definitions from specified directories. This process scans both workspace and user home directories for extension configurations, which are defined in files like gemini-extension.json. The system de-duplicates extensions by name, ensuring that only one instance of an extension is loaded if it is defined in multiple locations.

Authentication is central to the server's operation. The refreshAuthentication function within packages/a2a-server/src/config/config.ts manages the mechanism for authenticating the agent. It supports different authentication types, such as using Google Application Credentials or a direct Gemini API key, ensuring secure access to necessary services.

Furthermore, the configuration system integrates administrative controls. If enabled via experiment flags, the system can fetch and apply administrative settings, which can override various default configuration parameters. This allows for centralized management and control over agent behavior, such as disabling YOLO mode or controlling the availability of extensions and MCP servers. The configuration also handles the setup of a FileDiscoveryService for intelligent file filtering and checkpointing based on Git availability.

HTTP API and Endpoint Management
The Agent-to-Agent (A2A) server provides an HTTP API for external clients to interact with the Gemini CLI agent. This API facilitates task management, command execution, and the discovery of agent capabilities.

The packages/a2a-server/src/http/app.ts file is responsible for initializing the Express.js application that serves this API. It configures the server with various settings and extensions, and sets up either Google Cloud Storage (GCSTaskStore) or in-memory (InMemoryTaskStore) for task persistence, depending on the environment. The createApp function orchestrates this setup, defining routes for agent interactions.

A core feature is the publication of the agent's metadata, known as the agent card. Defined by coderAgentCard in packages/a2a-server/src/http/app.ts, this metadata includes the agent's name, description, capabilities, and supported skills. The updateCoderAgentCardUrl function dynamically updates the agent's URL, making it discoverable via the /.well-known/agent-card.json endpoint.

The API offers endpoints for task management. Clients can create new tasks via POST /tasks and retrieve metadata for individual tasks (GET /tasks/:taskId/metadata) or all tasks (GET /tasks/metadata). These functionalities are crucial for managing the agent's interactive sessions and persistent state.

Command execution is handled through the handleExecuteCommand function within packages/a2a-server/src/http/app.ts. This function processes requests to execute specific commands registered with the agent. It leverages the command registry to retrieve and execute commands, supporting both standard JSON responses and Server-Sent Events (SSE) for streaming output during long-running operations. Additionally, the /listCommands endpoint provides a hierarchical list of all available commands and their arguments.

For managing request-specific data across asynchronous operations, the packages/a2a-server/src/http/requestStorage.ts file provides a mechanism based on Node.js's AsyncLocalStorage. This ensures that an express.Request object, and thus request-scoped data, remains accessible throughout the lifecycle of an HTTP request.

The packages/a2a-server/src/http/server.ts file serves as the application's entry point, handling server startup and establishing robust error handling mechanisms for uncaught exceptions to ensure graceful termination.

Task Persistence and Storage
The persistence layer within the Agent-to-Agent (A2A) server is designed to manage the lifecycle of SDKTask objects, ensuring that their state and associated workspace data can be saved and restored. This is crucial for enabling long-running or resumable agent operations. Two primary implementations facilitate this: GCSTaskStore for cloud-based persistence and NoOpTaskStore as a fallback.

The GCSTaskStore, defined in packages/a2a-server/src/persistence/gcs.ts, integrates with Google Cloud Storage (GCS) to provide robust storage. When an SDKTask is saved, its metadata is serialized, compressed, and uploaded to a designated GCS bucket. Concurrently, if the task involves a local workspace, a gzipped tar archive of that workspace is created and also uploaded to GCS. This mechanism ensures that both the task's state and its working environment are preserved. To mitigate security risks such as path traversal, GCSTaskStore implements strict validation for task IDs, ensuring that only alphanumeric characters, dashes, and underscores are permitted in GCS object paths. The store also manages the initialization of the GCS bucket, creating it if it doesn't already exist, and cleans up temporary files generated during the saving and loading process.

Conversely, the NoOpTaskStore, also found in packages/a2a-server/src/persistence/gcs.ts, serves as a non-persistent alternative. It acts as a wrapper around a "real" TaskStore instance. When a save operation is invoked on NoOpTaskStore, it simply logs the attempt and does not perform any actual persistence. For load operations, it delegates the request to the underlying TaskStore it encapsulates. This design allows for flexible control over persistence, enabling scenarios where task data might not need to be saved, or where persistence is managed externally, without altering the core logic that interacts with the TaskStore interface.

Utility Functions and Testing Helpers
typescript
// From executor_utils.ts
async function pushTaskStateFailed(
  error: unknown,
  eventBus: ExecutionEventBus, // Assumed to be an instance of ExecutionEventBus
  taskId: string,
  contextId: string,
) {
  const errorMessage =
    error instanceof Error ? error.message : 'Agent execution error';
  const stateChange: StateChange = { kind: CoderAgentEvent.StateChangeEvent };
  eventBus.publish({
    kind: 'status-update',
    taskId,
    contextId,
    status: {
      state: 'failed',
      message: {
        kind: 'message',
        role: 'agent',
        parts: [{ kind: 'text', text: errorMessage }],
        messageId: uuidv4(), // Assume uuidv4 is imported
        taskId,
        contextId,
      },
    },
    final: true,
    metadata: { coderAgent: stateChange, model: 'unknown', error: errorMessage },
  });
}

// From testing_utils.ts
function createMockConfig(overrides: Partial<Config> = {}): Partial<Config> {
  const mockConfig = {
    // ... (rest of the mock config, as seen in testing_utils.ts)
    getApprovalMode: vi.fn().mockReturnValue(ApprovalMode.DEFAULT),
    getMessageBus: vi.fn().mockReturnValue(createMockMessageBus()), // Assume createMockMessageBus is defined
    getPolicyEngine: vi.fn().mockReturnValue({
      check: async () => ({ decision: PolicyDecision.ALLOW }), // Simplified for snippet
    }),
    ...overrides,
  } as unknown as Config;
  return mockConfig;
}

// Example usage
async function demonstrateFailure() {
  const mockEventBus = { publish: vi.fn() }; // Mock ExecutionEventBus
  const mockConfig = createMockConfig({ getApprovalMode: vi.fn().mockReturnValue(ApprovalMode.YOLO) });
  const error = new Error('Something went wrong during execution');

  await pushTaskStateFailed(error, mockEventBus, 'task-123', 'context-456');

  // Verify that pushTaskStateFailed published the correct event
  expect(mockEventBus.publish).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'status-update',
      taskId: 'task-123',
      contextId: 'context-456',
      status: expect.objectContaining({
        state: 'failed',
        message: expect.objectContaining({
          parts: [{ kind: 'text', text: 'Something went wrong during execution' }],
        }),
      }),
      final: true,
    })
  );

  // Example of using a value from the mock config
  expect(mockConfig.getApprovalMode()).toBe(ApprovalMode.YOLO);
}
Utility functions are provided for common tasks such as error reporting and application-wide logging. The pushTaskStateFailed function in packages/a2a-server/src/utils/executor_utils.ts publishes task failure events to an event bus, ensuring that errors are consistently reported with detailed messages and state changes. For logging, packages/a2a-server/src/utils/logger.ts configures a global logger using winston to provide structured and formatted output to the console.

A suite of testing tools, located in packages/a2a-server/src/utils/testing_utils.ts, facilitates the creation of mock configurations and mock RPC requests for Agent-to-Agent (A2A) interactions. The createMockConfig function generates a comprehensive mock Config object, allowing tests to control and inspect configuration behavior by overriding specific properties as needed. The createStreamMessageRequest function aids in constructing JSON-RPC 2.0 request objects for streaming messages within A2A communication. Additionally, helper functions like assertUniqueFinalEventIsLast and assertTaskCreationAndWorkingStatus are available to assert task states and event streams during A2A interactions.

Behavioral Evaluations
Behavior Description	Example File Path
Agent does not modify files when asked to inspect for bugs, answer general questions, or inquire about style or issues.	evals/answer-vs-act.eval.ts
Agent modifies files when explicitly asked to fix a bug.	evals/answer-vs-act.eval.ts
Agent utilizes automated tools like eslint --fix and prettier --write for code style and formatting issues.	evals/automated-tool-use.eval.ts
Agent does not commit changes to a git repository unprompted but will commit when explicitly asked.	evals/gitRepo.eval.ts
Agent avoids using interactive commands unless specifically instructed.	evals/interactive-hang.eval.ts
Agent refuses file modifications in plan mode, but allows modifications within the plans directory. It also enters and exits plan mode as requested.	evals/plan_mode.eval.ts
Agent remembers specific user preferences and project-related information, such as favorite color, command restrictions, workflow, coding style, and entry points.	evals/save_memory.eval.ts
Agent delegates tasks to relevant expert subagents when available.	evals/subagents.eval.ts
Behavioral evaluations provide a framework for validating the agent's behavior against prompts, offering a distinct approach from traditional integration tests and broader industry benchmarks. They focus on how the agent interprets and acts upon instructions, thereby offering a crucial feedback loop for refining system prompts and tool definitions, preventing regressions, and verifying the efficacy of model steering. The design accounts for the non-deterministic nature of large language models (LLMs) by categorizing evaluations into ALWAYS_PASSES (expected 100% pass rate) and USUALLY_PASSES (generally reliable but potentially flaky) policies.

The evaluation framework utilizes Vitest as its testing engine, with individual evaluation cases orchestrated by the evalTest utility located in evals/test-helper.ts. This utility sets up an isolated environment for each test, manages test files, initializes a Git repository, executes the agent with a specified prompt, and asserts the outcomes. This comprehensive approach ensures that evaluations are conducted in controlled and reproducible conditions. The system also supports reporting evaluation results on GitHub Actions, providing metrics such as Pass Rate (%) and History for continuous monitoring of the agent's performance. For further details on reporting and remediation, see Evaluation Reporting and Remediation Tools.

Key agent behaviors are validated through specific evaluation test cases designed to address various functionalities. These include ensuring appropriate file modification control (e.g., in evals/answer-vs-act.eval.ts), verifying the agent's ability to use automated tools like ESLint and Prettier (e.g., in evals/automated-tool-use.eval.ts), and confirming correct handling of Git commits (e.g., in evals/gitRepo.eval.ts). The framework also evaluates adherence to non-interactive command execution (e.g., in evals/interactive-hang.eval.ts), proper functioning of "plan mode" (e.g., in evals/plan_mode.eval.ts), and the effective use of the save_memory tool (e.g., in evals/save_memory.eval.ts). Furthermore, the system includes tests for the delegation of tasks to specialized subagents in an Agent-to-Agent (A2A) system, such as in evals/subagents.eval.ts, ensuring that the main agent can correctly identify and delegate to the most relevant subagent based on context. For a deeper understanding of agent lifecycles, refer to AI Agent Lifecycle and Execution.

Evaluation Policies and Types
Characteristic	ALWAYS_PASSES	USUALLY_PASSES
Description	Tests expected to pass 100% of the time, typically trivial and testing basic, unambiguous functionality.	Tests expected to pass most of the time, but may have flakiness due to non-deterministic behaviors, ambiguous prompts, or complex tasks.
Expected Pass Rate	100%	Most of the time, but not necessarily 100%.
Implications of Failure	Direct indicator of regressions in key functionalities; must pass for every PR.	A significant drop indicates reduced reliability of model behavior, tracking long-term health and stability.
Typical Use Cases	First line of defense against regressions in core behaviors, run in every CI.	Measure of overall product quality, run nightly to track health from build to build.
Execution Trigger	npm run test:always_passing_evals	npm run test:all_evals (requires RUN_EVALS environment variable)
CI Integration	Included in CI Evals (E2E Chained workflow).	Run nightly via Evals: Nightly workflow.
Given the non-deterministic nature of large language models (LLMs), the evaluation framework differentiates between two types of evaluation policies to manage test reliability and provide actionable feedback. These policies are critical for interpreting test results, especially when agent behavior might vary across runs.

The first policy, ALWAYS_PASSES, is applied to robust tests that are expected to achieve a 100% pass rate consistently. These tests typically validate fundamental agent behaviors or deterministic aspects of the system. Failures in ALWAYS_PASSES tests often indicate a significant regression or a critical issue that requires immediate attention.

The second policy, USUALLY_PASSES, is used for tests that are generally reliable but might occasionally exhibit flakiness due to the inherent variability of LLM responses. While these tests are designed to pass most of the time, intermittent failures are anticipated and do not necessarily signify a severe bug. Instead, USUALLY_PASSES tests help track the long-term health and steering of the model. A significant drop in their pass rate over time, as observed in Evaluation Reporting and Remediation Tools, can indicate a shift in model behavior that warrants investigation.

The evalTest function, central to the evaluation framework (as detailed in evals/test-helper.ts), incorporates these policies to determine whether a test should be executed or skipped. Specifically, USUALLY_PASSES tests can be conditionally skipped based on environment variables, allowing for focused testing on critical, deterministic behaviors during typical continuous integration workflows while still providing comprehensive coverage in nightly runs. This conditional execution mechanism helps to optimize testing efficiency and reduce noise from expected non-deterministic outcomes.

Evaluation Framework and Execution
The Gemini CLI application employs a behavioral evaluation framework to validate the agent's actions against prompts, providing a crucial feedback loop for prompt and tool changes and ensuring consistent model steering. These evaluations are distinct from traditional integration tests, which focus on system functionality, and broader industry benchmarks that measure general capabilities.

The framework uses Vitest as its testing harness, with its configuration defined in evals/vitest.config.ts to specifically include test files ending in .eval.ts. This configuration also sets extended timeouts for evaluations, reflecting their potentially long-running nature.

Central to the evaluation process is the evalTest function, located in evals/test-helper.ts. This function orchestrates each evaluation case, handling initialization, environment setup, agent execution, and result validation. An evalCase object, which defines each test scenario, includes a name, the prompt given to the agent, optional params for configuring the test environment, and an assert function for validating the outcomes.

During execution, evalTest first initializes an isolated TestRig environment. It then prepares a log directory, symlinks necessary node_modules for efficient setup, and writes the test-specific files defined in evalCase.files to the environment. This includes handling agent markdown files by parsing their definitions and acknowledging them, creating an agents.json file to simulate user recognition of agents. A Git repository is also initialized within the test directory, with initial files committed to ensure a controlled and consistent version control state.

The agent is then executed with the specified evalCase.prompt, and its activity logs are captured. The framework checks for unauthorized tool errors, and finally, the evalCase.assert function is invoked to validate the agent's behavior against the expected outcomes. This robust setup allows for comprehensive testing of how the agent interprets prompts and utilizes its tools within a simulated environment. The distinction between ALWAYS_PASSES and USUALLY_PASSES policies within the evaluation framework accounts for the non-deterministic nature of large language models, allowing for a pragmatic approach to testing stability and identifying regressions, as discussed further in Evaluation Policies and Types.

Specific Evaluation Test Cases
Test Case Category	Description	Evaluation File(s)
File Modification Control	Ensures the agent modifies files only when explicitly asked to fix issues, not for inspection or general questions.	answer-vs-act.eval.ts
Automated Tool Use	Verifies the agent utilizes automated tools like ESLint and Prettier with appropriate flags (--fix, --write) for code style and formatting issues.	automated-tool-use.eval.ts
Git Repository Interaction	Checks if the agent commits changes only when prompted, and not automatically.	gitRepo.eval.ts
Interactive Commands	Validates that the agent avoids using interactive commands that would block progress without user intervention.	interactive-hang.eval.ts
Plan Mode Functionality	Assesses the agent's ability to enter and exit plan mode, refuse file modifications outside of designated planning areas in plan mode, and modify plan files.	plan_mode.eval.ts
Memory Management	Confirms the agent's ability to remember and recall user preferences, restrictions, and project-specific details, while ignoring temporary information.	save_memory.eval.ts
Subagent Delegation	Examines whether the main agent can correctly identify and delegate tasks to specialized subagents based on their expertise.	subagents.eval.ts
Behavioral evaluations include a variety of specialized test cases to validate specific agent functionalities. These tests ensure the agent behaves as expected in different scenarios, from handling file modifications to using automated tools and delegating tasks to subagents.

One set of tests focuses on file modification control, ensuring that the agent only modifies files when explicitly prompted to do so. For instance, the test case in evals/answer-vs-act.eval.ts verifies that the agent refrains from editing files when merely asked to "inspect for bugs" or "ask a general question," but proceeds with modifications when explicitly asked to "fix bug." This distinction prevents unintended changes during investigative prompts.

Another area of evaluation is automated tool use. Test cases like those in evals/automated-tool-use.eval.ts confirm the agent's ability to correctly employ tools such as ESLint and Prettier. These tests set up scenarios where code formatting or linting issues are present and assert that the agent executes the appropriate shell commands (eslint --fix or prettier --write) to resolve them.

Git commit handling is also a critical aspect. The tests in evals/gitRepo.eval.ts validate that the agent only performs git commit operations when explicitly instructed, preventing unprompted or accidental commits.

The framework also includes tests for interactive command prevention. The interactive_commands test in evals/interactive-hang.eval.ts ensures that when asked to execute tasks like running tests, the agent utilizes non-interactive commands (e.g., vitest --run) to avoid blocking and requiring user intervention.

Plan mode functionality is evaluated by tests in evals/plan_mode.eval.ts. These ensure that the agent correctly enters and exits "plan mode," where file modifications are restricted to designated "plan" directories and are otherwise refused. This validates the system's ability to manage read-only phases for planning and then transition to implementation.

The agent's ability to save and recall memory is tested in evals/save_memory.eval.ts. These evaluations confirm that the agent correctly utilizes the save_memory tool for important information like user preferences or project details, while also ignoring transient conversational elements.

Finally, subagent delegation is covered by tests in evals/subagents.eval.ts. These tests verify that the main agent can effectively delegate tasks to specialized subagents based on the task's context, even when not explicitly named in the prompt. An example involves the main agent recognizing the need for a docs-agent to update documentation.

Evaluation Reporting and Remediation Tools
Evaluation results are reported in GitHub Actions, providing a continuous feedback loop on the agent's behavior. For continuous integration (CI), evaluations are part of the E2E (Chained) workflow and must pass 100% before a pull request can be merged. This ensures that changes do not introduce immediate regressions in the agent's core responses. Nightly evaluations, run daily via the Evals: Nightly workflow, track the long-term health and steering of the model. These reports aggregate results from multiple runs to account for the non-deterministic nature of large language models. The nightly report format displays the Pass Rate (%) for each test, a History showing pass rates over the last 10 runs, and an overall Total Pass Rate. A significant decline in the pass rate for tests, especially those designated as USUALLY_PASSES, often indicates an issue requiring attention. Further details on evaluation policies and types can be found in Evaluation Policies and Types.

To assist in investigating and remediating failing evaluations, the Gemini CLI includes a /fix-behavioral-eval command. This command facilitates a structured workflow for addressing behavioral regressions. It can Investigate by fetching evaluation results, identifying failures, and reviewing logs. It then helps Fix by suggesting and applying targeted modifications to prompts, tool instructions, and modules. After potential fixes, it Verifyies the changes by rerunning tests across multiple models. Finally, it Reports a summary of success rates and applied fixes. Users can invoke this command directly with gemini /fix-behavioral-eval or by providing a specific GitHub Action run link or test name. For in-depth manual investigation, setting GEMINI_DEBUG_LOG_FILE enables verbose agent logs. The overall evaluation framework and execution are detailed in Evaluation Framework and Execution.

Project Orchestration and Automation
The Gemini CLI project employs a robust suite of scripts and automated processes to manage its various operational aspects, spanning from build orchestration and artifact management to GitHub automation and release procedures. These mechanisms ensure consistency, streamline development workflows, and maintain the quality of the codebase.

Project-wide operations are largely managed through scripts located in the scripts directory. For instance, the main build process, orchestrated by scripts/build.js, handles dependency installation, code generation, and package building across all workspaces. This script can also conditionally trigger the creation of sandboxed container images via scripts/build_sandbox.js, which manages package installation, building, packing, and image creation for the CLI and core packages. To maintain a clean development environment, scripts/clean.js removes various project artifacts, including node_modules, bundle directories, and generated source files. The integrity of the project's dependency graph is enforced by scripts/check-lockfile.js, which validates package-lock.json for missing resolved or integrity fields in third-party dependencies.

Automation extends significantly to GitHub-related tasks, facilitating efficient collaboration and project maintenance. Templates like .github/pull_request_template.md standardize pull request descriptions, ensuring all necessary information, such as summaries, validation steps, and pre-merge checklists, is consistently provided. Scripts within the .github/scripts directory, such as .github/scripts/backfill-need-triage.cjs and .github/scripts/pr-triage.sh, automate the labeling of issues and pull requests, helping to triage new contributions and maintain organized issue queues. These scripts apply labels based on specific criteria or synchronize them from linked issues, enhancing discoverability and workflow efficiency.

Release management is also highly automated, with scripts designed to streamline the versioning and publication of the CLI. scripts/get-release-version.js calculates release versions, while scripts/prepare-github-release.js prepares packages for GitHub releases, including configuring npm registries and modifying package metadata. Furthermore, the scripts/releasing directory contains scripts that automate the patch release workflow, such as creating patch release pull requests and commenting on original pull requests with release statuses.

Documentation and schema generation are also automated processes. scripts/generate-keybindings-doc.ts generates and updates keyboard-shortcuts.md to reflect current keybinding configurations, ensuring the documentation remains accurate. Similarly, scripts/generate-settings-doc.ts creates and updates documentation for application settings in configuration.md and settings.md, drawing from the project's settings schema. The settings.schema.json file, used for IDE completion and validation, is itself generated by scripts/generate-settings-schema.ts.

Lastly, the project incorporates tools for quality assurance and development utilities. Linting and code style consistency are enforced by scripts/lint.js, which integrates various linters and custom checks. Pre-commit hooks, managed by scripts/pre-commit.js, execute lint-staged to ensure code quality before commits. The scripts/deflake.js script aids in identifying flaky tests by repeatedly executing commands and reporting on their consistency. These tools collectively contribute to maintaining a high standard of code quality and a smooth development experience.

Project Build and Artifact Management
The Gemini CLI uses a suite of scripts to manage its build process, artifact generation, and cleanup. These scripts automate tasks from dependency management to packaging and sandboxed container image creation.

The primary orchestration for building the project is handled by the script in scripts/build.js. This script first ensures that all project dependencies are installed and then triggers the build process across all workspaces. A key feature is its conditional handling of sandboxed container image creation, which occurs if the BUILD_SANDBOX environment variable is enabled. The actual sandbox image construction is delegated to the script in scripts/build_sandbox.js, which leverages containerization tools like Podman or Docker to build images for the CLI and core packages. This includes packing the npm packages into .tgz files and then incorporating them into the container image.

Individual JavaScript packages are built and packaged by the script in scripts/build_package.js. This script compiles TypeScript source files, copies necessary assets such as Markdown and JSON files, and for the core package, it also copies project documentation. It creates a .last_build file to timestamp the successful completion of the build, which is then used by the script in scripts/check-build-status.js to determine if the CLI package's build artifacts are up-to-date by comparing source file modification times against this timestamp.

For comprehensive cleanup of the project's build and installation artifacts, the script in scripts/clean.js removes node_modules directories, bundle directories, generated source files, and dynamically identified dist directories within workspaces.

Essential project assets, including sandbox definitions, policy definitions, documentation, and built-in skills, are aggregated and copied into a consolidated bundle directory by the script in scripts/copy_bundle_assets.js. This ensures all necessary files are co-located for packaging or deployment. Specific file types and directories are copied from source to build directories by the script in scripts/copy_files.js, handling special cases for the cli and core packages. Before packaging, the script in scripts/prepare-package.js copies crucial files like README.md and LICENSE to sub-packages.

Git commit information and the CLI version are dynamically generated and written into TypeScript files within the CLI and core packages by the script in scripts/generate-git-commit-info.js. This provides version transparency and build traceability.

GitHub Automation for Issues and Pull Requests
The project employs a set of automated processes to streamline GitHub workflows, managing issues and pull requests to ensure consistency, proper labeling, and timely communication. This automation includes standardizing pull request submissions, managing labels based on issue relationships, and notifying contributors about process changes.

A key component is the pull request template, defined in .github/pull_request_template.md. This template structures PR descriptions into clear sections such as Summary, Details, Related Issues, How to Validate, and a Pre-Merge Checklist. This ensures that all necessary information, from the PR's purpose to validation steps and critical pre-merge considerations, is consistently provided.

Several scripts located in .github/scripts automate issue and PR management:

The .github/scripts/backfill-need-triage.cjs script identifies open issues that lack specific labels and are not pull requests, then automatically applies the status/need-triage label. This helps in efficiently identifying issues that require initial assessment.
The .github/scripts/backfill-pr-notification.cjs script sends automated notifications to authors of open pull requests, particularly those not created by maintainers and without linked issues. This ensures contributors are informed about evolving submission requirements or process changes.
The .github/scripts/pr-triage.sh script manages labels on pull requests by synchronizing them with labels from linked issues. It extracts relevant labels, such as area/*, priority/*, help wanted, and 🔒 maintainer only, and applies them to the corresponding PRs based on their draft status and associated issues.
The .github/scripts/sync-maintainer-labels.cjs script identifies issues that are part of a hierarchy, specifically descendants of predefined root issues, and labels them with 🔒 maintainer only. This ensures that issues requiring maintainer attention are properly flagged, utilizing both native GitHub sub-issue relationships and references parsed from markdown task lists within issue bodies and comments.
Release Management and Versioning
The project incorporates automated processes for managing software releases, encompassing version calculation, package preparation for GitHub releases, and the orchestration of patch release pull requests.

The script scripts/get-release-version.js determines release version strings by considering various release types such as nightly, promote-nightly, stable, preview, and patch. This script interacts with Git to retrieve the latest tags, npm to query existing versions, and the GitHub command-line interface (gh) to check for version existence, employing semantic versioning (semver) for consistent version parsing.

To facilitate GitHub releases, the script scripts/prepare-github-release.js prepares packages by copying the bundled assets, configuring npm registries, and modifying package.json files for the core CLI and A2A server packages. The bundling of essential project assets is handled by scripts/copy_bundle_assets.js, which aggregates sandbox definitions, policy definitions, documentation, and built-in skills into a consolidated bundle directory.

The directory scripts/releasing contains specialized scripts that automate the patch release workflow. This includes scripts/releasing/create-patch-pr.js, which automates the creation of pull requests for patch releases by cherry-picking commits onto a designated release branch. Once a patch release attempt is made, scripts such as scripts/releasing/patch-comment.js and scripts/releasing/patch-create-comment.js are used to comment on the original pull requests, providing status updates (success, failure, or race conditions) and detailed feedback after a patch creation attempt. Finally, scripts/releasing/patch-trigger.js manages the triggering of the GitHub Actions workflow responsible for the actual patch release and posts comments to the original PR with links to the workflow run.

Documentation and Schema Generation
The Gemini CLI application automates the generation of documentation and schema files to ensure consistency and enhance the developer experience. This process includes creating human-readable documentation for keybindings and application settings, as well as machine-readable JSON schemas for IDE integration and validation.

Keybinding documentation for keyboard shortcuts is generated by the script in scripts/generate-keybindings-doc.ts. This script reads the defined keybindings and command descriptions from the CLI's configuration, processes them into a structured format, and then renders this information into a Markdown file, docs/cli/keyboard-shortcuts.md. This ensures that the documentation accurately reflects the application's current shortcuts.

Similarly, application settings documentation is automated through the script in scripts/generate-settings-doc.ts. This script parses the internal settings schema, extracts details such as setting paths, types, labels, descriptions, and default values, and then formats this information into Markdown. This generates two documentation files: docs/get-started/configuration.md and docs/cli/settings.md, providing both detailed configuration guides and concise summaries of available settings.

For IDE integration and validation, a JSON schema file, settings.schema.json, is generated by the script in scripts/generate-settings-schema.ts. This schema provides structural definitions for the application's settings, enabling features like autocompletion, type checking, and validation within development environments when users edit their settings.json files. The schema is built by iterating through internal setting definitions and constructing corresponding JSON schema fragments for various data types, including booleans, strings, numbers, enums, arrays, and objects.

Quality Assurance and Development Utilities
Script Name	Primary Function	Supported QA/Development Aspect
check-build-status.js	Verifies if the CLI package's build artifacts are up-to-date with source files.	Build Verification, Dependency Management
check-lockfile.js	Validates the package-lock.json for integrity and resolved dependencies.	Dependency Security, Build Reliability
deflake.js	Repeatedly runs a specified command to identify flaky tests or commands.	Test Reliability, CI Stability
lint.js	Orchestrates various linters (ESLint, Actionlint, Shellcheck, Yamllint, Prettier, sensitive keyword, tsconfig) to enforce code style and best practices.	Code Quality, Style Enforcement, Security, Configuration Validation
local_telemetry.js	Sets up a local OpenTelemetry Collector and Jaeger instance for observing CLI telemetry data.	Observability, Debugging
pre-commit.js	Executes lint-staged to run linters and formatters on staged Git files before commit.	Developer Workflow, Code Quality Gates
Scripts and tools within the project maintain code quality, ensure adherence to standards, and assist in development workflows. These utilities cover lockfile integrity, static code analysis, Git hook enforcement, and local environment setup for telemetry.

The integrity of dependency lockfiles, specifically package-lock.json, is verified by scripts/check-lockfile.js. This script scans for missing resolved or integrity fields in third-party dependencies, which can indicate an invalid or compromised lockfile.

Static analysis and code style enforcement are managed through scripts/lint.js. This script orchestrates various linters, including ESLint, Actionlint, Shellcheck, Yamllint, and Prettier, along with custom checks for sensitive keywords and tsconfig.json validation. These tools ensure code consistency and identify potential issues early in the development cycle.

Before code changes are committed to the repository, scripts/pre-commit.js executes lint-staged. This utility runs linters on staged Git files, preventing non-compliant code from being committed.

For testing purposes, the scripts/deflake.js script aids in identifying flaky tests or commands. It repeatedly executes a specified command, tracking its success and failure rates. This helps pinpoint intermittent issues that might not be caught by single test runs. The script also temporarily modifies the .dockerignore file to ensure a consistent testing environment.

Local development environments can be configured for telemetry using scripts/local_telemetry.js. This script sets up and manages a local OpenTelemetry (OTEL) collector and Jaeger instance, enabling developers to capture and visualize trace data during local development.

Additionally, scripts/check-build-status.js assesses the freshness of the cli package's build artifacts. It compares the modification times of source and configuration files against the last build timestamp, issuing warnings if sources are newer and indicating that a rebuild might be necessary. This helps ensure that developers are always working with up-to-date builds.

Evaluation Result Aggregation
The project utilizes a script to aggregate and summarize behavioral evaluation results, generating a formatted Markdown report. This report provides insights into model and test performance by comparing current evaluation statistics with historical data.

The aggregation process involves:

Report Discovery and Model Identification: The script locates report.json files within specified directories, extracting the model name associated with each report based on its file path.
Statistics Calculation: For each discovered report, the script processes the test results to calculate the number of passed, failed, and total tests, grouping these statistics by model.
Historical Data Retrieval: To provide a comparative view, the script fetches historical evaluation data from GitHub Actions workflow runs. It uses the gh command-line tool to retrieve past evals-nightly.yml workflow runs, download their artifacts, and process them to gather historical statistics. Temporary directories are used for storing these artifacts, ensuring a clean process.
Markdown Generation: Finally, the script formats the aggregated current and historical evaluation statistics into a Markdown table. This table includes a high-level summary, total pass rates for each model, and a detailed breakdown of pass rates for individual tests across historical and current runs.
This process, primarily orchestrated by the script located at scripts/aggregate_evals.js, ensures that evaluation results are systematically gathered, analyzed, and presented, offering a clear overview of the agent's behavioral performance over time.

Third-Party Dependencies
The project manages external third-party dependencies, particularly the ripgrep binary, by handling its acquisition and integration into the system. This involves a process for downloading, extracting, and caching platform-specific executables, and subsequently providing the correct path to these binaries for use within the application. The mechanisms ensure that the ripgrep command-line tool is available and correctly configured for the current operating system and architecture.

Ripgrep Download and Extraction Process
The ripgrep binary is acquired through a robust mechanism that handles platform detection, atomic downloads from GitHub, caching, and various archive formats. This process is managed primarily by the script located at third_party/get-ripgrep/src/downloadRipGrep.js.

The system identifies the appropriate ripgrep release asset by detecting the operating system and CPU architecture. It then constructs a download URL using a pinned version of ripgrep, which can be overridden by an environment variable. To prevent redundant downloads, the system caches previously downloaded archives. If the archive is not found in the cache, it proceeds to download the file from GitHub.

Downloads are designed to be atomic, meaning the file is first downloaded to a temporary location and then moved to its final destination once the download is complete, ensuring data integrity. After a successful download, the system extracts the contents of the archive. It supports both .zip and .tar.gz formats, utilizing appropriate tools for extraction. Error handling is integrated throughout the process, providing detailed context for any issues that may arise during download or extraction.

Ripgrep Executable Path Management
javascript
// ... other code ...

export const rgPath = join(
  __dirname, // Base directory of the current module
  '..',      // Navigate up to the parent directory
  'bin',     // Enter the 'bin' directory
  `rg${process.platform === 'win32' ? '.exe' : ''}`, // Append '.exe' for Windows
);
The rg (ripgrep) executable's path is dynamically constructed and made available to the application, accounting for various operating systems. The file third_party/get-ripgrep/src/index.js defines and exports rgPath, which represents the path to the ripgrep executable. This path is built relative to the current module's directory, navigating to a bin directory where the executable resides. For Windows systems, the .exe extension is appended to the executable name to ensure proper identification. This dynamic path resolution allows the application to locate and utilize the ripgrep binary regardless of the host operating system. The ripgrep binary itself is acquired and prepared through a dedicated download and extraction process, as detailed in Ripgrep Download and Extraction Process.