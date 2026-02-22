import dotenv from 'dotenv';
import express from 'express';

// 可选：允许在本地调试时临时关闭 TLS 证书验证
// 使用方式：ALLOW_INSECURE_TLS=1 npm run server
if (process.env.ALLOW_INSECURE_TLS === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.warn('⚠️  已启用不安全的 TLS 验证（仅建议本地调试）');
}

// 加载环境变量
dotenv.config();
import path from 'path';
import { fileURLToPath } from 'url';
import { WorkflowManager } from './workflow/WorkflowManager.js';
import { ArticleRepository } from './data/repositories/ArticleRepository.js';
import { ArticleFormatter } from './article-formatter.js';
import { AIClient } from './ai-client.js';
import multer from 'multer';
import fs from 'fs/promises';
import { FileParser } from './file-parser.js';
import { taskQueue, TaskStatus } from './task-queue.js';
import {
  initializeDatabase,
  getAllRSSFeeds,
  getAllCategories,
  addRSSFeeds,
  updateRSSFeedCategory,
  getSystemConfig,
  updateSystemConfigs,
  getRSSFeedsWithPagination
} from './database/db.js';

// 计算 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 文件上传配置
const upload = multer({
  dest: path.join(__dirname, '../temp'),
  limits: {
    fileSize: 10 * 1024 * 1024 // 限制文件大小为 10MB
  },
  fileFilter: (req, file, cb) => {
    // 允许的文件类型
    const allowedTypes = [
      'text/plain',
      'text/html',
      'application/xml',
      'application/json',
      'text/xml',
      'text/x-opml',
      'application/opml+xml'
    ];

    // 检查文件类型或扩展名
    const isAllowedType = allowedTypes.includes(file.mimetype);
    const isAllowedExtension = ['.txt', '.html', '.xml', '.json', '.opml'].some(ext =>
      file.originalname.toLowerCase().endsWith(ext)
    );

    if (isAllowedType || isAllowedExtension) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型。请上传文本文件、HTML文件、XML文件、JSON文件或OPML文件。'), false);
    }
  }
});

// 确保临时目录存在
fs.mkdir(path.join(__dirname, '../temp'), { recursive: true }).catch(err => {
  console.warn('创建临时目录失败:', err.message);
});

const app = express();
const PORT = 3000;

// 初始化数据库
initializeDatabase().catch(error => {
  console.error('数据库初始化失败:', error);
  process.exit(1);
});

// 确保运行时目录存在
WorkflowManager.ensureRuntimeDirectories().catch(error => {
  console.warn('创建运行时目录失败:', error.message);
});

// 中间件
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/data/reports', express.static(path.join(__dirname, '../data/reports')));
app.use('/output', express.static(path.join(__dirname, '../output')));

// 设置模板引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 路由
app.get('/', async (req, res) => {
  try {
    const config = await WorkflowManager.loadConfig();

    // 获取最近的报告
    const reportsDir = path.join(__dirname, '../data/reports');
    const fs = await import('fs/promises');
    await fs.mkdir(reportsDir, { recursive: true });
    const reportFiles = await fs.readdir(reportsDir);

    const jsonFiles = reportFiles
      .filter(filename => filename.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, 10); // 只返回最新的10个报告

    const reports = [];
    for (const filename of jsonFiles) {
      const filePath = path.join(reportsDir, filename);
      const content = await fs.readFile(filePath, 'utf8');
      const report = JSON.parse(content);
      reports.push({
        filename: filename.replace('.json', '.html'),
        startTime: report.startTime,
        duration: report.duration,
        generatedBlogs: report.generatedBlogs
      });
    }

    res.render('index', { config, reports });
  } catch (error) {
    console.error('主页加载失败:', error);
    res.render('index', { config: null, reports: null, error: error.message });
  }
});

// 执行完整工作流（异步）
app.post('/api/start', async (req, res) => {
  try {
    const { aiModel, outputStyle, outputDir, articleCount } = req.body;
    const options = {
      aiModel: aiModel,
      outputStyle: outputStyle,
      outputDir: outputDir,
      articleCount: articleCount
    };

    const taskId = taskQueue.createTask('fullWorkflow', { options });

    // 异步执行任务
    WorkflowManager.executeFullWorkflow(1, options, (progress, step, message) => {
      taskQueue.updateProgress(taskId, progress, step, message);
    }, taskId).catch(error => {
      console.error('工作流执行失败:', error);
      const task = taskQueue.getTask(taskId);
      if (task) {
        task.status = 'failed';
        task.error = error.message;
        task.endTime = new Date();
      }
    });

    res.json({ success: true, taskId: taskId, message: '任务已创建' });
  } catch (error) {
    console.error('创建任务失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取RSS源列表（按分类分组）
app.get('/api/rss-feeds', async (req, res) => {
  try {
    const { grouped = 'true' } = req.query;
    const rssFeeds = await getAllRSSFeeds();

    if (grouped === 'true') {
      // 按分类分组
      const feedsByCategory = rssFeeds.reduce((acc, feed) => {
        const category = feed.category || '未分类';
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(feed);
        return acc;
      }, {});

      // 转换为数组格式并按分类排序
      const groupedFeeds = Object.keys(feedsByCategory)
        .sort()
        .map(category => ({
          category: category,
          feeds: feedsByCategory[category].sort((a, b) => a.name.localeCompare(b.name))
        }));

      res.json(groupedFeeds);
    } else {
      // 返回扁平列表
      res.json(rssFeeds.sort((a, b) => a.name.localeCompare(b.name)));
    }
  } catch (error) {
    console.error('获取RSS源列表失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取所有分类列表
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await getAllCategories();
    res.json(categories.sort());
  } catch (error) {
    console.error('获取分类列表失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 更新RSS源分类
app.post('/api/rss-feeds/:name/category', async (req, res) => {
  try {
    const { name } = req.params;
    const { category } = req.body;

    // 由于name可能不唯一，我们使用url进行查找
    // 首先获取所有RSS源，找到匹配name的源
    const allFeeds = await getAllRSSFeeds();
    const feed = allFeeds.find(f => f.name === name);

    if (!feed) {
      return res.status(404).json({ success: false, message: '未找到指定的RSS源' });
    }

    await updateRSSFeedCategory(feed.url, category || '未分类');
    res.json({ success: true, message: '分类更新成功' });
  } catch (error) {
    console.error('更新RSS源分类失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 只抓取文章（支持选择性抓取，异步）
app.post('/api/fetch', async (req, res) => {
  try {
    const { selectedFeeds } = req.body; // 可选参数，要抓取的RSS源名称列表

    const taskId = taskQueue.createTask('fetchWorkflow', { selectedFeeds });

    // 异步执行任务
    WorkflowManager.executeFetchWorkflow(selectedFeeds, (progress, step, message) => {
      taskQueue.updateProgress(taskId, progress, step, message);
    }, taskId).catch(error => {
      console.error('抓取任务执行失败:', error);
      const task = taskQueue.getTask(taskId);
      if (task) {
        task.status = 'failed';
        task.error = error.message;
        task.endTime = new Date();
      }
    });

    res.json({ success: true, taskId: taskId, message: '任务已创建' });
  } catch (error) {
    console.error('创建抓取任务失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 只分析文章（异步）
app.post('/api/analyze', async (req, res) => {
  try {
    const { aiModel, outputStyle, outputDir, articleCount } = req.body;
    const options = {
      aiModel: aiModel,
      outputStyle: outputStyle,
      outputDir: outputDir,
      articleCount: articleCount
    };

    const taskId = taskQueue.createTask('analyzeWorkflow', { options });

    // 异步执行任务
    WorkflowManager.analyzeExistingArticles(1, options, (progress, step, message) => {
      taskQueue.updateProgress(taskId, progress, step, message);
    }, taskId).catch(error => {
      console.error('分析任务执行失败:', error);
      const task = taskQueue.getTask(taskId);
      if (task) {
        task.status = 'failed';
        task.error = error.message;
        task.endTime = new Date();
      }
    });

    res.json({ success: true, taskId: taskId, message: '任务已创建' });
  } catch (error) {
    console.error('创建分析任务失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 增量更新

// 获取统计信息
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await ArticleRepository.getArticleStats();
    res.json(stats);
  } catch (error) {
    console.error('获取统计信息失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取所有文章列表
app.get('/api/all-articles', async (req, res) => {
  try {
    const articles = await ArticleRepository.getAllArticles();
    res.json(articles);
  } catch (error) {
    console.error('获取所有文章列表失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取未处理文章列表
app.get('/api/unprocessed-articles', async (req, res) => {
  try {
    const articles = await ArticleRepository.getUnprocessedArticles();
    res.json(articles);
  } catch (error) {
    console.error('获取未处理文章列表失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取已处理文章列表
app.get('/api/processed-articles', async (req, res) => {
  try {
    const articles = await ArticleRepository.getProcessedArticles();
    res.json(articles);
  } catch (error) {
    console.error('获取已处理文章列表失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取支持的AI模型列表
app.get('/api/ai-models', (req, res) => {
  try {
    const models = [
      { value: 'deepseek', label: 'DeepSeek', description: '深度搜索AI模型' },
      { value: 'zhipu', label: '智谱AI', description: '智谱GLM系列模型' },
      { value: 'kimi', label: 'Kimi', description: 'MoonShot Kimi模型' },
      { value: 'anthropic', label: 'Anthropic', description: 'Claude模型' },
      { value: 'ark', label: '方舟', description: '字节跳动方舟模型' }
    ];
    res.json(models);
  } catch (error) {
    console.error('获取AI模型列表失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 文件上传 API
app.post('/api/upload-file', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '请选择要上传的文件' });
    }

    console.log('文件上传成功:', req.file.originalname);

    // 解析文件内容，提取 RSS 链接
    const rssLinks = await FileParser.parseFile(req.file.path);

    // 去重
    const existingFeeds = await getAllRSSFeeds();
    const existingUrls = new Set(existingFeeds.map(feed => feed.url));

    // 为每个链接生成完整的信息
    const parsedFeeds = [];
    const uniqueLinks = new Set();

    for (const link of rssLinks) {
      // 确保链接唯一性
      if (uniqueLinks.has(link.url)) {
        continue;
      }
      uniqueLinks.add(link.url);

      // 检查是否已存在
      const isExisting = existingUrls.has(link.url);

      parsedFeeds.push({
        url: link.url,
        name: link.name || (link.title || FileParser.extractTitleFromUrl(link.url)),
        category: link.category || '未分类',
        htmlUrl: link.htmlUrl,
        isExisting: isExisting
      });
    }

    // 清理临时文件
    await fs.unlink(req.file.path);

    res.json({
      success: true,
      message: `文件解析成功，找到 ${parsedFeeds.length} 个 RSS 链接，其中 ${parsedFeeds.filter(f => !f.isExisting).length} 个是新源`,
      data: {
        totalLinks: parsedFeeds.length,
        newFeeds: parsedFeeds.filter(f => !f.isExisting).length,
        feeds: parsedFeeds
      }
    });
  } catch (error) {
    console.error('文件上传和解析失败:', error);

    // 清理临时文件
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.warn('清理临时文件失败:', unlinkError.message);
      }
    }

    res.status(500).json({ success: false, message: error.message });
  }
});

// 导入选中的 RSS 源 API
app.post('/api/import-feeds', async (req, res) => {
  try {
    const { feeds } = req.body;

    if (!feeds || !Array.isArray(feeds) || feeds.length === 0) {
      return res.status(400).json({ success: false, message: '请选择要导入的 RSS 源' });
    }

    console.log('开始导入选中的 RSS 源:', feeds.length);

    // 去重和验证
    const validFeeds = [];
    const existingFeeds = await getAllRSSFeeds();
    const existingUrls = new Set(existingFeeds.map(feed => feed.url));

    for (const feed of feeds) {
      // 验证 URL 格式
      if (feed.url && !existingUrls.has(feed.url)) {
        try {
          new URL(feed.url);
          validFeeds.push({
            name: feed.name || FileParser.extractTitleFromUrl(feed.url),
            url: feed.url,
            category: feed.category || '未分类'
          });
          existingUrls.add(feed.url); // 防止重复导入
        } catch (error) {
          console.warn('无效的 RSS 链接，已跳过:', feed.url);
        }
      }
    }

    if (validFeeds.length > 0) {
      await addRSSFeeds(validFeeds);
    }

    res.json({
      success: true,
      message: `成功导入 ${validFeeds.length} 个 RSS 源`,
      data: {
        importedFeeds: validFeeds,
        skippedFeeds: feeds.length - validFeeds.length
      }
    });
  } catch (error) {
    console.error('导入 RSS 源失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});


// 获取支持的输出风格列表
app.get('/api/output-styles', (req, res) => {
  try {
    const styles = ArticleFormatter.getSupportedStyles();
    res.json(styles);
  } catch (error) {
    console.error('获取输出风格列表失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 文章生成API（支持更多选项）
app.post('/api/generate-article', async (req, res) => {
  try {
    const { selectedArticles, aiModel, outputStyle, outputDir } = req.body;
    const options = {};

    if (selectedArticles && selectedArticles.length > 0) {
      options.selectedArticles = selectedArticles;
    }

    if (aiModel) {
      options.aiModel = aiModel;
    }

    if (outputStyle) {
      options.outputStyle = outputStyle;
    }

    if (outputDir) {
      options.outputDir = outputDir;
    }

    const taskId = taskQueue.createTask('analyzeWorkflow', { options });

    // 异步执行任务
    WorkflowManager.analyzeExistingArticles(1, options, (progress, step, message) => {
      taskQueue.updateProgress(taskId, progress, step, message);
    }, taskId).catch(error => {
      console.error('分析文章任务执行失败:', error);
      const task = taskQueue.getTask(taskId);
      if (task) {
        task.status = 'failed';
        task.error = error.message;
        task.endTime = new Date();
      }
    });

    res.json({ success: true, taskId: taskId, message: '任务已创建' });
  } catch (error) {
    console.error('创建分析文章任务失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 重新生成文章API
app.post('/api/regenerate-article', async (req, res) => {
  try {
    const { articleId, aiModel, outputStyle, outputDir } = req.body;
    const options = {};

    if (aiModel) {
      options.aiModel = aiModel;
    }

    if (outputStyle) {
      options.outputStyle = outputStyle;
    }

    if (outputDir) {
      options.outputDir = outputDir;
    }

    // 这里需要实现重新生成逻辑，目前可以使用相同的方法
    const result = await WorkflowManager.analyzeExistingArticles(1, options);
    res.json(result);
  } catch (error) {
    console.error('重新生成文章失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取报告
app.get('/api/reports', async (req, res) => {
  try {
    const reportsDir = path.join(__dirname, '../data/reports');
    const fs = await import('fs/promises');
    await fs.mkdir(reportsDir, { recursive: true });
    const reportFiles = await fs.readdir(reportsDir);

    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || '10', 10), 1), 50);
    const search = (req.query.search || '').toString().trim().toLowerCase();

    const jsonFiles = reportFiles
      .filter(filename => filename.endsWith('.json'))
      .sort()
      .reverse();

    const reports = [];
    for (const filename of jsonFiles) {
      const filePath = path.join(reportsDir, filename);
      const content = await fs.readFile(filePath, 'utf8');
      const report = JSON.parse(content);
      const htmlFilename = filename.replace('.json', '.html');

      const matchesSearch = !search ||
        htmlFilename.toLowerCase().includes(search) ||
        (report.startTime || '').toLowerCase().includes(search) ||
        (report.duration || '').toLowerCase().includes(search) ||
        String(report.generatedBlogs ?? '').toLowerCase().includes(search);

      if (matchesSearch) {
        reports.push({
          filename: htmlFilename,
          startTime: report.startTime,
          duration: report.duration,
          generatedBlogs: report.generatedBlogs
        });
      }
    }

    const total = reports.length;
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const pagedReports = reports.slice(start, start + pageSize);

    res.json({
      page: safePage,
      pageSize,
      total,
      totalPages,
      items: pagedReports
    });
  } catch (error) {
    console.error('获取报告失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取最新报告的详细内容
app.get('/api/reports/:filename', async (req, res) => {
  try {
    const raw = req.params.filename;
    const filename = path.basename(raw);
    const isAllowed = /^report-\d+\.(json|html)$/.test(filename);
    if (!isAllowed) {
      return res.status(400).json({ success: false, message: '非法报告文件名' });
    }

    const reportPath = path.join(__dirname, '../data/reports', filename);
    const fs = await import('fs/promises');
    const content = await fs.readFile(reportPath, 'utf8');
    if (filename.endsWith('.json')) {
      const report = JSON.parse(content);
      return res.json(report);
    }

    res.type('html').send(content);
  } catch (error) {
    console.error('获取报告详细内容失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取所有任务
app.get('/api/tasks', (req, res) => {
  const tasks = taskQueue.getTasks();
  res.json(tasks);
});

// 获取单个任务详情
app.get('/api/tasks/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = taskQueue.getTask(taskId);
  if (!task) {
    return res.status(404).json({ success: false, message: '任务不存在' });
  }
  res.json(task);
});

// 取消任务
app.post('/api/tasks/:taskId/cancel', (req, res) => {
  const { taskId } = req.params;
  const task = taskQueue.getTask(taskId);
  if (!task) {
    return res.status(404).json({ success: false, message: '任务不存在' });
  }

  taskQueue.cancelTask(taskId);
  res.json({ success: true, message: '任务已取消' });
});

// 删除报告
app.delete('/api/reports/:filename', async (req, res) => {
  try {
    const fs = await import('fs/promises');
    const raw = req.params.filename;
    const filename = path.basename(raw);
    const isAllowed = /^report-\d+\.(json|html)$/.test(filename);
    if (!isAllowed) {
      return res.status(400).json({ success: false, message: '非法报告文件名' });
    }

    const reportPath = path.join(__dirname, '../data/reports', filename);

    // 检查文件是否存在
    try {
      await fs.access(reportPath);
    } catch (error) {
      return res.status(404).json({ success: false, message: '报告文件不存在' });
    }

    // 删除报告文件
    await fs.unlink(reportPath);

    // 同时删除对应的HTML报告（如果存在）
    if (filename.endsWith('.json')) {
      const htmlFilename = filename.replace('.json', '.html');
      const htmlPath = path.join(__dirname, '../data/reports', htmlFilename);
      try {
        await fs.access(htmlPath);
        await fs.unlink(htmlPath);
      } catch (error) {
        console.warn(`HTML报告文件不存在: ${htmlFilename}`);
      }
    } else if (filename.endsWith('.html')) {
      const jsonFilename = filename.replace('.html', '.json');
      const jsonPath = path.join(__dirname, '../data/reports', jsonFilename);
      try {
        await fs.access(jsonPath);
        await fs.unlink(jsonPath);
      } catch (error) {
        console.warn(`JSON报告文件不存在: ${jsonFilename}`);
      }
    }

    res.json({ success: true, message: '报告删除成功' });
  } catch (error) {
    console.error('删除报告失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 系统清理
app.post('/api/cleanup', async (req, res) => {
  try {
    const result = await WorkflowManager.executeCleanupWorkflow();
    res.json(result);
  } catch (error) {
    console.error('系统清理失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 配置界面路由
app.get('/config', async (req, res) => {
  try {
    const config = await WorkflowManager.loadConfig();
    res.render('config', { config });
  } catch (error) {
    console.error('加载配置界面失败:', error);
    res.render('config', { config: null, error: error.message });
  }
});

// 统计信息界面路由
app.get('/stats', async (req, res) => {
  try {
    const stats = await ArticleRepository.getArticleStats();
    res.render('stats', { stats, error: null });
  } catch (error) {
    console.error('加载统计信息界面失败:', error);
    res.render('stats', { stats: null, error: error.message });
  }
});

// AI分析详情界面路由
app.get('/analysis', async (req, res) => {
  try {
    const reportsDir = path.join(__dirname, '../data/reports');
    const fs = await import('fs/promises');
    await fs.mkdir(reportsDir, { recursive: true });
    const reportFiles = await fs.readdir(reportsDir);

    const jsonFiles = reportFiles
      .filter(filename => filename.endsWith('.json'))
      .sort()
      .reverse();

    if (jsonFiles.length === 0) {
      return res.render('analysis', { analysisResults: [], error: null });
    }

    const latestReport = jsonFiles[0];
    const reportPath = path.join(reportsDir, latestReport);
    const content = await fs.readFile(reportPath, 'utf8');
    const report = JSON.parse(content);
    const analysisResults = report.analysisResults || [];

    res.render('analysis', { analysisResults, error: null });
  } catch (error) {
    console.error('加载AI分析界面失败:', error);
    res.render('analysis', { analysisResults: [], error: error.message });
  }
});

// 获取配置API
app.get('/api/config', async (req, res) => {
  try {
    const config = await getSystemConfig();
    res.json({
      apiKey: config.api_key || '',
      apiBase: config.api_base || '',
      apiModel: config.api_model || 'default',
      outputDir: config.output_dir || './output',
      imagesDir: config.images_dir || './images',
      defaultStyle: config.default_style || 'jekyll',
      articleLength: parseInt(config.article_length) || 6000,
      articlesPerBlog: parseInt(config.articles_per_blog) || 6,
      language: config.language || 'zh',
      rssCache: parseInt(config.rss_cache) || 6
    });
  } catch (error) {
    console.error('获取配置失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 保存配置API
app.post('/api/config', async (req, res) => {
  try {
    const { apiKey, apiBase, apiModel, outputDir, imagesDir, defaultStyle, articleLength, articlesPerBlog, language, rssCache } = req.body;

    // 保存环境变量
    process.env.OPENAI_API_KEY = apiKey;
    process.env.OPENAI_API_BASE = apiBase;

    // 更新数据库配置
    const configs = {
      api_key: apiKey,
      api_base: apiBase,
      api_model: apiModel,
      output_dir: outputDir,
      images_dir: imagesDir,
      default_style: defaultStyle,
      article_length: articleLength.toString(),
      articles_per_blog: articlesPerBlog.toString(),
      language: language,
      rss_cache: rssCache.toString()
    };

    await updateSystemConfigs(configs);

    res.json({ success: true, message: '配置保存成功' });
  } catch (error) {
    console.error('保存配置失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 分页获取RSS源API
app.get('/api/rss-feeds/paginated', async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 20,
      category = null,
      search = null
    } = req.query;

    const result = await getRSSFeedsWithPagination(
      parseInt(page),
      parseInt(pageSize),
      category || null,
      search || null
    );

    res.json({
      success: true,
      data: result.data,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages
      }
    });
  } catch (error) {
    console.error('获取RSS源列表失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 辅助方法：从 URL 中提取标题
app.locals.extractTitleFromUrl = function(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    return '未知来源';
  }
};

// 启动服务器
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`\n========================================`);
  console.log(`FeedFlow - RSS内容提取与格式化系统`);
  console.log(`========================================`);
  console.log(`服务器已启动，访问地址: http://${HOST}:${PORT}`);
  console.log(`配置界面: http://${HOST}:${PORT}/config`);
  console.log(`========================================\n`);
});
