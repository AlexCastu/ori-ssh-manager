interface LogoProps {
  className?: string;
  size?: number;
}

export function Logo({ className = '', size = 32 }: LogoProps) {
  return (
    <img
      src="/logo.png"
      alt="SSH Manager"
      width={size}
      height={size}
      className={`rounded-lg ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
