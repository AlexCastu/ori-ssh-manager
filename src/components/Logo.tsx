interface LogoProps {
  className?: string;
  size?: number;
}

export function Logo({ className = '', size = 32 }: LogoProps) {
  return (
    <img
      src="/logo.png"
      alt="ORI-SSHManager"
      width={size}
      height={size}
      className={`rounded-lg ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
