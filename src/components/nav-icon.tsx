export type NavIconName = "home" | "film" | "kids" | "learn" | "folder";

type Props = {
  name: NavIconName;
  className?: string;
};

export function NavIcon({ name, className = "text-white/75" }: Props) {
  const cls = `block size-5 shrink-0 ${className}`;

  switch (name) {
    case "home":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width={20}
          height={20}
          fill="currentColor"
          className={cls}
          aria-hidden
        >
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5z" />
        </svg>
      );
    case "film":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width={20}
          height={20}
          fill="currentColor"
          className={cls}
          aria-hidden
        >
          <path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" />
        </svg>
      );
    case "kids":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width={20}
          height={20}
          fill="currentColor"
          className={cls}
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813a3.75 3.75 0 002.576-2.576l.813-2.846A.75.75 0 019 4.5zM18 1.5a.75.75 0 01.728.568l.258 1.036c.236.94 1.01 1.616 1.948 1.856l1.036.258a.75.75 0 010 1.456l-1.036.258c-.938.24-1.712.916-1.948 1.856l-.258 1.036a.75.75 0 01-1.456 0l-.258-1.036a2.625 2.625 0 00-1.948-1.856l-1.036-.258a.75.75 0 010-1.456l1.036-.258a2.625 2.625 0 001.948-1.856l.258-1.036A.75.75 0 0118 1.5z"
            clipRule="evenodd"
          />
        </svg>
      );
    case "learn":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width={20}
          height={20}
          fill="currentColor"
          className={cls}
          aria-hidden
        >
          <path d="M11.7 2.805a.75.75 0 01.6 0A60.65 60.65 0 0122.83 8.72a.75.75 0 01-.231 1.337 49.949 49.949 0 00-9.902 3.912l-.3.128a.75.75 0 01-.286 0 49.955 49.955 0 00-9.903-3.912.75.75 0 01-.231-1.337A60.653 60.653 0 0111.7 2.805z" />
          <path d="M13.5 10.5a.75.75 0 00-1.5 0v3.75a.75.75 0 001.5 0v-3.75zM11.25 15.75a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75h-.008a.75.75 0 01-.75-.75v-.008z" />
          <path d="M3 20.25a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5H4.5a.75.75 0 01-.75-.75zm16.5 0a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5H20.25a.75.75 0 01-.75-.75z" />
        </svg>
      );
    default:
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width={20}
          height={20}
          fill="currentColor"
          className={cls}
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M4.5 3.75a1.5 1.5 0 00-1.5 1.5v14.25a1.5 1.5 0 001.5 1.5h15a1.5 1.5 0 001.5-1.5V5.25a1.5 1.5 0 00-1.5-1.5h-15zM9 6.75a.75.75 0 01.75-.75h.75v3h-.75A.75.75 0 019 9.75v-3zm4.5 0A.75.75 0 0114.25 6h.75v3h-.75a.75.75 0 01-.75-.75v-3zm-4.5 6.75a.75.75 0 01.75-.75h.75v3h-.75A.75.75 0 019 16.5v-3zm4.5 0a.75.75 0 01.75-.75h.75v3h-.75a.75.75 0 01-.75-.75v-3z"
            clipRule="evenodd"
          />
        </svg>
      );
  }
}

export function categoryIcon(label: string, id: string): NavIconName {
  const key = `${label} ${id}`.toLowerCase();
  if (/(child|kid|family)/.test(key)) return "kids";
  if (/(develop|learn|tutorial|course|edu)/.test(key)) return "learn";
  if (/(action|movie|film|drama|horror|comedy|sci)/.test(key)) return "film";
  return "folder";
}
