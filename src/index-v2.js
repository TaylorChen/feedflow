#!/usr/bin/env node

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { WorkflowManager } from './workflow/WorkflowManager.js';
import { ArticleRepository } from './data/repositories/ArticleRepository.js';
import { StorageManager } from './data/storage/StorageManager.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 命令行接口
 * 支持多种操作模式
 */
class CLI {
  static commands = {
    help: '显示帮助信息',
    start: '执行完整的工作流（抓取→存储→分析→生成）',
    fetch: '只抓取RSS内容',
    analyze: '只分析现有文章',
    generate: '执行增量更新（只处理新文章）',
    stats: '显示文章统计信息',
    report: '查看报告',
    cleanup: '执行系统清理',
    config: '显示配置信息'
  };

  static async run() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === 'help') {
      this.showHelp();
      return;
    }

    try {
      switch (args[0]) {
        case 'start':
          await this.executeCommand('start', '执行完整工作流', 'full');
          break;
        case 'fetch':
          await this.executeCommand('fetch', '只抓取RSS内容', 'fetch');
          break;
        case 'analyze':
          await this.executeCommand('analyze', '只分析现有文章', 'analyze');
          break;
        case 'generate':
          await this.executeCommand('generate', '执行增量更新', 'incremental');
          break;
        case 'stats':
          await this.showStats();
          break;
        case 'report':
          await this.showReports();
          break;
        case 'cleanup':
          await this.executeCleanup();
          break;
        case 'config':
          await this.showConfig();
          break;
        default:
          console.error(`未知命令: ${args[0]}`);
          this.showHelp();
      }

    } catch (error) {
      console.error('\n❌ 执行命令失败:');
      console.error(`   ${error.message}`);
      if (error.stack) {
        console.error(`\n详细信息:\n${error.stack}`);
      }
      process.exit(1);
    }
  }

  static async executeCommand(commandName, description, workflowType) {
    console.log(`执行命令: ${commandName}`);
    console.log(`说明: ${description}`);
    console.log('='.repeat(60));

    let result;

    switch (workflowType) {
      case 'full':
        result = await WorkflowManager.executeFullWorkflow();
        break;
      case 'fetch':
        result = await this.fetchOnly();
        break;
      case 'analyze':
        result = await WorkflowManager.analyzeExistingArticles(1);
        break;
      case 'incremental':
        result = await WorkflowManager.executeIncrementalWorkflow(1);
        break;
    }

    this.printResult(result);
  }

  static async fetchOnly() {
    console.log('该命令将只抓取RSS内容，不进行分析和生成。');
    return await WorkflowManager.executeFullWorkflow(0); // 0表示不生成博客
  }

  static async showStats() {
    console.log('文章统计信息:');
    console.log('='.repeat(60));

    const stats = await ArticleRepository.getArticleStats();

    console.log('📊 基本统计:');
    console.log(`  总文章数: ${stats.totalArticles}`);
    console.log(`  已处理: ${stats.processedArticles} (${((stats.processedArticles / stats.totalArticles) * 100).toFixed(1)}%)`);
    console.log(`  未处理: ${stats.unprocessedArticles}`);
    console.log();

    console.log('🎯 主题分布:');
    stats.topicDistribution.forEach(({ topic, count }) => {
      const percentage = ((count / stats.processedArticles) * 100).toFixed(1);
      console.log(`  - ${topic}: ${count}篇 (${percentage}%)`);
    });
    console.log();

    console.log('📈 来源分布:');
    const top5Sources = stats.sourceDistribution.slice(0, 5);
    top5Sources.forEach(({ source, count }) => {
      const percentage = ((count / stats.totalArticles) * 100).toFixed(1);
      console.log(`  - ${source}: ${count}篇 (${percentage}%)`);
    });

    if (stats.sourceDistribution.length > 5) {
      const others = stats.sourceDistribution.slice(5);
      const otherCount = others.reduce((sum, { count }) => sum + count, 0);
      const otherPercentage = ((otherCount / stats.totalArticles) * 100).toFixed(1);
      console.log(`  - 其他 ${others.length} 个来源: ${otherCount}篇 (${otherPercentage}%)`);
    }

    console.log();
    console.log('📝 内容长度分布:');
    Object.entries(stats.lengthDistribution).forEach(([category, count]) => {
      const percentage = ((count / stats.totalArticles) * 100).toFixed(1);
      console.log(`  - ${category}: ${count}篇 (${percentage}%)`);
    });
  }

  static async showReports() {
    const reportsDir = path.join(__dirname, '../data/reports');
    console.log('可用报告:');
    console.log('='.repeat(60));

    try {
      const files = await import('fs/promises');
      const reportFiles = await files.readdir(reportsDir);

      if (reportFiles.length === 0) {
        console.log('⚠ 没有找到报告文件');
        return;
      }

      // 按时间排序（最新的在前）
      const jsonFiles = reportFiles
        .filter(filename => filename.endsWith('.json'))
        .sort()
        .reverse();

      console.log('JSON报告:');
      jsonFiles.forEach(filename => {
        const time = new Date(parseInt(filename.match(/\d+/)?.[0] || '')).toLocaleString();
        console.log(`  ${filename} (${time})`);
      });

      const htmlFiles = reportFiles
        .filter(filename => filename.endsWith('.html'))
        .sort()
        .reverse();

      if (htmlFiles.length > 0) {
        console.log('\nHTML报告:');
        htmlFiles.forEach(filename => {
          const time = new Date(parseInt(filename.match(/\d+/)?.[0] || '')).toLocaleString();
          console.log(`  ${filename} (${time})`);
        });
      }

      // 显示最新报告内容
      if (jsonFiles.length > 0) {
        const latestReport = jsonFiles[0];
        const reportPath = path.join(reportsDir, latestReport);
        const content = await files.readFile(reportPath, 'utf8');
        const report = JSON.parse(content);

        console.log(`\n最新报告 (${latestReport}):`);
        console.log(`  执行时间: ${report.startTime}`);
        console.log(`  执行时长: ${report.duration}`);
        console.log(`  生成博客: ${report.generatedBlogs}`);

        if (report.blogs && report.blogs.length > 0) {
          console.log(`  博客详情:`);
          report.blogs.forEach(blog => {
            console.log(`    - ${blog.title} (${blog.wordCount}字)`);
          });
        }
      }

    } catch (error) {
      console.error('读取报告失败:', error);
    }
  }

  static async executeCleanup() {
    console.log('执行系统清理...');
    const result = await WorkflowManager.executeCleanupWorkflow();
    this.printResult(result);
  }

  static async showConfig() {
    const config = await WorkflowManager.loadConfig();
    console.log('系统配置:');
    console.log('='.repeat(60));

    console.log('📦 RSS源配置:');
    console.log(`  源数量: ${config.rssFeeds.length}`);
    console.log(`  分类统计:`);

    const categories = {};
    config.rssFeeds.forEach(feed => {
      categories[feed.category] = (categories[feed.category] || 0) + 1;
    });

    Object.entries(categories).forEach(([category, count]) => {
      console.log(`    ${category}: ${count}个源`);
    });

    console.log();
    console.log('📝 文章配置:');
    console.log(`  分类: ${config.article.categories.join(', ')}`);
    console.log(`  默认标签: ${config.article.defaultTags.join(', ')}`);
    console.log(`  目标字数: ${config.article.targetLength}`);

    console.log();
    console.log('📂 输出配置:');
    console.log(`  博客目录: ${config.output.postsDir}`);
    console.log(`  图片目录: ${config.output.imagesDir}`);
  }

  static printResult(result) {
    if (!result) {
      console.log('❌ 未返回结果');
      return;
    }

    console.log('='.repeat(60));

    if (result.success) {
      console.log('✅ 任务执行成功');
      console.log(`📊 耗时: ${result.duration}`);
    } else {
      console.log('❌ 任务执行失败');
      if (result.message) {
        console.log(`💬 ${result.message}`);
      }
    }

    if (result.data) {
      console.log('🔍 结果详情:');
      console.log(JSON.stringify(result.data, null, 2));
    }

    console.log('='.repeat(60));
  }

  static showHelp() {
    console.log('FeedFlow - 技术文章聚合与博客生成系统');
    console.log('='.repeat(60));
    console.log('使用方法:');
    console.log('  node src/index-v2.js <命令> [选项]');
    console.log();
    console.log('可用命令:');

    Object.entries(this.commands).forEach(([command, description]) => {
      console.log(`  ${command.padEnd(10)} ${description}`);
    });

    console.log();
    console.log('示例:');
    console.log('  执行完整工作流:');
    console.log('    node src/index-v2.js start');
    console.log();
    console.log('  显示统计信息:');
    console.log('    node src/index-v2.js stats');
    console.log();
    console.log('  执行系统清理:');
    console.log('    node src/index-v2.js cleanup');
    console.log();
    console.log('  显示配置信息:');
    console.log('    node src/index-v2.js config');
  }
}

// 执行命令行接口
CLI.run().catch(error => {
  console.error('程序执行错误:');
  console.error(error);
  process.exit(1);
});
