import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import dotenv from 'dotenv';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

// 确保在模块加载时就加载环境变量
try {
  dotenv.config();
} catch (error) {
  console.warn('dotenv 加载警告:', error.message);
}

/**
 * AI 客户端工厂 - 支持多种 AI 服务提供商
 */

class AIClient {
  constructor(provider = null) {
    // 确保环境变量已加载
    try {
      const result = dotenv.config();
      if (result.error) {
        console.warn('dotenv 加载失败:', result.error);
      }
    } catch (error) {
      console.warn('dotenv 加载异常:', error);
    }

    this.provider = provider || this.detectProvider();
    this.client = this.createClient();
  }

  /**
   * 自动检测 AI 服务提供商
   */
  detectProvider() {
    if (process.env.DEEPSEEK_API_KEY) {
      return 'deepseek';
    } else if (process.env.ARK_API_KEY) {
      return 'ark';
    } else if (process.env.ANTHROPIC_API_KEY) {
      return 'anthropic';
    } else if (process.env.ZHIPU_API_KEY) {
      return 'zhipu';
    } else if (process.env.KIMI_API_KEY) {
      return 'kimi';
    } else {
      throw new Error('未配置 AI API 密钥，请检查 .env 文件');
    }
  }

  /**
   * 创建 AI 客户端实例
   */
  createClient() {
    switch (this.provider) {
      case 'deepseek':
        return new DeepSeekClient();
      case 'ark':
        return new ArkClient();
      case 'anthropic':
        return new AnthropicClient();
      case 'zhipu':
        return new ZhipuClient();
      case 'kimi':
        return new KimiClient();
      default:
        throw new Error('不支持的 AI 服务提供商');
    }
  }

  /**
   * 切换 AI 服务提供商
   */
  switchProvider(provider) {
    this.provider = provider;
    this.client = this.createClient();
  }

  /**
   * 发送聊天请求
   */
  async chatCompletion(messages, options = {}) {
    return await this.client.chatCompletion(messages, options);
  }
}

function shouldUseProxyForUrl(targetUrl = '') {
  const domainList = (process.env.PROXY_DOMAINS || 'youtube.com,google.com,withgoogle.com')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
  if (domainList.length === 0) return false;
  try {
    const host = new URL(targetUrl).hostname.toLowerCase();
    return domainList.some(domain => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function getProxyConfig(targetUrl = '') {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.ALL_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy ||
    process.env.all_proxy;
  if (!proxyUrl || !shouldUseProxyForUrl(targetUrl)) {
    return { proxy: false };
  }

  const isHttps = targetUrl.startsWith('https://');
  const isSocks = proxyUrl.startsWith('socks');
  const normalizedProxyUrl = isSocks && proxyUrl.startsWith('socks5://')
    ? proxyUrl.replace('socks5://', 'socks5h://')
    : proxyUrl;
  const agent = isSocks
    ? new SocksProxyAgent(normalizedProxyUrl)
    : (isHttps ? new HttpsProxyAgent(normalizedProxyUrl) : new HttpProxyAgent(normalizedProxyUrl));

  return {
    proxy: false,
    httpAgent: agent,
    httpsAgent: agent
  };
}

/**
 * DeepSeek AI 客户端
 */
class DeepSeekClient {
  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY;
    this.baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
  }

  async chatCompletion(messages, options = {}) {
    const defaultOptions = {
      model: 'deepseek-chat',
      temperature: 0.7,
      max_tokens: 4096,
      top_p: 0.95,
      stream: false
    };

    const config = {
      ...defaultOptions,
      ...options
    };

    try {
      const url = `${this.baseURL}/chat/completions`;
      const response = await axios.post(url, {
        model: config.model,
        messages: messages,
        temperature: config.temperature,
        max_tokens: config.max_tokens,
        top_p: config.top_p,
        frequency_penalty: config.frequency_penalty,
        presence_penalty: config.presence_penalty,
        stream: config.stream
      }, {
        ...getProxyConfig(url),
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        content: response.data.choices[0].message.content,
        usage: response.data.usage
      };

    } catch (error) {
      console.error('DeepSeek API 调用失败:', error.response?.data || error.message);
      throw error;
    }
  }
}

/**
 * 方舟（豆包）AI 客户端
 */
class ArkClient {
  constructor() {
    this.apiKey = process.env.ARK_API_KEY;
    this.secretKey = process.env.ARK_SECRET_KEY;
    this.baseURL = process.env.ARK_BASE_URL || 'https://ark.cn-north-1.volces.com/api/v1';
  }

  async chatCompletion(messages, options = {}) {
    const defaultOptions = {
      model: 'doubao-pro',
      temperature: 0.7,
      max_tokens: 4096,
      top_p: 0.9,
      stream: false
    };

    const config = {
      ...defaultOptions,
      ...options
    };

    try {
      const url = `${this.baseURL}/chat/completions`;
      const response = await axios.post(url, {
        model: config.model,
        messages: messages,
        temperature: config.temperature,
        max_tokens: config.max_tokens,
        top_p: config.top_p,
        frequency_penalty: config.frequency_penalty,
        presence_penalty: config.presence_penalty,
        stream: config.stream
      }, {
        ...getProxyConfig(url),
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        content: response.data.choices[0].message.content,
        usage: response.data.usage
      };

    } catch (error) {
      console.error('方舟 API 调用失败:', error.response?.data || error.message);
      throw error;
    }
  }
}

/**
 * Anthropic AI 客户端（保留原支持）
 */
class AnthropicClient {
  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }

  async chatCompletion(messages, options = {}) {
    const defaultOptions = {
      model: 'claude-3-sonnet-20240229',
      temperature: 0.7,
      max_tokens: 4096
    };

    const config = {
      ...defaultOptions,
      ...options
    };

    try {
      const response = await this.client.messages.create({
        model: config.model,
        max_tokens: config.max_tokens,
        temperature: config.temperature,
        messages: messages
      });

      return {
        content: response.content[0].text,
        usage: response.usage
      };

    } catch (error) {
      console.error('Anthropic API 调用失败:', error.message);
      throw error;
    }
  }
}

/**
 * 智谱（Zhipu）AI 客户端
 */
class ZhipuClient {
  constructor() {
    this.apiKey = process.env.ZHIPU_API_KEY;
    this.baseURL = process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
  }

  async chatCompletion(messages, options = {}) {
    const defaultOptions = {
      model: 'glm-4',
      temperature: 0.7,
      max_tokens: 4096,
      top_p: 0.9,
      stream: false
    };

    const config = {
      ...defaultOptions,
      ...options
    };

    try {
      const url = `${this.baseURL}/chat/completions`;
      const response = await axios.post(url, {
        model: config.model,
        messages: messages,
        temperature: config.temperature,
        max_tokens: config.max_tokens,
        top_p: config.top_p,
        frequency_penalty: config.frequency_penalty,
        presence_penalty: config.presence_penalty,
        stream: config.stream
      }, {
        ...getProxyConfig(url),
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        content: response.data.choices[0].message.content,
        usage: response.data.usage
      };

    } catch (error) {
      console.error('智谱 API 调用失败:', error.response?.data || error.message);
      throw error;
    }
  }
}

/**
 * Kimi AI 客户端
 */
class KimiClient {
  constructor() {
    this.apiKey = process.env.KIMI_API_KEY;
    this.baseURL = process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1';
  }

  async chatCompletion(messages, options = {}) {
    const defaultOptions = {
      model: 'moonshot-v1-8k',
      temperature: 0.7,
      max_tokens: 4096,
      top_p: 0.9,
      stream: false
    };

    const config = {
      ...defaultOptions,
      ...options
    };

    try {
      const url = `${this.baseURL}/chat/completions`;
      const response = await axios.post(url, {
        model: config.model,
        messages: messages,
        temperature: config.temperature,
        max_tokens: config.max_tokens,
        top_p: config.top_p,
        frequency_penalty: config.frequency_penalty,
        presence_penalty: config.presence_penalty,
        stream: config.stream
      }, {
        ...getProxyConfig(url),
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        content: response.data.choices[0].message.content,
        usage: response.data.usage
      };

    } catch (error) {
      console.error('Kimi API 调用失败:', error.response?.data || error.message);
      throw error;
    }
  }
}

// 导出单例实例
const aiClient = new AIClient();

export { aiClient, AIClient };
