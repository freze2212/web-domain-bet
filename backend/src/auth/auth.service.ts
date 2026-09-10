import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { appConfig } from '../config/env.config.js';

export interface User {
  id: string;
  username: string;
  passwordHash?: string;
  role: 'admin' | 'user';
  fullName?: string;
  balance?: number;
  createdAt: string;
  status: 'active' | 'banned';
}

@Injectable()
export class AuthService {
  private usersFile = path.join(appConfig.dataDir, 'users.json');

  constructor(private readonly jwtService: JwtService) {
    this.ensureUsersFile();
  }

  private ensureUsersFile() {
    if (!fs.existsSync(appConfig.dataDir)) {
      fs.mkdirSync(appConfig.dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.usersFile)) {
      const defaultAdmin: User = {
        id: 'u_admin',
        username: 'admin',
        passwordHash: this.hashPassword('admin123'),
        role: 'admin',
        fullName: 'Tổng Quản Trị (Admin)',
        createdAt: new Date().toISOString(),
        status: 'active',
      };
      fs.writeFileSync(this.usersFile, JSON.stringify([defaultAdmin], null, 2), 'utf8');
    }
  }

  private hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password.trim()).digest('hex');
  }

  getAllUsers(): User[] {
    try {
      if (!fs.existsSync(this.usersFile)) return [];
      const data = fs.readFileSync(this.usersFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  private saveUsers(users: User[]) {
    fs.writeFileSync(this.usersFile, JSON.stringify(users, null, 2), 'utf8');
  }

  async login(username: string, password: string) {
    const normUser = (username || '').trim().toLowerCase();
    const users = this.getAllUsers();
    const user = users.find((u) => u.username.toLowerCase() === normUser);

    if (!user) {
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không chính xác');
    }

    if (user.status === 'banned') {
      throw new UnauthorizedException('Tài khoản của bạn đã bị khóa bởi Quản trị viên');
    }

    const hash = this.hashPassword(password);
    if (user.passwordHash !== hash) {
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không chính xác');
    }

    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      fullName: user.fullName || user.username,
    };

    const token = this.jwtService.sign(payload);
    const { passwordHash, ...safeUser } = user;
    return {
      token,
      user: safeUser,
    };
  }

  async register(username: string, password: string, fullName = '') {
    const normUser = (username || '').trim().toLowerCase();
    if (!normUser || normUser.length < 3) {
      throw new BadRequestException('Tên đăng nhập phải có ít nhất 3 ký tự');
    }
    if (!password || password.length < 5) {
      throw new BadRequestException('Mật khẩu phải có ít nhất 5 ký tự');
    }

    const users = this.getAllUsers();
    if (users.some((u) => u.username.toLowerCase() === normUser)) {
      throw new BadRequestException('Tên đăng nhập này đã được sử dụng');
    }

    const newUser: User = {
      id: 'u_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      username: normUser,
      passwordHash: this.hashPassword(password),
      role: 'user',
      fullName: fullName.trim() || normUser,
      createdAt: new Date().toISOString(),
      status: 'active',
    };

    users.push(newUser);
    this.saveUsers(users);

    const payload = {
      sub: newUser.id,
      username: newUser.username,
      role: newUser.role,
      fullName: newUser.fullName,
    };

    const token = this.jwtService.sign(payload);
    const { passwordHash, ...safeUser } = newUser;
    return {
      token,
      user: safeUser,
    };
  }

  getUserById(id: string): User | null {
    const users = this.getAllUsers();
    return users.find((u) => u.id === id) || null;
  }

  updateUser(id: string, updateData: Partial<User>) {
    const users = this.getAllUsers();
    const idx = users.findIndex((u) => u.id === id);
    if (idx === -1) throw new BadRequestException('Không tìm thấy người dùng');

    if (updateData.passwordHash) {
      updateData.passwordHash = this.hashPassword(updateData.passwordHash);
    }

    users[idx] = { ...users[idx], ...updateData };
    this.saveUsers(users);
    const { passwordHash, ...safeUser } = users[idx];
    return safeUser;
  }

  deleteUser(id: string) {
    if (id === 'u_admin') throw new BadRequestException('Không thể xóa tài khoản Admin gốc');
    let users = this.getAllUsers();
    users = users.filter((u) => u.id !== id);
    this.saveUsers(users);
    return true;
  }
}
