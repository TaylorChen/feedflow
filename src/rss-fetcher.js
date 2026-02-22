import Parser from 'rss-parser';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 自定义Parser配置，添加用户代理和超时
const parser = new Parser({
  customFields: {
    item: [
      ['content:encoded', 'contentEncoded'],
      ['description', 'description']
    ]
  },
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/rss+xml, application/xml, text/xml; q=0.9, */*; q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
  }
});

// 超时和重试配置
const REQUEST_TIMEOUT = 30000; // 30秒
const YOUTUBE_TIMEOUT = 60000; // 60秒
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1秒
const YOUTUBE_RETRY_DELAY = 3000; // 3秒

/**
 * 延迟函数
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带重试的HTTP请求
 * @param {string} url - 请求URL
 * @param {number} retryCount - 重试次数
 * @returns {Promise}
 */
function shouldUseProxyForUrl(url) {
  const domainList = (process.env.PROXY_DOMAINS || 'youtube.com,google.com,withgoogle.com')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
  if (domainList.length === 0) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return domainList.some(domain => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

async function fetchWithRetry(url, retryCount = MAX_RETRIES) {
  try {
    const proxyUrl =
      process.env.HTTPS_PROXY ||
      process.env.HTTP_PROXY ||
      process.env.ALL_PROXY ||
      process.env.https_proxy ||
      process.env.http_proxy ||
      process.env.all_proxy;
    const useProxy = Boolean(proxyUrl) && shouldUseProxyForUrl(url);
    const isHttps = url.startsWith('https://');
    const isSocks = proxyUrl && proxyUrl.startsWith('socks');
    const normalizedProxyUrl = isSocks && proxyUrl.startsWith('socks5://')
      ? proxyUrl.replace('socks5://', 'socks5h://')
      : proxyUrl;
    const agent = useProxy
      ? (isSocks
        ? new SocksProxyAgent(normalizedProxyUrl)
        : (isHttps ? new HttpsProxyAgent(normalizedProxyUrl) : new HttpProxyAgent(normalizedProxyUrl)))
      : undefined;
    const isYoutube = url.includes('youtube.com/feeds/videos.xml');
    const timeout = isYoutube ? YOUTUBE_TIMEOUT : REQUEST_TIMEOUT;

    if (retryCount === MAX_RETRIES) {
      console.log(`代理配置: ${useProxy ? normalizedProxyUrl : '未启用'}`);
    }

    const response = await axios.get(url, {
      timeout,
      ...(useProxy ? { proxy: false, httpAgent: agent, httpsAgent: agent } : {}),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml; q=0.9, */*; q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    });
    return response.data;
  } catch (error) {
    if (retryCount > 0) {
      const isYoutube = url.includes('youtube.com/feeds/videos.xml');
      const retryDelay = isYoutube ? YOUTUBE_RETRY_DELAY : RETRY_DELAY;
      console.warn(`请求失败，${retryDelay / 1000}秒后重试 (剩余${retryCount}次): ${url}`);
      await delay(retryDelay);
      return fetchWithRetry(url, retryCount - 1);
    }
    throw error;
  }
}

/**
 * 抓取单个RSS源的内容
 * @param {Object} feed - RSS源配置
 * @param {number} limit - 每个源抓取的文章数量
 * @returns {Promise<Array>} 文章列表
 */
async function fetchSingleRSSFeed(feed, limit) {
  try {
    console.log(`正在抓取: ${feed.name}`);

    // 使用axios获取RSS内容并传递给parser
    const rssContent = await fetchWithRetry(feed.url);
    const rss = await parser.parseString(rssContent);

    const articles = rss.items.slice(0, limit).map(item => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      content: item.contentEncoded || item.description || item.content || '',
      source: feed.name,
      category: feed.category,
      guid: item.guid || item.link
    }));

    console.log(`✓ ${feed.name}: 抓取了 ${articles.length} 篇文章`);
    return articles;

  } catch (error) {
    // 详细的错误处理
    if (error.response) {
      // 服务器响应了，但状态码不是2xx
      const status = error.response.status;
      if (status === 406) {
        console.error(`✗ ${feed.name}: 抓取失败 - 406 不可接受 (可能需要调整请求头)`);
      } else if (status === 404) {
        console.error(`✗ ${feed.name}: 抓取失败 - 404 未找到`);
      } else if (status === 500) {
        console.error(`✗ ${feed.name}: 抓取失败 - 500 服务器内部错误`);
      } else {
        console.error(`✗ ${feed.name}: 抓取失败 - 状态码 ${status}`);
      }
    } else if (error.request) {
      // 请求发出但没有收到响应
      console.error(`✗ ${feed.name}: 抓取失败 - 请求超时或网络错误`);
    } else {
      // 请求配置出错
      console.error(`✗ ${feed.name}: 抓取失败 - ${error.message}`);
    }

    return [];
  }
}

/**
 * 并发抓取RSS源的最新内容
 * @param {Array} feeds - RSS源配置数组
 * @param {number} limit - 每个源抓取的文章数量
 * @param {number} concurrency - 并发数（默认10）
 * @returns {Promise<Array>} 文章列表
 */
export async function fetchRSSFeeds(feeds, limit = 5, concurrency = 10) {
  const allArticles = [];

  console.log(`开始抓取 ${feeds.length} 个RSS源...`);
  console.log(`并发数: ${concurrency}`);

  // 分批处理RSS源
  for (let i = 0; i < feeds.length; i += concurrency) {
    const batch = feeds.slice(i, i + concurrency);
    const batchPromises = batch.map(feed => fetchSingleRSSFeed(feed, limit));
    const batchResults = await Promise.all(batchPromises);

    // 将批次结果添加到总列表
    batchResults.forEach(articles => {
      allArticles.push(...articles);
    });
  }

  console.log(`\n总共抓取了 ${allArticles.length} 篇文章`);
  return allArticles;
}

/**
 * 过滤已处理的文章
 * @param {Array} articles - 文章列表
 * @returns {Promise<Array>} 未处理的文章列表
 */
export async function filterProcessedArticles(articles) {
  const dataDir = path.join(__dirname, '../data');
  const processedFile = path.join(dataDir, 'processed.json');

  let processed = [];
  try {
    const data = await fs.readFile(processedFile, 'utf-8');
    processed = JSON.parse(data);
  } catch (error) {
    // 文件不存在，创建空数组
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(processedFile, JSON.stringify([], null, 2));
  }

  const processedGuids = new Set(processed.map(p => p.guid));
  const newArticles = articles.filter(article => !processedGuids.has(article.guid));

  console.log(`\n过滤后剩余 ${newArticles.length} 篇未处理文章`);
  return newArticles;
}

/**
 * 标记文章为已处理
 * @param {Array} articles - 已处理的文章列表
 */
export async function markAsProcessed(articles) {
  const dataDir = path.join(__dirname, '../data');
  const processedFile = path.join(dataDir, 'processed.json');

  let processed = [];
  try {
    const data = await fs.readFile(processedFile, 'utf-8');
    processed = JSON.parse(data);
  } catch (error) {
    // 忽略错误
  }

  const newProcessed = articles.map(article => ({
    guid: article.guid,
    title: article.title,
    processedAt: new Date().toISOString()
  }));

  processed.push(...newProcessed);
  await fs.writeFile(processedFile, JSON.stringify(processed, null, 2));
}
