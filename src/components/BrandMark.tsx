import brandIcon from "@/assets/brand-icon.png";

export function BrandMark({
  size = 20,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src={brandIcon}
      alt="Syncd"
      width={size}
      height={size}
      className={`rounded-full object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
