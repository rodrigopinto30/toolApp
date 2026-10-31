import type { Locator } from "@playwright/test";

import { ADMIN_AUDIT_PATH, ADMIN_COUPONS_PATH, ADMIN_EXCHANGE_RATES_PATH, ADMIN_PICKUP_POINTS_PATH, ADMIN_SHIPPING_PATH } from "../../src/features/admin/paths";
import { AppPage } from "./app-page";

export type CouponDraft = { code: string; value: string };
export type ZoneDraft = { code: string; name: string; cost: string; etaMin: string; etaMax: string };

abstract class AdminPage extends AppPage {
  readonly sheet = this.page.getByRole("dialog");
  readonly dialog = this.page.getByRole("alertdialog");
  readonly navigation = this.page.getByRole("navigation", { name: this.t.Admin.nav.label });

  protected async remove(name: string): Promise<void> {
    await this.main.getByRole("button", { name: this.t.Admin.deleteItem.replace("{name}", name) }).click();
    await this.dialog.getByRole("button", { name: this.t.Admin.confirmDelete }).click();
  }

  protected async edit(name: string): Promise<void> {
    await this.main.getByRole("button", { name: this.t.Admin.editItem.replace("{name}", name) }).click();
  }

  protected async save(): Promise<void> {
    await this.sheet.getByRole("button", { name: this.t.Admin.save }).click();
  }

  row(text: string): Locator {
    return this.main.getByRole("row").filter({ hasText: text });
  }
}

export class AdminCouponsPage extends AdminPage {
  protected readonly path = ADMIN_COUPONS_PATH;
  readonly add = this.main.getByRole("button", { name: this.t.Admin.coupons.add });

  async create({ code, value }: CouponDraft): Promise<void> {
    const t = this.t.Admin.coupons;
    await this.add.click();
    await this.sheet.getByLabel(t.code, { exact: true }).fill(code);
    await this.sheet.getByLabel(t.value, { exact: true }).fill(value);
    await this.save();
  }

  async changeValue(code: string, value: string): Promise<void> {
    await this.edit(code);
    await this.sheet.getByLabel(this.t.Admin.coupons.value, { exact: true }).fill(value);
    await this.save();
  }

  async delete(code: string): Promise<void> {
    await this.remove(code);
  }
}

export class AdminExchangeRatesPage extends AdminPage {
  protected readonly path = ADMIN_EXCHANGE_RATES_PATH;
  readonly add = this.main.getByRole("button", { name: this.t.Admin.exchangeRates.add });
  readonly rows = this.main.getByRole("row");

  async create(rate: string): Promise<void> {
    await this.add.click();
    await this.sheet.getByLabel(this.t.Admin.exchangeRates.rate, { exact: true }).fill(rate);
    await this.save();
  }
}

export class AdminShippingPage extends AdminPage {
  protected readonly path = ADMIN_SHIPPING_PATH;
  readonly add = this.main.getByRole("button", { name: this.t.Admin.zones.add });

  async create({ code, name, cost, etaMin, etaMax }: ZoneDraft): Promise<void> {
    const t = this.t.Admin.zones;
    await this.add.click();
    await this.sheet.getByLabel(t.code, { exact: true }).fill(code);
    await this.sheet.getByLabel(this.t.Admin.inSpanish.replace("{label}", t.name), { exact: true }).fill(name);
    await this.sheet.getByLabel(this.t.Admin.inEnglish.replace("{label}", t.name), { exact: true }).fill(name);
    await this.sheet.getByLabel(t.cost, { exact: true }).fill(cost);
    await this.sheet.getByLabel(t.etaMin, { exact: true }).fill(etaMin);
    await this.sheet.getByLabel(t.etaMax, { exact: true }).fill(etaMax);
    await this.save();
  }

  async delete(code: string): Promise<void> {
    await this.remove(code);
  }
}

export class AdminPickupPointsPage extends AdminPage {
  protected readonly path = ADMIN_PICKUP_POINTS_PATH;
  readonly add = this.main.getByRole("button", { name: this.t.Admin.pickupPoints.add });

  async createInactive(name: string, address: string): Promise<void> {
    const t = this.t.Admin.pickupPoints;
    await this.add.click();
    await this.sheet.getByLabel(t.name, { exact: true }).fill(name);
    await this.sheet.getByLabel(t.address, { exact: true }).fill(address);
    await this.sheet.getByLabel(this.t.Admin.isActive, { exact: true }).click();
    await this.save();
  }

  async delete(name: string): Promise<void> {
    await this.remove(name);
  }
}

export class AdminAuditPage extends AdminPage {
  protected readonly path = ADMIN_AUDIT_PATH;

  async filterByEntity(entity: string, id: string): Promise<void> {
    const t = this.t.Admin.audit;
    await this.main.getByLabel(t.entity, { exact: true }).fill(entity);
    await this.main.getByLabel(t.entity_id, { exact: true }).fill(id);
    await this.main.getByRole("button", { name: t.apply }).click();
  }
}
