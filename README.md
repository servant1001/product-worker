# product-worker

`product-worker` 是一個部署在 Cloudflare Workers 上的專案，用來抓取 Campus 商品頁資料，並以 JSON API 的形式回傳。

## 專案用途

這個 Worker 目前提供以下 API 端點：

```txt
GET /api/campus-product?url=<商品頁網址>
```

它會請求指定的商品頁面，從 HTML 內容中解析出商品資訊，並回傳 JSON 結果。

目前回傳欄位包含：

- `name`：商品名稱
- `price`：原價
- `sellingPrice`：售價或特價
- `isbn`：ISBN
- `imageUrl`：商品圖片網址
- `website`：原始商品頁網址
- `source`：資料來源，目前為 `campus`

## 使用技術

- Cloudflare Workers
- Wrangler
- Vitest

## 專案結構

```txt
src/index.js         Worker 入口檔
test/index.spec.js   測試檔
wrangler.jsonc       Cloudflare Worker 設定檔
```

## 本機開發

安裝套件：

```bash
npm install
```

啟動本機開發伺服器：

```bash
npm run dev
```

## 部署

部署到 Cloudflare Workers：

```bash
npm run deploy
```

## API 使用範例

請求範例：

```txt
https://<your-worker>.workers.dev/api/campus-product?url=https://example.com/product-page
```

回傳範例：

```json
{
  "name": "Example Product",
  "price": 420,
  "sellingPrice": 399,
  "isbn": "9781234567890",
  "imageUrl": "https://example.com/product.jpg",
  "website": "https://example.com/product-page",
  "source": "campus"
}
```

## 注意事項

- 目前這個 Worker 只處理 `/api/campus-product` 路由。
- 商品資料解析依賴目標頁面的 HTML 結構，若網站版型變動，解析結果可能需要調整。
- 目前的測試檔仍是預設的 `Hello World` 範例，尚未更新成符合目前 API 功能的測試內容。
