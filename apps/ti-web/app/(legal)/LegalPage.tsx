import Link from "next/link";
import styles from "./LegalPage.module.css";

type LegalPageProps = {
  title: string;
  lastUpdated: string;
  markdown: string;
};

type Block =
  | { type: "h2"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] };

function parseMarkdown(markdown: string): Block[] {
  const lines = markdown.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
      continue;
    }

    if (line.startsWith("## ")) {
      blocks.push({ type: "h2", text: line.slice(3).trim() });
      i += 1;
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("- ")) {
        items.push(lines[i].trim().slice(2).trim());
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("## ") &&
      !lines[i].trim().startsWith("- ")
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: "p", text: paragraph.join(" ") });
  }

  return blocks;
}

export default function LegalPage({ title, lastUpdated, markdown }: LegalPageProps) {
  const blocks = parseMarkdown(markdown);

  return (
    <main className={styles.wrap}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.updated}>Last updated: {lastUpdated}</p>

      {blocks.map((block, idx) => {
        if (block.type === "h2") {
          return (
            <h2 className={styles.sectionTitle} key={`h2-${idx}`}>
              {block.text}
            </h2>
          );
        }
        if (block.type === "ul") {
          return (
            <ul className={styles.list} key={`ul-${idx}`}>
              {block.items.map((item, itemIdx) => (
                <li key={`li-${idx}-${itemIdx}`}>{item}</li>
              ))}
            </ul>
          );
        }
        return (
          <p className={styles.paragraph} key={`p-${idx}`}>
            {block.text}
          </p>
        );
      })}

      <nav className={styles.footerLinks} aria-label="Legal pages">
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/disclaimer">Disclaimer</Link>
      </nav>
    </main>
  );
}
