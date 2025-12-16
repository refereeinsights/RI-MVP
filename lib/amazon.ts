export const AMAZON_TAG = "refereeinsigh-20";

export function withAmazonTag(url: string) {
  if (!url) return url;
  return url.includes("tag=") ? url : `${url}${url.includes("?") ? "&" : "?"}tag=${AMAZON_TAG}`;
}

export function amazonImageUrl(asin: string, format = "_SL500_") {
  const params = new URLSearchParams({
    _encoding: "UTF8",
    ASIN: asin,
    Format: format,
    ID: "AsinImage",
    MarketPlace: "US",
    ServiceVersion: "20070822",
    WS: "1",
    tag: AMAZON_TAG,
    language: "en_US",
  });
  return `https://ws-na.amazon-adsystem.com/widgets/q?${params.toString()}`;
}
