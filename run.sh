#!/bin/bash

# 技术文章聚合与博客生成自动化脚本

echo "=================================="
echo "FeedFlow - 技术文章聚合与博客生成系统"
echo "=================================="
echo ""

# 检查 .env 文件
if [ ! -f .env ]; then
    echo "❌ 错误: 未找到 .env 文件"
    echo "请先复制 .env.example 为 .env 并配置API密钥"
    echo ""
    echo "  cp .env.example .env"
    echo "  然后编辑 .env 文件填入你的API密钥"
    exit 1
fi

# 检查 ANTHROPIC_API_KEY
if ! grep -q "ANTHROPIC_API_KEY=sk-" .env 2>/dev/null; then
    echo "⚠️  警告: ANTHROPIC_API_KEY 可能未配置"
    echo "请确保在 .env 文件中配置了有效的 Anthropic API Key"
    echo ""
fi

# 运行主程序
echo "🚀 开始运行..."
echo ""
npm start

echo ""
echo "=================================="
echo "✅ 完成"
echo "=================================="
