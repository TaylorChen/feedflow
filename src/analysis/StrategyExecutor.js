import { StorageManager } from '../data/storage/StorageManager.js';
import { ArticleRepository } from '../data/repositories/ArticleRepository.js';
import { aiClient, AIClient } from '../ai-client.js';
import { ArticleFormatter } from '../article-formatter.js';
import { formatJekyllPost, saveJekyllPost } from '../jekyll-formatter.js';
import { generateImage } from '../image-generator.js';

/**
 * 策略执行器
 * 负责根据策略选择文章、分析和生成博客
 */
class StrategyExecutor {
  static getAnalysisConfig(config) {
    const defaultConfig = {
      minNoveltyScore: 6,
      minImpactScore: 6,
      minValueScore: 8,
      maxTopics: 5
    };

    return { ...defaultConfig, ...(config.analysis || {}) };
  }

  static extractJSON(text) {
    if (!text) return null;
    const fenced = text.match(/```json([\s\S]*?)```/i);
    if (fenced) {
      const candidate = fenced[1].trim();
      try {
        return JSON.parse(candidate);
      } catch {
        // fall through
      }
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
  /**
   * 获取策略配置参数
   * @param {Object} config - 系统配置
   * @returns {Object} 策略配置
   */
  static getStrategyConfig(config) {
    const defaultConfig = {
      articlesPerBlog: 5, // 每个博客包含的文章数量
      maxTokenLimit: 80000, // AI服务的token限制
      topicCount: 3, // 每个博客的主题数量
      wordCount: 5000 // 目标字数
    };

    return { ...defaultConfig, ...config.strategy };
  }

  /**
   * 执行博客生成策略
   * @param {Object} config - 系统配置
   * @param {number} count - 要生成的博客数量
   * @param {Object} options - 执行选项
   */
  static async executeStrategy(config, count = 1, options = {}) {
    const generatedBlogs = [];
    const strategyConfig = this.getStrategyConfig(config);
    const analysisConfig = this.getAnalysisConfig(config);

    // 支持选择AI模型
    let aiInstance = aiClient;
    if (options.aiModel && options.aiModel !== 'default') {
      aiInstance = new AIClient(options.aiModel);
    }

    // 支持选择输出风格
    const outputStyle = options.outputStyle || 'jekyll';
    const outputDir = options.outputDir || config.output.postsDir;

    for (let i = 0; i < count; i++) {
      try {
        console.log(`\n=== 正在生成第 ${i + 1} 篇博客 ===`);

        // 1. 选择未处理的文章
        let unprocessedArticles = [];
        if (options.selectedArticles && options.selectedArticles.length > 0) {
          // 使用用户选择的文章
          unprocessedArticles = await Promise.all(options.selectedArticles.map(id =>
            ArticleRepository.getArticleById(id)
          ));
          unprocessedArticles = unprocessedArticles.filter(article => article);
        } else {
          // 自动选择未处理的文章
          unprocessedArticles = await ArticleRepository.getUnprocessedArticles(strategyConfig.articlesPerBlog);
        }

        if (unprocessedArticles.length === 0) {
          console.log('⚠ 没有未处理的文章，停止生成');
          break;
        }

        // 2. 分析文章内容
        const analysisResult = await this.analyzeArticles(unprocessedArticles, strategyConfig, analysisConfig, aiInstance);

        // 3. 生成博客文章
        const blog = await this.generateBlog(analysisResult, unprocessedArticles, strategyConfig, analysisConfig, aiInstance);

        // 4. 生成配图
        const imagePath = await this.generateBlogImage(blog.imagePrompt, config.output.imagesDir);

        // 5. 格式化文章
        let savedPath;
        if (outputStyle === 'jekyll') {
          const jekyllPost = formatJekyllPost(blog, imagePath, config);
          savedPath = await saveJekyllPost(jekyllPost, outputDir);
        } else {
          const formattedContent = ArticleFormatter.formatArticle(blog, imagePath, config, outputStyle);
          savedPath = await ArticleFormatter.saveArticle(formattedContent, outputDir, outputStyle);
        }

        console.log(`✅ 博客已保存: ${savedPath}`);

        // 6. 标记文章为已处理
        await Promise.all(unprocessedArticles.map(article =>
          ArticleRepository.markArticleProcessed(article, analysisResult.topics)
        ));

        generatedBlogs.push({
          title: blog.title,
          description: blog.description,
          path: savedPath,
          imagePath,
          wordCount: blog.content.length,
          processedArticles: unprocessedArticles.length,
          analysis: analysisResult,
          aiModel: options.aiModel || 'default',
          outputStyle: outputStyle,
          outputDir: outputDir
        });

      } catch (error) {
        console.error(`❌ 第 ${i + 1} 篇博客生成失败:`, error.message);
        // 继续处理下一篇
      }
    }

    return generatedBlogs;
  }

  /**
   * 分析文章内容
   * @param {Array} articles - 文章列表
   * @returns {Promise<Object>} 分析结果
   */
  static async analyzeArticles(articles, strategyConfig, analysisConfig, aiInstance = aiClient) {
    console.log('🧠 正在分析文章内容...');

    // 准备文章摘要
    const articleSummaries = articles.map((article, index) => {
      const preview = this.getArticlePreview(article);
      return `
【文章 ${index + 1}】
标题: ${article.title}
来源: ${article.source}
链接: ${article.link}
发布时间: ${article.pubDate}
内容预览: ${preview}
---
`;
    }).join('\n');

    const prompt = `你是一位资深技术研究员与技术写作者。我收集了最近的技术文章内容，请进行更全面的技术分析，强调“主题、观点、实践价值、风险和趋势”，并过滤营销/招聘/活动宣传等无关信息。

以下是收集到的文章：

${articleSummaries}

评分准则（0-10分）：
- noveltyScore（新颖性）：是否是新技术/新方法/新观点；行业中是否少见。
- impactScore（影响力）：是否对性能、可靠性、成本、体验或团队效率有显著影响。
- valueScore（文章价值）：信息密度、可复用性、落地性、可信度的综合。

请完成以下任务：
1. 识别出最有技术价值的内容（新技术、最佳实践、架构设计、性能优化、工程效率、可靠性/安全等）
2. 过滤掉广告、招聘、活动宣传等无关内容
3. 总结出${analysisConfig.maxTopics}个核心技术主题
4. 为每个主题提供简要说明、关键要点、相关文章和可落地的实践建议
5. 标注潜在风险、坑点、反模式或争议观点
6. 提炼工具/框架/标准/概念清单与趋势
7. 对每篇文章给出结构化判断（价值评分、是否值得深入、归属主题）

请严格仅输出JSON，不要包含额外文本。JSON格式如下：
{
  "topics": [
    {
      "title": "主题标题",
      "description": "主题描述",
      "keyPoints": ["关键要点1", "关键要点2"],
      "actions": ["可执行建议1", "可执行建议2"],
      "risks": ["风险/坑点1", "风险/争议2"],
      "keywords": ["关键词1", "关键词2"],
      "difficulty": "beginner|intermediate|advanced",
      "noveltyScore": 0,
      "impactScore": 0,
      "relatedArticles": [
        { "title": "文章标题1", "link": "链接", "source": "来源", "reason": "关联原因" }
      ]
    }
  ],
  "trends": ["趋势1", "趋势2"],
  "bestPractices": ["最佳实践1", "最佳实践2"],
  "antiPatterns": ["反模式1", "反模式2"],
  "tooling": ["工具/框架/标准1", "工具/框架/标准2"],
  "openQuestions": ["尚待验证/开放问题1", "开放问题2"],
  "articles": [
    {
      "title": "文章标题",
      "link": "链接",
      "source": "来源",
      "valueScore": 0,
      "summary": "一句话总结",
      "tags": ["标签1", "标签2"],
      "topic": "归属主题标题",
      "actionable": true
    }
  ],
  "summary": "整体技术趋势总结"
}`;

    try {
      const response = await aiInstance.chatCompletion([
        { role: 'user', content: prompt }
      ], {
        max_tokens: 4096,
        temperature: 0.7
      });

      const responseText = response.content;
      const analysis = this.extractJSON(responseText);
      if (analysis) {
        console.log(`✓ 分析完成，识别出 ${analysis.topics.length} 个技术主题`);
        return analysis;
      } else {
        throw new Error('无法解析分析结果');
      }

    } catch (error) {
      console.error('✗ 内容分析失败:', error.message);
      throw error;
    }
  }

  /**
   * 生成博客文章
   * @param {Object} analysis - 分析结果
   * @param {Array} articles - 文章列表
   * @returns {Promise<Object>} 博客文章
   */
  static async generateBlog(analysis, articles, strategyConfig, analysisConfig, aiInstance = aiClient) {
    console.log('📝 正在生成博客文章...');

    const minNoveltyScore = Number(analysisConfig.minNoveltyScore ?? 0);
    const minImpactScore = Number(analysisConfig.minImpactScore ?? 0);
    const minValueScore = Number(analysisConfig.minValueScore ?? 0);
    const maxTopics = Number(analysisConfig.maxTopics ?? strategyConfig.topicCount);

    const topics = Array.isArray(analysis.topics) ? analysis.topics : [];
    const scoredTopics = topics.map((topic) => {
      const novelty = Number(topic.noveltyScore ?? 0);
      const impact = Number(topic.impactScore ?? 0);
      return {
        ...topic,
        _score: (Number.isFinite(novelty) ? novelty : 0) + (Number.isFinite(impact) ? impact : 0)
      };
    });

    const filteredTopics = scoredTopics.filter((topic) => {
      const novelty = Number(topic.noveltyScore ?? 0);
      const impact = Number(topic.impactScore ?? 0);
      return (Number.isFinite(novelty) ? novelty : 0) >= minNoveltyScore &&
             (Number.isFinite(impact) ? impact : 0) >= minImpactScore;
    });

    const topicsToRank = filteredTopics.length > 0 ? filteredTopics : scoredTopics;

    const selectedTopics = topicsToRank
      .sort((a, b) => b._score - a._score)
      .slice(0, Math.max(1, maxTopics))
      .map(({ _score, ...rest }) => rest);

    const highValueArticles = Array.isArray(analysis.articles)
      ? analysis.articles.filter((item) => Number(item.valueScore) >= minValueScore)
      : [];

    const detailedContent = articles.map((article, index) => `
【参考文章 ${index + 1}】
标题: ${article.title}
来源: ${article.source}
链接: ${article.link}
`).join('\n');

    const prompt = `你是一位资深的技术博客作者，擅长将技术文章的内容整合成深度技术文章。

基于以下技术主题分析结果，请撰写一篇约${strategyConfig.wordCount}字的技术博客文章：

【技术主题分析】
${JSON.stringify(analysis, null, 2)}

【本次优先写作主题（已按影响力+新颖性排序）】
${JSON.stringify(selectedTopics, null, 2)}

【高价值参考文章（valueScore >= ${minValueScore || 8}）】
${JSON.stringify(highValueArticles, null, 2)}

【参考文章列表】
${detailedContent}

写作要求：
1. 文章长度约${strategyConfig.wordCount}字
2. 风格：自然流畅，符合人的写作习惯，避免AI生成的生硬感
3. 结构清晰，包含：
   - 引言（介绍技术趋势背景）
   - 核心技术点详解（优先选择 noveltyScore/impactScore 高的主题）
   - 最佳实践与落地建议（来自 analysis.bestPractices / topics.actions）
   - 风险与反模式（来自 analysis.antiPatterns / topics.risks）
   - 总结与展望（结合 openQuestions）
4. 每个技术点要深入讲解，包含原理、应用场景、优缺点等
5. 适当引用参考文章的链接作为延伸阅读
6. 使用markdown格式，包含代码示例（如果适用）
7. 标题要吸引人且准确反映内容
8. 如果 analysis.articles 中存在 valueScore>=${minValueScore || 8} 的文章，请在文章中优先引用
9. 语言要通俗易懂，避免过度使用专业术语
10. 使用真实的案例和数据，增强可信度
11. 结尾要有总结和展望，给读者留下思考空间

请以JSON格式返回：
{
  "title": "文章标题",
  "description": "文章简介（100字以内）",
  "content": "文章正文（markdown格式）",
  "tags": ["标签1", "标签2", "标签3"],
  "imagePrompt": "为这篇文章生成配图的AI提示词（英文，描述一个技术相关的场景）"
}`;

    try {
      const response = await aiInstance.chatCompletion([
        { role: 'user', content: prompt }
      ], {
        max_tokens: 8000,
        temperature: 0.7
      });

      const responseText = response.content;
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const article = JSON.parse(jsonMatch[0]);
        const wordCount = article.content.length;
        console.log(`✓ 文章生成完成`);
        console.log(`  标题: ${article.title}`);
        console.log(`  字数: ${wordCount} 字`);
        console.log(`  标签: ${article.tags.join(', ')}`);
        return article;
      } else {
        throw new Error('无法解析生成的文章');
      }

    } catch (error) {
      console.error('✗ 文章生成失败:', error.message);
      throw error;
    }
  }

  /**
   * 生成博客配图
   * @param {string} imagePrompt - 图片描述
   * @param {string} imagesDir - 图片存储目录
   * @returns {Promise<string>} 图片路径
   */
  static async generateBlogImage(imagePrompt, imagesDir) {
    if (!imagePrompt) {
      console.log('⚠ 没有图片提示词，跳过配图生成');
      return null;
    }

    console.log('🖼️  正在生成博客配图...');

    try {
      const imagePath = await generateImage(imagePrompt, imagesDir);
      return imagePath;
    } catch (error) {
      console.error('✗ 配图生成失败:', error.message);
      return null;
    }
  }

  /**
   * 获取文章预览内容
   * @param {Object} article - 文章对象
   * @param {number} length - 预览长度
   * @returns {string} 预览内容
   */
  static getArticlePreview(article, length = 500) {
    // 清理HTML标签和特殊字符
    const cleanContent = article.content
      .replace(/<[^>]*>/g, '') // 移除HTML标签
      .replace(/&[^;]+;/g, ' ') // 移除HTML实体
      .replace(/\s+/g, ' ') // 压缩空格
      .trim();

    return cleanContent.length > length
      ? cleanContent.substring(0, length) + '...'
      : cleanContent;
  }

  /**
   * 验证生成的博客质量
   * @param {Object} blog - 博客文章
   * @returns {boolean} 质量是否符合要求
   */
  static validateBlogQuality(blog, strategyConfig) {
    const MIN_WORDS = strategyConfig.wordCount * 0.8; // 最低字数要求
    const MIN_TAGS = 3; // 最低标签数量

    return blog.content.length >= MIN_WORDS &&
           blog.tags.length >= MIN_TAGS &&
           blog.description && blog.description.length > 20;
  }

  /**
   * 获取策略执行统计信息
   * @param {Object} config - 系统配置
   * @returns {Promise<Object>} 统计信息
   */
  static async getStrategyStats(config) {
    const strategyConfig = this.getStrategyConfig(config);
    const allArticles = await ArticleRepository.getAllArticles();
    const processedArticles = await ArticleRepository.getProcessedArticles();
    const unprocessedArticles = await ArticleRepository.getUnprocessedArticles();

    const blogsPerBatch = Math.floor(allArticles.length / strategyConfig.articlesPerBlog);
    const remainingArticles = allArticles.length % strategyConfig.articlesPerBlog;

    return {
      totalArticles: allArticles.length,
      processedArticles: processedArticles.length,
      unprocessedArticles: unprocessedArticles.length,
      estimatedBlogCount: blogsPerBatch,
      remainingArticles,
      articlesPerBlog: strategyConfig.articlesPerBlog,
      wordCountPerBlog: strategyConfig.wordCount
    };
  }

  /**
   * 调整策略参数
   * @param {Object} config - 系统配置
   * @param {Object} params - 策略参数
   */
  static adjustStrategyParams(config, params = {}) {
    const strategyConfig = config.strategy || {};

    if (params.articlesPerBlog && params.articlesPerBlog >= 3 && params.articlesPerBlog <= 10) {
      strategyConfig.articlesPerBlog = params.articlesPerBlog;
    }

    if (params.wordCount && params.wordCount >= 3000 && params.wordCount <= 8000) {
      strategyConfig.wordCount = params.wordCount;
    }

    if (params.topicCount && params.topicCount >= 2 && params.topicCount <= 5) {
      strategyConfig.topicCount = params.topicCount;
    }

    console.log('策略参数已调整:', strategyConfig);
  }
}

export { StrategyExecutor };
