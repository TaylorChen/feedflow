import { aiClient } from './ai-client.js';

/**
 * 生成技术博客文章
 * @param {Object} analysisResult - 内容分析结果
 * @param {number} targetLength - 目标字数
 * @returns {Promise<Object>} 生成的文章
 */
export async function generateArticle(analysisResult, targetLength = 5000, options = {}) {
  console.log('\n开始生成技术博客文章...');

  const { analysis, articles } = analysisResult;
  const analysisConfig = options.analysisConfig || {};
  const minNoveltyScore = Number(analysisConfig.minNoveltyScore ?? 0);
  const minImpactScore = Number(analysisConfig.minImpactScore ?? 0);
  const minValueScore = Number(analysisConfig.minValueScore ?? 0);
  const maxTopics = Number(analysisConfig.maxTopics ?? 5);

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

  // 准备详细的文章内容供参考
  const detailedContent = articles.map((article, index) => `
【参考文章 ${index + 1}】
标题: ${article.title}
来源: ${article.source}
链接: ${article.link}
`).join('\n');

  const prompt = `你是一位资深的技术博客作者，擅长将技术文章的内容整合成深度技术文章。

基于以下技术主题分析结果，请撰写一篇约${targetLength}字的技术博客文章：

【技术主题分析】
${JSON.stringify(analysis, null, 2)}

【本次优先写作主题（已按影响力+新颖性排序）】
${JSON.stringify(selectedTopics, null, 2)}

【高价值参考文章（valueScore >= 8）】
${JSON.stringify(highValueArticles, null, 2)}

【参考文章列表】
${detailedContent}

写作要求：
1. 文章长度约${targetLength}字
2. 风格：技术深度文章，类似于你看到的参考博客风格（专业、深入、有实践价值）
3. 结构清晰，包含：
   - 引言（技术趋势背景，引用 analysis.trends / summary）
   - 核心技术点详解（优先选择 noveltyScore/impactScore 高的主题）
   - 最佳实践与落地建议（来自 analysis.bestPractices / topics.actions）
   - 风险与反模式（来自 analysis.antiPatterns / topics.risks）
   - 总结与展望（结合 openQuestions）
4. 每个技术点要深入讲解，包含原理、应用场景、优缺点等
5. 适当引用参考文章的链接作为延伸阅读（来自 topics.relatedArticles 或 articles）
6. 使用markdown格式，包含代码示例（如果适用）
7. 标题要吸引人且准确反映内容
8. 如果 analysis.articles 中存在 valueScore>=${minValueScore || 8} 的文章，请在文章中优先引用

请以JSON格式返回：
{
  "title": "文章标题",
  "description": "文章简介（100字以内）",
  "content": "文章正文（markdown格式）",
  "tags": ["标签1", "标签2", "标签3"],
  "imagePrompt": "为这篇文章生成配图的AI提示词（英文，描述一个技术相关的场景）"
}`;

  try {
    const response = await aiClient.chatCompletion([
      { role: 'user', content: prompt }
    ], {
      max_tokens: 16000
    });

    const responseText = response.content;
    // 提取JSON
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
