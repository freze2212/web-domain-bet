import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { TasksService } from './tasks.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

@Controller('api/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  listTasks() {
    return { success: true, tasks: this.tasksService.listTasks() };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  getTask(@Param('id') id: string) {
    const task = this.tasksService.getTask(id);
    if (!task) return { success: false, error: 'Không tìm thấy task' };
    return { success: true, task };
  }
}
