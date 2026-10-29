import { CSRF_COOKIE, CSRF_HEADER } from "../../src/lib/api/cookies";
import { ACCESS_COOKIE } from "../../src/lib/session-cookies";
import { redirectedToLogin } from "../pages/login-page";
import { expect, test } from "../support/fixtures";
import { messages } from "../support/i18n";
import { BASE_URL } from "../support/stack";
import { newPassword } from "../support/users";

const t = messages.es;
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

test("a customer logs in, saves the profile twice and changes the password", async ({
  context,
  page,
  account,
  loginPage,
  accountPage,
}) => {
  await test.step("a wrong password is rejected", async () => {
    await loginPage.goto("//evil.example/phishing");
    await loginPage.login({ ...account, password: newPassword() });
    await expect(loginPage.alert).toHaveText(t.Errors.invalid_credentials);
  });

  await test.step("the login ignores an external next and opens the account", async () => {
    await loginPage.login(account);
    await expect(page).toHaveURL(`${BASE_URL}${accountPage.url}`);
    await expect(accountPage.heading).toHaveText(t.Account.title);
    await expect(accountPage.header.accountMenu).toHaveText(account.firstName);
  });

  await test.step("the session cookie is host-only, HttpOnly and lasts seven days", async () => {
    const cookie = (await context.cookies()).find(({ name }) => name === ACCESS_COOKIE);
    expect(cookie).toMatchObject({
      domain: new URL(BASE_URL).hostname,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    });
    expect((cookie?.expires ?? 0) - Date.now() / 1000).toBeGreaterThan(SEVEN_DAYS_SECONDS - 300);
  });

  await test.step("the profile can be saved twice in a row", async () => {
    await accountPage.fillProfile({ firstName: "Ana María" });
    const response = await accountPage.submitProfile();
    const csrf = (await context.cookies()).find(({ name }) => name === CSRF_COOKIE)?.value;
    expect(await response.request().headerValue(CSRF_HEADER)).toBe(csrf);
    await expect(accountPage.profileSaved).toBeVisible();
    await expect(accountPage.saveProfile).toBeDisabled();
    await expect(accountPage.header.accountMenu).toHaveText("Ana María");

    await accountPage.fillProfile({ lastName: "Prueba Dos", phone: "+54 11 5555-5555" });
    await expect(accountPage.profileSaved).toBeHidden();
    await expect(accountPage.saveProfile).toBeEnabled();
    await accountPage.submitProfile();
    await expect(accountPage.profileSaved).toBeVisible();

    await page.reload();
    await expect(accountPage.lastName).toHaveValue("Prueba Dos");
    await expect(accountPage.phone).toHaveValue("+54 11 5555-5555");
  });

  await test.step("a wrong current password is rejected on its field", async () => {
    await accountPage.changePassword(newPassword(), newPassword());
    await expect(accountPage.currentPassword).toHaveAccessibleDescription(t.Errors.invalid_current_password);
  });

  await test.step("the new password keeps this session open", async () => {
    await accountPage.changePassword(account.password, newPassword());
    await expect(accountPage.passwordChanged).toBeVisible();
    await page.reload();
    await expect(accountPage.heading).toHaveText(t.Account.title);
  });

  await test.step("the logout sends the account page back to the login", async () => {
    await accountPage.logout.click();
    await expect(page).toHaveURL(redirectedToLogin(accountPage.url));
    await expect(accountPage.header.loginLink).toBeVisible();
  });
});
