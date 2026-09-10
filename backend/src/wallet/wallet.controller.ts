import { Controller, Get, Post, Body, Req, UseGuards, Put } from '@nestjs/common';
import { WalletService } from './wallet.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';

@Controller('api/wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @UseGuards(JwtAuthGuard)
  @Get('balance')
  getBalance(@Req() req: any) {
    const balance = this.walletService.getBalance(req.user.id);
    return { success: true, balance, userId: req.user.id };
  }

  @UseGuards(JwtAuthGuard)
  @Get('transactions')
  getTransactions(@Req() req: any) {
    const list = this.walletService.getTransactions(req.user.role === 'admin' ? undefined : req.user.id);
    return { success: true, transactions: list };
  }

  @UseGuards(JwtAuthGuard)
  @Get('vietqr-info')
  getVietQrInfo(@Req() req: any) {
    const info = this.walletService.generateVietQrInfo(req.user.username);
    return { success: true, ...info };
  }

  @Get('pricing')
  getPricing() {
    const pricing = this.walletService.getPricing();
    return { success: true, pricing };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Put('pricing')
  updatePricing(@Body() body: any) {
    const updated = this.walletService.updatePricing(body);
    return { success: true, pricing: updated };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('bank-config')
  getBankConfig() {
    const config = this.walletService.getBankConfig();
    return { success: true, config };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Put('bank-config')
  updateBankConfig(@Body() body: any) {
    const updated = this.walletService.updateBankConfig(body);
    return { success: true, config: updated };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('topup')
  topup(@Body() body: { userId: string; amount: number; note?: string }, @Req() req: any) {
    const res = this.walletService.topupBalance(body.userId, body.amount, body.note, req.user.username);
    return { success: true, ...res };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('all-wallets')
  getAllWallets() {
    const wallets = this.walletService.getAllWallets();
    return { success: true, wallets };
  }
}
