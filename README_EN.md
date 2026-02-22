# FeedFlow - RSS Content Extraction & Formatting System

Automatically fetches technical RSS content, uses multi-model AI for analysis and writing, generates high-quality technical articles, supports multiple output styles, and provides a modern web UI with report management and task tracking.

## Features

### 🎯 Core Features
- 📡 **Auto Fetch**: Supports multiple RSS feeds and fetches the latest content automatically
- 🤖 **AI Analysis**: Multi-model support (DeepSeek / Anthropic / Zhipu / Kimi / Ark)
- ✍️ **AI Writing**: Generates structured technical articles and auto-tags
- 🎨 **AI Images**: Supports multiple image generation APIs (optional)
- 📝 **Multiple Output Styles**: Jekyll / WeChat / Simple
- 🔄 **De-duplication**: Tracks processed articles to avoid repeats
- 📥 **OPML Support**: Import RSS lists from OPML
- 📊 **Task Progress**: Real-time task progress and status
- 📈 **Report Management**: JSON/HTML reports with analysis summaries

### 🎨 Web UI
- 📱 **Responsive Design**: Works on desktop, tablet, and mobile
- 🎯 **Modern UI**: Card-based layout and clear action paths
- 🔍 **Report Search**: Search and pagination for report lists
- 📊 **Stats & Analysis**: Stats page and AI analysis page

## Installation

1. Enter the project directory:
```bash
cd feedflow
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your API keys:
```env
ANTHROPIC_API_KEY=your_anthropic_api_key_here
DEEPSEEK_API_KEY=your_deepseek_api_key_here
ZHIPU_API_KEY=your_zhipu_api_key_here
KIMI_API_KEY=your_kimi_api_key_here
ARK_API_KEY=your_ark_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

## Configuration

Edit `config.json` (or update via the System Config page):

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

## Usage

### Start Server

```bash
npm run server
```

Default binds to `0.0.0.0:3000` and can be accessed on LAN:
- Home: `http://<your-ip>:3000/`
- System Config: `http://<your-ip>:3000/config`
- Stats: `http://<your-ip>:3000/stats`
- AI Analysis: `http://<your-ip>:3000/analysis`

To bind to a specific address:
```bash
HOST=127.0.0.1 npm run server
```

### Runtime Parameters Source

The Home page no longer provides a “runtime parameters” panel.  
All runtime parameters are read from **System Config** (`/config`).  
If required fields (API Key / output dir / images dir) are missing, the Home page will show a warning.

### Run Generation Manually

```bash
npm start
```

Flow:
1. Fetch latest RSS content
2. Filter processed articles
3. AI analysis of topics and trends
4. Generate technical articles and tags
5. Generate images (optional)
6. Save to output directory

### Output Styles

Supported styles: `jekyll / wechat / simple`
- Jekyll: includes front matter
- WeChat/Simple: includes inline tags in content

## Project Structure

```
feedflow/
├── package.json          # Project configuration
├── config.json           # RSS and output settings
├── .env                  # API keys (create locally)
├── .env.example          # Env template
├── src/
│   ├── server.js         # Web server
│   ├── index.js          # Main entry
│   ├── index-v2.js       # New CLI entry
│   ├── rss-fetcher.js    # RSS fetcher
│   ├── content-analyzer.js  # Content analyzer
│   ├── article-generator.js # Article generator
│   ├── image-generator.js   # Image generator
│   ├── jekyll-formatter.js  # Jekyll formatter
│   ├── article-formatter.js # Multi-style formatter
│   ├── task-queue.js     # Task queue
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

## Notes

- Processed articles are tracked in `data/processed.json`
- If there are no new articles, the program exits automatically
- Image generation requires the corresponding API key; if missing, it will be skipped
- Recommended to run periodically (e.g., weekly)

## Troubleshooting

### RSS fetch fails
- Check network connectivity
- Verify RSS URLs
- Some feeds may require a proxy

### API call fails
- Verify API keys
- Check account quota
- Check network access

### Web UI not accessible
- Ensure server is running: `lsof -i :3000`
- Resolve port conflicts or change `PORT`

## License

MIT
