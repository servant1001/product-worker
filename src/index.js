const PRODUCT_API_PATHS = new Set(["/api/campus-product", "/api/product"]);

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (!PRODUCT_API_PATHS.has(url.pathname)) {
      return json({ message: "Not Found" }, 404);
    }

    if (request.method === "OPTIONS") {
      return handleCors();
    }

    if (request.method !== "GET") {
      return json({ message: "Method Not Allowed" }, 405);
    }

    try {
      const productUrl = url.searchParams.get("url");

      if (!productUrl) {
        return json({ message: "Please provide a product url query parameter." }, 400);
      }

      const targetUrl = new URL(productUrl);
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if (!response.ok) {
        return json(
          { message: "Failed to fetch product page.", status: response.status },
          502
        );
      }

      const html = await response.text();
      const product = parseProductPage(targetUrl.href, html);

      if (!product) {
        return json({ message: "Unsupported product page format." }, 400);
      }

      return json(product);
    } catch (error) {
      return json(
        {
          message: "Failed to parse product page.",
          error: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  },
};

export function parseProductPage(productUrl, html) {
  const source = detectSource(productUrl);

  if (source === "campus") {
    return parseCampusProduct(productUrl, html);
  }

  if (source === "sheep100love") {
    return parseSheep100LoveProduct(productUrl, html);
  }

  return null;
}

export function detectSource(productUrl) {
  const hostname = new URL(productUrl).hostname.toLowerCase();

  if (hostname.includes("campus")) {
    return "campus";
  }

  if (hostname === "sheep100love.shopstore.tw") {
    return "sheep100love";
  }

  return "unknown";
}

function parseCampusProduct(productUrl, html) {
  const text = htmlToText(html);
  const metaTitle = getMetaContent(html, "og:title") || getTitleContent(html);
  const name = cleanCampusTitle(metaTitle) || getCampusNameFromText(text);
  const isbn = getMatch(text, /ISBN\D*([0-9Xx-]+)/i);
  const imageUrl = getProductImageUrl(html, productUrl);
  const { price, sellingPrice } = getCampusPrice(text, html);

  return {
    name,
    price,
    sellingPrice,
    isbn,
    imageUrl,
    website: productUrl,
    source: "campus",
    variants: [],
  };
}

function parseSheep100LoveProduct(productUrl, html) {
  const text = htmlToText(html);
  const title = getMetaContent(html, "og:title") || getTitleContent(html);
  const name = cleanSheepTitle(title);
  const imageUrl = getProductImageUrl(html, productUrl);
  const isbn = getMatch(text, /ISBN\D*([0-9Xx-]+)/i);
  const variantImageMap = parseSheepVariantImageMap(html);
  const variants = parseSheepVariants(
    html,
    productUrl,
    imageUrl,
    variantImageMap
  );
  const { price, sellingPrice } = getSheepBasePrice(html, variants);

  return {
    name,
    price,
    sellingPrice,
    isbn,
    imageUrl,
    website: productUrl,
    source: "sheep100love",
    variants
  };
}

function parseSheepVariantImageMap(html) {
  const map = new Map();

  const pattern =
    /{\s*id:\s*\d+,\s*name:\s*['"]([^'"]+)['"],[\s\S]*?spec_ids:\s*\[([\s\S]*?)\],[\s\S]*?slide_index:\s*\d+\s*,?\s*}/g;

  let match;
  while ((match = pattern.exec(html))) {
    const rawImagePath = (match[1] || "").trim();
    const specIdsBlock = match[2] || "";

    const specIds = [...specIdsBlock.matchAll(/['"](\d+)['"]/g)].map(
      (m) => m[1]
    );

    if (!specIds.length) continue;

    const imageUrl = toSheepProductImageUrl(rawImagePath);
    if (!imageUrl) continue;

    for (const specId of specIds) {
      if (!map.has(specId)) {
        map.set(specId, imageUrl);
      }
    }
  }

  return map;
}

function toSheepProductImageUrl(path) {
  const value = decodeHtml(String(path || ""))
    .replace(/\\\//g, "/")
    .trim();

  if (!value) return "";

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (value.startsWith("/")) {
    return `https://shopstore-image.pages.dev/upload${value}`;
  }

  return `https://shopstore-image.pages.dev/upload/${value}`;
}

function parseSheepVariants(
  html,
  productUrl,
  fallbackImageUrl,
  variantImageMap = new Map()
) {
  const specsBlock = getMatch(
    html,
    /var\s+specs\s*=\s*(\[[\s\S]*?\]);/i
  );

  if (!specsBlock) return [];

  const variants = [];

  const objectPattern =
    /{\s*id:\s*(\d+),[\s\S]*?sku:\s*"([^"]*)"|{\s*id:\s*(\d+),[\s\S]*?sku:\s*'([^']*)'/g;

  let match;

  while ((match = objectPattern.exec(specsBlock))) {
    const startIndex = match.index;
    const objectText = readJsObject(specsBlock, startIndex);

    if (!objectText) {
      objectPattern.lastIndex = startIndex + 1;
      continue;
    }

    const id = toNumber(
      getMatch(objectText, /id:\s*(\d+)/i)
    );

    const sku = getQuotedValue(objectText, "sku");
    const price = toNumber(
      getQuotedValue(objectText, "price")
    );

    const specialPrice = toNumber(
      getQuotedValue(objectText, "special_price")
    );

    const quantity = toNumber(
      getQuotedValue(objectText, "quantity")
    );

    const sizeName = getQuotedValue(
      objectText,
      "size_name"
    );

    const optionValues = getQuotedValue(
      objectText,
      "option_values"
    );

    // 先嘗試從規格物件本身取得圖片
    const directImageUrl = getSheepVariantImageUrl(
      objectText,
      productUrl,
      ""
    );

    // 再依照規格 ID，從圖片對照表取得圖片
    const mappedImageUrl =
      variantImageMap.get(String(id)) ||
      variantImageMap.get(id) ||
      "";

    // 規格圖片優先，沒有才使用商品主圖
    const imageUrl =
      directImageUrl ||
      mappedImageUrl ||
      fallbackImageUrl;

    variants.push({
      id,
      name: sizeName || optionValues || "",
      optionValues: optionValues || sizeName || "",
      sku,
      price,
      sellingPrice: specialPrice || price,
      stock: quantity,
      imageUrl,
    });

    objectPattern.lastIndex =
      startIndex + objectText.length;
  }

  return variants;
}

function getSheepVariantImageUrl(objectText, productUrl, fallbackImageUrl) {
  const directKeys = [
    "image",
    "image_url",
    "img",
    "img_url",
    "photo",
    "photo_url",
    "pic",
    "pic_url",
    "src",
  ];

  for (const key of directKeys) {
    const value = getQuotedValue(objectText, key);
    if (value) {
      return toAbsoluteUrl(value, productUrl);
    }
  }

  const uploadPath =
    getMatch(objectText, /(upload\/[^"'\\\s<>()]+(?:\.(?:jpe?g|png|webp))(?:\.webp)?)/i) ||
    getMatch(
      objectText,
      /(https?:\/\/[^"'\\\s<>()]+(?:\.(?:jpe?g|png|webp))(?:\.webp)?)/i
    );

  if (uploadPath) {
    return toAbsoluteUrl(uploadPath, productUrl);
  }

  return fallbackImageUrl;
}

function readJsObject(text, startIndex) {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let escaping = false;

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }

    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }

    if (inSingle || inDouble) {
      continue;
    }

    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;

    if (depth === 0) {
      return text.slice(startIndex, i + 1);
    }
  }

  return "";
}

function getQuotedValue(text, key) {
  return (
    getMatch(text, new RegExp(`${escapeRegExp(key)}:\\s*'([^']*)'`, "i")) ||
    getMatch(text, new RegExp(`${escapeRegExp(key)}:\\s*"([^"]*)"`, "i"))
  );
}

function getCampusPrice(text, html) {
  const sellingPrice =
    getNumberMatch(text, /售價\s*(?:NT\$?|NT)?\s*([\d,]+)/i) ||
    getNumberMatch(html, /售價[^0-9]{0,20}([\d,]+)/i);

  const price =
    getNumberMatch(text, /定價\s*(?:NT\$?|NT)?\s*([\d,]+)/i) ||
    getNumberMatch(html, /定價[^0-9]{0,20}([\d,]+)/i);

  if (sellingPrice || price) {
    return {
      price: price || sellingPrice || 0,
      sellingPrice: sellingPrice || price || 0,
    };
  }

  const ntPrices = [...text.matchAll(/NT\s*\$?\s*([\d,]+)/gi)].map((m) =>
    toNumber(m[1])
  );

  if (ntPrices.length >= 2) {
    return { sellingPrice: ntPrices[0], price: ntPrices[1] };
  }

  if (ntPrices.length === 1) {
    return { sellingPrice: ntPrices[0], price: ntPrices[0] };
  }

  return { sellingPrice: 0, price: 0 };
}

function getSheepBasePrice(html, variants) {
  const productViewPrice = getNumberMatch(
    html,
    /promoteViewContent\([^,]+,\s*'[^']+',\s*([\d,]+)\s*,\s*select_price/i
  );
  const firstVariant = variants[0];
  const sellingPrice =
    productViewPrice || firstVariant?.sellingPrice || firstVariant?.price || 0;
  const price = firstVariant?.price || sellingPrice || 0;

  return { price, sellingPrice };
}

function htmlToText(html) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, "\n")
      .replace(/\s+/g, " ")
  ).trim();
}

function getCampusNameFromText(text) {
  return (
    getMatch(text, /書名\s*[:：]?\s*(.+?)(?:ISBN|定價|售價)/i) ||
    getMatch(text, /商品名稱\s*[:：]?\s*(.+?)(?:ISBN|定價|售價)/i) ||
    ""
  ).trim();
}

function cleanCampusTitle(title) {
  return cleanTitleBySeparators(title, ["|"]);
}

function cleanSheepTitle(title) {
  const cleaned = cleanTitleBySeparators(title, ["|"]);
  return cleaned.replace(/^【🐑百羊書房】\s*/u, "").trim();
}

function cleanTitleBySeparators(title, suffixes) {
  let result = decodeHtml(title || "").trim();
  for (const suffix of suffixes) {
    if (result.includes(suffix)) {
      result = result.split(suffix)[0].trim();
    }
  }
  return result;
}

function getProductImageUrl(html, productUrl) {
  let imageUrl =
    getMetaContent(html, "og:image") ||
    getMetaContent(html, "twitter:image") ||
    "";

  if (!imageUrl) {
    const imgMatches = [...html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)];
    const productImage = imgMatches
      .map((match) => match[1])
      .find(
        (src) =>
          src &&
          !/logo|icon|banner/i.test(src) &&
          (/(product|upload|images)/i.test(src) ||
            /\.(jpg|jpeg|png|webp)(\?|$)/i.test(src))
      );
    imageUrl = productImage || "";
  }

  return toAbsoluteUrl(imageUrl, productUrl);
}

function getMetaContent(html, property) {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escapeRegExp(
        property
      )}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapeRegExp(
        property
      )}["'][^>]*>`,
      "i"
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeHtml(match[1]);
  }

  return "";
}

function getTitleContent(html) {
  return decodeHtml(getMatch(html, /<title>([^<]+)<\/title>/i));
}

function toAbsoluteUrl(value, baseUrl) {
  if (!value) return "";
  const decoded = decodeHtml(value).trim();
  if (/^https?:\/\//i.test(decoded)) return decoded;
  if (/^upload\//i.test(decoded)) {
    try {
      const base = new URL(baseUrl);
      return `${base.origin}/${decoded}`;
    } catch {
      return decoded;
    }
  }
  try {
    return new URL(decoded, baseUrl).href;
  } catch {
    return decoded;
  }
}

function decodeHtml(text) {
  return String(text || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function getMatch(text, regex) {
  const match = String(text || "").match(regex);
  return match ? match[1].trim() : "";
}

function getNumberMatch(text, regex) {
  return toNumber(getMatch(text, regex));
}

function toNumber(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

