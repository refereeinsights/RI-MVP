export const AMAZON_TAG = "refereeinsigh-20";

export function withAmazonTag(url: string) {
  if (!url) return url;
  return url.includes("tag=") ? url : `${url}${url.includes("?") ? "&" : "?"}tag=${AMAZON_TAG}`;
}

export function amazonImageUrl(asin: string, size: 150 | 300 | 500 = 300) {
  const cleanAsin = asin.replace(/[^A-Za-z0-9]/g, "");
  return `https://images-na.ssl-images-amazon.com/images/P/${cleanAsin}.01._SL${size}_.jpg`;
}
