import { Controller, Get, Post, Body, Req, UseGuards, Param, Query } from '@nestjs/common';
import { DomainOrdersService } from './domain-orders.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';

@Controller('api/domain-orders')
export class DomainOrdersController {
  constructor(private readonly ordersService: DomainOrdersService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  createOrder(@Body() body: { domain: string; note?: string }, @Req() req: any) {
    const res = this.ordersService.createOrder({
      userId: req.user.id,
      username: req.user.username,
      fullName: req.user.fullName,
      domain: body.domain,
      note: body.note,
    });
    return { success: true, ...res };
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  listOrders(@Req() req: any, @Query('status') status?: string) {
    const list = this.ordersService.listOrders({
      userId: req.user.id,
      role: req.user.role,
      status,
    });
    return { success: true, count: list.length, orders: list };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post(':id/approve')
  approveOrder(@Param('id') id: string, @Req() req: any) {
    const res = this.ordersService.approveOrder(id, req.user);
    return { success: true, ...res };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post(':id/reject')
  rejectOrder(@Param('id') id: string, @Body() body: { reason?: string }, @Req() req: any) {
    const res = this.ordersService.rejectOrder(id, req.user, body.reason);
    return { success: true, ...res };
  }
}
