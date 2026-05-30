# TogoSpace 智能体学习路径

本文档面向第一次接触 TogoSpace 的开发者和 Agent，目标是用一条从运行体验到核心机制、再到扩展开发的路线，带你理解这个多 Agent 聊天室框架。

## 审核结论

原文的章节顺序是合理的：先跑起来，再理解 LLM、工具、Agent 生命周期、调度、历史和压缩。但它和当前项目已有几处偏差，需要修正：

- 旧路径较多：例如 `src/service/llmService.py`、`src/service/roomService.py`、`gtTeamModel.py` 已经分别演进为包目录或新文件名。
- 启动恢复流程写成旧版 `load_all_team()` / `load_rooms_from_db()`，当前入口是 `backend_main.py` 调用 `teamService.restore_team()` 恢复每个启用团队。
- 工具名 `finish_chat_turn` 已不再是当前实现，结束本轮的基础工具是 `finish_action`。
- Function Calling 示例仍停留在手写 JSON schema，当前工具 schema 由 `FuncTool` 基于函数签名和 docstring 自动生成。
- 缺少上手必需主题：配置与 preset 的边界、Web 前端与 TUI、HTTP/WebSocket 协议、测试体系、日志排障、团队热更新、演示模式和发布文档。

下面是按当前仓库状态补全后的学习路径。

## 学习地图总览

```text
第 0 章  学习方法与代码导航        → 建立阅读方式
第 1 章  环境搭建与首次运行        → 跑起来，建立感性认识
第 2 章  项目骨架与四层架构        → 知道代码应该放在哪
第 3 章  配置、preset 与运行目录   → 理解数据从哪里来、写到哪里
第 4 章  后端启动与运行时恢复      → 看懂服务怎么从 DB 恢复
第 5 章  HTTP API 与 WebSocket     → 理解前后端协议边界
第 6 章  Web 前端与 TUI            → 理解两个前端如何消费同一后端
第 7 章  LLM 调用机制              → Agent 的大脑
第 8 章  Function Calling          → Agent 的手脚
第 9 章  Agent 生命周期            → 从配置成员到运行时实例
第10章  房间、消息与调度轮转       → 多 Agent 如何有序发言
第11章  对话历史与活动日志         → Agent 的记忆与可观测性
第12章  Driver 策略模式            → Native / TSP / Claude SDK 的差异
第13章  Token 压缩与 Prompt Cache  → 长上下文治理
第14章  持久化、重启与热更新       → 服务重启后的状态找回
第15章  测试与排障                 → 怎么验证和定位问题
第16章  实战：添加一个工具         → 动手扩展
```

推荐阅读顺序：

```text
0 → 1 → 2 → 3 → 4 → 5 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16
                          ↘
                            6 可以在理解接口后再看
```

## 第 0 章 学习方法与代码导航

**目标**：用正确粒度读代码，避免陷入细节。

### 0.1 先读稳定入口

优先从这些文件开始：

| 文件 | 你要看什么 |
|------|------------|
| `AGENTS.md` | 分层规则、启动方式、测试命令、目录约定 |
| `src/backend_main.py` | 后端 4 阶段启动、调度闸门开启、shutdown 顺序 |
| `src/route.py` | 所有 HTTP / WebSocket 路由 |
| `src/constants.py` | 核心枚举：Room、Agent、Driver、Tool、Schedule、Task 状态 |
| `docs/tech/01_architecture/architecture.md` | 架构总览，部分细节可能比代码稍旧，读时以代码为准 |
| `docs/tech/04_agent/*.md` | Agent、调度、Driver、压缩等专题文档 |

### 0.2 读代码时的三条主线

1. 用户在前端发消息后，如何变成房间消息和调度任务。
2. Agent 领取任务后，如何调用 LLM、执行工具、结束回合。
3. 服务重启后，Team、Agent、Room、History、Task 如何恢复。

只要能把这三条主线串起来，项目大多数功能都能定位。

## 第 1 章 环境搭建与首次运行

**目标**：跑起后端和 Web 前端，看到一个真实的多 Agent 聊天室。

### 1.1 后端环境

项目使用 Python 3.11+，仓库通常配套 `.venv`：

```bash
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python3 src/backend_main.py --port 8080
```

如果已经存在 `.venv`，直接使用它即可。

### 1.2 Web 前端

```bash
cd frontend
npm install
npm run dev
```

默认 Vite 开发服务器通过代理连接 `http://127.0.0.1:8080`。如需指定后端：

```bash
cd frontend
VITE_API_BASE_URL=http://127.0.0.1:8080 npm run dev
```

打开 `http://localhost:5173` 后重点观察：

- 顶部团队选择和调度状态。
- Console 页的房间列表、Agent 列表、消息流。
- Settings 页的模型服务、团队、角色模板、运行设置。
- 首次未配置 LLM 时会出现快速初始化或调度阻塞提示。

### 1.3 TUI 前端

```bash
.venv/bin/python3 tui/tui_main.py --base-url http://127.0.0.1:8080
```

TUI 适合快速排障和终端自动化观察。它和 Web 前端消费同一套 HTTP / WebSocket API。

## 第 2 章 项目骨架与四层架构

**目标**：理解代码为什么这样分层。

TogoSpace 后端遵循四层架构：

```text
controller → service → dal → model → util
```

| 层 | 典型目录 | 职责 |
|----|----------|------|
| controller | `src/controller/` | HTTP / WebSocket 入参解析、响应封装、调用 service |
| service | `src/service/` | 有状态业务逻辑、调度、Agent 运行时、工具执行 |
| dal | `src/dal/` | 数据库读写封装 |
| model | `src/model/` | 数据模型、Peewee ORM 模型、运行时数据结构 |
| util | `src/util/` | 通用工具，不依赖业务层 |

下层不能反向依赖上层。同层可以互相引用，但仍要控制耦合。

### 2.1 用一个接口追踪调用链

以团队列表为例：

```text
GET /teams/list.json
  → src/controller/teamController.py
  → src/service/teamService.py 或 dal manager
  → src/dal/db/gtTeamManager.py
  → src/model/dbModel/gtTeam.py
```

以房间消息为例：

```text
POST /rooms/{room_id}/messages/send.json
  → src/controller/roomController.py
  → src/service/roomService/
  → src/service/messageBus.py
  → src/service/schedulerService.py
  → src/service/agentService/
```

### 2.2 命名提醒

仓库里有历史命名痕迹，例如 `GtScheculeTask` 中的 `Schecule` 拼写。学习时按现有文件名查找，不要自行改名。

## 第 3 章 配置、preset 与运行目录

**目标**：分清“随源码提交的预设”和“用户私有运行配置”。

### 3.1 preset 与 config

| 类别 | 内容 | 当前路径 | 是否提交 |
|------|------|----------|----------|
| preset | 内置角色模板、团队模板 | `assets/preset/role_templates/*.json`、`assets/preset/teams/*.json` | 是 |
| config | LLM 服务、API key、持久化、运行设置 | `STORAGE_ROOT/setting.json` | 否 |

相关代码：

- `src/appPaths.py`：定义 `STORAGE_ROOT`、`ASSETS_DIR`、`PRESET_DIR`、`WORKSPACE_ROOT`。
- `src/util/configUtil.py`：加载配置。
- `src/util/configTypes.py`：Pydantic 配置模型。
- `src/service/presetService.py`：导入 preset。

### 3.2 开发模式运行目录

开发模式默认写入：

```text
dev_storage_root/
├── setting.json
├── data/
├── logs/backend/
└── workspace/
```

打包模式默认写入 `~/.togospace/`。也可以通过环境变量 `STORAGE_ROOT` 覆盖。

### 3.3 学习重点

- `assets/preset/` 是产品默认内容，不应掺入用户 API key。
- `dev_storage_root/` 是本地运行状态，不应提交。
- 后端启动后会 `chdir` 到 `src/`，排查相对路径时必须记住这一点。

## 第 4 章 后端启动与运行时恢复

**目标**：看懂 `backend_main.py` 如何把静态配置、数据库和运行时对象组装起来。

当前启动大致分为四段：

```text
1. 基础 service 启动
   messageBus → llmService → funcToolService → ormService
   → persistenceService → agentService → roomService
   → schedulerService → presetService

2. 导入 preset
   presetService.import_from_app_config()

3. 准备团队运行时恢复
   当前主要是阶段日志，真正恢复在下一阶段按 Team 执行

4. 恢复启用中的 Team
   for enabled team:
     teamService.restore_team(...)

5. 开启调度闸门
   schedulerService.start_schedule()
```

`teamService.restore_team()` 是理解运行时恢复的关键入口：

```text
同步部门树中的在岗成员
  → agentService.load_team_agents()
  → roomService.load_team_rooms()
  → agentService.restore_team_agents_runtime_state()
  → roomService.restore_team_rooms_runtime_state()
  → schedulerService.start_scheduling(team.name)
```

调度真正能否运行，还要看全局闸门 `ScheduleState`：

- `STOPPED`：未开启或已停止。
- `BLOCKED`：前置条件不满足，例如未初始化 LLM 或演示只读模式。
- `RUNNING`：允许激活房间、创建任务、启动 Agent 消费协程。

## 第 5 章 HTTP API 与 WebSocket

**目标**：理解前后端边界。

### 5.1 路由入口

所有 Tornado 路由集中在 `src/route.py`。常用分组：

| 分组 | 路径示例 | Controller |
|------|----------|------------|
| 系统状态 | `/system/status.json`、`/system/schedule/resume.json` | `systemController.py` |
| LLM 配置 | `/config/llm_services/list.json`、`/config/llm_services/test.json` | `settingController.py` |
| 团队 | `/teams/list.json`、`/teams/{id}/modify.json` | `teamController.py` |
| 角色模板 | `/role_templates/list.json` | `roleTemplateController.py` |
| Agent | `/agents/list.json`、`/agents/{id}/resume.json` | `agentController.py` |
| 房间 | `/rooms/list.json`、`/rooms/{id}/messages/send.json` | `roomController.py` |
| WebSocket | `/ws/events.json` | `wsController.py` |

### 5.2 WebSocket 事件

后端通过 `messageBus` 发布事件，`wsController` 负责广播给前端。

核心主题定义在 `src/constants.py` 的 `MessageBusTopic`：

```text
ROOM_MSG_ADDED
ROOM_MSG_CHANGED
ROOM_STATUS_CHANGED
ROOM_ADDED
AGENT_STATUS_CHANGED
AGENT_ACTIVITY_CHANGED
SCHEDULE_STATE_CHANGED
TEAM_RELOADED
```

学习建议：先看 `src/service/messageBus.py`，再看 `src/controller/wsController.py`，最后回到前端 `frontend/src/realtime/wsClient.ts`。

## 第 6 章 Web 前端与 TUI

**目标**：理解两个前端如何共享后端能力。

### 6.1 Web 前端

Web 前端是 Vue 3 + TypeScript + Vite。入口与主线：

| 文件 | 作用 |
|------|------|
| `frontend/src/main.ts` | Vue 应用入口 |
| `frontend/src/router.ts` | 路由：Console、Settings、TeamCreate |
| `frontend/src/App.vue` | 全局布局、主题、调度状态、快速初始化弹窗 |
| `frontend/src/api.ts` | HTTP API 封装 |
| `frontend/src/realtime/wsClient.ts` | WebSocket 实时事件 |
| `frontend/src/pages/ConsolePage.vue` | 聊天控制台 |
| `frontend/src/pages/SettingsPage.vue` | 设置页 |

前端测试使用 Vitest：

```bash
cd frontend
npm run test:run
npm run build
```

### 6.2 TUI

TUI 使用 Textual：

| 文件 | 作用 |
|------|------|
| `tui/tui_main.py` | 启动入口 |
| `tui/app.py` | Textual 应用主体 |
| `tui/api_client.py` | 后端 API 客户端 |
| `tui/widgets.py` | UI 组件 |

TUI 更适合终端排障；Web 前端更适合完整功能验证。

## 第 7 章 LLM 调用机制

**核心概念**：Agent 的“大脑”如何和模型通信。

### 7.1 关键文件

| 文件 | 重点 |
|------|------|
| `src/service/llmService/core.py` | `infer()`、`infer_stream()`、请求组装、Provider 映射 |
| `src/service/llmService/llmRequestRules.py` | 针对不同 provider 的请求规则修正 |
| `src/model/coreModel/gtCoreChatModel.py` | `GtCoreAgentDialogContext` 等聊天上下文模型 |
| `src/util/llmApiUtil.py` | OpenAI 兼容请求/响应结构和 LiteLLM 调用 |
| `src/util/configTypes.py` | `LlmServiceConfig` |
| `src/service/agentService/driver/nativeDriver.py` | Native Driver 如何调用 LLM |

### 7.2 请求流

```text
AgentTurnRunner
  → Driver
  → llmService.infer() / infer_stream()
  → llmApiUtil.send_request_non_stream() / send_request_stream()
  → LiteLLM
  → OpenAI / Anthropic / Google / DeepSeek / OpenAI-compatible
```

`GtCoreAgentDialogContext` 主要包含：

- `system_prompt`：角色、团队、工具使用规则。
- `messages`：历史消息。
- `tools`：可用工具 schema。
- `tool_choice`：是否强制或允许工具调用。
- `prompt_cache`：prompt cache 配置。

### 7.3 学习问题

- 为什么项目使用 LiteLLM，而不是直接调用某一个厂商 SDK？
- `infer_stream()` 为什么需要 `on_progress` 回调？
- `llmRequestRules.py` 解决了哪些 provider 差异？

## 第 8 章 Function Calling

**核心概念**：Agent 通过工具把“想法”变成可执行动作。

### 8.1 当前工具体系

| 文件 | 职责 |
|------|------|
| `src/service/funcToolService/tools.py` | 工具函数实现 |
| `src/service/funcToolService/funcToolType.py` | 从函数签名和 docstring 生成 OpenAI tool schema |
| `src/service/funcToolService/core.py` | 装载工具、执行工具调用 |
| `src/service/agentService/toolRegistry.py` | 每个 Agent 运行时可用工具、类别权限、执行结果 |

工具 schema 不再手写大块 JSON，而是由函数定义生成：

```python
def get_time(timezone: Optional[str] = None) -> dict:
    """获取当前时间

    Args:
        timezone: 可选的时区名称，如 "Asia/Shanghai"，默认使用本地时区
    """
```

`FuncTool.to_openai_tool()` 会读取类型注解、默认值和 docstring，生成 OpenAI 兼容的 tools schema。

### 8.2 工具执行流程

```text
LLM 返回 tool_calls
  → AgentTurnRunner 解析 OpenAIToolCall
  → AgentToolRegistry.execute_tool_call()
  → funcToolService.run_tool_call()
  → tools.py 中的具体函数
  → 结果转成纯 JSON
  → 写回 Agent 历史
  → 继续下一次 step 或结束 turn
```

### 8.3 重要工具

| 工具 | 作用 |
|------|------|
| `send_chat_msg` | 向当前房间或目标房间发送消息 |
| `finish_action` | 显式结束当前 Agent 的本轮行动，交棒给下一位 |
| `start_chat` | 发起私聊 |
| `wake_up_agent` | 唤醒目标 Agent |
| `create_task` / `update_task` / `get_task` / `list_tasks` | 协作任务管理 |
| `save_agent` / `save_dept` / `save_room` 等 | 管理类工具，仅 root leader 可获得 Admin 类别 |

### 8.4 权限类别

工具类别定义在 `ToolCategory`：

```text
Basic / Read / Write / Execute / Admin
```

`toolRegistry.build_runtime_allow_specs()` 会强制包含 `Category:Basic`，root leader 会额外拥有 `Category:Admin`。

## 第 9 章 Agent 生命周期

**核心概念**：数据库中的 Agent 配置如何变成可运行的 Agent。

### 9.1 关键文件

| 文件 | 职责 |
|------|------|
| `src/service/agentService/core.py` | Team Agent 的加载、卸载、恢复 |
| `src/service/agentService/agent.py` | Agent facade |
| `src/service/agentService/agentTaskConsumer.py` | 数据库任务串行消费 |
| `src/service/agentService/agentTurnRunner.py` | 单个 turn 的推理和工具调用编排 |
| `src/service/agentService/promptBuilder.py` | system prompt 构建 |
| `src/model/dbModel/gtAgent.py` | Agent 数据库模型 |

### 9.2 状态

`AgentStatus` 只有运行态状态：

```text
IDLE → ACTIVE → IDLE
          ↓
        FAILED
```

任务消费状态由 `AgentTaskStatus` 表达：

```text
PENDING → RUNNING → COMPLETED / FAILED / CANCELLED
```

### 9.3 生命周期主线

```text
teamService.restore_team()
  → agentService.load_team_agents()
  → Agent.startup()
  → 创建 driver
  → 注册工具
  → 恢复历史和未完成任务
  → schedulerService 创建 PENDING task
  → AgentTaskConsumer.consume()
  → AgentTurnRunner.run_chat_turn()
```

出现异常后 Agent 会进入 `FAILED`，可通过 `/agents/{id}/resume.json` 触发恢复。

## 第 10 章 房间、消息与调度轮转

**核心概念**：多 Agent 如何在同一个房间里有序发言。

### 10.1 关键文件

| 文件 | 职责 |
|------|------|
| `src/service/roomService/chatRoom.py` | 房间状态机、轮次推进、消息追加 |
| `src/service/roomService/roomScheduler.py` | 房间调度辅助逻辑 |
| `src/service/roomService/messageStore.py` | 房间消息存储辅助 |
| `src/service/roomService/core.py` | Room service 对外入口 |
| `src/service/schedulerService.py` | 全局调度闸门和任务投递 |
| `src/dal/db/gtScheculeTaskManager.py` | Agent 调度任务 DB 操作 |

### 10.2 房间状态

```text
INIT → SCHEDULING → IDLE
          ↑          ↓
          └── 新消息唤醒
```

`GROUP` 房间中，普通 Agent 轮流发言；`OPERATOR` 通常不会被调度器当作 AI 执行。`PRIVATE` 房间中，`OPERATOR` 回合会等待人类输入。

### 10.3 调度流程

```text
用户或 Agent 写入房间消息
  → ChatRoom.add_message()
  → 发布 ROOM_MSG_ADDED / ROOM_STATUS_CHANGED
  → schedulerService 检查 ScheduleState
  → 创建 GtScheculeTask(type=ROOM_MESSAGE)
  → agent.start_consumer_task()
  → AgentTaskConsumer 原子认领 PENDING → RUNNING
  → AgentTurnRunner 执行本轮
  → send_chat_msg 写消息
  → finish_action 结束本轮
  → ChatRoom.finish_turn() 推进下一位
```

防重依赖数据库任务状态：同一 Agent、同一 room，如果已有 PENDING 或 FAILED 任务，调度器不会重复创建。

## 第 11 章 对话历史与活动日志

**核心概念**：Agent 记住什么，人类如何观察它做过什么。

### 11.1 对话历史

| 文件 | 职责 |
|------|------|
| `src/service/agentService/agentHistoryStore.py` | 内存历史管理 |
| `src/dal/db/gtAgentHistoryManager.py` | 历史 DB 读写 |
| `src/model/dbModel/gtAgentHistory.py` | 历史模型 |

历史状态由 `AgentHistoryStatus` 表示：

```text
INIT / SUCCESS / FAILED / CANCELLED
```

历史 tag 包括：

```text
ROOM_TURN_BEGIN
ROOM_TURN_FINISH
COMPACT_SUMMARY
SELF_INTERRUPT
```

### 11.2 活动日志

活动日志用于前端展示 Agent 的推理、工具调用、状态变化等：

| 文件 | 职责 |
|------|------|
| `src/service/agentActivityService.py` | 活动记录服务 |
| `src/model/dbModel/gtAgentActivity.py` | 活动记录模型 |
| `frontend/src/components/agent/AgentActivityDialog.vue` | 前端活动详情 |

`AgentActivityType` 包括 `LLM_INFER`、`TOOL_CALL`、`COMPACT`、`REASONING`、`CHAT_REPLY` 等。

## 第 12 章 Driver 策略模式

**核心概念**：同一个 Agent 运行时可以使用不同 LLM 交互策略。

### 12.1 关键文件

| 文件 | 说明 |
|------|------|
| `src/service/agentService/driver/base.py` | Driver 基类和 host 协议 |
| `src/service/agentService/driver/nativeDriver.py` | Native Driver |
| `src/service/agentService/driver/tspDriver.py` | TSP Driver |
| `src/service/agentService/driver/claudeSdkDriver.py` | Claude SDK Driver |
| `src/service/agentService/driver/factory.py` | Driver 工厂 |

### 12.2 三种驱动

```text
NativeDriver
  → 宿主 AgentTurnRunner 控制 loop
  → 直接走 llmService
  → 适合通用 OpenAI-compatible / Anthropic / Gemini 等服务

TSPDriver
  → 宿主 AgentTurnRunner 控制 loop
  → 通过 gtsp 子进程接入工具服务能力
  → 适合需要进程级工具隔离的场景

ClaudeSdkDriver
  → Driver 自己控制 turn loop
  → 通过 Claude SDK / MCP 风格桥接工具
  → 适合 Claude 特性更强的场景
```

学习时先读 Native，再读 TSP，最后读 Claude SDK。

## 第 13 章 Token 压缩与 Prompt Cache

**核心概念**：长对话如何控制上下文窗口和成本。

### 13.1 Token 压缩

关键文件：

- `src/service/agentService/compact.py`
- `docs/tech/04_agent/token_compaction.md`

压缩触发逻辑由配置控制：

```text
估算 token > context_window × compact_trigger_ratio
```

触发后会把较早历史压缩成摘要，并保留近期消息继续推理。压缩摘要会以 `COMPACT_SUMMARY` tag 写入历史。

### 13.2 Prompt Cache

关键文件：

- `docs/tech/05_llm/prompt_cache.md`
- `src/service/llmService/llmRequestRules.py`

Prompt Cache 是面向 provider 的成本和性能优化。学习时重点看：

- 哪些 provider 支持。
- 请求规则如何标记 cache。
- 不支持的 provider 如何降级。

## 第 14 章 持久化、重启与热更新

**核心概念**：服务不是一次性内存程序，重启后需要恢复可继续运行的状态。

### 14.1 恢复内容

| 内容 | 代码 |
|------|------|
| Team 是否启用、成员配置 | `gtTeamManager.py`、`gtAgentManager.py` |
| Agent 历史 | `gtAgentHistoryManager.py` |
| Agent 调度任务 | `gtScheculeTaskManager.py` |
| 房间消息和已读指针 | `gtRoomMessageManager.py`、`gtRoomManager.py` |
| 房间运行态 | `roomService.restore_team_rooms_runtime_state()` |

启动时遗留的 RUNNING 任务会被标记为失败，避免重启后卡在运行中。

### 14.2 Team 热更新

当团队、成员、房间或部门结构改变时，通常走：

```text
teamService.restart_team_runtime()
  → stop_team_runtime()
  → restore_team()
```

也就是先停止该 Team 的消费者和房间运行态，再按数据库配置重建。

## 第 15 章 测试与排障

**目标**：知道改完代码怎么验证，出问题先看哪里。

### 15.1 后端测试

默认测试：

```bash
./scripts/run_tests.sh
```

指定范围：

```bash
./scripts/run_tests.sh tests/unit
./scripts/run_tests.sh tests/integration/test_chat_flow
./scripts/run_tests.sh -k "test_name"
./scripts/run_tests.sh --serial
```

API 测试需要真实后端子进程和 Mock LLM：

```bash
./scripts/run_tests.sh tests/api
```

测试体系详见：

- `docs/tech/07_test/execution_architecture.md`
- `docs/tech/07_test/case_design_guide.md`

### 15.2 前端测试

```bash
cd frontend
npm run test:run
npm run build
```

### 15.3 日志入口

开发模式日志在：

```text
dev_storage_root/logs/backend/
├── backend.log
├── backend_warning.log
├── service/
├── controller/
├── dal/
└── util/
```

优先看：

- `backend.log`：全局启动、恢复、调度大事件。
- `service/agentService*.log` 或相关 service 日志：Agent 执行细节。
- `controller/*.log`：接口异常。
- `backend_warning.log`：跨模块告警。

### 15.4 常见排障路线

| 问题 | 优先检查 |
|------|----------|
| 调度不动 | `/system/status.json`、`ScheduleState`、LLM 是否初始化 |
| Agent 不说话 | Agent 是否 `FAILED`、是否有 PENDING/FAILED 任务、房间是否 IDLE |
| 工具没执行 | `toolRegistry` 权限类别、LLM 返回的 tool name、工具参数 JSON |
| 前端没刷新 | WebSocket 是否连接、`ROOM_*` 事件是否发布 |
| 重启后状态异常 | Team 是否 enabled、历史和房间 read_index 是否恢复 |

## 第 16 章 实战：添加一个工具

**目标**：按当前工具体系添加一个 `get_weather` 工具。

### 16.1 实现工具函数

在 `src/service/funcToolService/tools.py` 添加函数。参数必须有清晰类型注解，返回值保持 dict：

```python
def get_weather(city: str) -> dict:
    """查询指定城市的天气。

    Args:
        city: 城市名称，如 "北京"。
    """
    return {
        "success": True,
        "city": city,
        "temperature": "22°C",
        "condition": "晴天",
    }
```

如果工具需要当前 Agent、Team 或房间上下文，增加 `_context: ToolCallContext = None` 参数。以下划线开头的参数不会暴露给 LLM，会在执行时由 `funcToolService.run_tool_call()` 注入。

### 16.2 注册工具

在 `src/service/funcToolService/core.py`：

1. 从 `.tools` import `get_weather`。
2. 在 `load_func_tools()` 的 `_registry` 中加入 `"get_weather": get_weather`。

在 `src/service/agentService/toolRegistry.py` 的 `CATEGORY_CONFIG` 中加入类别：

```python
"get_weather": ToolCategory.BASIC,
```

如果这是管理类工具，谨慎放入 `ADMIN`。普通 Agent 默认不会拿到 Admin 工具。

### 16.3 验证

建议最少做三层验证：

```bash
./scripts/run_tests.sh tests/unit tests/integration/test_funcToolService
./scripts/run_tests.sh --serial -k "tool"
```

然后启动后端和前端，在聊天室里让 Agent 查询天气，观察：

- Web 前端活动日志是否出现 `TOOL_CALL`。
- 后端日志是否出现 `use_tool: tool=get_weather`。
- Agent 历史是否追加了 tool 结果。

### 16.4 新增工具的设计原则

- 工具函数返回业务数据，不返回为前端展示拼接的冗余字段。
- 函数签名保持简单，参数类型使用 `str/int/float/bool/dict/list[T]` 等当前 schema 生成器支持的类型。
- docstring 第一行写工具用途，`Args:` 写参数语义，这会直接影响 LLM 是否会正确调用。
- 涉及文件、执行、管理能力时，要明确 ToolCategory，避免越权。

## 辅助资料索引

| 主题 | 文档 |
|------|------|
| 项目架构 | `docs/tech/01_architecture/architecture.md` |
| 服务依赖 | `docs/tech/01_architecture/service_dependencies.md` |
| Controller / Service / DAL 规范 | `docs/tech/02_mvc/` |
| Driver 架构 | `docs/tech/04_agent/driver_architecture.md` |
| 调度逻辑 | `docs/tech/04_agent/scheduling_logic.md` |
| 任务生命周期 | `docs/tech/04_agent/task_lifecycle.md` |
| 状态持久化 | `docs/tech/04_agent/state_persistence.md` |
| Token 压缩 | `docs/tech/04_agent/token_compaction.md` |
| LLM 配置 | `docs/tech/05_llm/configuration.md` |
| Prompt Cache | `docs/tech/05_llm/prompt_cache.md` |
| Web 实体 i18n | `docs/tech/06_i18n/web_entity_contract.md` |
| 测试体系 | `docs/tech/07_test/execution_architecture.md` |
| 轮次和消息排障 | `docs/tech/08_debugging/turn_message_debugging.md` |
| Web 布局排障 | `docs/tech/08_debugging/web_layout_debugging.md` |
| TUI 布局 | `docs/tech/09_tui/tui_layout.md` |
| 打包发布 | `docs/tech/10_release/packaging_design.md` |
| 调度初始化闸门 | `docs/tech/10_release/scheduler_init_gate.md` |

## 学习验收清单

读完本文后，建议用下面的问题自测：

- 能否从 `/rooms/{id}/messages/send.json` 追踪到 Agent 发言？
- 能否解释 `send_chat_msg` 和 `finish_action` 为什么都是工具？
- 能否说清楚 `ScheduleState.BLOCKED` 和 Agent `FAILED` 的区别？
- 能否定位某个 Agent 本轮为什么没有继续发言？
- 能否新增一个只读工具，并为它选择合理的 ToolCategory？
- 能否用测试或日志证明一个调度问题发生在哪一层？
