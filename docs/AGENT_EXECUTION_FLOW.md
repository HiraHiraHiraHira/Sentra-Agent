# Sentra-Agent 执行流程详解

本文档详细描述了 Sentra-Agent 的内部执行流程，从系统启动到消息处理、决策制定及最终回复。

## 1. 系统初始化 (Initialization)

入口文件：`Main.js`

系统启动时按以下顺序初始化核心组件：

1.  **环境配置**: 加载 `.env` 文件并启动热更新监听器 (`envHotReloader.js`)。
2.  **SDK 初始化**: 初始化 `SentraMcpSDK` (插件系统) 和 `SentraPromptsSDK` (提示词系统)。
3.  **WebSocket 连接**: 建立与消息网关（如 NC 适配器）的 WebSocket 连接 (`WS_URL`)。
4.  **管理器初始化**:
    *   `GroupHistoryManager`: 管理群聊上下文历史。
    *   `UserPersonaManager`: 管理用户画像（LLM 驱动）。
    *   `DesireManager`: 管理主动回复欲望系统。
    *   `SocialContextManager`: 管理社交关系上下文。
5.  **预设加载**: 加载 Agent 人设 (`AgentPreset`) 并监听文件变更。
6.  **调度器启动**: 启动 `DelayJobWorker` 处理延迟任务，启动 `DesireManager` 的 tick 循环。

## 2. 消息接收与预处理 (Message Reception)

位置：`components/SocketHandlers.js`

当 WebSocket 收到 `message` 事件时：

1.  **消息去重**: 通过 `shouldDropDuplicateIncoming` 检查消息ID与时间戳，防止重复处理。
2.  **基础解析**: 识别是普通消息还是 Poke（拍一拍）事件。
3.  **情感分析**: (可选) 调用 `SentraEmo` 对消息内容进行实时情感分析。
4.  **历史记录**: 将消息存入 `historyManager` (Pending 状态) 和 `personaManager`。
5.  **改主意检测 (Override Intent)**:
    *   如果该用户已有正在处理的任务 (`pending_queued`)，新消息会被缓冲。
    *   触发 `decideOverrideIntent`，判断用户的新消息是否意味着“取消旧任务”或“补充信息”。
    *   如果判定为取消，则中断旧任务的运行。

## 3. 消息聚合与回复决策 (Buffering & Decision)

位置：`utils/messageBundler.js` & `utils/replyPolicy.js`

1.  **消息聚合 (Bundling)**:
    *   系统不会立即回复每一条消息，而是通过 `collectBundleForSender` 等待一个“聚合窗口”。
    *   目的是将用户连续发送的多条短句合并为一个完整的 Context。
2.  **回复策略 (Reply Policy)**:
    *   调用 `shouldReply` 判断是否需要回复。
    *   **规则判断**: 检查黑名单、静默模式、关键词触发等。
    *   **概率判断**: 如果不是直接点名（@bot），根据 `DesireManager` 计算的欲望值或配置的概率决定是否插话。
    *   **Gate拦截**: `ReplyGate` 负责拦截低质量输入（如乱码、过短无意义文本）。

如果决定回复，生成一个 `taskId` 并进入后续流程。

## 4. 核心处理管道 (Message Pipeline)

位置：`components/MessagePipeline.js` (函数 `handleOneMessageCore`)

这是 Agent 处理单个会话任务的主逻辑：

1.  **上下文组装**:
    *   从 `historyManager` 获取近期对话历史。
    *   提取用户画像 (`personaManager`)。
    *   提取情感状态 (`SentraEmo`)。
    *   提取长期记忆/摘要 (`contextMemoryManager`)。
    *   加载 Agent 预设 (System Prompt)。
2.  **构建 MCP 上下文**:
    *   将上述信息转换为 MCP 协议要求的格式 (`Tools Block`, `Context Block`)。
3.  **MCP 执行 (Thinking)**:
    *   调用 `sdk.chat` 或内部的 `planThenExecuteStream`。
    *   这是 Agent 的“大脑”部分（见下节）。
4.  **结果处理**:
    *   接收 MCP 产生的回复。
    *   **补充消息检测**: 在发送前再次检查是否有用户新消息 (`wait_for_supplement`)。如果有，可能会“吞掉”当前回复重新思考。
    *   **格式修复**: 修复 XML/Markdown 格式问题。
5.  **发送回复**:
    *   调用 `smartSend` 通过 WebSocket 发回给用户。
    *   支持文本、图片、语音等多种模态。

## 5. MCP 决策引擎 (The Brain)

位置：`sentra-mcp/src/agent/planners.js`

Sentra Agent 使用一个多阶段的思维链（Chain of Thought）引擎：

1.  **Judge (判断)**: 分析用户意图，决定是否需要使用工具，或者直接回复。
2.  **Plan (规划)**: 如果任务复杂，生成一个多步骤的执行计划 (DAG)。
3.  **ArgGen (参数生成)**: 为计划中的每个步骤生成具体的工具调用参数。
4.  **Execution (执行)**: 执行工具（如搜索、读文件、绘画等），获取结果。
5.  **Evaluate (评估)**: 评估工具结果是否满足了用户需求。
    *   如果不满足，回退到 Plan 阶段重试。
6.  **Summary (总结)**: 根据工具执行结果，生成最终回复给用户的自然语言。

## 6. 主动回复机制 (Proactive System)

位置：`utils/desireManager.js` & `components/ProactiveDirectivePlanner.js`

Agent 不仅被动响应，还会主动发起对话：

1.  **欲望循环 (Tick)**: `runDesireTick` 定期运行。
2.  **候选生成**: 扫描活跃群组和好友，计算“聊天欲望值”。
    *   基于上次聊天时间、话题热度、用户亲密度衰减计算。
3.  **决策**: 选出欲望值最高的候选者。
4.  **话题规划**: `ProactiveDirectivePlanner` 根据历史摘要和画像，生成一个“开场白”或“话题转移”的指令。
5.  **伪造消息**: 构造一条内部的“主动触发指令”消息，注入到 **核心处理管道** 中，欺骗 Agent 认为这是它需要处理的任务，从而通过 MCP 流程生成主动发言。

## 7. 流程图示 (Simplified Flow)

```mermaid
graph TD
    User[用户发送消息] --> WS[WebSocket 接收]
    WS --> Dedup[去重 & 预处理]
    Dedup --> History[存入历史/画像]
    
    subgraph "Decision Loop"
        History --> Buffer[消息聚合窗口]
        Buffer --> Policy{回复策略判定}
        Policy -- "不回复" --> End((结束))
        Policy -- "回复" --> Pipeline[进入处理管道]
    end

    subgraph "Proactive Loop"
        Timer[定时器] --> Desire[欲望值计算]
        Desire --> |达到阈值| ProactivePlanner[话题规划]
        ProactivePlanner --> Pipeline
    end

    subgraph "Core Pipeline"
        Pipeline --> Context[组装上下文(记忆/画像/Emo)]
        Context --> MCP[MCP 决策引擎]
        
        MCP --> Judge[Judge: 意图判断]
        Judge --> |Simple| GEN[生成回复]
        Judge --> |Complex| Plan[Plan: 制定计划]
        Plan --> Tools[执行工具]
        Tools --> Eval{评估结果}
        Eval -- "不满意/重试" --> Plan
        Eval -- "满意" --> GEN
    end

    GEN --> CancelCheck{发送前检查\n是否有新消息}
    CancelCheck -- "有新消息(吞吐)" --> End
    CancelCheck -- "无" --> Send[WebSocket 发送]
    Send --> User
```
