import { expect, test } from "@playwright/test";

const apiBase = `http://127.0.0.1:${process.env.E2E_API_PORT ?? 3011}`;

test.describe("Comacoffe POS", () => {
  test.beforeEach(async ({ page, request }) => {
    const res = await request.post(`${apiBase}/api/v1/auth/login`, {
      data: { email: "cashier@demo.coffee", password: "demo1234" },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const token = body.data.token as string;
    const user = body.data.user;
    await page.addInitScript(
      ([t, u]) => {
        localStorage.setItem("comacoffe_auth_token", t);
        localStorage.setItem("comacoffe_auth_user", JSON.stringify(u));
      },
      [token, user] as const,
    );
  });

  test("cash sale and orders list", async ({ page, request }) => {
    const login = await request.post(`${apiBase}/api/v1/auth/login`, {
      data: { email: "cashier@demo.coffee", password: "demo1234" },
    });
    const loginBody = await login.json();
    const outletId = loginBody.data.user.outletId as string;
    const token = loginBody.data.token as string;
    const catalog = await request.get(
      `${apiBase}/api/v1/catalog/products?outletId=${outletId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const products = (await catalog.json()).data as unknown[];
    expect(products.length).toBeGreaterThan(0);

    await page.goto("/pos");
    const healthOk = await page.evaluate(async (api) => {
      const r = await fetch(`${api}/health`);
      return r.ok;
    }, apiBase);
    expect(healthOk).toBe(true);

    await expect(page.getByRole("heading", { name: "Keranjang" })).toBeVisible({ timeout: 15_000 });

    const product = page.locator(".product-tile").first();
    await expect(product).toBeVisible();
    await product.click();

    await page.getByRole("button", { name: "Bayar Tunai" }).click();
    await expect(page.getByText(/Transaksi POS-/)).toBeVisible({ timeout: 20_000 });

    await page.goto("/orders");
    await expect(page.getByRole("link", { name: "Struk" }).first()).toBeVisible();
  });

});
