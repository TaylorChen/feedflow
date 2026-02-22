import fs from 'fs/promises';
import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * 文件和网页内容解析器
 * 用于从上传的文件或网页中提取 RSS 链接
 */
class FileParser {
  /**
   * 从文件中提取 RSS 链接
   * @param {string} filePath - 文件路径
   * @returns {Promise<Array>} 提取到的 RSS 链接数组
   */
  static async parseFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');

      // 检查是否是 OPML 格式文件
      if (content.includes('<opml') || content.includes('<outline')) {
        return this.extractRSSLinksFromOPML(content);
      }

      return this.extractRSSLinks(content);
    } catch (error) {
      console.error('文件解析失败:', error);
      throw new Error(`文件解析失败: ${error.message}`);
    }
  }

  /**
   * 从 OPML 格式内容中提取 RSS 链接
   * @param {string} content - OPML 格式内容
   * @returns {Array} 提取到的 RSS 链接数组
   */
  static extractRSSLinksFromOPML(content) {
    const rssLinks = [];
    const uniqueLinks = new Set();

    try {
      const $ = cheerio.load(content, { xmlMode: true });

      // 解析 OPML 文件结构
      $('outline').each((index, element) => {
        const outline = $(element);
        const type = outline.attr('type');
        const xmlUrl = outline.attr('xmlUrl');
        const htmlUrl = outline.attr('htmlUrl');
        const title = outline.attr('title') || outline.attr('text');
        const category = outline.attr('category') || '未分类';

        // 查找 RSS/Atom 源
        if (xmlUrl) {
          const cleanedLink = this.cleanRSSLink(xmlUrl);
          if (cleanedLink && !uniqueLinks.has(cleanedLink)) {
            uniqueLinks.add(cleanedLink);
            rssLinks.push({
              url: cleanedLink,
              name: title || this.extractTitleFromUrl(cleanedLink),
              category: category,
              htmlUrl: htmlUrl
            });
          }
        }
      });

      console.log(`从 OPML 文件中提取到 ${rssLinks.length} 个 RSS 源`);
    } catch (error) {
      console.error('OPML 解析失败:', error);
      throw new Error(`OPML 文件解析失败: ${error.message}`);
    }

    return rssLinks;
  }

  /**
   * 从网页 URL 中提取 RSS 链接
   * @param {string} url - 网页 URL
   * @returns {Promise<Array>} 提取到的 RSS 链接数组
   */
  static async parseWebPage(url) {
    try {
      const https = await import('https');

      // 创建一个自定义的 https agent 来禁用证书验证
      const agent = new https.Agent({
        rejectUnauthorized: false
      });

      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        httpsAgent: agent,
        httpAgent: agent
      });

      return this.extractRSSLinks(response.data);
    } catch (error) {
      console.error('网页解析失败:', error);
      throw new Error(`网页解析失败: ${error.message}`);
    }
  }

  /**
   * 从文本内容中提取 RSS 链接
   * @param {string} content - 要解析的文本内容
   * @returns {Array} 提取到的 RSS 链接数组
   */
  static extractRSSLinks(content) {
    const rssLinks = [];
    const uniqueLinks = new Set();

    // 1. 匹配常见的 RSS/Atom 链接格式
    // 特别处理 Markdown 格式的链接，如 [title](https://url)
    const markdownLinkPattern = /\[.*?\]\((https?:\/\/[^\s)]*?)\)/gi;
    let markdownMatch;
    while ((markdownMatch = markdownLinkPattern.exec(content)) !== null) {
      const link = markdownMatch[1];
      const cleanedLink = this.cleanRSSLink(link);
      if (cleanedLink && !uniqueLinks.has(cleanedLink)) {
        uniqueLinks.add(cleanedLink);
        rssLinks.push({
          url: cleanedLink,
          category: '未分类'
        });
      }
    }

    // 2. 匹配其他格式的 RSS/Atom 链接
    // 避免匹配格式为 https://www.zhihu.com/rss](https://www.zhihu.com/rss 的链接
    const rssPatterns = [
      /https?:\/\/[^\s"\]')]*?(?:rss|feed|atom)[^\s"\]')]*/gi
    ];

    rssPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(link => {
          // 直接过滤掉包含 ]( 的链接，因为这些链接格式不正确
          if (link.includes('](')) {
            return;
          }
          // 清理链接（去除可能的尾随字符）
          const cleanedLink = this.cleanRSSLink(link);
          if (cleanedLink && !uniqueLinks.has(cleanedLink)) {
            uniqueLinks.add(cleanedLink);
            rssLinks.push({
              url: cleanedLink,
              category: '未分类'
            });
          }
        });
      }
    });

    // 2. 从 HTML 中提取 <link rel="alternate" type="application/rss+xml"> 标签
    try {
      const $ = cheerio.load(content);
      $('link').each((index, element) => {
        const rel = $(element).attr('rel');
        const type = $(element).attr('type');
        const href = $(element).attr('href');

        if (rel && type && href) {
          const normalizedRel = rel.toLowerCase();
          const normalizedType = type.toLowerCase();

          if (
            (normalizedRel.includes('alternate') &&
             (normalizedType.includes('rss') || normalizedType.includes('atom') || normalizedType.includes('feed'))) ||
            normalizedType.includes('application/rss+xml') ||
            normalizedType.includes('application/atom+xml')
          ) {
            const cleanedLink = this.cleanRSSLink(href);
            if (cleanedLink && !uniqueLinks.has(cleanedLink)) {
              uniqueLinks.add(cleanedLink);
              rssLinks.push({
                url: cleanedLink,
                category: '未分类'
              });
            }
          }
        }
      });
    } catch (error) {
      console.warn('HTML 解析失败，跳过标签提取:', error.message);
    }

    return rssLinks;
  }

  /**
   * 清理 RSS 链接
   * @param {string} link - 原始链接
   * @returns {string} 清理后的链接
   */
  static cleanRSSLink(link) {
    // 去除链接前后的引号和空格
    let cleaned = link.trim().replace(/^["']+|["']+$/g, '');

    // 直接过滤掉包含 ]( 的链接，因为这些链接格式不正确
    if (cleaned.includes('](')) {
      return null;
    }

    // 处理 Markdown 格式的链接，如 [title](https://url)
    const markdownPattern = /\[.*?\]\((https?:\/\/[^\s)]*)\)/;
    const markdownMatch = cleaned.match(markdownPattern);
    if (markdownMatch) {
      cleaned = markdownMatch[1];
    }

    // 去除链接中的无效字符，如 [ 和 ]
    cleaned = cleaned.replace(/\[|\]/g, '');

    // 去除可能的尾随字符（如括号、逗号、竖线、句号等）
    cleaned = cleaned.replace(/[|\)\],;.]+$/, '');

    // 确保链接以 http:// 或 https:// 开头
    if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
      return null;
    }

    // 检查链接是否包含有效的域名且格式符合 HTTP 协议标准
    try {
      const urlObj = new URL(cleaned);

      // 确保主机名是有效的
      if (!urlObj.hostname || urlObj.hostname.includes('|') || urlObj.hostname.includes(')')) {
        return null;
      }

      return cleaned;
    } catch (error) {
      return null;
    }
  }

  /**
   * 验证 RSS 链接是否可访问
   * @param {string} url - 要验证的 RSS 链接
   * @returns {Promise<boolean>} 链接是否可访问
   */
  static async validateRSSLink(url) {
    try {
      const response = await axios.get(url, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      return response.status === 200;
    } catch (error) {
      console.warn(`RSS 链接验证失败: ${url}`, error.message);
      return false;
    }
  }

  /**
   * 从 URL 中提取标题（用于自动命名 RSS 源）
   * @param {string} url - RSS 链接
   * @returns {string} 提取到的标题
   */
  static extractTitleFromUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      return '未知来源';
    }
  }

  /**
   * 从文件内容中提取标题（用于自动命名 RSS 源）
   * @param {string} content - 文件内容
   * @param {string} url - RSS 链接
   * @returns {string} 提取到的标题
   */
  static extractTitleFromContent(content, url) {
    try {
      const $ = cheerio.load(content);
      const title = $('title').text().trim();
      if (title) {
        return title;
      }
    } catch (error) {
      console.warn('提取标题失败:', error.message);
    }

    return this.extractTitleFromUrl(url);
  }
}

export { FileParser };
