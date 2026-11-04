import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

// Conservative pre-publication review: flags unexpected real email addresses
// and non-loopback IPv4 addresses without printing their actual values.
// This is NOT a substitute for independent secret scanning or manual review.
const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0").filter(Boolean);
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json",
  ".md", ".mdx", ".yaml", ".yml", ".sql", ".prisma", ".toml",
  ".css", ".html", ".svg", ".sh", ".ps1", ".txt", ".example"]);
const emailRe = /[A-Z0-9._%+-]+@(?:[A-Z0-9-]+\.)+[A-Z]{2,}/gi;
const ipRe = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const likelyTokenRe = /(?:gh[pousr]_|github_pat_|sk_live_|AKIA[0-9A-Z]{8,}|ASIA[0-9A-Z]{8,})[A-Za-z0-9_\-]{10,}/g;
const ignoreDomains = new Set(["example.com", "example.org", "example.net", "example.invalid"]);
const flags = [];
let scanned = 0;
for (const file of tracked) {
  if (file === "package-lock.json" || file.endsWith("scripts/audit-public-content.mjs") || file.endsWith("scripts/privacy-file-review.mjs")) continue;
  if (!extensions.has(path.extname(file)) && !file.endsWith(".env.example")) continue;
  const stat = fs.statSync(file);
  if (stat.size > 2_000_000) { flags.push({file, line:0, category:"large text file, review manually"}); continue; }
  const content = fs.readFileSync(file, "utf8");
  scanned++;
  const lines = content.split(/\r?\n/);
  for (let i=0;i<lines.length;i++) {
    const line = lines[i];
    for (const m of line.matchAll(emailRe)) {
      const domain = m[0].split("@").at(-1).toLowerCase();
      if (!ignoreDomains.has(domain) && !domain.endsWith(".invalid") && !domain.endsWith(".test")) flags.push({file, line:i+1, category:"email address for manual review"});
    }
    for (const m of line.matchAll(ipRe)) {
      const ip = m[0];
      // SVG path coordinates resemble IPv4 addresses; test-only DNS IP 9.9.9.9 is intentional.
      if (file.endsWith(".svg") || (file === "tests/unit/get-client-ip.test.ts" && ip === "9.9.9.9")) continue;
      if (ip !== "127.0.0.1" && ip !== "0.0.0.0" && !ip.startsWith("192.0.2.") &&
          !ip.startsWith("198.51.100.") && !ip.startsWith("203.0.113.")) {
        flags.push({file, line:i+1, category:"IPv4 address for manual review"});
      }
    }
    if (likelyTokenRe.test(line)) flags.push({file, line:i+1, category:"possible token"});
    likelyTokenRe.lastIndex=0;
  }
}
const unique = [...new Map(flags.map(f=>[f.file+":"+f.line+":"+f.category,f])).values()];
console.log("Scanned",scanned,"tracked text files for contact data, IPs and token patterns.");
if (unique.length) {
  console.error("Manual-review findings (values redacted):",JSON.stringify(unique.slice(0,120)));
  console.error("Total flagged locations:",unique.length);
  process.exitCode=1;
} else {
  console.log("No matches for the selected privacy patterns. Independent review is still required.");
}
