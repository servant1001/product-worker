export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname !== "/api/campus-product") {
      return json({ message: "Not Found" }, 404);
    }

    if (request.method === "OPTIONS") {
      return handleCors();
    }

    try {
      const productUrl = url.searchParams.get("url");

      if (!productUrl) {
        return json({ message: "請提供校園書房商品網址" }, 400);
      }

      const response = await fetch(productUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "text/html",
        },
      });

      const html = await response.text();
      const text = htmlToText(html);

      const name = getProductName(text);
      const isbn = getMatch(text, /ISBN：\s*([0-9Xx-]+)/);
      const imageUrl = getProductImageUrl(html, productUrl);

      let specialPrice = 0;
      let price = 0;

      const priceMatch = text.match(/特價\s*NT\s*([0-9]+)\s*([0-9]+)/);
      if (priceMatch) {
        specialPrice = Number(priceMatch[1] || 0);
        price = Number(priceMatch[2] || 0);
      }

      return json({
        name,
        price,
        sellingPrice: specialPrice,
        isbn,
        imageUrl,
        website: productUrl,
        source: "campus",
      });
    } catch (error) {
      return json({
        message: "抓取失敗",
        error: error.message,
      }, 500);
    }
  },
};

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

function getProductName(text) {
  const match = text.match(/商品詳細資料\s+(.+?)\s+作者：/);

  if (!match) return "";

  return match[1]
    .replace(/紙本書\s+電子書\s+/g, "")
    .replace(/^試讀\s*/g, "")
    .trim();
}

function getProductImageUrl(html, productUrl) {
  let imageUrl =
    getMetaContent(html, "og:image") ||
    getMetaContent(html, "twitter:image") ||
    "";

  if (!imageUrl) {
    const imgMatches = [...html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)];

    const productImage = imgMatches
      .map((m) => m[1])
      .find((src) =>
        src &&
        !src.includes("logo") &&
        !src.includes("icon") &&
        !src.includes("banner") &&
        (
          src.includes("Product") ||
          src.includes("product") ||
          src.includes("Upload") ||
          src.includes("upload") ||
          src.includes("Images") ||
          src.includes("images") ||
          src.match(/\.(jpg|jpeg|png|webp)(\?|$)/i)
        )
      );

    imageUrl = productImage || "";
  }

  return toAbsoluteUrl(imageUrl, productUrl);
}

function getMetaContent(html, property) {
  const regex = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );

  const match = html.match(regex);
  return match ? decodeHtml(match[1]) : "";
}

function toAbsoluteUrl(imageUrl, baseUrl) {
  if (!imageUrl) return "";

  const decodedUrl = decodeHtml(imageUrl).trim();

  if (decodedUrl.startsWith("http://") || decodedUrl.startsWith("https://")) {
    return decodedUrl;
  }

  try {
    return new URL(decodedUrl, baseUrl).href;
  } catch {
    return decodedUrl;
  }
}

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, `"`)
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function getMatch(text, regex) {
  const match = text.match(regex);
  return match ? match[1].trim() : "";
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function handleCors() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}