import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { detectSource, parseProductPage } from "../src";

const sheepHtml = `
  <html>
    <head>
      <title>????叟足?ｇ?謆?頦朝?捍???????????謕?) | ????鞊ｇ?</title>
      <meta property="og:title" content="????叟足?ｇ?謆?頦朝?捍???????????謕?) | ????鞊ｇ?-?啾貔???? />
      <meta property="og:image" content="https://shopstore-image.pages.dev/upload/17189/product/example.jpeg" />
    </head>
    <body>
      <script>
        var specs = [
          {
            id: 3457436,
            sku: "",
            price: '49',
            special_price: "",
            quantity: '1',
            size_name: '05.?????',
            option_values: '05.?????',
            image_url: 'upload/17189/product/variant-05.jpeg',
            is_customer_price: false,
            buy_price: 49,
            pre_order: false
          },
          {
            id: 3457437,
            sku: "",
            price: '59',
            special_price: "",
            quantity: '10',
            size_name: '01.????謜?',
            option_values: '01.????謜?',
            is_customer_price: false,
            buy_price: 59,
            pre_order: false
          },
          {
            id: 3457438,
            sku: "",
            price: '59',
            special_price: "",
            quantity: '2',
            size_name: '02.?W??',
            option_values: '02.?W??',
            photo: 'https://shopstore-image.pages.dev/upload/17189/product/variant-02.jpeg',
            is_customer_price: false,
            buy_price: 59,
            pre_order: false
          }
        ];
        promoteViewContent('829284', '????叟足?ｇ?謆?頦朝?捍???????????謕?)', 49, select_price, option_values, '???');
      </script>
    </body>
  </html>
`;

const campusHtml = `
  <html>
    <head>
      <title>?拙??蝔?| ?∪??豢</title>
      <meta property="og:title" content="?拙??蝔?| ?∪??豢" />
      <meta property="og:image" content="/images/book.jpg" />
    </head>
    <body>
      <div>?詨?嚗?貊???</div>
      <div>ISBN嚗?789861234567</div>
      <div>?孵 NT 320 摰 NT 380</div>
    </body>
  </html>
`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("product source detection", () => {
  it("detects campus pages", () => {
    expect(detectSource("https://shop.campus.org.tw/product/123")).toBe("campus");
  });

  it("detects sheep100love pages", () => {
    expect(detectSource("https://sheep100love.shopstore.tw/item/Shopee69cf739300a20")).toBe(
      "sheep100love"
    );
  });
});

describe("product parsing", () => {
  it("parses Campus product fields", () => {
    expect(
      parseProductPage("https://shop.campus.org.tw/product/123", campusHtml)
    ).toMatchObject({
      price: 380,
      sellingPrice: 320,
      isbn: "789861234567",
      imageUrl: "https://shop.campus.org.tw/images/book.jpg",
      website: "https://shop.campus.org.tw/product/123",
      source: "campus",
      variants: [],
    });
  });

  it("parses Sheep100Love product fields and variants", () => {
    const product = parseProductPage(
      "https://sheep100love.shopstore.tw/item/Shopee69cf739300a20",
      sheepHtml
    );

    expect(product).toMatchObject({
      price: 49,
      sellingPrice: 49,
      isbn: "",
      imageUrl: "https://shopstore-image.pages.dev/upload/17189/product/example.jpeg",
      website: "https://sheep100love.shopstore.tw/item/Shopee69cf739300a20",
      source: "sheep100love",
    });

    expect(product.variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 3457436,
          price: 49,
          stock: 1,
          imageUrl: "https://sheep100love.shopstore.tw/upload/17189/product/variant-05.jpeg",
        }),
        expect.objectContaining({
          id: 3457437,
          price: 59,
          stock: 10,
          imageUrl: "https://shopstore-image.pages.dev/upload/17189/product/example.jpeg",
        }),
        expect.objectContaining({
          id: 3457438,
          price: 59,
          stock: 2,
          imageUrl: "https://shopstore-image.pages.dev/upload/17189/product/variant-02.jpeg",
        }),
      ])
    );
    expect(product.variants).toHaveLength(3);
  });
});

describe("worker API", () => {
  it("returns parsed sheep100love data from the API route", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(sheepHtml, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );

    const request = new Request(
      "https://worker.example/api/campus-product?url=https://sheep100love.shopstore.tw/item/Shopee69cf739300a20"
    );
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);

    await waitOnExecutionContext(ctx);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload).toMatchObject({
      price: 49,
      sellingPrice: 49,
      source: "sheep100love",
    });
    expect(payload.variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 3457436,
          price: 49,
          imageUrl: "https://sheep100love.shopstore.tw/upload/17189/product/variant-05.jpeg",
        }),
        expect.objectContaining({
          id: 3457437,
          price: 59,
          imageUrl: "https://shopstore-image.pages.dev/upload/17189/product/example.jpeg",
        }),
        expect.objectContaining({
          id: 3457438,
          price: 59,
          imageUrl: "https://shopstore-image.pages.dev/upload/17189/product/variant-02.jpeg",
        }),
      ])
    );
  });

  it("returns 400 when url is missing", async () => {
    const request = new Request("https://worker.example/api/campus-product");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);

    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(400);
  });
});


