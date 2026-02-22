# 快速开始指南

## 第一步：配置API密钥

1. 复制环境变量模板：
```bash
cp .env.example .env
```

2. 编辑 `.env` 文件，填入你的API密钥：
```bash
# 必需：用于内容分析和文章生成
ANTHROPIC_API_KEY=sk-ant-xxxxx

# 可选：用于AI配图（如果不配置会跳过配图）
OPENAI_API_KEY=sk-xxxxx
```

### 如何获取API密钥？

**Anthropic API Key (必需)**
- 访问：https://console.anthropic.com/
- 注册账号并登录
- 进入 "API Keys" 页面
- 点击 "Create Key" 创建新密钥
- 复制密钥并粘贴到 `.env` 文件

**OpenAI API Key (可选，用于配图)**
- 访问：https://platform.openai.com/
- 注册账号并登录
- 进入 "API Keys" 页面
- 点击 "Create new secret key"
- 复制密钥并粘贴到 `.env` 文件

## 第二步：运行程序

### 方式1：使用启动脚本（推荐）
```bash
./run.sh
```

### 方式2：直接运行
```bash
npm start
```

## 第三步：查看生成的文章

文章会自动保存到：
```
~/go/TaylorChen.github.io/_posts/YYYY-MM-DD-文章标题.md
```

## 第四步：发布到GitHub

```bash
cd ~/go/TaylorChen.github.io
git add _posts/
git add assets/images/  # 如果有配图
git commit -m "Add newsletter article: 文章标题"
git push
```

## 工作流程说明

程序运行时会自动完成以下步骤：

1. **抓取RSS内容** (约30秒)
   - 从配置的所有RSS源抓取最新文章
   - 每个源抓取最近3篇文章

2. **过滤已处理文章** (即时)
   - 检查 `data/processed.json` 记录
   - 只处理新文章，避免重复

3. **AI内容分析** (约1-2分钟)
   - 使用Claude分析所有文章
   - 提取技术精华和核心主题
   - 过滤广告、招聘等无关内容

4. **生成技术博客** (约2-3分钟)
   - 基于分析结果生成5000字文章
   - 包含引言、技术详解、实践建议、总结
   - 自动生成标题、标签、描述

5. **AI配图** (约30秒，如果配置了OpenAI)
   - 根据文章内容生成配图提示词
   - 使用DALL-E 3生成高质量配图
   - 保存到 `assets/images/` 目录

6. **保存Jekyll文章** (即时)
   - 生成符合Jekyll格式的markdown
   - 包含front matter（标题、日期、分类、标签等）
   - 保存到 `_posts` 目录

总耗时：约4-6分钟

## 自定义配置

### 修改RSS源

编辑 `config.json`，添加或删除RSS源：

```json
{
  "rssFeeds": [
    {
      "name": "你的RSS源名称",
      "url": "https://example.com/rss.xml",
      "category": "技术"
    }
  ]
}
```

### 调整文章长度

在 `config.json` 中修改：

```json
{
  "article": {
    "targetLength": 5000  // 改为你想要的字数
  }
}
```

### 修改分类和标签

在 `config.json` 中修改：

```json
{
  "article": {
    "categories": ["技术", "周刊"],
    "defaultTags": ["技术", "周刊"]
  }
}
```

## 常见问题

### Q: 第一次运行需要多久？
A: 约4-6分钟，主要时间花在AI分析和文章生成上。

### Q: 如果没有新文章会怎样？
A: 程序会自动检测并提示"所有文章都已处理过"，然后退出。

### Q: 可以不配置OpenAI API吗？
A: 可以，程序会跳过配图生成，其他功能正常工作。

### Q: 生成的文章质量如何？
A: 使用Claude Sonnet 4.5模型，生成的文章质量较高，包含技术深度和实践价值。

### Q: 多久运行一次比较好？
A: 建议每周运行一次，这样可以汇总一周的技术动态。

### Q: 可以自动定时运行吗？
A: 可以使用cron定时任务，例如每周一早上9点运行：
```bash
0 9 * * 1 cd /Users/demo/nodejs/feedflow/feedflow && ./run.sh
```

## 下一步

- 运行程序生成第一篇文章
- 查看生成的文章质量
- 根据需要调整配置
- 设置定时任务自动运行
- 享受自动化带来的便利！
