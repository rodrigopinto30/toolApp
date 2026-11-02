import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

type Violation = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"][number];

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21aa"];
const BLOCKING_IMPACTS = ["serious", "critical"];
const MAX_NODES = 5;

function describeViolation({ id, impact, help, nodes }: Violation): string {
  const details = nodes.slice(0, MAX_NODES).map((node) => {
    const reason = node.any[0]?.message ?? node.failureSummary ?? "";
    return `${node.target.join(" ")}: ${reason}`;
  });
  return [`${impact} ${id}: ${help} (${nodes.length})`, ...details].join("\n  ");
}

export async function expectAccessible(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);

  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).exclude("nextjs-portal").analyze();
  const blocking = violations.filter(({ impact }) => BLOCKING_IMPACTS.includes(impact ?? ""));
  for (const violation of violations.filter((item) => !blocking.includes(item))) {
    console.log(`[axe] ${new URL(page.url()).pathname} ${describeViolation(violation)}`);
  }

  expect(blocking.map(describeViolation), page.url()).toEqual([]);
}
