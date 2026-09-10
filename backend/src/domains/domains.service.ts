import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { SpaceshipService } from '../spaceship/spaceship.service.js';
import { CloudflareService } from '../cloudflare/cloudflare.service.js';
import { TemplatesService } from '../templates/templates.service.js';
import { OwnershipService } from '../ownership/ownership.service.js';
import { WalletService } from '../wallet/wallet.service.js';

@Injectable()
export class DomainsService {
  private readonly logger = new Logger(DomainsService.name);

  constructor(
    private readonly spaceshipService: SpaceshipService,
    private readonly cloudflareService: CloudflareService,
    private readonly templatesService: TemplatesService,
    private readonly ownershipService: OwnershipService,
    private readonly walletService: WalletService,
  ) {}

  async checkDomain(domain: string) {
    const norm = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    if (!norm) {
      throw new BadRequestException('Tên miền không hợp lệ');
    }

    const pricing = this.walletService.calculateDomainPriceInXu(norm);
    let availability: any = { available: true };
    try {
      availability = await this.spaceshipService.checkDomainAvailability(norm);
    } catch (err: any) {
      this.logger.warn(`Lỗi kiểm tra Spaceship availability: ${err.message}`);
    }

    return {
      domain: norm,
      available: availability?.available ?? true,
      pricing,
    };
  }

  async buyAndConfigureDomain({
    domain,
    cnameTarget,
    targetUrl,
    telegramUrl,
    user,
  }: {
    domain: string;
    cnameTarget: string;
    targetUrl: string;
    telegramUrl?: string;
    user: any;
  }) {
    const norm = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    if (!norm) throw new BadRequestException('Tên miền không hợp lệ');

    // 1. Calculate price & verify balance
    const priceXu = this.walletService.calculateDomainPrice(norm);
    const balance = this.walletService.getBalance(user.id);
    if (balance < priceXu && user.role !== 'admin') {
      throw new BadRequestException(`Số dư không đủ! Cần ${priceXu} Xu, hiện có ${balance} Xu.`);
    }

    // 2. Register domain via Spaceship
    this.logger.log(`[Buy] Đăng ký tên miền ${norm}...`);
    const regRes = await this.spaceshipService.registerDomain(norm);

    // 3. Create or get Cloudflare Zone
    this.logger.log(`[Cloudflare] Tạo zone cho ${norm}...`);
    const zone = await this.cloudflareService.getOrCreateZone(norm);
    const nameservers = this.cloudflareService.getZoneNameservers(zone);

    // 4. Update NS on Spaceship
    this.logger.log(`[Spaceship] Cập nhật NS cho ${norm} -> ${nameservers.join(', ')}...`);
    await this.spaceshipService.updateNameservers(norm, nameservers).catch((e) => {
      this.logger.warn(`Cập nhật NS thất bại: ${e.message}`);
    });

    // 5. Ensure CNAME DNS records on Cloudflare
    const cleanCname = (cnameTarget || 'lp-gg88-vip-2.pages.dev').trim();
    this.logger.log(`[Cloudflare] Cấu hình CNAME ${norm} -> ${cleanCname}...`);
    await this.cloudflareService.ensurePagesCname(norm, cleanCname);

    // 6. Add Custom Domain to Cloudflare Pages Project
    const tpl = this.templatesService.getTemplate(cleanCname);
    const projectName = tpl?.pagesProject || cleanCname.replace('.pages.dev', '');
    this.logger.log(`[Pages] Thêm ${norm} vào Pages project ${projectName}...`);
    await this.cloudflareService.addPagesDomain(norm, projectName).catch(() => {});

    // 7. Update Template domains.json & JS Config
    if (targetUrl) {
      await this.templatesService.updateTemplateDomainsJson(cleanCname, norm, targetUrl, telegramUrl);
    }

    // 8. Deduct Balance
    this.walletService.deductBalance(user.id, priceXu, `Mua tên miền ${norm}`, { domain: norm, cname: cleanCname });

    // 9. Assign ownership
    this.ownershipService.assignDomain(norm, user.id, {
      username: user.username,
      fullName: user.fullName,
      purchasedWithXu: priceXu,
      cnameTarget: cleanCname,
      targetUrl,
    });

    return {
      success: true,
      domain: norm,
      cnameTarget: cleanCname,
      nameservers,
      regResult: regRes,
    };
  }

  async pointExistingDomain({
    domain,
    cnameTarget,
    targetUrl,
    telegramUrl,
    user,
  }: {
    domain: string;
    cnameTarget: string;
    targetUrl: string;
    telegramUrl?: string;
    user: any;
  }) {
    const norm = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    if (!norm) throw new BadRequestException('Tên miền không hợp lệ');

    // 1. Create or get Cloudflare Zone
    const zone = await this.cloudflareService.getOrCreateZone(norm);
    const nameservers = this.cloudflareService.getZoneNameservers(zone);

    // 2. Ensure CNAME
    const cleanCname = (cnameTarget || 'lp-gg88-vip-2.pages.dev').trim();
    await this.cloudflareService.ensurePagesCname(norm, cleanCname);

    // 3. Add Custom Domain to Cloudflare Pages Project
    const tpl = this.templatesService.getTemplate(cleanCname);
    const projectName = tpl?.pagesProject || cleanCname.replace('.pages.dev', '');
    await this.cloudflareService.addPagesDomain(norm, projectName).catch(() => {});

    // 4. Update Template domains.json & JS config
    if (targetUrl) {
      await this.templatesService.updateTemplateDomainsJson(cleanCname, norm, targetUrl, telegramUrl);
    }

    // 5. Assign ownership if not assigned
    if (!this.ownershipService.getDomainOwner(norm)) {
      this.ownershipService.assignDomain(norm, user.id, {
        username: user.username,
        fullName: user.fullName,
        type: 'EXISTING_POINTED',
        cnameTarget: cleanCname,
        targetUrl,
      });
    }

    return {
      success: true,
      domain: norm,
      cnameTarget: cleanCname,
      nameservers,
      message: `Đã trỏ tên miền ${norm} về ${cleanCname}. Vui lòng đảm bảo NS của tên miền là: ${nameservers.join(', ')}`,
    };
  }

  async listDomains(user: any) {
    const allAssignments = this.ownershipService.listAllAssignments();
    let userDomainNames = this.ownershipService.listUserDomainNames(user.id);

    // Get zones from Cloudflare
    let zones: any[] = [];
    try {
      zones = (await this.cloudflareService.listAllZones()) || [];
    } catch {}

    const list = zones.map((z) => {
      const owner = allAssignments[z.name] || null;
      const tpl = this.templatesService.findTemplateByDomain(z.name);
      return {
        id: z.id,
        name: z.name,
        status: z.status,
        name_servers: z.name_servers,
        owner: owner ? { userId: owner.userId, username: owner.username } : null,
        template: tpl ? { id: tpl.id, name: tpl.name, cname: tpl.cnameTarget } : null,
      };
    });

    if (user.role !== 'admin' && userDomainNames) {
      return list.filter((d) => userDomainNames?.includes(d.name));
    }

    return list;
  }
}
