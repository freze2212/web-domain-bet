import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { appConfig } from '../config/env.config.js';
import { OwnershipService } from '../ownership/ownership.service.js';
import { WalletService } from '../wallet/wallet.service.js';

export interface DomainOrder {
  id: string;
  userId: string;
  username: string;
  fullName: string;
  domain: string;
  note: string;
  priceXu: number;
  priceVnd: number;
  priceUsd: number;
  ruleApplied: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  rejectReason: string | null;
  deductedAmount: number;
  remainingBalance?: number;
}

@Injectable()
export class DomainOrdersService {
  constructor(
    private readonly ownershipService: OwnershipService,
    private readonly walletService: WalletService,
  ) {}

  private getFilePath(): string {
    return path.join(appConfig.dataDir, 'domain_orders.json');
  }

  private loadOrders(): DomainOrder[] {
    const file = this.getFilePath();
    if (!fs.existsSync(file)) {
      if (!fs.existsSync(appConfig.dataDir)) {
        fs.mkdirSync(appConfig.dataDir, { recursive: true });
      }
      fs.writeFileSync(file, JSON.stringify([], null, 2), 'utf8');
      return [];
    }
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return [];
    }
  }

  private saveOrders(data: DomainOrder[]): void {
    const file = this.getFilePath();
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  }

  createOrder({
    userId,
    username,
    fullName,
    domain,
    note = '',
  }: {
    userId: string;
    username?: string;
    fullName?: string;
    domain: string;
    note?: string;
  }) {
    const normDomain = domain.trim().toLowerCase().replace(/^www\./, '');
    if (!normDomain) {
      throw new BadRequestException('Vui lòng cung cấp tên miền hợp lệ');
    }

    const pricing = this.walletService.calculateDomainPriceRule(normDomain);
    const currentBalance = this.walletService.getBalance(userId);

    const orders = this.loadOrders();
    const existingPending = orders.find(
      (o) => o.domain === normDomain && o.status === 'pending',
    );
    if (existingPending) {
      if (existingPending.userId === userId) {
        throw new BadRequestException(`Bạn đã có đơn đặt mua cho tên miền ${normDomain} đang chờ Admin duyệt!`);
      } else {
        throw new BadRequestException(`Tên miền ${normDomain} hiện đã có một đơn đặt mua khác đang chờ Admin duyệt!`);
      }
    }

    const newOrder: DomainOrder = {
      id: `ord_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      username: username || userId,
      fullName: fullName || username || userId,
      domain: normDomain,
      note: note.trim(),
      priceXu: pricing.priceXu,
      priceVnd: pricing.priceVnd,
      priceUsd: pricing.priceUsd,
      ruleApplied: pricing.ruleApplied,
      status: 'pending',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      resolvedBy: null,
      rejectReason: null,
      deductedAmount: 0,
    };

    orders.unshift(newOrder);
    this.saveOrders(orders);

    return {
      order: newOrder,
      currentBalance,
      estimatedCost: pricing.priceXu,
    };
  }

  listOrders({
    userId,
    role = 'user',
    status,
  }: {
    userId?: string;
    role?: string;
    status?: string;
  } = {}) {
    let list = this.loadOrders();
    if (role !== 'admin' && userId) {
      list = list.filter((o) => o.userId === userId);
    }
    if (status) {
      list = list.filter((o) => o.status === status);
    }

    return list.map((o) => {
      const userBalance = this.walletService.getBalance(o.userId);
      const hasEnoughBalance = userBalance >= o.priceXu;
      const currentOwner = this.ownershipService.getDomainOwner(o.domain);

      return {
        ...o,
        userCurrentBalance: userBalance,
        hasEnoughBalance,
        currentOwner: currentOwner ? { userId: currentOwner.userId, username: currentOwner.username } : null,
      };
    });
  }

  getOrderById(id: string): DomainOrder | null {
    const orders = this.loadOrders();
    return orders.find((o) => o.id === id) || null;
  }

  approveOrder(orderId: string, adminUser: { id?: string; username?: string }) {
    const orders = this.loadOrders();
    const order = orders.find((o) => o.id === orderId);

    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn đặt mua này');
    }
    if (order.status !== 'pending') {
      throw new BadRequestException(`Đơn hàng này đã được xử lý trước đó (Trạng thái: ${order.status})`);
    }

    const userBalance = this.walletService.getBalance(order.userId);
    if (userBalance < order.priceXu && order.userId !== 'u_admin' && order.userId !== 'admin') {
      throw new BadRequestException(
        `Số dư của người dùng [${order.username}] không đủ để thanh toán! (Ví hiện có: ${userBalance.toLocaleString('vi-VN')} Xu, Cần: ${order.priceXu.toLocaleString('vi-VN')} Xu). Vui lòng thông báo nạp thêm Xu trước khi duyệt đơn.`,
      );
    }

    // 1. Deduct balance
    const deductRes = this.walletService.deductBalance(
      order.userId,
      order.priceXu,
      `Thanh toán mua tên miền [${order.domain}] - Đơn hàng #${order.id}`,
      { orderId: order.id, domain: order.domain, rule: order.ruleApplied },
    );

    // 2. Assign domain
    this.ownershipService.assignDomain(order.domain, order.userId, {
      approvedBy: adminUser.username || adminUser.id || 'admin',
      approvedAt: new Date().toISOString(),
      username: order.username,
      fullName: order.fullName,
      orderId: order.id,
      purchasedWithXu: order.priceXu,
    });

    // 3. Update status
    order.status = 'approved';
    order.resolvedAt = new Date().toISOString();
    order.resolvedBy = adminUser.username || adminUser.id || 'admin';
    order.deductedAmount = order.priceXu;
    order.remainingBalance = deductRes.balance;

    this.saveOrders(orders);

    return {
      order,
      deductedAmount: order.priceXu,
      remainingBalance: deductRes.balance,
    };
  }

  rejectOrder(orderId: string, adminUser: { id?: string; username?: string }, reason = 'Admin từ chối đơn đặt mua') {
    const orders = this.loadOrders();
    const order = orders.find((o) => o.id === orderId);

    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn đặt mua này');
    }
    if (order.status !== 'pending') {
      throw new BadRequestException(`Đơn hàng này đã được xử lý trước đó (Trạng thái: ${order.status})`);
    }

    order.status = 'rejected';
    order.resolvedAt = new Date().toISOString();
    order.resolvedBy = adminUser.username || adminUser.id || 'admin';
    order.rejectReason = reason;

    this.saveOrders(orders);

    return {
      order,
      message: 'Đã từ chối đơn đặt mua thành công. Không trừ Xu của người dùng.',
    };
  }
}
