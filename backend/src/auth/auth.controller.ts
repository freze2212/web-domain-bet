import { Controller, Post, Get, Body, Req, UseGuards, Param, Put, Delete } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { Roles } from './roles.decorator.js';

@Controller('api')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('auth/login')
  async login(@Body() body: { username?: string; password?: string }) {
    const result = await this.authService.login(body.username || '', body.password || '');
    return { success: true, ...result };
  }

  @Post('auth/register')
  async register(@Body() body: { username?: string; password?: string; fullName?: string }) {
    const result = await this.authService.register(body.username || '', body.password || '', body.fullName || '');
    return { success: true, ...result };
  }

  @UseGuards(JwtAuthGuard)
  @Get('auth/me')
  async getMe(@Req() req: any) {
    const user = this.authService.getUserById(req.user.id);
    if (!user) return { success: false, error: 'User not found' };
    const { passwordHash, ...safeUser } = user;
    return { success: true, user: safeUser };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('admin/users')
  async listUsers() {
    const users = this.authService.getAllUsers().map(({ passwordHash, ...u }) => u);
    return { success: true, count: users.length, users };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('admin/users')
  async createUser(@Body() body: { username: string; password: string; role?: 'admin' | 'user'; fullName?: string }) {
    const result = await this.authService.register(body.username, body.password, body.fullName);
    if (body.role && body.role === 'admin') {
      this.authService.updateUser(result.user.id, { role: 'admin' });
      result.user.role = 'admin';
    }
    return { success: true, user: result.user };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Put('admin/users/:id')
  async updateUser(@Param('id') id: string, @Body() body: any) {
    const updated = this.authService.updateUser(id, body);
    return { success: true, user: updated };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete('admin/users/:id')
  async deleteUser(@Param('id') id: string) {
    this.authService.deleteUser(id);
    return { success: true, message: 'Đã xóa người dùng' };
  }
}
