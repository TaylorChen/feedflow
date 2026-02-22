import mysql from 'mysql2/promise';

// 从环境变量中读取数据库配置
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'feedflow',
  port: parseInt(process.env.DB_PORT) || 3306
};

// 创建连接池
const pool = mysql.createPool(dbConfig);

/**
 * 初始化数据库
 */
async function initializeDatabase() {
  try {
    // 首先检查数据库是否存在
    const connection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      port: dbConfig.port
    });

    // 创建数据库（如果不存在）
    await connection.execute(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`);
    await connection.end();

    // 使用连接池连接到数据库
    const poolConnection = await pool.getConnection();

    // 创建 RSS 源表（如果不存在）
    await poolConnection.execute(`
      CREATE TABLE IF NOT EXISTS rss_feeds (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        url VARCHAR(255) NOT NULL,
        category VARCHAR(255) DEFAULT '未分类',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_url (url)
      )
    `);

    // 创建系统配置表（如果不存在）
    await poolConnection.execute(`
      CREATE TABLE IF NOT EXISTS system_config (
        id INT AUTO_INCREMENT PRIMARY KEY,
        config_key VARCHAR(255) NOT NULL UNIQUE,
        config_value TEXT,
        description VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // 初始化默认配置
    const defaultConfigs = [
      { config_key: 'api_key', config_value: '', description: 'OpenAI API 密钥' },
      { config_key: 'api_base', config_value: '', description: 'API 基础地址' },
      { config_key: 'api_model', config_value: 'default', description: '默认 AI 模型' },
      { config_key: 'output_dir', config_value: './output', description: '文章输出目录' },
      { config_key: 'images_dir', config_value: './images', description: '图片输出目录' },
      { config_key: 'default_style', config_value: 'jekyll', description: '默认输出风格' },
      { config_key: 'article_length', config_value: '6000', description: '目标文章长度' },
      { config_key: 'articles_per_blog', config_value: '6', description: '每篇博客文章数量' },
      { config_key: 'language', config_value: 'zh', description: '文章语言' },
      { config_key: 'rss_cache', config_value: '6', description: 'RSS 缓存时间（小时）' }
    ];

    for (const config of defaultConfigs) {
      await poolConnection.execute(
        'INSERT INTO system_config (config_key, config_value, description) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE config_value = config_value',
        [config.config_key, config.config_value, config.description]
      );
    }

    poolConnection.release();
    console.log('数据库初始化成功');
  } catch (error) {
    console.error('数据库初始化失败:', error);
    throw error;
  }
}

/**
 * 获取系统配置
 */
async function getSystemConfig() {
  try {
    const [rows] = await pool.execute('SELECT config_key, config_value FROM system_config');
    const config = {};
    rows.forEach(row => {
      config[row.config_key] = row.config_value;
    });
    return config;
  } catch (error) {
    console.error('获取系统配置失败:', error);
    throw error;
  }
}

/**
 * 更新系统配置
 */
async function updateSystemConfig(configKey, configValue) {
  try {
    const [result] = await pool.execute(
      'UPDATE system_config SET config_value = ? WHERE config_key = ?',
      [configValue, configKey]
    );
    return result;
  } catch (error) {
    console.error('更新系统配置失败:', error);
    throw error;
  }
}

/**
 * 批量更新系统配置
 */
async function updateSystemConfigs(configs) {
  try {
    const results = [];
    for (const [key, value] of Object.entries(configs)) {
      const [result] = await pool.execute(
        'UPDATE system_config SET config_value = ? WHERE config_key = ?',
        [value, key]
      );
      results.push(result);
    }
    return results;
  } catch (error) {
    console.error('批量更新系统配置失败:', error);
    throw error;
  }
}

/**
 * 分页获取 RSS 源
 */
async function getRSSFeedsWithPagination(page = 1, pageSize = 20, category = null, search = null) {
  try {
    let query = 'SELECT * FROM rss_feeds';
    const params = [];
    const conditions = [];

    if (category) {
      conditions.push('category = ?');
      params.push(category);
    }

    if (search) {
      conditions.push('(name LIKE ? OR url LIKE ? OR category LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    // 计算总记录数
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const [countResult] = await pool.execute(countQuery, params);
    const total = countResult[0].total;

    // 分页查询 - LIMIT 和 OFFSET 不能使用参数，直接拼接
    const offset = (page - 1) * pageSize;
    query += ` ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`;

    const [rows] = await pool.execute(query, params);

    return {
      data: rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  } catch (error) {
    console.error('分页获取 RSS 源失败:', error);
    throw error;
  }
}

/**
 * 从数据库获取所有 RSS 源
 */
async function getAllRSSFeeds() {
  try {
    const [rows] = await pool.execute('SELECT * FROM rss_feeds');
    return rows;
  } catch (error) {
    console.error('获取 RSS 源失败:', error);
    throw error;
  }
}

/**
 * 根据分类获取 RSS 源
 */
async function getRSSFeedsByCategory(category) {
  try {
    const [rows] = await pool.execute('SELECT * FROM rss_feeds WHERE category = ?', [category]);
    return rows;
  } catch (error) {
    console.error('根据分类获取 RSS 源失败:', error);
    throw error;
  }
}

/**
 * 获取所有分类
 */
async function getAllCategories() {
  try {
    const [rows] = await pool.execute('SELECT DISTINCT category FROM rss_feeds');
    return rows.map(row => row.category).filter(category => category);
  } catch (error) {
    console.error('获取分类失败:', error);
    throw error;
  }
}

/**
 * 添加 RSS 源
 */
async function addRSSFeed(feed) {
  try {
    const { name, url, category = '未分类' } = feed;
    const [result] = await pool.execute(
      'INSERT INTO rss_feeds (name, url, category) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), category = VALUES(category)',
      [name, url, category]
    );
    return result;
  } catch (error) {
    console.error('添加 RSS 源失败:', error);
    throw error;
  }
}

/**
 * 批量添加 RSS 源
 */
async function addRSSFeeds(feeds) {
  try {
    const results = [];
    for (const feed of feeds) {
      const { name, url, category = '未分类' } = feed;
      const [result] = await pool.execute(
        'INSERT INTO rss_feeds (name, url, category) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), category = VALUES(category)',
        [name, url, category]
      );
      results.push(result);
    }
    return results;
  } catch (error) {
    console.error('批量添加 RSS 源失败:', error);
    throw error;
  }
}

/**
 * 更新 RSS 源分类
 */
async function updateRSSFeedCategory(url, category) {
  try {
    const [result] = await pool.execute(
      'UPDATE rss_feeds SET category = ? WHERE url = ?',
      [category, url]
    );
    return result;
  } catch (error) {
    console.error('更新 RSS 源分类失败:', error);
    throw error;
  }
}

/**
 * 删除 RSS 源
 */
async function deleteRSSFeed(url) {
  try {
    const [result] = await pool.execute('DELETE FROM rss_feeds WHERE url = ?', [url]);
    return result;
  } catch (error) {
    console.error('删除 RSS 源失败:', error);
    throw error;
  }
}

/**
 * 从 rss.json 文件导入数据到数据库
 */
async function importFromJSONFile() {
  try {
    const fs = await import('fs');
    const path = await import('path');

    const rssPath = path.resolve(process.cwd(), 'rss.json');
    if (!fs.existsSync(rssPath)) {
      console.log('rss.json 文件不存在，跳过导入');
      return;
    }

    const rssData = JSON.parse(fs.readFileSync(rssPath, 'utf8'));
    if (rssData.rssFeeds && Array.isArray(rssData.rssFeeds)) {
      const results = await addRSSFeeds(rssData.rssFeeds);
      const importedCount = results.filter(result => result.affectedRows > 0).length;
      console.log(`成功导入 ${importedCount} 个 RSS 源`);
      return importedCount;
    }
    return 0;
  } catch (error) {
    console.error('从 rss.json 文件导入数据失败:', error);
    throw error;
  }
}

// 导出模块
export {
  initializeDatabase,
  getAllRSSFeeds,
  getRSSFeedsByCategory,
  getAllCategories,
  addRSSFeed,
  addRSSFeeds,
  updateRSSFeedCategory,
  deleteRSSFeed,
  importFromJSONFile,
  getSystemConfig,
  updateSystemConfig,
  updateSystemConfigs,
  getRSSFeedsWithPagination,
  pool
};