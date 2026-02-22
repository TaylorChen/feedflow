import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchRSSFeeds } from '../rss-fetcher.js';
import { StorageManager } from '../data/storage/StorageManager.js';
import { ArticleRepository } from '../data/repositories/ArticleRepository.js';
import { StrategyExecutor } from '../analysis/StrategyExecutor.js';
import { taskQueue, TaskStatus } from '../task-queue.js';
import { getAllRSSFeeds } from '../database/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config();

/**
 * 工作流管理器
 * 协调整个博客生成过程
 */
class WorkflowManager {
  /**
   * 加载系统配置
   * @returns {Promise<Object>} 系统配置
   */
  static async loadConfig() {
    const configPath = path.join(__dirname, '../../config.json');
    const configData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);

    await this.ensureRuntimeDirectories();

    // 加载RSS源配置（从数据库）
    config.rssFeeds = await getAllRSSFeeds();

    // 设置默认值
    config.article = config.article || {
      categories: ['技术', '周刊'],
      defaultTags: ['技术', '周刊'],
      targetLength: 5000
    };

    config.output = config.output || {
      postsDir: '~/go/TaylorChen.github.io/_posts',
      imagesDir: '~/go/TaylorChen.github.io/assets/images'
    };

    config.analysis = config.analysis || {
      minNoveltyScore: 6,
      minImpactScore: 6,
      minValueScore: 8,
      maxTopics: 5
    };

    return config;
  }

  static async ensureRuntimeDirectories() {
    const dirs = [
      path.join(__dirname, '../../data'),
      path.join(__dirname, '../../data/reports'),
      path.join(__dirname, '../../data/articles'),
      path.join(__dirname, '../../data/articles/raw'),
      path.join(__dirname, '../../data/processed'),
      path.join(__dirname, '../../output'),
      path.join(__dirname, '../../images'),
      path.join(__dirname, '../../temp')
    ];

    await Promise.all(dirs.map((dir) => fs.mkdir(dir, { recursive: true })));
  }

  /**
   * 完整工作流执行（异步任务版本）
   * @param {number} blogCount - 要生成的博客数量
   * @param {Object} options - 执行选项
   * @param {Function} progressCallback - 进度回调函数
   * @param {string} taskId - 外部传递的任务ID（可选）
   * @returns {Promise<Object>} 执行结果
   */
  static async executeFullWorkflow(blogCount = 1, options = {}, progressCallback = null, taskId = null) {
    // 如果没有传递任务ID，创建新的任务ID
    if (!taskId) {
      taskId = taskQueue.createTask('fullWorkflow', { blogCount, options });
    }

    try {
      await taskQueue.startTask(taskId, async (progress, step, message) => {
        const start = Date.now();

        // 1. 加载系统配置
        const progress1 = 10;
        const step1 = '加载配置';
        const message1 = '正在加载系统配置';
        progress( progress1, step1, message1);
        if (progressCallback) {
          progressCallback(progress1, step1, message1);
        }
        const config = await this.loadConfig();
        console.log('\n📋 配置信息:');
        console.log(`  RSS源数量: ${config.rssFeeds.length}`);
        console.log(`  目标字数: ${config.article.targetLength}`);
        console.log(`  输出目录: ${options.outputDir || config.output.postsDir}`);

        // 2. 抓取RSS内容
        const progress2 = 25;
        const step2 = '抓取RSS';
        const message2 = '正在抓取RSS内容';
        progress( progress2, step2, message2);
        if (progressCallback) {
          progressCallback(progress2, step2, message2);
        }
        console.log('\n' + '='.repeat(60));
        console.log('步骤 1/5: 抓取RSS内容');
        console.log('='.repeat(60));
        const articles = await fetchRSSFeeds(config.rssFeeds, 3);
        console.log(`\n✓ 共抓取了 ${articles.length} 篇文章`);

        if (articles.length === 0) {
          return this.createWorkflowResult(false, '没有抓取到任何文章');
        }

        // 3. 存储抓取的文章
        const progress3 = 50;
        const step3 = '存储文章';
        const message3 = '正在存储文章内容';
        progress( progress3, step3, message3);
        if (progressCallback) {
          progressCallback(progress3, step3, message3);
        }
        console.log('\n' + '='.repeat(60));
        console.log('步骤 2/5: 存储文章内容');
        console.log('='.repeat(60));

        for (const article of articles) {
          await StorageManager.saveArticle(article);
        }
        console.log(`✓ 已存储 ${articles.length} 篇文章`);

        // 4. 执行博客生成策略
        const progress4 = 70;
        const step4 = '分析文章';
        const message4 = '正在分析和生成博客';
        progress( progress4, step4, message4);
        if (progressCallback) {
          progressCallback(progress4, step4, message4);
        }
        console.log('\n' + '='.repeat(60));
        console.log('步骤 3/5: 执行博客生成策略');
        console.log('='.repeat(60));

        const generatedBlogs = await StrategyExecutor.executeStrategy(config, blogCount, options);

        // 5. 生成报告
        const progress5 = 90;
        const step5 = '生成报告';
        const message5 = '正在生成执行报告';
        progress( progress5, step5, message5);
        if (progressCallback) {
          progressCallback(progress5, step5, message5);
        }
        console.log('\n' + '='.repeat(60));
        console.log('步骤 4/5: 生成执行报告');
        console.log('='.repeat(60));

        const report = await this.generateReport(generatedBlogs, config, start);

        // 6. 保存报告
        const progress6 = 95;
        const step6 = '保存报告';
        const message6 = '正在保存执行报告';
        progress( progress6, step6, message6);
        if (progressCallback) {
          progressCallback(progress6, step6, message6);
        }
        await this.saveReport(report);

        const progress7 = 100;
        const step7 = '完成';
        const message7 = '工作流执行完成';
        progress( progress7, step7, message7);
        if (progressCallback) {
          progressCallback(progress7, step7, message7);
        }
        console.log('\n' + '='.repeat(60));
        console.log('✅ 工作流执行完成！');
        console.log('='.repeat(60));

        return report;
      });

      const task = taskQueue.getTask(taskId);
      if (task.status === TaskStatus.COMPLETED) {
        return task.result;
      } else if (task.status === TaskStatus.FAILED) {
        throw task.error;
      } else {
        throw new Error(`任务 ${taskId} 状态异常: ${task.status}`);
      }

    } catch (error) {
      console.error('\n❌ 工作流执行失败:', error);
      return this.createWorkflowResult(false, '工作流执行失败', error);
    }
  }

  /**
   * 增量更新工作流
   * 只处理新文章，不重新抓取全部
   * @param {number} blogCount - 要生成的博客数量
   * @param {Object} options - 执行选项
   */
  static async executeIncrementalWorkflow(blogCount = 1, options = {}) {
    console.log('='.repeat(60));
    console.log('技术文章聚合与博客生成系统 - 增量更新');
    console.log('='.repeat(60));

    const start = Date.now();

    try {
      const config = await this.loadConfig();

      // 检查是否有新文章
      const existingArticles = await ArticleRepository.getAllArticles();
      const processedMetadata = await ArticleRepository.getProcessedArticles();

      if (existingArticles.length === processedMetadata.length) {
        return this.createWorkflowResult(false, '没有新文章需要处理');
      }

      // 执行博客生成策略
      const generatedBlogs = await StrategyExecutor.executeStrategy(config, blogCount, options);

      const report = await this.generateReport(generatedBlogs, config, start);
      await this.saveReport(report);

      return report;

    } catch (error) {
      console.error('增量更新失败:', error);
      return this.createWorkflowResult(false, '增量更新失败', error);
    }
  }

  /**
   * 分析现有文章（异步任务版本）
   * 不抓取新文章，只分析现有文章
   * @param {number} blogCount - 要生成的博客数量
   * @param {Object} options - 执行选项
   * @param {Function} progressCallback - 进度回调函数
   * @param {string} taskId - 外部传递的任务ID（可选）
   */
  static async analyzeExistingArticles(blogCount = 1, options = {}, progressCallback = null, taskId = null) {
    // 如果没有传递任务ID，创建新的任务ID
    if (!taskId) {
      taskId = taskQueue.createTask('analyzeWorkflow', { blogCount, options });
    }

    try {
      await taskQueue.startTask(taskId, async (progress, step, message) => {
        const start = Date.now();

        // 1. 加载系统配置
        const progress1 = 10;
        const step1 = '加载配置';
        const message1 = '正在加载系统配置';
        progress( progress1, step1, message1);
        if (progressCallback) {
          progressCallback(progress1, step1, message1);
        }
        const config = await this.loadConfig();

        // 2. 执行博客生成策略
        const progress2 = 50;
        const step2 = '分析文章';
        const message2 = '正在分析文章和生成博客';
        progress( progress2, step2, message2);
        if (progressCallback) {
          progressCallback(progress2, step2, message2);
        }
        const generatedBlogs = await StrategyExecutor.executeStrategy(config, blogCount, options);

        // 3. 生成报告
        const progress3 = 90;
        const step3 = '生成报告';
        const message3 = '正在生成执行报告';
        progress( progress3, step3, message3);
        if (progressCallback) {
          progressCallback(progress3, step3, message3);
        }
        const report = await this.generateReport(generatedBlogs, config, start);
        await this.saveReport(report);

        const progress4 = 100;
        const step4 = '完成';
        const message4 = '分析文章执行完成';
        progress( progress4, step4, message4);
        if (progressCallback) {
          progressCallback(progress4, step4, message4);
        }
        return report;
      });

      const task = taskQueue.getTask(taskId);
      if (task.status === TaskStatus.COMPLETED) {
        return task.result;
      } else if (task.status === TaskStatus.FAILED) {
        throw task.error;
      } else {
        throw new Error(`任务 ${taskId} 状态异常: ${task.status}`);
      }

    } catch (error) {
      console.error('分析现有文章失败:', error);
      return this.createWorkflowResult(false, '分析现有文章失败', error);
    }
  }

  /**
   * 选择性抓取工作流（异步任务版本）
   * 只抓取指定的RSS源
   * @param {Array} selectedFeeds - 要抓取的RSS源名称列表（可选）
   * @param {Function} progressCallback - 进度回调函数
   * @param {string} taskId - 外部传递的任务ID（可选）
   * @returns {Promise<Object>} 执行结果
   */
  static async executeFetchWorkflow(selectedFeeds = null, progressCallback = null, taskId = null) {
    // 如果没有传递任务ID，创建新的任务ID
    if (!taskId) {
      taskId = taskQueue.createTask('fetchWorkflow', { selectedFeeds });
    }

    try {
      await taskQueue.startTask(taskId, async (progress, step, message) => {
        const start = Date.now();

        // 1. 加载系统配置
        const progress1 = 15;
        const step1 = '加载配置';
        const message1 = '正在加载系统配置';
        progress( progress1, step1, message1);
        if (progressCallback) {
          progressCallback(progress1, step1, message1);
        }
        const config = await this.loadConfig();

        // 选择要抓取的RSS源
        let feedsToFetch = config.rssFeeds;
        if (selectedFeeds && selectedFeeds.length > 0) {
          feedsToFetch = config.rssFeeds.filter(feed => selectedFeeds.includes(feed.name));
          console.log(`\n📋 选择了 ${feedsToFetch.length} 个RSS源进行抓取`);
        } else {
          console.log(`\n📋 抓取所有 ${feedsToFetch.length} 个RSS源`);
        }

        console.log('📋 配置信息:');
        console.log(`  RSS源数量: ${feedsToFetch.length}`);
        console.log(`  输出目录: ${config.output.postsDir}`);

        // 2. 抓取RSS内容
        const progress2 = 45;
        const step2 = '抓取RSS';
        const message2 = '正在抓取RSS内容';
        progress( progress2, step2, message2);
        if (progressCallback) {
          progressCallback(progress2, step2, message2);
        }
        console.log('\n' + '='.repeat(60));
        console.log('步骤 1/3: 抓取RSS内容');
        console.log('='.repeat(60));
        const articles = await fetchRSSFeeds(feedsToFetch, 3);
        console.log(`\n✓ 共抓取了 ${articles.length} 篇文章`);

        if (articles.length === 0) {
          const progress3 = 100;
          const step3 = '完成';
          const message3 = '没有抓取到任何文章';
          progress( progress3, step3, message3);
          if (progressCallback) {
            progressCallback(progress3, step3, message3);
          }
          return this.createWorkflowResult(false, '没有抓取到任何文章');
        }

        // 3. 存储抓取的文章
        const progress4 = 75;
        const step4 = '存储文章';
        const message4 = '正在存储文章内容';
        progress( progress4, step4, message4);
        if (progressCallback) {
          progressCallback(progress4, step4, message4);
        }
        console.log('\n' + '='.repeat(60));
        console.log('步骤 2/3: 存储文章内容');
        console.log('='.repeat(60));

        for (const article of articles) {
          await StorageManager.saveArticle(article);
        }
        console.log(`✓ 已存储 ${articles.length} 篇文章`);

        // 4. 生成报告
        const progress5 = 90;
        const step5 = '生成报告';
        const message5 = '正在生成执行报告';
        progress( progress5, step5, message5);
        if (progressCallback) {
          progressCallback(progress5, step5, message5);
        }
        console.log('\n' + '='.repeat(60));
        console.log('步骤 3/3: 生成执行报告');
        console.log('='.repeat(60));

        const stats = await ArticleRepository.getArticleStats();
        const report = {
          success: true,
          startTime: new Date(start).toISOString(),
          duration: this.formatDuration(Date.now() - start),
          generatedBlogs: 0, // 只抓取文章，不生成博客
          articleStats: stats,
          configSummary: {
            rssFeedCount: feedsToFetch.length,
            articlesFetched: articles.length
          },
          systemInfo: {
            nodeVersion: process.version,
            memoryUsage: process.memoryUsage(),
            cpuUsage: process.cpuUsage()
          }
        };

        await this.saveReport(report);

        const progress6 = 100;
        const step6 = '完成';
        const message6 = '选择性抓取执行完成';
        progress( progress6, step6, message6);
        if (progressCallback) {
          progressCallback(progress6, step6, message6);
        }
        console.log('\n' + '='.repeat(60));
        console.log('✅ 选择性抓取执行完成！');
        console.log('='.repeat(60));

        return this.createWorkflowResult(true, '选择性抓取执行成功', report);
      });

      const task = taskQueue.getTask(taskId);
      if (task.status === TaskStatus.COMPLETED) {
        return task.result;
      } else if (task.status === TaskStatus.FAILED) {
        throw task.error;
      } else {
        throw new Error(`任务 ${taskId} 状态异常: ${task.status}`);
      }

    } catch (error) {
      console.error('\n❌ 选择性抓取执行失败:', error);
      return this.createWorkflowResult(false, '选择性抓取执行失败', error);
    }
  }

  /**
   * 系统清理工作流
   * 删除临时文件，优化存储
   */
  static async executeCleanupWorkflow() {
    console.log('='.repeat(60));
    console.log('技术文章聚合与博客生成系统 - 系统清理');
    console.log('='.repeat(60));

    try {
      // 清理无效文件
      console.log('清理无效的文章文件...');
      await StorageManager.cleanupInvalidFiles();

      // 优化存储
      const stats = await StorageManager.getStorageStats();
      console.log('存储优化完成');
      console.log(`文章数量: ${stats.totalArticles}`);
      console.log(`处理率: ${((stats.processedArticles / stats.totalArticles) * 100).toFixed(1)}%`);
      console.log(`存储大小: ${(stats.storageSize / 1024).toFixed(1)} KB`);

      return this.createWorkflowResult(true, '系统清理完成', stats);

    } catch (error) {
      console.error('清理工作流失败:', error);
      return this.createWorkflowResult(false, '系统清理失败', error);
    }
  }

  /**
   * 生成执行报告
   */
  static async generateReport(generatedBlogs, config, startTime) {
    const duration = Date.now() - startTime;
    const stats = await ArticleRepository.getArticleStats();
    const analysisResults = generatedBlogs
      .filter(blog => blog.analysis)
      .map(blog => ({
        title: blog.title,
        analysis: blog.analysis
      }));

    return {
      success: true,
      startTime: new Date(startTime).toISOString(),
      duration: this.formatDuration(duration),
      generatedBlogs: generatedBlogs.length,
      blogs: generatedBlogs,
      analysisResults,
      articleStats: stats,
      configSummary: {
        rssFeedCount: config.rssFeeds.length,
        articlesPerBlog: config.strategy.articlesPerBlog || 5,
        wordCount: config.strategy.wordCount || 5000,
        analysis: config.analysis || {}
      },
      systemInfo: {
        nodeVersion: process.version,
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage()
      }
    };
  }

  /**
   * 保存执行报告
   * @param {Object} report - 执行报告
   */
  static async saveReport(report) {
    const reportDir = path.join(__dirname, '../../data/reports');
    await fs.mkdir(reportDir, { recursive: true });

    const timestamp = Date.now();
    const jsonFilename = `report-${timestamp}.json`;
    const jsonPath = path.join(reportDir, jsonFilename);
    await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));

    console.log(`✓ 执行报告已保存: ${jsonFilename}`);

    // 同时保存HTML格式的报告
    await this.saveHTMLReport(report, reportDir, timestamp);
  }

  /**
   * 保存HTML格式的报告
   */
  static async saveHTMLReport(report, reportDir, timestamp) {
    const html = this.generateHTMLReport(report);
    const htmlFilename = `report-${timestamp}.html`;
    const htmlPath = path.join(reportDir, htmlFilename);
    await fs.writeFile(htmlPath, html);
  }

  /**
   * 生成HTML格式的报告
   */
  static generateHTMLReport(report) {
    let blogsHTML = '';
    if (report.blogs && report.blogs.length > 0) {
      blogsHTML = report.blogs.map(blog => `
        <div class="blog">
          <h3>${blog.title}</h3>
          <p class="description">${blog.description}</p>
          <p class="stats">
            <span>字数: ${blog.wordCount}</span>
            <span>处理文章: ${blog.processedArticles}篇</span>
            <span><a href="/output/${path.basename(blog.path)}">查看文章</a></span>
          </p>
          ${blog.imagePath ? `<img src="/assets/images/${blog.imagePath}" alt="${blog.title}">` : ''}
        </div>
      `).join('');
    }

    const analysisHTML = (report.analysisResults && report.analysisResults.length > 0)
      ? report.analysisResults.map(item => {
          const summary = item.analysis?.summary || '';
          const trends = Array.isArray(item.analysis?.trends) ? item.analysis.trends : [];
          const bestPractices = Array.isArray(item.analysis?.bestPractices) ? item.analysis.bestPractices : [];
          const antiPatterns = Array.isArray(item.analysis?.antiPatterns) ? item.analysis.antiPatterns : [];
          const openQuestions = Array.isArray(item.analysis?.openQuestions) ? item.analysis.openQuestions : [];
          const tooling = Array.isArray(item.analysis?.tooling) ? item.analysis.tooling : [];
          return `
            <div class="analysis-block">
              <h3>${item.title}</h3>
              ${summary ? `<p class="analysis-summary">${summary}</p>` : ''}
              ${trends.length ? `<p><strong>趋势:</strong> ${trends.join('、')}</p>` : ''}
              ${bestPractices.length ? `<p><strong>最佳实践:</strong> ${bestPractices.join('、')}</p>` : ''}
              ${antiPatterns.length ? `<p><strong>反模式:</strong> ${antiPatterns.join('、')}</p>` : ''}
              ${openQuestions.length ? `<p><strong>开放问题:</strong> ${openQuestions.join('、')}</p>` : ''}
              ${tooling.length ? `<p><strong>工具/框架:</strong> ${tooling.join('、')}</p>` : ''}
            </div>
          `;
        }).join('')
      : '';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>博客生成报告</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; border-bottom: 1px solid #ddd; padding-bottom: 20px; }
          .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
          .stat-card { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; }
          .blogs { margin-top: 30px; }
          .blog { border: 1px solid #ddd; padding: 20px; margin: 10px 0; border-radius: 8px; }
          .blog h3 { color: #333; margin-top: 0; }
          .blog .description { color: #666; }
          .blog .stats { font-size: 12px; color: #999; }
          .blog img { max-width: 300px; margin: 10px 0; }
          .analysis { margin-top: 30px; }
          .analysis-block { border: 1px dashed #ddd; padding: 15px; border-radius: 8px; margin-bottom: 12px; }
          .analysis-summary { color: #444; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>博客生成报告</h1>
          <p>执行时间: ${new Date(report.startTime).toLocaleString()}</p>
          <p>执行时长: ${report.duration}</p>
        </div>

        <div class="summary">
          <div class="stat-card">
            <h3>生成博客</h3>
            <p>${report.generatedBlogs || 0}</p>
          </div>
          <div class="stat-card">
            <h3>总文章数</h3>
            <p>${report.articleStats.totalArticles}</p>
          </div>
          <div class="stat-card">
            <h3>已处理</h3>
            <p>${report.articleStats.processedArticles}</p>
          </div>
          <div class="stat-card">
            <h3>未处理</h3>
            <p>${report.articleStats.unprocessedArticles}</p>
          </div>
        </div>

        ${blogsHTML ? `
        <div class="blogs">
          <h2>生成的博客</h2>
          ${blogsHTML}
        </div>
        ` : `
        <div class="no-blogs">
          <p>本次操作只抓取了文章，未生成博客</p>
        </div>
        `}

        ${analysisHTML ? `
        <div class="analysis">
          <h2>AI 分析摘要</h2>
          ${analysisHTML}
        </div>
        ` : ''}
      </body>
      </html>
    `;
  }

  /**
   * 格式化持续时间
   */
  static formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}小时${minutes % 60}分钟`;
    } else if (minutes > 0) {
      return `${minutes}分钟${seconds % 60}秒`;
    } else {
      return `${seconds}秒${ms % 1000}毫秒`;
    }
  }

  /**
   * 创建工作流结果
   */
  static createWorkflowResult(success, message, data = null) {
    return {
      success,
      message,
      timestamp: new Date().toISOString(),
      duration: this.formatDuration(Date.now() - Date.now()),
      data
    };
  }
}

export { WorkflowManager };
