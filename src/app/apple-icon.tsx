import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          borderRadius: 36,
        }}
      >
        <svg
          width="120"
          height="120"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M12 10.5v11l9-5.5-9-5.5z" fill="#ffffff" />
          <path
            d="M22 11.5c1.2.7 1.2 2.3 0 3"
            stroke="#ffffff"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <path
            d="M24.5 9c2.4 1.4 2.4 4.6 0 6"
            stroke="#ffffff"
            strokeWidth="1.75"
            strokeLinecap="round"
            opacity="0.65"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
