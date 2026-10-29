import { AccountPage } from "../pages/account-page";
import { expect, test } from "../support/fixtures";
import { messages } from "../support/i18n";
import { BASE_URL, isDevStack } from "../support/stack";
import { newPassword, newUser } from "../support/users";

const t = messages.es;

test.skip(!isDevStack, "Mailpit only runs in the dev stack");

test("a visitor signs up and confirms the email", async ({ context, registerPage, verifyEmailPage, mailbox }) => {
  const user = newUser();

  await test.step("the form is validated in the browser", async () => {
    await registerPage.goto();
    await registerPage.submit.click();
    await expect(registerPage.firstName).toHaveAccessibleDescription(t.Validation.required);
    await registerPage.fill({ ...user, password: "short" });
    await registerPage.submit.click();
    await expect(registerPage.password).toHaveAccessibleDescription(
      `${t.Auth.register.passwordHint} ${t.Validation.passwordLength}`,
    );
  });

  await test.step("the account is created", async () => {
    await registerPage.register(user);
    await expect(registerPage.success).toBeVisible();
  });

  const link = await mailbox.link(user.email, verifyEmailPage.url);

  await test.step("the email link carries the token only in its fragment", async () => {
    const url = new URL(link);
    expect(url.origin).toBe(BASE_URL);
    expect(url.search).toBe("");
    expect(url.hash).toMatch(/^#token=[\w-]+$/);
  });

  await test.step("the link confirms the email and the token never reaches a URL", async () => {
    const token = new URL(link).hash.slice("#token=".length);
    const leaks: string[] = [];
    context.on("request", (request) => {
      if (request.url().includes(token)) {
        leaks.push(request.url());
      }
    });
    await verifyEmailPage.openLink(link);
    await expect(verifyEmailPage.success).toBeVisible();
    await expect(verifyEmailPage.page).toHaveURL(`${BASE_URL}${verifyEmailPage.url}`);
    expect(leaks).toEqual([]);
  });

  await test.step("a used link is rejected", async () => {
    await verifyEmailPage.openLink(link);
    await expect(verifyEmailPage.alert).toHaveText(t.Errors.invalid_token);
  });
});

test("a customer resets a forgotten password", async ({
  account,
  mailbox,
  loginPage,
  forgotPasswordPage,
  resetPasswordPage,
}) => {
  const password = newPassword();

  await test.step("the reset link is requested", async () => {
    await forgotPasswordPage.goto();
    await forgotPasswordPage.requestLink(account.email);
    await expect(forgotPasswordPage.success).toBeVisible();
  });

  const link = await mailbox.link(account.email, resetPasswordPage.url);

  await test.step("the link sets the new password", async () => {
    await resetPasswordPage.openLink(link);
    await resetPasswordPage.reset(password, newPassword());
    await expect(resetPasswordPage.confirm).toHaveAccessibleDescription(t.Validation.passwordMismatch);
    await resetPasswordPage.reset(password);
    await expect(resetPasswordPage.success).toBeVisible();
    await expect(resetPasswordPage.page).toHaveURL(`${BASE_URL}${resetPasswordPage.url}`);
  });

  await test.step("used and incomplete links are rejected", async () => {
    await resetPasswordPage.openLink(link);
    await resetPasswordPage.reset(newPassword());
    await expect(resetPasswordPage.alert).toHaveText(t.Errors.invalid_token);
    await resetPasswordPage.goto();
    await expect(resetPasswordPage.alert).toHaveText(t.Auth.reset.missingToken);
  });

  await test.step("the new password logs in and the safe next is followed", async () => {
    const englishAccount = new AccountPage(loginPage.page, "en");
    await loginPage.goto(englishAccount.url);
    await loginPage.login({ email: account.email, password });
    await expect(loginPage.page).toHaveURL(`${BASE_URL}${englishAccount.url}`);
    await expect(englishAccount.heading).toHaveText(messages.en.Account.title);
  });
});
