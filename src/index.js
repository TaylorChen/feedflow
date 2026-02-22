import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchRSSFeeds, filterProcessedArticles, markAsProcessed } from './rss-fetcher.js';
import { analyzeContent } from './content-analyzer.js';
import { generateArticle } from './article-generator.js';
import { generateImage } from './image-generator.js';
import { formatJekyllPost, saveJekyllPost } from './jekyll-formatter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config();

/**
 * 主流程
 */
async function main() {
  try {
    console.log('='.repeat(60));
    console.log('FeedFlow - 技术文章聚合与博客生成系统');
    console.log('='.repeat(60));

    // 确保运行时目录存在
    await fs.mkdir(path.join(__dirname, '../data/reports'), { recursive: true });
    await fs.mkdir(path.join(__dirname, '../data/articles/raw'), { recursive: true });
    await fs.mkdir(path.join(__dirname, '../data/processed'), { recursive: true });
    await fs.mkdir(path.join(__dirname, '../output'), { recursive: true });
    await fs.mkdir(path.join(__dirname, '../images'), { recursive: true });
    await fs.mkdir(path.join(__dirname, '../temp'), { recursive: true });

    // 1. 加载配置
    const configPath = path.join(__dirname, '../config.json');
    const configData = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configData);
    config.analysis = config.analysis || {
      minNoveltyScore: 6,
      minImpactScore: 6,
      minValueScore: 8,
      maxTopics: 5
    };

    console.log('\n📋 配置信息:');
    console.log(`  RSS源数量: ${config.rssFeeds.length}`);
    console.log(`  目标字数: ${config.article.targetLength}`);
    console.log(`  输出目录: ${config.output.postsDir}`);

    // 2. 抓取RSS内容
    console.log('\n' + '='.repeat(60));
    console.log('步骤 1/5: 抓取RSS内容');
    console.log('='.repeat(60));
    const articles = await fetchRSSFeeds(config.rssFeeds, 3);

    if (articles.length === 0) {
      console.log('\n⚠ 没有抓取到任何文章，程序退出');
      return;
    }

    // 3. 过滤已处理的文章
    const newArticles = await filterProcessedArticles(articles);

    if (newArticles.length === 0) {
      console.log('\n✓ 所有文章都已处理过，无需生成新博客');
      return;
    }

    // 4. 分析内容
    console.log('\n' + '='.repeat(60));
    console.log('步骤 2/5: 分析技术内容');
    console.log('='.repeat(60));
    const analysisResult = await analyzeContent(newArticles, config.analysis || {});

    // 5. 生成文章
    console.log('\n' + '='.repeat(60));
    console.log('步骤 3/5: 生成技术博客');
    console.log('='.repeat(60));
    const article = await generateArticle(analysisResult, config.article.targetLength, {
      analysisConfig: config.analysis || {}
    });

    // 6. 生成配图
    console.log('\n' + '='.repeat(60));
    console.log('步骤 4/5: 生成文章配图');
    console.log('='.repeat(60));
    const imagePath = await generateImage(article.imagePrompt, config.output.imagesDir);

    // 7. 格式化并保存
    console.log('\n' + '='.repeat(60));
    console.log('步骤 5/5: 保存Jekyll文章');
    console.log('='.repeat(60));
    const jekyllPost = formatJekyllPost(article, imagePath, config);
    const savedPath = await saveJekyllPost(jekyllPost, config.output.postsDir);

    // 8. 标记为已处理
    await markAsProcessed(newArticles);

    // 9. 完成
    console.log('\n' + '='.repeat(60));
    console.log('✅ 全部完成！');
    console.log('='.repeat(60));
    console.log(`\n📝 文章标题: ${article.title}`);
    console.log(`📄 文件路径: ${savedPath}`);
    console.log(`📊 文章字数: ${article.content.length} 字`);
    if (imagePath) {
      console.log(`🖼️  配图: ${imagePath}`);
    }
    console.log('\n💡 提示: 你可以使用 git 命令提交并推送到GitHub');

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行主流程
main();
