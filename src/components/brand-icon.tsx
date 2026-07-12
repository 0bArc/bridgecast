type Props = {
  className?: string;
};

export function BrandIcon({ className = "size-6 text-white" }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={24}
      height={24}
      fill="none"
      className={`block shrink-0 ${className}`}
      aria-hidden
    >
      <rect width="32" height="32" rx="8" fill="currentColor" fillOpacity="0.12" />
      <path
        d="M12 10.5v11l9-5.5-9-5.5z"
        fill="currentColor"
      />
      <path
        d="M22 11.5c1.2.7 1.2 2.3 0 3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M24.5 9c2.4 1.4 2.4 4.6 0 6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        opacity="0.65"
      />
    </svg>
  );
}
