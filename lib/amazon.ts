const AMAZON_TAG = "refereeinsigh-20";

export function withAmazonTag(url: string) {
  if (!url) return url;
  return url.includes("tag=") ? url : `${url}${url.includes("?") ? "&" : "?"}tag=${AMAZON_TAG}`;
}
