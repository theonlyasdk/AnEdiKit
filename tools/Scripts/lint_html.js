import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.resolve(__dirname, "../..");
const { default: linthtml } = await import("@linthtml/linthtml");


const configPath = path.join(ROOT, ".linthtmlrc.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

async function lintContent(content, filename) {
  const issues = await linthtml(content, config.rules);
  return issues.map((issue) => ({
    file: filename,
    line: issue.line,
    column: issue.column,
    rule: issue.rule,
    data: issue.data,
    msg: linthtml.messages?.renderIssue ? linthtml.messages.renderIssue(issue) : issue.rule
  }));
}

async function run() {
  let allIssues = [];

  // 1. Lint assembled index.html
  const indexPath = path.join(ROOT, "src", "index.html");
  if (fs.existsSync(indexPath)) {
    const content = fs.readFileSync(indexPath, "utf8");
    const issues = await lintContent(content, "src/index.html");
    allIssues.push(...issues);
  }

  // 2. Lint standalone views partials
  const viewsDir = path.join(ROOT, "src", "partials", "views");
  if (fs.existsSync(viewsDir)) {
    const files = fs.readdirSync(viewsDir).filter((f) => f.endsWith(".html"));
    for (const f of files) {
      const p = path.join(viewsDir, f);
      const content = fs.readFileSync(p, "utf8");
      const issues = await lintContent(content, path.relative(ROOT, p));
      allIssues.push(...issues);
    }
  }

  // 3. Lint standalone partials (sidebar, modals)
  for (const part of ["20_sidebar.html", "50_modals.html"]) {
    const p = path.join(ROOT, "src", "partials", part);
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, "utf8");
      const issues = await lintContent(content, path.relative(ROOT, p));
      allIssues.push(...issues);
    }
  }

  if (allIssues.length > 0) {
    console.error(`\n❌ Linthtml found ${allIssues.length} issue(s):\n`);
    for (const issue of allIssues) {
      console.error(`  ${issue.file}:${issue.line}:${issue.column} - [${issue.rule}] ${issue.msg || ""}`);
    }
    process.exit(1);
  } else {
    console.log("✔ Linthtml passed: all HTML files and partials are valid!");
  }
}

run().catch((err) => {
  console.error("Error running Linthtml:", err);
  process.exit(1);
});
