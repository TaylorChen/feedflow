import fs from 'fs/promises';
import path from 'path';

const tasksDir = path.join(process.cwd(), '.tasks');

// 任务状态更新函数
async function updateTasks() {
  try {
    // 检查任务目录是否存在
    try {
      await fs.access(tasksDir);
    } catch (error) {
      console.log('任务目录不存在，已创建');
      await fs.mkdir(tasksDir, { recursive: true });
    }

    // 读取所有任务文件
    const taskFiles = await fs.readdir(tasksDir);
    const jsonFiles = taskFiles.filter(file => file.endsWith('.json'));

    if (jsonFiles.length === 0) {
      console.log('没有找到任务文件');
      return;
    }

    console.log(`找到 ${jsonFiles.length} 个任务文件`);

    // 更新每个任务的状态
    for (const fileName of jsonFiles) {
      const filePath = path.join(tasksDir, fileName);
      const fileContent = await fs.readFile(filePath, 'utf8');
      const task = JSON.parse(fileContent);

      // 检查任务是否已经是已完成状态
      if (task.status === 'completed') {
        continue;
      }

      // 根据任务主题判断是否需要更新状态
      // 这里可以根据实际情况添加逻辑
      // 例如：如果任务主题包含"OPML"、"导入"、"去重"、"进度"等关键词，说明任务已完成
      const taskKeywords = ['OPML', '导入', '去重', '进度'];
      const isTaskCompleted = taskKeywords.some(keyword =>
        task.subject.includes(keyword) || task.description.includes(keyword)
      );

      if (isTaskCompleted) {
        task.status = 'completed';
        task.activeForm = '任务已完成';
        await fs.writeFile(filePath, JSON.stringify(task, null, 2));
        console.log(`更新任务 ${task.id} 的状态为已完成`);
      }
    }

    console.log('任务状态更新完成');
  } catch (error) {
    console.error('更新任务状态时出错:', error);
  }
}

// 执行更新任务状态函数
updateTasks();
