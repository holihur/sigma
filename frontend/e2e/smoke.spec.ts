import { expect, test } from "@playwright/test";

test("critical path: login, create, open, add page, reload", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/login");
  await page.getByRole("button", { name: /Explore the demo workspace/i }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(/Recent designs|最近设计/i).first()).toBeVisible();

  await page.getByRole("button", { name: /New design|新建设计/i }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: /^Create design$/i }).click();

  await expect(page).toHaveURL(/\/file\//);
  await expect(page.getByRole("button", { name: /Present|演示/i })).toBeVisible({ timeout: 30_000 });

  await page.getByTitle(/Add page|添加页面/i).click();
  await expect(page.getByText(/Page 2|页面 2/i).first()).toBeVisible();

  // Give autosave a moment, then reload the editor and ensure the document still
  // opens without a runtime page error.
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.getByRole("button", { name: /Present|演示/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Page 2|页面 2/i).first()).toBeVisible();

  expect(pageErrors, `runtime page errors:\n${pageErrors.join("\n")}`).toEqual([]);
});
