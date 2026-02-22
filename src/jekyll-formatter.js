import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// 由于是ES模块，需要使用import.meta.url替代__dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 格式化为Jekyll文章格式
 * @param {Object} article - 文章对象
 * @param {string} imagePath - 图片路径（可选）
 * @param {Object} config - 配置对象
 * @returns {Object} Jekyll格式的文章
 */
export function formatJekyllPost(article, imagePath, config) {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

  // 生成文件名：YYYY-MM-DD-标题.md
  const titleSlug = article.title
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s-]/g, '') // 保留中文、英文、数字、空格和连字符
    .replace(/\s+/g, '-') // 空格替换为连字符
    .substring(0, 50); // 限制长度

  const filename = `${dateStr}-${titleSlug}.md`;

  // 构建front matter
  const frontMatter = {
    title: `"${article.title}"`,
    date: dateStr,
    categories: config.article.categories,
    tags: [...new Set([...config.article.defaultTags, ...article.tags])],
    description: `"${article.description}"`
  };

  // 构建markdown内容
  let content = '---\n';
  content += `title: ${frontMatter.title}\n`;
  content += `date: ${frontMatter.date}\n`;
  content += `categories: [${frontMatter.categories.join(', ')}]\n`;
  content += `tags: [${frontMatter.tags.join(', ')}]\n`;
  content += `description: ${frontMatter.description}\n`;
  content += '---\n\n';

  // 添加配图（如果有）
  if (imagePath) {
    content += `![${article.title}](/assets/images/${imagePath})\n\n`;
  }

  // 添加文章简介
  content += `${article.description}\n\n`;

  // 添加正文
  content += article.content;

  // 添加来源说明
  content += '\n\n---\n\n';
  content += '*本文基于最新技术文章内容整理而成，汇总了近期技术社区的热点话题和最佳实践。*\n';

  return {
    filename,
    content
  };
}

/**
 * 保存Jekyll文章
 * @param {Object} jekyllPost - Jekyll格式的文章
 * @param {string} postsDir - 文章目录
 * @returns {Promise<string>} 保存的文件路径
 */
export async function saveJekyllPost(jekyllPost, postsDir) {
  console.log('\n保存Jekyll文章...');

  let expandedPath;
  // 处理路径，防止使用无效路径
  if (!postsDir || postsDir === '/' || postsDir === '\\' || postsDir === '/test' || postsDir.startsWith('/test')) {
    console.warn('⚠ 无效的文章目录，使用默认目录');
    expandedPath = path.join(__dirname, '../output');
  } else if (postsDir.startsWith('~')) {
    expandedPath = postsDir.replace('~', process.env.HOME);
  } else if (path.isAbsolute(postsDir)) {
    expandedPath = postsDir;
  } else {
    expandedPath = path.join(__dirname, '..', postsDir);
  }

  try {
    await fs.mkdir(expandedPath, { recursive: true });
    console.log(`✓ 文章目录已准备: ${expandedPath}`);
  } catch (error) {
    console.error('✗ 创建文章目录失败:', error.message);
    // 尝试使用项目本地目录作为备用
    const fallbackDir = path.join(__dirname, '../output');
    await fs.mkdir(fallbackDir, { recursive: true });
    console.log(`✓ 使用备用文章目录: ${fallbackDir}`);
    const fallbackFilepath = path.join(fallbackDir, jekyllPost.filename);
    await fs.writeFile(fallbackFilepath, jekyllPost.content, 'utf-8');
    console.log(`✓ 文章已保存到备用目录: ${fallbackFilepath}`);
    return fallbackFilepath;
  }

  const filepath = path.join(expandedPath, jekyllPost.filename);
  await fs.writeFile(filepath, jekyllPost.content, 'utf-8');

  console.log(`✓ 文章已保存: ${filepath}`);
  return filepath;
}
