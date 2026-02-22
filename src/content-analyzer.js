import * as cheerio from 'cheerio';
import { aiClient } from './ai-client.js';

/**
 * 清理HTML内容，提取纯文本
 * @param {string} html - HTML内容
 * @returns {string} 纯文本
 */
function cleanHTML(html) {
  const $ = cheerio.load(html);
  // 移除script和style标签
  $('script, style').remove();
  // 获取文本内容
  return $.text().trim();
}

function extractJSON(text) {
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
 * 分析文章内容，提取技术相关的精华
 * @param {Array} articles - 文章列表
 * @returns {Promise<Object>} 分析结果
 */
export async function analyzeContent(articles, analysisConfig = {}) {
  console.log('\n开始分析文章内容...');

  // 准备文章摘要
  const articleSummaries = articles.map((article, index) => {
    const cleanContent = cleanHTML(article.content);
    const preview = cleanContent.substring(0, 1200); // 取前1200字符

    return `
【文章 ${index + 1}】
标题: ${article.title}
来源: ${article.source}
链接: ${article.link}
发布时间: ${article.pubDate}
内容预览: ${preview}...
---
`;
  }).join('\n');

  const maxTopics = Number(analysisConfig.maxTopics ?? 6);
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
3. 总结出${maxTopics}个核心技术主题
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
    const response = await aiClient.chatCompletion([
      { role: 'user', content: prompt }
    ], {
      max_tokens: 4096
    });

    const responseText = response.content;
    const analysis = extractJSON(responseText);
    if (analysis) {
      console.log(`✓ 分析完成，识别出 ${analysis.topics.length} 个技术主题`);
      return { analysis, articles };
    } else {
      throw new Error('无法解析分析结果');
    }

  } catch (error) {
    console.error('✗ 内容分析失败:', error.message);
    throw error;
  }
}
