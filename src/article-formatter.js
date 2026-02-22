/**
 * 文章格式化器 - 支持多种Markdown风格
 */

class ArticleFormatter {
  /**
   * 根据风格格式化文章
   * @param {Object} blog - 博客文章对象
   * @param {string} imagePath - 图片路径
   * @param {Object} config - 系统配置
   * @param {string} style - 输出风格 (jekyll, wechat, simple)
   * @returns {string} 格式化后的文章内容
   */
  static formatArticle(blog, imagePath, config, style = 'jekyll') {
    const tagMap = {
      wechat: '微信风格',
      simple: '简洁风格',
      jekyll: 'Jekyll风格'
    };
    const styleTag = tagMap[style] || '未知风格';
    const baseTags = Array.isArray(blog.tags) ? blog.tags : [];
    const tags = baseTags.includes(styleTag) ? baseTags : [...baseTags, styleTag];

    switch (style) {
      case 'wechat':
        return this.formatWeChatStyle(blog, imagePath, config, tags);
      case 'simple':
        return this.formatSimpleStyle(blog, imagePath, config, tags);
      case 'jekyll':
      default:
        return this.formatJekyllStyle(blog, imagePath, config, tags);
    }
  }

  /**
   * Jekyll风格格式化
   * 适合GitHub Pages博客
   */
  static formatJekyllStyle(blog, imagePath, config, tags = null) {
    const finalTags = tags || blog.tags;
    const frontmatter = `---
layout: post
title: "${blog.title}"
date: ${new Date().toISOString().split('T')[0]}
categories: ${JSON.stringify(config.article.categories || ['技术', '周刊'])}
tags: ${JSON.stringify(finalTags)}
description: "${blog.description}"
---

`;

    let content = frontmatter;

    if (imagePath) {
      content += `![${blog.title}](${imagePath})\n\n`;
    }

    content += blog.content;

    // 添加参考文章链接
    content += `\n\n---\n\n## 参考文章\n\n`;

    return content;
  }

  /**
   * 微信风格格式化
   * 适合微信公众号发布
   */
  static formatWeChatStyle(blog, imagePath, config, tags = null) {
    const finalTags = tags || blog.tags;
    let content = `# ${blog.title}\n\n`;

    if (imagePath) {
      content += `![${blog.title}](${imagePath})\n\n`;
    }

    content += `**${blog.description}**\n\n`;
    if (finalTags && finalTags.length > 0) {
      content += `> 标签：${finalTags.join('、')}\n\n`;
    }
    content += blog.content;

    // 微信风格的底部信息
    content += `\n\n---\n\n📚 本文参考了 ${config.strategy.articlesPerBlog} 篇技术文章\n\n`;
    content += `💡 如果你喜欢这篇文章，欢迎分享给更多人\n\n`;
    content += `⏰ 每周定期更新技术干货，记得关注哦！\n`;

    return content;
  }

  /**
   * 简洁风格格式化
   * 适合普通Markdown发布
   */
  static formatSimpleStyle(blog, imagePath, config, tags = null) {
    const finalTags = tags || blog.tags;
    let content = `# ${blog.title}\n\n`;

    if (imagePath) {
      content += `![${blog.title}](${imagePath})\n\n`;
    }

    content += `**${blog.description}**\n\n`;
    if (finalTags && finalTags.length > 0) {
      content += `> 标签：${finalTags.join('、')}\n\n`;
    }
    content += blog.content;

    return content;
  }

  /**
   * 获取支持的风格列表
   */
  static getSupportedStyles() {
    return [
      {
        name: 'jekyll',
        label: 'Jekyll风格',
        description: '适合GitHub Pages博客的标准格式'
      },
      {
        name: 'wechat',
        label: '微信风格',
        description: '适合微信公众号发布的格式'
      },
      {
        name: 'simple',
        label: '简洁风格',
        description: '通用的Markdown格式'
      }
    ];
  }

  /**
   * 保存格式化后的文章
   * @param {string} content - 格式化后的内容
   * @param {string} outputDir - 输出目录
   * @param {string} style - 风格
   * @returns {Promise<string>} 保存的文件路径
   */
  static async saveArticle(content, outputDir, style) {
    const fs = await import('fs/promises');
    const path = await import('path');

    // 确保输出目录存在
    await fs.mkdir(outputDir, { recursive: true });

    // 生成文件名
    const fileName = this.generateFileName(content);
    const filePath = path.join(outputDir, fileName);

    await fs.writeFile(filePath, content, 'utf8');

    return filePath;
  }

  /**
   * 生成文件名
   * @param {string} content - 文章内容
   * @returns {string} 文件名
   */
  static generateFileName(content) {
    // 从内容中提取标题（处理各种格式的标题）
    let title = 'untitled';

    const titleMatches = content.match(/^#\s*([^\n]+)/m) ||
                         content.match(/title:\s*"?([^"\n]+)"?/m);

    if (titleMatches) {
      title = titleMatches[1].trim();
    }

    // 清理文件名
    const safeTitle = title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase();
    const date = new Date().toISOString().split('T')[0];

    return `${date}-${safeTitle}.md`;
  }
}

export { ArticleFormatter };
