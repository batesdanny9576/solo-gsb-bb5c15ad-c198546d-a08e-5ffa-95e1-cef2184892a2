# 访谈转录质性分析工作台

用于访谈转录文本的质性编码（qualitative coding）Web 工作台：按字符区间给文本片段添加**可重叠**编码，实时检测同名与嵌套冲突，并提供合并 / 拆分 / 保留边界三种决策。数据落盘 SQLite，刷新、重启均可恢复。

技术栈：React 18 + Vite · FastAPI · SQLite · Docker Compose

## 一键启动

```bash
docker compose up --build
```

## 访问地址

| 入口 | 地址 |
| --- | --- |
| Web 工作台 | http://localhost:8080 |
| 后端 API（Swagger 文档） | http://localhost:8000/docs |
| 健康检查 | http://localhost:8000/api/health |

数据保存在名为 `qual-data` 的 Docker 卷中（容器内路径 `/data/app.db`），删除容器不丢数据。

## 功能说明

- **区间编码**：在文本上**拖选**，或在表单中直接输入半开区间 `[起始, 结束)`，选择既有编码或新建编码即可添加标注；支持对同一文本叠加多个编码（重叠高亮以渐变条带呈现）。
- **冲突实时检测**：提交前先调用 `POST /api/codings/preview` 检测——
  - **同名冲突**：相同编码的区间相互重叠；
  - **嵌套冲突**：不同编码的区间互相包含（含两个方向）。
- **三种决策**：
  - **合并 merge**：同名且重叠/相邻的编码合并为一个连续区间（传递闭包）；
  - **拆分 split**：沿新区间边界拆分外层编码；若新区间包含他者，则新区间自身绕开拆分；
  - **保留边界 keep**：不做调整，重叠 / 嵌套共存。
- **编辑与删除**：侧栏标注列表支持定位（滚动 + 闪烁）、编辑（改区间或改编码，同样走冲突检测）、删除。
- **编码筛选**：编码本复选框控制文本高亮与标注列表的显示范围。
- **编码共现视图**：正文区顶部切换到「编码共现」，按当前文档展示编码两两关系矩阵——
  - 口径：统计前先把**同一编码自身重叠 / 相邻**的半开区间合并，再对编码对求交集，因此同一处共享字符不会被重复计数（半开区间仅首尾相接 `[a,b)`+`[b,c)` 不算共现）；
  - 可在**共现覆盖字符数**与**共现片段数**两种口径之间切换，单元格按当前口径相对最大值深浅着色；斜纹对角格为编码自身合并覆盖；
  - 点击非零单元格，下方列出对应交集片段（区间 + 原文摘录）；点击片段自动切回正文视图并滚动、闪烁定位高亮；
  - 编码筛选变化后矩阵与片段明细同步更新；筛选为空、仅 1 个编码或编码间无共现时给出明确空状态。
- **JSON 导出**：顶栏「导出 JSON」下载当前文档的完整编码结果（含每条标注的区间与原文切片），对应 `GET /api/documents/{id}/export`。
- **持久化**：所有文档、编码本、标注均存于 SQLite，刷新页面后原样恢复；首次启动自动载入一份示例访谈与编码。

## 本地开发（不用 Docker）

```bash
# 后端（Python 3.11+）
cd backend
pip install -r requirements.txt
DB_PATH=./dev.db uvicorn app.main:app --reload --port 8000

# 前端（Node 20+），Vite 已配置 /api 代理到 8000
cd frontend
npm install
npm run dev   # http://localhost:5173
```

## API 概览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/documents` | 文档列表 |
| POST | `/api/documents` | 新建文档 `{title, content}` |
| GET | `/api/documents/{id}` | 文档详情（含编码本与全部标注） |
| GET | `/api/documents/{id}/cooccurrence` | 编码两两共现矩阵（可重复带 `code_ids` 参数限定统计编码） |
| GET | `/api/documents/{id}/export` | 导出 JSON（附件下载） |
| GET / POST | `/api/codes` | 编码本列表 / 新建（重名返回 409） |
| PUT / DELETE | `/api/codes/{id}` | 重命名、改色 / 删除（级联删除标注） |
| POST | `/api/codings/preview` | 冲突预览 `{document_id, code_id, start, end, exclude_id?}` |
| POST | `/api/codings` | 创建标注，可带 `resolution: keep\|merge\|split` |
| PUT / DELETE | `/api/codings/{id}` | 修改（同样支持 resolution）/ 删除 |

## 项目结构

```
├── docker-compose.yml      # 一键启动
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py         # FastAPI 路由与决策应用
│       ├── conflicts.py    # 冲突检测 / 合并 / 拆分纯函数
│       ├── cooccurrence.py # 共现区间合并 / 交集 / 矩阵统计纯函数
│       └── db.py           # SQLite 连接、建表、示例数据
└── frontend/
    ├── Dockerfile          # 多阶段构建：Vite build → nginx
    ├── nginx.conf          # 静态托管 + /api 反向代理
    └── src/
        ├── App.jsx         # 状态编排与冲突决策流
        └── components/     # TextView / CodingForm / ConflictDialog / Sidebar / CooccurrenceMatrix
```
