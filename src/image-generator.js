import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 使用OpenAI DALL-E生成图片
 * @param {string} prompt - 图片描述
 * @param {string} outputPath - 输出路径
 * @returns {Promise<string>} 图片文件名
 */
async function generateWithDALLE(prompt, outputPath) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('未设置OPENAI_API_KEY环境变量');
  }

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/images/generations',
      {
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: '1792x1024',
        quality: 'standard'
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const imageUrl = response.data.data[0].url;

    // 下载图片
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(imageResponse.data);

    // 生成文件名
    const timestamp = Date.now();
    const filename = `newsletter-${timestamp}.png`;
    const filepath = path.join(outputPath, filename);

    await fs.writeFile(filepath, imageBuffer);
    console.log(`✓ 图片已保存: ${filename}`);

    return filename;

  } catch (error) {
    console.error('✗ DALL-E图片生成失败:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * 生成文章配图
 * @param {string} imagePrompt - 图片描述
 * @param {string} imagesDir - 图片保存目录
 * @returns {Promise<string>} 图片文件名
 */
export async function generateImage(imagePrompt, imagesDir) {
  console.log('\n开始生成文章配图...');
  console.log(`提示词: ${imagePrompt}`);

  // 确保目录存在
  let expandedPath;
  try {
    // 处理路径
    if (!imagesDir || imagesDir === '/' || imagesDir === '\\' || imagesDir === '/test') {
      console.warn('⚠ 无效的图片目录，使用默认目录');
      expandedPath = path.join(__dirname, '../images');
    } else if (imagesDir.startsWith('~')) {
      expandedPath = imagesDir.replace('~', process.env.HOME);
    } else if (path.isAbsolute(imagesDir)) {
      // 确保绝对路径是有效的，避免在根目录或无效路径创建
      if (imagesDir.length <= 1 || imagesDir.startsWith('/test')) {
        expandedPath = path.join(__dirname, '../images');
      } else {
        expandedPath = imagesDir;
      }
    } else {
      // 相对路径相对于项目根目录
      if (imagesDir.startsWith('test')) {
        expandedPath = path.join(__dirname, '../images');
      } else {
        expandedPath = path.join(__dirname, '..', imagesDir);
      }
    }

    await fs.mkdir(expandedPath, { recursive: true });
    console.log(`✓ 图片目录已准备: ${expandedPath}`);
  } catch (error) {
    console.error('✗ 创建图片目录失败:', error.message);
    // 尝试使用项目本地目录作为备用
    const fallbackDir = path.join(__dirname, '../images');
    await fs.mkdir(fallbackDir, { recursive: true });
    console.log(`✓ 使用备用图片目录: ${fallbackDir}`);
    return null; // 或者返回 null 表示使用默认图片
  }

  try {
    // 优先使用DALL-E
    if (process.env.OPENAI_API_KEY) {
      return await generateWithDALLE(imagePrompt, expandedPath);
    } else {
      console.log('⚠ 未配置图片生成API，跳过配图生成');
      return null;
    }

  } catch (error) {
    console.error('✗ 图片生成失败:', error.message);
    return null;
  }
}
