// Shared brand icon: /logo.svg, /icon.svg and the favicon are one symbol.
// This component remains a semantic link; no navigation behavior changes.
import Image from "next/image";
import Link from "next/link";

export interface WordmarkProps {
  href?: string;
  className?: string;
}

export function Wordmark({ href = "/", className }: WordmarkProps) {
  return (
    <Link href={href} className={`wordmark${className ? ` ${className}` : ""}`} aria-label="TerraResponse AI home">
      <Image
        src="/logo.svg"
        alt=""
        className="wordmark__mark"
        width={28}
        height={28}
        priority
        unoptimized
      />
      <span className="wordmark__name">TerraResponse <span className="wordmark__ai">AI</span></span>
    </Link>
  );
}
