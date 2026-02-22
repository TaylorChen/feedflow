#!/bin/bash

# 任务管理脚本

TASKS_DIR="/Users/demo/nodejs/feedflow/.tasks"

# 检查任务目录是否存在
if [ ! -d "$TASKS_DIR" ]; then
    echo "任务目录不存在: $TASKS_DIR"
    exit 1
fi

# 读取所有任务文件
TASK_FILES=$(ls "$TASKS_DIR"/task_*.json 2>/dev/null)

if [ -z "$TASK_FILES" ]; then
    echo "没有找到任务文件"
    exit 1
fi

# 显示任务列表
echo "任务列表:"
echo "----------------"
for TASK_FILE in $TASK_FILES; do
    # 提取任务ID
    TASK_ID=$(basename "$TASK_FILE" .json | sed 's/task_//')
    
    # 提取任务状态
    TASK_STATUS=$(jq -r '.status' "$TASK_FILE")
    
    # 提取任务主题
    TASK_SUBJECT=$(jq -r '.subject' "$TASK_FILE")
    
    # 显示任务信息
    if [ "$TASK_STATUS" = "completed" ]; then
        echo "✅ $TASK_ID. [$TASK_STATUS] $TASK_SUBJECT"
    else
        echo "🔄 $TASK_ID. [$TASK_STATUS] $TASK_SUBJECT"
    fi
done

# 统计任务完成情况
TOTAL_TASKS=$(echo "$TASK_FILES" | wc -l)
COMPLETED_TASKS=$(grep -rl '"status": "completed"' "$TASKS_DIR" 2>/dev/null | wc -l)
PENDING_TASKS=$((TOTAL_TASKS - COMPLETED_TASKS))

echo ""
echo "任务统计:"
echo "----------------"
echo "总任务数: $TOTAL_TASKS"
echo "已完成: $COMPLETED_TASKS"
echo "待完成: $PENDING_TASKS"
