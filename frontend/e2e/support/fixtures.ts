import { test as base, expect } from "@playwright/test";

import { AccountPage } from "../pages/account-page";
import { CheckoutPage } from "../pages/checkout-page";
import { ForgotPasswordPage } from "../pages/forgot-password-page";
import { HomePage } from "../pages/home-page";
import { LoginPage } from "../pages/login-page";
import { RegisterPage } from "../pages/register-page";
import { ResetPasswordPage } from "../pages/reset-password-page";
import { SearchPage } from "../pages/search-page";
import { VerifyEmailPage } from "../pages/verify-email-page";
import { registerUser } from "./api";
import { readShoppers, type Buyer, type BuyerName } from "./buyers";
import { emptyServerCart } from "./cart";
import { Mailbox } from "./mailbox";
import { cancelOpenOrders } from "./orders";
import { newUser, type TestUser } from "./users";

const EXPECTED_CONSOLE_ERROR =
  /^Failed to load resource: (the server responded with a status of 4\d\d\b|net::ERR_CONNECTION_RESET)/;

type Fixtures = {
  allowedConsoleError: RegExp | null;
  browserErrors: void;
  buyerName: BuyerName;
  buyer: Buyer;
  account: TestUser;
  mailbox: Mailbox;
  homePage: HomePage;
  loginPage: LoginPage;
  registerPage: RegisterPage;
  verifyEmailPage: VerifyEmailPage;
  forgotPasswordPage: ForgotPasswordPage;
  resetPasswordPage: ResetPasswordPage;
  accountPage: AccountPage;
  searchPage: SearchPage;
};

type WorkerFixtures = {
  unverifiedShopper: Buyer;
};

export const test = base.extend<Fixtures, WorkerFixtures>({
  buyerName: ["cart", { option: true }],
  buyer: async ({ buyerName }, use) => {
    await use(readShoppers().buyers[buyerName]);
  },
  unverifiedShopper: [
    async ({}, use) => {
      await use(readShoppers().unverified);
    },
    { scope: "worker" },
  ],
  allowedConsoleError: [null, { option: true }],
  browserErrors: [
    async ({ context, allowedConsoleError }, use) => {
      const errors: string[] = [];
      await context.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (event) => {
          console.error(
            `CSP violation: ${event.violatedDirective} ${event.blockedURI} at ${event.sourceFile}:${event.lineNumber}:${event.columnNumber}`,
          );
        });
      });
      context.on("console", (message) => {
        const expected = EXPECTED_CONSOLE_ERROR.test(message.text()) || allowedConsoleError?.test(message.text());
        if (message.type() === "error" && !expected) {
          errors.push(message.text());
        }
      });
      context.on("weberror", (error) => errors.push(error.error().message));
      await use();
      expect(errors, "console errors, uncaught exceptions and CSP violations").toEqual([]);
    },
    { auto: true },
  ],
  account: async ({ request }, use) => {
    const user = newUser();
    await registerUser(request, user);
    await use(user);
  },
  mailbox: async ({ request }, use) => {
    await use(new Mailbox(request));
  },
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  registerPage: async ({ page }, use) => {
    await use(new RegisterPage(page));
  },
  verifyEmailPage: async ({ page }, use) => {
    await use(new VerifyEmailPage(page));
  },
  forgotPasswordPage: async ({ page }, use) => {
    await use(new ForgotPasswordPage(page));
  },
  resetPasswordPage: async ({ page }, use) => {
    await use(new ResetPasswordPage(page));
  },
  accountPage: async ({ page }, use) => {
    await use(new AccountPage(page));
  },
  searchPage: async ({ page }, use) => {
    await use(new SearchPage(page));
  },
});

export const customerTest = test.extend<{ emptyCart: void }>({
  storageState: async ({ buyer }, use) => {
    await use(buyer.storageState);
  },
  emptyCart: [
    async ({ context }, use) => {
      await emptyServerCart(context.request);
      await use();
    },
    { auto: true },
  ],
});

export const checkoutTest = customerTest.extend<{ checkoutPage: CheckoutPage }>({
  checkoutPage: async ({ page, context }, use) => {
    await use(new CheckoutPage(page));
    await cancelOpenOrders(context.request);
  },
});

export const unverifiedTest = test.extend({
  storageState: async ({ unverifiedShopper }, use) => {
    await use(unverifiedShopper.storageState);
  },
});

export { expect };
