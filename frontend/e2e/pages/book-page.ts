import type { Locator } from "@playwright/test";

import { AppPage } from "./app-page";

export type Address = { label: string; street: string };
export type BillingDetails = { legalName: string; taxId: string; fiscalAddress: string };

abstract class BookPage extends AppPage {
  readonly sheet = this.page.getByRole("dialog");
  readonly dialog = this.page.getByRole("alertdialog");
  abstract readonly empty: Locator;
  abstract readonly addButton: Locator;

  private editButton(name: string): Locator {
    return this.page.getByRole("button", { name: this.t.Account.book.editItem.replace("{name}", name), exact: true });
  }

  entry(name: string): Locator {
    return this.main.getByRole("listitem").filter({ has: this.editButton(name) });
  }

  defaultBadge(name: string): Locator {
    return this.entry(name).getByText(this.t.Account.book.default, { exact: true });
  }

  async edit(name: string): Promise<void> {
    await this.editButton(name).click();
  }

  async makeDefault(name: string): Promise<void> {
    await this.main.getByRole("button", { name: this.t.Account.book.makeDefaultItem.replace("{name}", name) }).click();
  }

  async remove(name: string): Promise<void> {
    await this.main.getByRole("button", { name: this.t.Account.book.deleteItem.replace("{name}", name) }).click();
    await this.dialog.getByRole("button", { name: this.t.Account.book.confirmDelete }).click();
  }
}

export class AddressesPage extends BookPage {
  protected readonly path = "/account/addresses";
  readonly empty = this.main.getByText(this.t.Account.addresses.empty);
  readonly addButton = this.main.getByRole("button", { name: this.t.Account.addresses.add });

  async fill({ label, street }: Address): Promise<void> {
    const t = this.t.AddressForm;
    await this.sheet.getByLabel(t.label, { exact: true }).fill(label);
    await this.sheet.getByLabel(t.street, { exact: true }).fill(street);
  }

  async add(address: Address): Promise<void> {
    const t = this.t.AddressForm;
    await this.addButton.click();
    await this.fill(address);
    await this.sheet.getByLabel(t.recipient, { exact: true }).fill("Ana Diaz");
    await this.sheet.getByLabel(t.phone, { exact: true }).fill("1155555555");
    await this.sheet.getByLabel(t.number, { exact: true }).fill("1234");
    await this.sheet.getByLabel(t.city, { exact: true }).fill("CABA");
    await this.sheet.getByRole("combobox", { name: t.province }).click();
    await this.page.getByRole("option").first().click();
    await this.sheet.getByLabel(t.postalCode, { exact: true }).fill("C1043");
    await this.save();
  }

  async save(): Promise<void> {
    await this.sheet.getByRole("button", { name: this.t.AddressForm.submit }).click();
  }
}

export class BillingPage extends BookPage {
  protected readonly path = "/account/billing";
  readonly empty = this.main.getByText(this.t.Account.billing.empty);
  readonly addButton = this.main.getByRole("button", { name: this.t.Account.billing.add });

  async fill({ legalName, taxId, fiscalAddress }: BillingDetails): Promise<void> {
    const t = this.t.BillingForm;
    await this.sheet.getByLabel(t.taxId, { exact: true }).fill(taxId);
    await this.sheet.getByLabel(t.legalName, { exact: true }).fill(legalName);
    await this.sheet.getByLabel(t.fiscalAddress, { exact: true }).fill(fiscalAddress);
  }

  async add(details: BillingDetails): Promise<void> {
    await this.addButton.click();
    await this.fill(details);
    await this.save();
  }

  async save(): Promise<void> {
    await this.sheet.getByRole("button", { name: this.t.BillingForm.submit }).click();
  }
}
