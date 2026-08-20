import Image from "next/image";

type BrandLogoProps = {
  className?: string;
  tone?: "adaptive" | "dark-background" | "light-background";
};

export function BrandLogo({ className = "", tone = "adaptive" }: BrandLogoProps) {
  const classes = ["brandLogo", `brandLogo-${tone}`, className].filter(Boolean).join(" ");

  if (tone === "adaptive") {
    return (
      <span className={classes} aria-label="Corralio" role="img">
        <Image className="brandLogoLight" src="/brand/corralio-logo-horizontal.svg" alt="" width={300} height={56} priority />
        <Image className="brandLogoDark" src="/brand/corralio-logo-horizontal-dark.svg" alt="" width={300} height={56} priority />
      </span>
    );
  }

  return (
    <Image
      className={classes}
      src={tone === "dark-background" ? "/brand/corralio-logo-horizontal-dark.svg" : "/brand/corralio-logo-horizontal.svg"}
      alt="Corralio"
      width={300}
      height={56}
      priority
    />
  );
}
