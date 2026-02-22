import EventEmitter from 'events';

/**
 * 任务状态枚举
 */
const TaskStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * 任务队列管理器
 * 用于处理异步任务并提供进度报告
 */
class TaskQueue extends EventEmitter {
  constructor() {
    super();
    this.tasks = new Map();
    this.nextTaskId = 1;
  }

  /**
   * 创建一个新任务
   * @param {string} type - 任务类型
   * @param {Object} options - 任务选项
   * @returns {string} 任务ID
   */
  createTask(type, options = {}) {
    const taskId = `task_${this.nextTaskId++}`;
    const task = {
      id: taskId,
      type: type,
      status: TaskStatus.PENDING,
      progress: 0,
      startTime: null,
      endTime: null,
      duration: null,
      options: options,
      result: null,
      error: null,
      steps: []
    };

    this.tasks.set(taskId, task);
    this.emit('taskCreated', task);

    return taskId;
  }

  /**
   * 开始执行任务
   * @param {string} taskId - 任务ID
   * @param {Function} executor - 任务执行器函数
   * @returns {Promise} 任务执行结果
   */
  async startTask(taskId, executor) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    if (task.status !== TaskStatus.PENDING) {
      throw new Error(`任务状态不允许开始: ${task.status}`);
    }

    task.status = TaskStatus.IN_PROGRESS;
    task.startTime = new Date();
    this.emit('taskStarted', task);

    try {
      // 执行任务，传入任务更新回调
      const result = await executor((progress, step, message) => {
        this.updateProgress(taskId, progress, step, message);
      });

      task.status = TaskStatus.COMPLETED;
      task.endTime = new Date();
      task.duration = task.endTime - task.startTime;
      task.result = result;
      task.progress = 100;

      this.emit('taskCompleted', task);
    } catch (error) {
      task.status = TaskStatus.FAILED;
      task.endTime = new Date();
      task.duration = task.endTime - task.startTime;
      task.error = error;

      this.emit('taskFailed', task);
      throw error;
    }
  }

  /**
   * 取消任务
   * @param {string} taskId - 任务ID
   */
  cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (task && task.status === TaskStatus.IN_PROGRESS) {
      task.status = TaskStatus.CANCELLED;
      this.emit('taskCancelled', task);
    }
  }

  /**
   * 更新任务进度
   * @param {string} taskId - 任务ID
   * @param {number} progress - 进度百分比 (0-100)
   * @param {string} step - 当前步骤
   * @param {string} message - 进度消息
   */
  updateProgress(taskId, progress, step, message) {
    const task = this.tasks.get(taskId);
    if (task && task.status === TaskStatus.IN_PROGRESS) {
      task.progress = Math.max(0, Math.min(100, progress));

      if (step) {
        const existingStepIndex = task.steps.findIndex(s => s.step === step);
        if (existingStepIndex >= 0) {
          task.steps[existingStepIndex].message = message;
          task.steps[existingStepIndex].timestamp = new Date();
        } else {
          task.steps.push({
            step: step,
            message: message,
            timestamp: new Date()
          });
        }
      }

      this.emit('taskProgress', task);
    }
  }

  /**
   * 获取任务信息
   * @param {string} taskId - 任务ID
   * @returns {Object|null} 任务信息
   */
  getTask(taskId) {
    return this.tasks.get(taskId) || null;
  }

  /**
   * 获取所有任务
   * @returns {Array} 任务列表
   */
  getTasks() {
    return Array.from(this.tasks.values());
  }

  /**
   * 获取任务状态
   * @param {string} taskId - 任务ID
   * @returns {string} 任务状态
   */
  getTaskStatus(taskId) {
    const task = this.tasks.get(taskId);
    return task ? task.status : null;
  }

  /**
   * 清理已完成的任务（可选）
   * @param {number} maxAge - 保留的最大时间（毫秒）
   */
  cleanupTasks(maxAge = 3600000) {
    const now = Date.now();
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.FAILED) {
        const taskAge = now - (task.endTime || task.startTime || now);
        if (taskAge > maxAge) {
          this.tasks.delete(taskId);
        }
      }
    }
  }

  /**
   * 获取任务统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const stats = {
      total: this.tasks.size,
      pending: 0,
      inProgress: 0,
      completed: 0,
      failed: 0,
      cancelled: 0
    };

    for (const task of this.tasks.values()) {
      stats[task.status]++;
    }

    return stats;
  }
}

// 创建单例实例
const taskQueue = new TaskQueue();
export { taskQueue, TaskStatus };
