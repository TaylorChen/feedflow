# FeedFlow - RSS内容提取与格式化系统

自动抓取技术 RSS 内容，使用多模型 AI 进行分析与写作，生成高质量技术文章；支持多种输出风格，提供现代化 Web 界面、报告管理与任务跟踪。

## 功能特性

### 🎯 核心功能
- 📡 **自动抓取**: 支持多个 RSS 源，自动获取最新内容
- 🤖 **AI 分析**: 多模型可选（DeepSeek / Anthropic / 智谱 / Kimi / 方舟）
- ✍️ **智能写作**: 生成结构化技术文章，自动打标签
- 🎨 **AI 配图**: 支持多种图片生成 API（可选）
- 📝 **多种输出格式**: Jekyll / 微信 / 简洁
- 🔄 **去重处理**: 自动记录已处理文章，避免重复
- 📥 **OPML 支持**: 支持导入 OPML 格式的 RSS 源列表
- 📊 **任务进度**: 实时显示任务执行进度和状态
- 📈 **报告管理**: JSON/HTML 报告与分析摘要

### 🎨 Web 界面
- 📱 **响应式设计**: 适配桌面、平板、移动端
- 🎯 **现代化 UI**: 卡片式布局与清晰操作路径
- 🔍 **报告搜索**: 支持报告列表搜索与分页
- 📊 **统计与分析**: 统计页 / AI 分析页

## 安装

1. 进入项目目录：
```bash
cd feedflow
```

2. 安装依赖：
```bash
npm install
```

3. 配置环境变量：
```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你的 API 密钥：
```env
ANTHROPIC_API_KEY=your_anthropic_api_key_here
DEEPSEEK_API_KEY=your_deepseek_api_key_here
ZHIPU_API_KEY=your_zhipu_api_key_here
KIMI_API_KEY=your_kimi_api_key_here
ARK_API_KEY=your_ark_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

## 配置

编辑 `config.json` 文件（或通过“系统配置”页面修改数据库配置）：

```json
{
  "output": {
    "postsDir": "./output",
    "imagesDir": "./images"
  },
  "article": {
    "targetLength": 6000,
    "categories": ["技术", "周刊"],
    "defaultTags": ["技术", "周刊"]
  },
  "strategy": {
    "articlesPerBlog": 6,
    "maxTokenLimit": 80000,
    "topicCount": 3,
    "wordCount": 5000
  },
  "analysis": {
    "minNoveltyScore": 6,
    "minImpactScore": 6,
    "minValueScore": 8,
    "maxTopics": 5
  }
}
```

## 使用方法

### 启动服务器

```bash
npm run server
```

默认监听 `0.0.0.0:3000`，可通过局域网访问：
- 主页: `http://<你的IP>:3000/`
- 系统配置: `http://<你的IP>:3000/config`
- 统计信息: `http://<你的IP>:3000/stats`
- AI 分析: `http://<你的IP>:3000/analysis`

如需指定监听地址：
```bash
HOST=127.0.0.1 npm run server
```

### 运行参数来源说明

首页不再提供“运行参数”面板，运行时参数统一从“系统配置”读取（`/config`）。  
若检测到关键配置缺失（如 API Key / 输出目录 / 图片目录），首页会提示并建议补齐配置。

### 手动触发生成

```bash
npm start
```

执行流程：
1. 抓取 RSS 源最新内容
2. 过滤已处理文章
3. AI 分析主题与趋势
4. 生成技术文章与标签
5. 生成配图（可选）
6. 保存到输出目录

### 输出风格

支持 `jekyll / wechat / simple`：
- Jekyll：包含 Front Matter
- 微信/简洁：正文内附“标签”信息

## 项目结构

```
feedflow/
├── package.json          # 项目配置
├── config.json           # RSS源和输出配置
├── .env                  # API密钥（需自行创建）
├── .env.example          # 环境变量模板
├── src/
│   ├── server.js         # Web服务器
│   ├── index.js          # 主入口
│   ├── index-v2.js       # 新版本入口
│   ├── rss-fetcher.js    # RSS抓取模块
│   ├── content-analyzer.js  # 内容分析模块
│   ├── article-generator.js # 文章生成模块
│   ├── image-generator.js   # 图片生成模块
│   ├── jekyll-formatter.js  # Jekyll格式化模块
│   ├── article-formatter.js # 多种输出格式支持
│   ├── task-queue.js     # 任务队列管理
│   ├── analysis/
│   │   └── StrategyExecutor.js
│   ├── workflow/
│   │   └── WorkflowManager.js
│   ├── database/
│   │   └── db.js
│   ├── views/
│   │   ├── index.ejs
│   │   ├── config.ejs
│   │   ├── stats.ejs
│   │   └── analysis.ejs
├── data/
│   ├── reports/
│   └── articles/
├── output/
├── temp/
└── images/
```

## 注意事项

- 已处理文章记录在 `data/processed.json`
- 如果没有新文章，程序会自动退出
- 图片生成需要对应的 API Key，未配置会跳过
- 建议定期运行（如每周一次）获取最新内容

## 故障排除

### 抓取 RSS 失败
- 检查网络连接
- 确认 RSS 源地址正确
- 部分源可能需要代理

### API 调用失败
- 检查 API Key
- 确认账户额度
- 检查网络访问

### Web 界面无法访问
- 确认服务运行中：`lsof -i :3000`
- 端口冲突时修改 `PORT` 或停止占用进程

## 许可证

MIT
