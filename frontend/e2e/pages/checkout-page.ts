import { AppPage } from "./app-page";
import { APPROVED_CARD, fillCard, type CardNumber } from "./card-form";

export type NewAddress = {
  label: string;
  recipient: string;
  phone: string;
  street: string;
  number: string;
  city: string;
  province: string;
  postalCode: string;
};

export class CheckoutPage extends AppPage {
  protected readonly path = "/checkout";
  readonly delivery = this.main.getByRole("region", { name: this.t.Checkout.delivery.title });
  readonly billing = this.main.getByRole("region", { name: this.t.Checkout.billing.title });
  readonly coupon = this.main.getByRole("region", { name: this.t.Checkout.coupon.title });
  readonly payment = this.main.getByRole("form", { name: this.t.Checkout.payment.title });
  readonly summary = this.main.getByRole("region", { name: this.t.Checkout.summary.title });
  readonly payButton = this.payment.getByRole("button", { name: new RegExp(`^${this.t.Checkout.payment.submitNoTotal}`) });
  readonly verifyNotice = this.main.getByText(this.t.Checkout.verify);

  async chooseDelivery(method: "shipping" | "pickup"): Promise<void> {
    await this.delivery.locator("label").filter({ hasText: this.t.Checkout.delivery.methods[method] }).click();
  }

  async addAddress(address: NewAddress): Promise<void> {
    const add = this.delivery.getByRole("button", { name: this.t.Checkout.delivery.addAddress });
    if (await add.isVisible()) {
      await add.click();
    }
    const form = this.t.AddressForm;
    await this.delivery.getByLabel(form.label, { exact: true }).fill(address.label);
    await this.delivery.getByLabel(form.recipient, { exact: true }).fill(address.recipient);
    await this.delivery.getByLabel(form.phone, { exact: true }).fill(address.phone);
    await this.delivery.getByLabel(form.street, { exact: true }).fill(address.street);
    await this.delivery.getByLabel(form.number, { exact: true }).fill(address.number);
    await this.delivery.getByLabel(form.city, { exact: true }).fill(address.city);
    await this.delivery.getByRole("combobox", { name: form.province }).click();
    await this.page.getByRole("option", { name: address.province, exact: true }).click();
    await this.delivery.getByLabel(form.postalCode, { exact: true }).fill(address.postalCode);
    await this.delivery.getByRole("button", { name: form.submit }).click();
  }

  async addBillingProfile(taxId: string): Promise<void> {
    await this.billing.getByRole("button", { name: this.t.Checkout.billing.addProfile }).click();
    const form = this.t.BillingForm;
    await this.billing.getByLabel(form.taxId, { exact: true }).fill(taxId);
    await this.billing.getByLabel(form.legalName, { exact: true }).fill("Ana Prueba");
    await this.billing.getByLabel(form.fiscalAddress, { exact: true }).fill("Calle Falsa 123, CABA");
    await this.billing.getByRole("button", { name: form.submit }).click();
  }

  async applyCoupon(code: string): Promise<void> {
    await this.coupon.getByLabel(this.t.Checkout.coupon.label, { exact: true }).fill(code);
    await this.coupon.getByRole("button", { name: this.t.Checkout.coupon.apply }).click();
  }

  async fillCard(number: CardNumber): Promise<void> {
    await fillCard(this.payment, this.t, number);
  }

  async pay(number: CardNumber = APPROVED_CARD): Promise<void> {
    await this.fillCard(number);
    await this.payButton.click();
  }

  orderUrl(): RegExp {
    return new RegExp(`/${this.locale}/account/orders/TA-\\d{4}-\\d{6}(\\?placed=1)?$`);
  }
}
