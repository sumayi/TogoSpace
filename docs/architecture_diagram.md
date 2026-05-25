# TogoSpace 架构图

## 1. 系统总览

```mermaid
graph TB
    subgraph Frontend["前端"]
        Web["Web 控制台<br/>(Vue 3 + Vite)"]
        TUI["终端前端<br/>(Textual)"]
    end

    subgraph API["API 层"]
        HTTP["HTTP REST API<br/>port:8080"]
        WS["WebSocket<br/>/ws/events.json"]
    end

    subgraph Controller["Controller 层"]
        C_Team["teamController"]
        C_Room["roomController"]
        C_Agent["agentController"]
        C_WS["wsController"]
        C_Setting["settingController"]
        C_Init["initController"]
        C_System["systemController"]
        C_Config["configController"]
        C_Dept["deptController"]
        C_Role["roleTemplateController"]
        C_Activity["activityController"]
        C_Supervise["superviseController"]
    end

    subgraph Service["Service 层"]
        S_Agent["agentService<br/>Agent 生命周期"]
        S_Room["roomService<br/>房间管理"]
        S_Scheduler["schedulerService<br/>全局调度"]
        S_LLM["llmService<br/>LiteLLM 封装"]
        S_Tool["funcToolService<br/>24 个工具"]
        S_Preset["presetService<br/>配置导入"]
        S_Team["teamService<br/>团队管理"]
        S_Dept["deptService<br/>部门树"]
        S_Persistence["persistenceService<br/>状态恢复"]
        S_Activity["agentActivityService<br/>活动记录"]
        S_Task["taskService<br/>协作任务"]
        S_Bus["messageBus<br/>事件总线"]
        S_Orm["ormService<br/>SQLite ORM"]
    end

    subgraph Driver["Driver 策略层"]
        D_Native["NativeDriver<br/>OpenAI 兼容"]
        D_TSP["TSPDriver<br/>gTSP 子进程"]
        D_Claude["ClaudeSdkDriver<br/>Anthropic SDK"]
    end

    subgraph External["外部依赖"]
        LLM["LLM API<br/>(OpenAI/Anthropic/DeepSeek...)"]
        gTSP["gTSP 二进制<br/>(stdio 子进程)"]
        SQLite["SQLite<br/>data/data.db"]
    end

    Web --> HTTP
    Web --> WS
    TUI --> HTTP
    TUI --> WS

    HTTP --> Controller
    WS --> C_WS

    Controller --> Service

    S_Agent --> Driver
    S_LLM --> LLM
    D_TSP --> gTSP
    S_Orm --> SQLite
```

## 2. 四层架构规则

```mermaid
graph TD
    C["Controller<br/>请求编排、响应序列化"]
    S["Service<br/>业务逻辑、状态管理"]
    D["DAL<br/>数据库 CRUD"]
    M["Model<br/>数据定义"]
    U["Util<br/>通用工具"]

    C --> S --> D --> M --> U

    style C fill:#e1f5fe
    style S fill:#fff3e0
    style D fill:#f3e5f5
    style M fill:#e8f5e9
    style U fill:#fce4ec
```

| 层 | 可 import | 说明 |
|----|-----------|------|
| `controller` | `service` + `dal` + `model` + `util` | HTTP / WebSocket 接口层 |
| `service` | `dal` + `model` + `util` | 有状态业务逻辑 |
| `dal` | `model` + `util` | 数据访问层 |
| `model` | `util` | 数据定义 |
| `util` | 标准库 + 第三方 | 通用工具 |

- 同层可互相引用，禁止下层反向依赖上层。
- 入口模块 `backend_main.py` 启动后会 `chdir` 到 `src/`。

## 3. 启动流程（4 阶段）

```mermaid
sequenceDiagram
    participant Main as backend_main.py
    participant Bus as messageBus
    participant LLM as llmService
    participant Tool as funcToolService
    participant Orm as ormService
    participant Agent as agentService
    participant Room as roomService
    participant Sched as schedulerService
    participant Preset as presetService
    participant Team as teamService
    participant Tornado as Tornado Server

    Main->>Main: chdir(src/)

    Note over Main: Phase 1: 基础服务初始化
    Main->>Bus: startup()
    Main->>LLM: startup()
    Main->>Tool: startup() 注册 24 个工具
    Main->>Orm: startup() 打开 SQLite + 迁移
    Main->>Agent: startup() 创建特殊 Agent (SYSTEM/OPERATOR)
    Main->>Room: startup()
    Main->>Sched: startup() 订阅事件

    Note over Main: Phase 2: 导入 Presets
    Main->>Preset: import_from_app_config()
    Preset-->>Main: 角色模板 + 团队 + 部门树 + 房间

    Note over Main: Phase 3: 构建运行时
    Main-->>Main: (空，团队恢复移到 Phase 4)

    Note over Main: Phase 4: 恢复持久化状态
    loop 每个已启用的团队
        Main->>Team: restore_team(team_id)
        Team->>Agent: load_team_agents() 创建 Agent 实例
        Team->>Room: load_team_rooms() 创建 ChatRoom 实例
        Team->>Sched: start_scheduling()
    end

    Main->>Tornado: 启动 HTTP Server (0.0.0.0:{port})
```

## 4. 请求处理流程（用户发消息）

```mermaid
sequenceDiagram
    participant User as 用户 (Web/TUI)
    participant HTTP as POST /rooms/{id}/messages/send.json
    participant RoomCtrl as roomController
    participant RoomSvc as roomService
    participant ChatRoom as ChatRoom
    participant MsgStore as RoomMessageStore
    participant Bus as messageBus
    participant WS as wsController
    participant Sched as schedulerService
    participant TaskCons as AgentTaskConsumer
    participant TurnRun as AgentTurnRunner
    participant Driver as AgentDriver
    participant LLM as llmService
    participant ToolReg as AgentToolRegistry

    User->>HTTP: 发送消息
    HTTP->>RoomCtrl: post()
    RoomCtrl->>RoomSvc: get_room()
    RoomSvc->>ChatRoom: add_message()
    ChatRoom->>MsgStore: append_and_assign_seq()
    ChatRoom->>Bus: publish(ROOM_MSG_ADDED)
    Bus->>WS: 广播给所有客户端
    ChatRoom->>Bus: publish(ROOM_STATUS_CHANGED)
    Bus->>Sched: need_scheduling=true

    Sched->>Sched: 检查调度闸门
    Sched->>Sched: 创建 GtScheculeTask
    Sched->>TaskCons: start_consumer_task()

    TaskCons->>TaskCons: 状态 -> ACTIVE
    TaskCons->>TaskCons: 认领任务 (PENDING -> RUNNING)
    TaskCons->>TurnRun: run_chat_turn(task)

    TurnRun->>TurnRun: 同步未读消息到历史
    loop Turn Loop
        TurnRun->>Driver: infer(消息列表, 工具列表)
        Driver->>LLM: LiteLLM 调用
        LLM-->>Driver: tool_calls / text
        Driver-->>TurnRun: 推理结果
        TurnRun->>ToolReg: execute_tool_call()
        alt 工具 = send_chat_msg
            ToolReg->>RoomSvc: add_message()
            RoomSvc->>Bus: publish(ROOM_MSG_ADDED)
            Bus->>WS: 广播消息
        else 工具 = finish_chat_turn
            ToolReg-->>TurnRun: TURN_DONE
        end
    end

    TurnRun->>TaskCons: 任务完成 (RUNNING -> COMPLETED)
    TaskCons->>TaskCons: 状态 -> IDLE

    Note over Sched: 发送下一个 speaker 的任务
```

## 5. Agent 生命周期

```mermaid
stateDiagram-v2
    [*] --> Created: 创建团队/导入Preset
    Created --> Runtime: load_team_agents()
    Runtime --> IDLE: startup() 完成
    IDLE --> ACTIVE: start_consumer_task()
    ACTIVE --> ACTIVE: Turn Loop 执行
    ACTIVE --> IDLE: 任务完成
    ACTIVE --> FAILED: 异常/错误
    FAILED --> IDLE: 用户手动恢复
    IDLE --> [*]: close() / shutdown()
    FAILED --> [*]: close() / shutdown()
```

### Task 生命周期

```mermaid
stateDiagram-v2
    [*] --> PENDING: schedulerService 创建任务
    PENDING --> RUNNING: 认领任务 (CAS)
    RUNNING --> COMPLETED: 正常完成
    RUNNING --> FAILED: 异常终止
    RUNNING --> CANCELLED: 用户取消
    PENDING --> CANCELLED: 用户取消
    FAILED --> PENDING: 重新调度
```

## 6. Driver 策略架构

```mermaid
classDiagram
    class AgentDriverHost {
        <<Protocol>>
        +gt_agent: GtAgent
        +system_prompt: str
        +agent_workdir: str
        +history: AgentHistoryStore
        +tool_registry: AgentToolRegistry
        +execute_pending_tools()
    }

    class AgentDriver {
        <<abstract>>
        +host: AgentDriverHost
        +host_managed_turn_loop: bool
        +infer()
        +startup()
        +shutdown()
        +get_turn_prompt()
    }

    class NativeAgentDriver {
        +host_managed_turn_loop = True
        直接调用 LiteLLM API
        工具由 funcToolService 注册
    }

    class TspAgentDriver {
        +host_managed_turn_loop = True
        通过 pytspclient (stdio) 与 gTSP 通信
        工具注册由 gTSP 提供
        自动重连
    }

    class ClaudeSdkAgentDriver {
        +host_managed_turn_loop = False
        使用 Anthropic Claude SDK
        工具通过 MCP Server 桥接
        持久会话 connect/disconnect
    }

    class AgentTurnRunner {
        +run_chat_turn()
        +_run_turn_loop()
        +_infer_and_classify()
        +_run_tool_to_item()
    }

    AgentDriverHost <|.. AgentTurnRunner : implements
    AgentDriver <|-- NativeAgentDriver
    AgentDriver <|-- TspAgentDriver
    AgentDriver <|-- ClaudeSdkAgentDriver
    AgentDriver o-- AgentDriverHost : uses
```

| 特性 | Native | TSP | Claude SDK |
|------|--------|-----|------------|
| Turn Loop 控制 | Host | Host | Driver 自身 |
| 工具注册 | funcToolService | gTSP + funcToolService | funcToolService via MCP |
| 通信方式 | 直接 LiteLLM API | stdio 子进程 | Claude SDK 持久会话 |
| 最大重试 | 3 | 3 | 3 |
| 连接管理 | 无状态 | 自动重连 | 持久 connect/disconnect |
| 沙箱隔离 | 无 | 进程级隔离 | SDK 封装 |

## 7. 房间状态机

```mermaid
stateDiagram-v2
    INIT --> SCHEDULING: activate_scheduling()
    SCHEDULING --> SCHEDULING: speaker_index 轮转
    SCHEDULING --> IDLE: 所有 Agent 完成 / 达到 max_rounds
    IDLE --> SCHEDULING: 新消息触发

    state SCHEDULING {
        [*] --> Speaker1: agent_ids[0]
        Speaker1 --> Speaker2: agent_ids[1]
        Speaker2 --> Speaker3: agent_ids[2]
        Speaker3 --> Speaker1: 循环
    }
```

| 类型 | 成员 | 行为 |
|------|------|------|
| **PRIVATE** | 1 Operator + 1 AI Agent | Operator 消息在 Agent 发言时排队 |
| **GROUP** | 多 AI Agent (+ 可选 Operator) | 轮转发言，按轮次跳过跟踪 |

## 8. 事件总线

```mermaid
graph LR
    subgraph Publishers["发布者"]
        P_Room["roomService/chatRoom"]
        P_Agent["agentService"]
        P_Sched["schedulerService"]
        P_Activity["agentActivityService"]
    end

    subgraph Bus["messageBus (进程内 Pub/Sub)"]
        T_Msg["ROOM_MSG_ADDED"]
        T_MsgChg["ROOM_MSG_CHANGED"]
        T_Status["ROOM_STATUS_CHANGED"]
        T_RoomAdd["ROOM_ADDED"]
        T_AgentSt["AGENT_STATUS_CHANGED"]
        T_ActChg["AGENT_ACTIVITY_CHANGED"]
        T_SchChg["SCHEDULE_STATE_CHANGED"]
    end

    subgraph Subscribers["订阅者"]
        S_WS["wsController<br/>WebSocket 广播"]
        S_Sched["schedulerService<br/>任务调度"]
    end

    P_Room --> T_Msg
    P_Room --> T_MsgChg
    P_Room --> T_Status
    P_Room --> T_RoomAdd
    P_Agent --> T_AgentSt
    P_Activity --> T_ActChg
    P_Sched --> T_SchChg

    T_Msg --> S_WS
    T_MsgChg --> S_WS
    T_Status --> S_WS
    T_Status --> S_Sched
    T_RoomAdd --> S_WS
    T_AgentSt --> S_WS
    T_ActChg --> S_WS
    T_SchChg --> S_WS
```

## 9. 数据库 Schema

```mermaid
erDiagram
    gt_team ||--o{ gt_agent : "1:N"
    gt_team ||--o{ gt_room : "1:N"
    gt_team ||--o{ gt_dept : "1:N"
    gt_team ||--o{ agent_tasks : "1:N"

    gt_agent ||--o{ gt_agent_history : "1:N"
    gt_agent ||--o{ gt_agent_activity : "1:N"
    gt_agent ||--o{ schecule_tasks : "1:N"
    gt_agent }o--|| gt_role_template : "N:1"

    gt_room ||--o{ gt_room_message : "1:N"

    gt_dept ||--o{ gt_dept : "parent_id (自引用)"

    gt_team {
        int id PK
        string name
        json config
        bool enabled
        bool deleted
    }

    gt_agent {
        int id PK
        int team_id FK
        string name
        int role_template_id FK
        string model
        string driver
        int employ_status
        json allow_tools
    }

    gt_room {
        int id PK
        int team_id FK
        string name
        string type "PRIVATE/GROUP"
        string initial_topic
        int max_rounds
        json agent_ids
        json state "read_index, speaker_index"
    }

    gt_room_message {
        int id PK
        int room_id FK
        int sender_id
        string content
        int seq
        bool insert_immediately
    }

    gt_agent_history {
        int id PK
        int agent_id FK
        string role "system/user/assistant/tool"
        string content
        json tool_calls
        string status
        int seq
        json usage
    }

    schecule_tasks {
        int id PK
        int agent_id FK
        string task_type
        json task_data
        string status "PENDING/RUNNING/COMPLETED/FAILED/CANCELLED"
        string error_message
    }

    gt_agent_activity {
        int id PK
        int agent_id FK
        string activity_type "LLM_INFER/TOOL_CALL/COMPACT/AGENT_STATE/..."
        string status
        json detail
        json metadata
    }

    gt_dept {
        int id PK
        int team_id FK
        int parent_id "自引用"
        string name
        int manager_id FK
        json agent_ids
    }

    agent_tasks {
        int id PK
        int team_id FK
        string title
        string status
        int priority
        int assignee_id FK
    }

    gt_role_template {
        int id PK
        string name
        string soul
        string type "system/user"
    }

    gt_system_config {
        string config_key PK
        string config_value
    }
```

## 10. 调度闸门

```mermaid
stateDiagram-v2
    STOPPED --> BLOCKED: 未配置 LLM / 演示模式 / 错误
    BLOCKED --> RUNNING: 配置完成 / 解除阻塞
    RUNNING --> BLOCKED: LLM 不可用 / 错误发生
    RUNNING --> STOPPED: 全局停止
    STOPPED --> STOPPED: 一直

    state BLOCKED {
        note: 调度器不创建新任务<br/>现有任务可继续完成
    }

    state RUNNING {
        note: 房间激活 -> 创建任务<br/>Agent IDLE -> 领取任务
    }
```

## 11. 目录结构（基于 STORAGE_ROOT）

```mermaid
graph TD
    Root[STORAGE_ROOT]
    Setting["setting.json<br/>用户配置"]
    Data["data/<br/>SQLite 数据库"]
    Logs["logs/backend/<br/>日志"]
    Workspace["workspace/<br/>Agent 工作目录"]

    Root --> Setting
    Root --> Data
    Root --> Logs
    Root --> Workspace

    subgraph LogDetail["日志详情"]
        Global["backend.log 全局"]
        Warning["backend_warning.log 告警"]
        Module["service/*.log 模块"]
    end

    Logs --> LogDetail
```

| 运行模式 | STORAGE_ROOT |
|----------|-------------|
| 开发模式 | `repo/dev_storage_root/` |
| 打包模式 | `~/.togo_agent/` |
| Docker | 环境变量 `STORAGE_ROOT` 指定 |

## 12. API 路由总览

```mermaid
graph LR
    subgraph Config["配置"]
        A1["GET /config/frontend.json"]
        A2["GET /config/directories.json"]
        A3["LLM 服务 CRUD"]
        A4["POST /config/language.json"]
        A5["POST /config/quick_init.json"]
    end

    subgraph System["系统"]
        B1["GET /system/status.json"]
        B2["POST /system/schedule/resume.json"]
    end

    subgraph Agent["Agent"]
        C1["GET /agents/list.json"]
        C2["GET /agents/{id}.json"]
        C3["GET /agents/{id}/tasks.json"]
        C4["POST /agents/{id}/resume.json"]
        C5["POST /agents/{id}/stop.json"]
        C6["POST /agents/{id}/supervise.json"]
    end

    subgraph Team["团队"]
        D1["GET /teams/list.json"]
        D2["POST /teams/create.json"]
        D3["GET /teams/{id}.json"]
        D4["POST /teams/{id}/modify.json"]
        D5["POST /teams/{id}/delete.json"]
        D6["POST /teams/{id}/set_enabled.json"]
        D7["POST /teams/{id}/clear_data.json"]
        D8["PUT  /teams/{id}/agents/save.json"]
    end

    subgraph Room["房间"]
        E1["GET /rooms/list.json"]
        E2["POST /teams/{id}/rooms/create.json"]
        E3["GET  /rooms/{id}/messages/list.json"]
        E4["POST /rooms/{id}/messages/list.json 发送"]
        E5["POST /rooms/{id}/messages/{id}/escalate.json"]
    end

    subgraph Dept["部门"]
        F1["GET /teams/{id}/dept_tree.json"]
        F2["PUT /teams/{id}/dept_tree/update.json"]
    end

    subgraph Role["角色模板"]
        G1["GET /role_templates/list.json"]
        G2["POST /role_templates/create.json"]
        G3["POST /role_templates/{id}/modify.json"]
        G4["POST /role_templates/{id}/delete.json"]
    end

    subgraph Activity["活动记录"]
        H1["GET /activities.json"]
        H2["GET /agents/{id}/activities.json"]
        H3["GET /teams/{id}/activities.json"]
    end

    subgraph Realtime["实时通信"]
        I1["WS /ws/events.json"]
        I2["GET /* (SPA fallback)"]
    end
```

## 13. Turn Loop 详细流程

```mermaid
flowchart TD
    Start([AgentTurnRunner.run_chat_turn]) --> Sync[同步未读消息到历史]
    Sync --> Advance{_advance_step<br/>检查历史状态}

    Advance -->|上次为 ASSISTANT/INIT| Infer[_infer_and_classify<br/>调用 LLM]
    Advance -->|上次为 ASSISTANT/SUCCESS + tool_calls| RunTool[_run_tool_to_item<br/>执行工具]
    Advance -->|TURN_DONE| Done[完成]

    Infer --> Compact{Token 超阈值?}
    Compact -->|85%| CompactMsg[压缩历史]
    CompactMsg --> Check
    Compact -->|否| Check{分类结果}

    RunTool --> Advance

    Check -->|TURN_DONE| Done
    Check -->|CONTINUE| Advance
    Check -->|NO_ACTION| Retry{重试 < 3?}
    Check -->|ERROR_ACTION| Hint[注入提示 -> 重试]

    Retry -->|是| Advance
    Retry -->|否| Done

    Hint --> Advance

    Done --> Update[更新 Task 状态 -> COMPLETED]
    Update --> Notify[Agent 状态 -> IDLE]
    Notify --> Next[调度下一个 speaker]
    Next --> End([结束])
```

## 14. 工具分类

| 分类 | 工具 | 作用域 |
|------|------|--------|
| **BASIC** | `get_time`, `send_chat_msg`, `finish_chat_turn`, `get_dept_info`, `get_room_info`, `get_agent_info`, `wake_up_agent`, `start_chat`, `create_task`, `update_task`, `get_task`, `list_tasks` | 全驱动 |
| **ADMIN** | `reload_team`, `list_role_templates`, `get_role_template`, `save_agent`, `save_dept`, `delete_dept`, `save_room`, `delete_room`, `save_role_template`, `delete_role_template` | 全驱动 |
| **READ** | `list_dir`, `read_file` | TSP 专属 |
| **WRITE** | `write_file` | TSP 专属 |
| **EXECUTE** | `execute_bash` | TSP 专属 |

## 15. 关键设计模式

| 模式 | 应用位置 | 说明 |
|------|---------|------|
| **Facade** | `Agent` / `ChatRoom` | 对外暴露简洁接口，内部委托子组件 |
| **Strategy** | `AgentDriver` 体系 | 三种驱动可互换 |
| **State Machine** | `RoomScheduler` / `AgentHistoryStore` | 状态转换有严格规则 |
| **Pub/Sub** | `messageBus` | 生产者与消费者解耦 |
| **CAS** | `gtScheculeTaskManager` | 任务认领防重复消费 |
| **Protocol** | `AgentDriverHost` | Python 结构化类型，松耦合 |
