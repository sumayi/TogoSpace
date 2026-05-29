# TogoSpace 智能体学习路径

本文档以 TogoSpace 项目为教材，按从易到难的顺序，循序渐进带你理解多智能体系统的核心概念与实现。

## 学习地图总览

```
第1章  环境搭建与首次运行    → 跑起来，建立感性认识
第2章  项目骨架与架构        → 理解分层设计，建立全局观
第3章  LLM 调用机制          → Agent 的大脑：如何与模型通信
第4章  Function Calling      → Agent 的手脚：工具调用原理
第5章  Agent 生命周期        → 从创建到销毁的完整旅程
第6章  对话历史管理          → Agent 的记忆系统
第7章  调度与轮转            → 多 Agent 如何有序发言
第8章  Driver 策略模式       → 三种驱动方式的共性与差异
第9章  Token 压缩            → 长对话如何控制上下文窗口
第10章 事件总线              → 发布/订阅解耦通信
第11章 持久化与状态恢复      → 服务重启后的状态找回
第12章 实战：从零添加一个工具 → 动手写代码
```

---

## 第1章 环境搭建与首次运行

**目标**：跑起项目，理解它是什么。

### 1.1 搭建环境

```bash
# Python 3.11+
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt

# 安装 Git LFS（gTSP 二进制文件用）
brew install git-lfs && git lfs pull

# 启动后端
.venv/bin/python3 src/backend_main.py --port 8080

# 启动前端（新终端）
cd frontend && npm install && npm run dev
```

### 1.2 观察现象

打开 `http://localhost:5173`，你应该看到：

- **设置页（齿轮图标）** → 配置 LLM API（key、地址、模型名）
- **控制台** → 一个聊天室，多个 Agent 角色在讨论
- 调度闸门 → 配置好 LLM 后闸门打开，Agent 开始工作

### 1.3 关键文件

| 文件 | 作用 |
|------|------|
| `src/backend_main.py` | 后端入口，看 `main()` 函数的 4 阶段启动 |
| `frontend/src/App.vue` | 前端入口 |
| `frontend/vite.config.ts` | Vite 代理配置（开发时把 `/api` 请求转发到后端） |

---

## 第2章 项目骨架与架构

**目标**：理解四层架构，知道代码分在哪。

### 2.1 四层架构

阅读 `AGENTS.md` 了解分层规则。核心原则：

```
controller → service → dal → model → util
   ↑           ↑        ↑       ↑       ↑
 接口层      业务层   数据层  数据定义  工具层
```

禁止下层反向引用上层。这个约束是理解整个项目的前提。

### 2.2 对比理解

以"获取团队列表"为例，追踪调用链：

```
浏览器请求 GET /teams/list.json
    ↓
controller/teamController.py   # 解析参数，调用 service
    ↓
service/teamService.py          # 业务逻辑，调用 dal
    ↓
dal/db/gtTeamManager.py        # 数据库查询
    ↓
model/dbModel/gtTeamModel.py   # 数据表定义
```

### 2.3 动手实践

- 打开 `src/route.py`，对照 `docs/architecture_diagram.md` 第 12 节，理解所有 API 端点
- 选一个感兴趣的端点，跟踪代码调用链

---

## 第3章 LLM 调用机制

**核心概念**：Agent 的"大脑"如何与 LLM 通信。

### 3.1 关键文件

| 文件 | 重点内容 |
|------|---------|
| `src/service/llmService.py` | 所有 LLM 调用的统一入口 |
| `src/model/coreModel/gtCoreChatModel.py` | `GtCoreAgentDialogContext` — 推理请求的数据结构 |
| `src/util/configTypes.py` | `LlmServiceConfig` — LLM 配置的 Pydantic 模型 |
| `src/service/agentService/driver/nativeDriver.py` | Native 驱动如何发起推理 |

### 3.2 阅读路径

1. 先看 `llmService.py`：
   - `infer_stream()` — 流式推理（边生成边返回）
   - `infer()` — 非流式推理（等全部生成完）
   - 理解 LiteLLM 做了什么：根据`LlmServiceType` 将请求路由到不同 Provider（OpenAI / Anthropic / DeepSeek...）

2. 再看 `GtCoreAgentDialogContext`：
   - `system_prompt` — 告诉 LLM"你是谁"
   - `messages` — 对话历史
   - `tools` — 可用的工具列表
   - `tool_choice` — 强制/可选/不调用工具

3. 理解 LiteLLM 的价值：不用为每个 LLM Provider 写不同的调用代码，一个接口搞定全部。

### 3.3 思考题

- 为什么选择 LiteLLM 而不是直接 `import openai`？
- `stream=True` 和不 streaming 的区别是什么？什么时候用哪种？

---

## 第4章 Function Calling（工具调用）

**核心概念**：Agent 不只是聊天，更能"做事情"——执行工具。

### 4.1 三个关键角色

| 角色 | 代码位置 | 职责 |
|------|---------|------|
| **工具定义** | `src/service/funcToolService/core.py` | 注册工具的 schema（name、description、parameters） |
| **工具注册表** | `src/service/agentService/toolRegistry.py` | 管理每个 Agent 可用哪些工具 |
| **工具执行** | 各 handler 函数 | 收到 tool_call 后真正执行 |

### 4.2 阅读路径

1. **工具定义**：看 `funcToolService/core.py` 中一个简单工具的定义，比如 `get_time`：
   ```python
   # 定义 schema
   {
     "type": "function",
     "function": {
       "name": "get_time",
       "description": "获取当前时间",
       "parameters": {...}
     }
   }
   
   # 定义执行函数
   def handle_get_time(args, context):
       return {"success": True, "time": datetime.now().isoformat()}
   ```

2. **工具注册**：看 `toolRegistry.py` 如何把工具列表传给 Agent

3. **工具执行流程**：在 `agentTurnRunner.py` 中追踪 `_run_tool_to_item()`：
   - LLM 返回 `tool_calls`
   - 解析工具名和参数
   - 调用 `tool_registry.execute_tool_call()`
   - 结果写入对话历史，进入下一轮推理

### 4.3 关键工具解读

| 工具 | 为什么重要 |
|------|-----------|
| `send_chat_msg` | Agent 通过这个工具"说话" |
| `finish_chat_turn` | Agent 说"我完了"，触发下一个人发言 |
| `create_task` / `update_task` | Agent 可以创建和管理任务 |

### 4.4 思考题

- Function Calling 和传统 API 调用有什么区别？
- 为什么 `send_chat_msg` 和 `finish_chat_turn` 不是 HTTP API，而是做成工具？

---

## 第5章 Agent 生命周期

**核心概念**：Agent 从"出生"到"死亡"的完整过程。

### 5.1 关键文件

| 文件 | 职责 |
|------|------|
| `src/service/agentService/core.py` | Agent 的工厂——创建、加载、卸载 |
| `src/service/agentService/agent.py` | Agent 的门面类 |
| `src/service/agentService/agentTaskConsumer.py` | Agent 的任务消费循环 |
| `src/service/agentService/agentTurnRunner.py` | 单轮对话的执行引擎 |
| `src/model/dbModel/gtAgentModel.py` | Agent 的数据库定义 |

### 5.2 五个状态阶段

```
创建(Created)  →  加载(Runtime)  →  运行(ACTIVE)  →  空闲(IDLE)  →  销毁(Shutdown)
                                                   ↕
                                               失败(FAILED)
```

#### 创建
- `agentService.load_team_agents()` 遍历团队中的每个 Agent 配置
- 解析角色模板 `role_template` → 构建 `system_prompt`
- 确定 `driver` 类型（native / tsp / claude_sdk）

#### 加载
- `Agent.startup()` → 创建 driver → 注册工具 → 恢复历史 → 状态设为 IDLE

#### 运行 (ACTIVE)
- `schedulerService` 创建任务 → `AgentTaskConsumer.consume()` 领取
- 状态变为 ACTIVE，广播 `AGENT_STATUS_CHANGED` 事件
- 执行 `run_chat_turn()` 进入 Turn Loop

#### 空闲 (IDLE) / 失败 (FAILED)
- 任务完成后变 IDLE，等待下一次调度
- 出现异常变 FAILED，需要用户手动恢复（POST /agents/{id}/resume.json）

### 5.3 阅读建议

先跳过复杂的 `agentTaskConsumer` 和 `agentTurnRunner`，只理解 `agent.py` 和 `core.py` 中的整体流程。深入细节留到第7章。

---

## 第6章 对话历史管理

**核心概念**：Agent 的"记忆"，如何记住之前的对话。

### 6.1 关键文件

| 文件 | 职责 |
|------|------|
| `src/service/agentService/agentHistoryStore.py` | 内存中的对话历史管理 |
| `src/dal/db/gtAgentHistoryManager.py` | 历史的持久化读写 |
| `src/model/dbModel/gtAgentHistoryModel.py` | `GtAgentHistory` — 每条历史的字段 |

### 6.2 理解历史结构

每条历史记录有这些核心字段：

```
role:      system | user | assistant | tool
content:   文本内容（或 tool_call 的结果）
tool_calls: JSON数组（assistant 发出工具调用时用）
seq:       序列号（严格递增）
status:    INIT | SUCCESS | FAILED | CANCELLED
```

### 6.3 历史的状态机

```
INIT (新角色) → 推理 → SUCCESS (含 tool_calls)
                ↓
              FAILED / CANCELLED

如果上一条是 SUCCESS + tool_calls：
  → 执行工具 → 追加 tool 角色记录
  → 再次推理
```

### 6.4 对 Agent 的意义

对话历史就是 Agent 的 "prompt chain"——每一轮推理时，整个历史都会被发给 LLM（直到压缩触发）。这意味着：

- Agent 能看到从头到尾的所有讨论
- 但历史太长会超出 context window → 需要压缩（第9章）

---

## 第7章 调度与轮转

**核心概念**：多个 Agent 如何有序地轮流发言。

### 7.1 关键文件

| 文件 | 职责 |
|------|------|
| `src/service/schedulerService.py` | 全局调度闸门 |
| `src/service/roomService/roomScheduler.py` | 单个房间的轮转状态机 |
| `src/service/roomService/chatRoom.py` | 房间的外观类 |

### 7.2 调度流程

```
1. 用户在聊天室发消息
     ↓
2. ChatRoom 收到消息，发布 ROOM_STATUS_CHANGED 事件
     ↓
3. schedulerService 收到事件
     ↓ (检查闸门是否 RUNNING)
4. 创建 GtScheculeTask → 指派给目标 Agent
     ↓
5. Agent 领取任务，进入 Turn Loop
     ↓
6. Agent 调用 finish_chat_turn 工具
     ↓
7. RoomScheduler 推进 speaker_index → 下一个 Agent
     ↓
8. 回到步骤 3 → 下一个 Agent 发言
     ↓ 直到所有 Agent 都发言完毕 或 达到 max_rounds
9. 房间状态变为 IDLE
```

### 7.3 调度的关键设计

| 概念 | 说明 |
|------|------|
| **闸门（Schedule Gate）** | STOPPED/BLOCKED/RUNNING 三种状态，控制全局是否允许调度 |
| **speaker_index** | 循环索引，指向当前发言的 Agent |
| **skip 跟踪** | 如果某 Agent 跳过了（无话可说），记录跳过次数 |
| **max_rounds** | 每轮对话的最大回合数，防止无限循环 |
| **CAS 防重** | `transition_task_status(PENDING, RUNNING)` 用状态前置条件防止重复消费 |

### 7.4 思考题

- 为什么不直接让 Agent 按顺序调用，而是用消息事件驱动？
- 如果某个 Agent 出错了，其他 Agent 会怎么样？

---

## 第8章 Driver 策略模式

**核心概念**：同一套 Agent 逻辑，三种不同的 LLM 交互方式。

### 8.1 关键文件

| 文件 | 说明 |
|------|------|
| `src/service/agentService/driver/base.py` | 抽象基类 |
| `src/service/agentService/driver/nativeDriver.py` | Native 驱动 |
| `src/service/agentService/driver/tspDriver.py` | TSP 驱动 |
| `src/service/agentService/driver/claudeSdkDriver.py` | Claude SDK 驱动 |
| `src/service/agentService/driver/factory.py` | 工厂方法 |

### 8.2 三种驱动的本质区别

```
NativeDriver:
  AgentTurnRunner 控制循环
    ↓
  直接调用 llmService.infer()
    ↓
  LLM 返回 (文本 或 tool_calls)
    ↓
  AgentTurnRunner 执行工具 或 结束

TSPDriver:
  AgentTurnRunner 控制循环
    ↓
  通过 pytspclient (stdio) 发给 gTSP 子进程
    ↓
  gTSP 内部执行工具（沙箱隔离）
    ↓
  结果返回给 AgentTurnRunner

ClaudeSdkDriver:
  Driver 自己控制循环（host_managed_turn_loop=False）
    ↓
  通过 Claude SDK 与 Anthropic API 交互
    ↓
  工具调用通过 MCP Server 桥接
    ↓
  AgentTurnRunner 只负责递消息和接收结果
```

### 8.3 驱动对比

| 维度 | Native | TSP | Claude SDK |
|------|--------|-----|------------|
| 循环控制 | 宿主 | 宿主 | 驱动自身 |
| 工具隔离 | 无 | 进程级沙箱 | SDK 封装 |
| 额外依赖 | 无 | gTSP 二进制 | Anthropic SDK |
| 适用场景 | 通用 | 需要安全沙箱 | 需要 Claude 特有功能 |

### 8.4 阅读理解

先读懂 `nativeDriver.py`（最纯粹），再对比 `tspDriver.py`（加了子进程通信），最后看 `claudeSdkDriver.py`（循环反向控制）。

---

## 第9章 Token 压缩（Context Compaction）

**核心概念**：对话太长超出 LLM 上下文窗口时，如何自动压缩历史。

### 9.1 关键文件

| 文件 | 职责 |
|------|------|
| `src/service/agentService/compact.py` | 压缩策略的核心实现 |

### 9.2 触发条件

```
估算 token > context_window × compact_trigger_ratio (默认 85%)
```

比如 context_window=128K，当估算到 ~109K tokens 时会触发压缩。

### 9.3 压缩流程

```
1. 检测阈值 → 从历史头部开始裁剪    # 保留最后的 N 条，丢弃老旧部分
2. 调用 LLM 做摘要                  # "请把上面的对话摘要成一段话"
3. 用摘要替换被丢弃的历史 → 继续推理
```

### 9.4 可以跳过的细节

`compact.py` 实现较复杂（token 估算、重试、不同模型的窗口大小映射），初学者只需理解**为什么需要压缩、什么条件触发**即可。

---

## 第10章 事件总线（Pub/Sub）

**核心概念**：服务之间如何解耦通信。

### 10.1 关键文件

| 文件 | 职责 |
|------|------|
| `src/service/messageBus.py` | 事件总线实现 |
| `src/controller/wsController.py` | WebSocket 消费者 |
| `src/service/schedulerService.py` | 调度消费者 |

### 10.2 7 个事件主题

```
ROOM_MSG_ADDED          → 新消息来了      → WebSocket 广播
ROOM_MSG_CHANGED        → 消息被升级      → WebSocket 广播
ROOM_STATUS_CHANGED     → 发言轮到下一个人  → WebSocket + schedulerService
ROOM_ADDED              → 新房间创建      → WebSocket 广播
AGENT_STATUS_CHANGED    → Agent 状态变了  → WebSocket 广播
AGENT_ACTIVITY_CHANGED  → Agent 活动日志  → WebSocket 广播
SCHEDULE_STATE_CHANGED  → 调度闸门变了    → WebSocket 广播
```

### 10.3 设计意图

没有事件总线的话，`roomService` 想通知 `schedulerService` "该调度了"，就得直接持有引用。有事件总线后：

```python
# roomService 只需：
messageBus.publish(ROOM_STATUS_CHANGED, data)

# schedulerService 无需被 roomService 知道，自己订阅：
messageBus.subscribe(ROOM_STATUS_CHANGED, self._on_room_status_changed)
```

两个服务完全解耦，互相不知道对方存在。

---

## 第11章 持久化与状态恢复

**核心概念**：服务挂了重启后，怎么找回之前的状态。

### 11.1 关键文件

| 文件 | 职责 |
|------|------|
| `src/service/persistenceService.py` | 状态恢复的总协调 |
| `src/dal/db/gtAgentHistoryManager.py` | 对话历史的读写 |
| `src/dal/db/gtScheculeTaskManager.py` | 任务状态的读写 |
| `src/dal/db/gtRoomManager.py` | 房间状态的读写 |

### 11.2 恢复什么

启动时 Phase 4 做的事情：

1. **Agent 历史恢复** — 从 DB 加载 `GtAgentHistory`，重建内存中的对话历史
2. **Task 状态恢复** — 把上一次 crash 前 RUNNING 的任务标记为 FAILED
3. **房间状态恢复** — 恢复 read_index（每个 Agent 读到哪了）、speaker_index（下一个谁说话）

### 11.3 一个关键细节

`load_agent_history_message()` 加载历史后还会做一次压缩检查：
```python
# 如果恢复后的历史超过了压缩阈值，先压缩再继续
if estimated_tokens > threshold:
    compact.compact_messages(...)
```

这保证了即使历史在 DB 中存了很久，也不会超过 context window。

---

## 第12章 实战：从零添加一个工具

**目标**：动手写代码，为 Agent 添加一个新工具。

### 12.1 场景

我们要添加一个 `get_weather` 工具，让 Agent 能查询天气。

### 12.2 第一步：定义工具 schema

在 `src/service/funcToolService/core.py` 添加：

```python
WEATHER_TOOL = {
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "查询指定城市的天气",
        "parameters": {
            "type": "object",
            "properties": {
                "city": {
                    "type": "string",
                    "description": "城市名称，如 '北京'"
                }
            },
            "required": ["city"]
        }
    }
}
```

### 12.3 第二步：实现工具处理函数

```python
async def handle_get_weather(function_args: dict, context=None) -> dict:
    city = function_args.get("city", "未知")
    # 实际项目中这里调用天气 API
    return {
        "success": True,
        "city": city,
        "temperature": "22°C",
        "condition": "晴天"
    }
```

### 12.4 第三步：注册工具

在 `funcToolService/core.py` 的注册环节：

```python
TOOL_REGISTRY = {
    # ... 已有工具
    "get_weather": {
        "schema": WEATHER_TOOL,
        "handler": handle_get_weather,
        "category": ToolCategory.BASIC,
    }
}
```

### 12.5 第四步：验证

重启后端，创建一个 Agent，看它的工具列表是否包含 `get_weather`。然后在聊天室里让 Agent 查天气，观察调用链路。

---

## 推荐阅读顺序总结

```
第1章 → 第2章 → 第3章 → 第4章 → 第5章 → 第7章 → (第6章) → 第8章 → 第10章 → 第9章 → 第11章 → 第12章

基础               核心流程                  深入机制              动手
```

- **第3-4章**是理解 Agent 最关键的两章（大脑 + 手脚）
- **第7章**理解多 Agent 协作的核心机制
- **第6章**和**第9章**解决 Agent 的"记忆"问题（记什么、记多少）
- **第12章**是最佳验收方式——能否自己加一个工具并跑通

## 辅助资料

| 资料 | 位置 |
|------|------|
| 项目架构图 | `docs/architecture_diagram.md` |
| Driver 架构 | `docs/tech/04_agent/driver_architecture.md` |
| Turn Runner 详解 | `docs/tech/04_agent/turn_runner_as_driver_host.md` |
| Token 压缩 | `docs/tech/04_agent/token_compaction.md` |
| Agent 体验改进 | `docs/improve/agent_experience_improvements.md` |
| 枚举规范 | `docs/code_rule/enum_conventions.md` |
| 日志规范 | `docs/code_rule/logger_convention.md` |
