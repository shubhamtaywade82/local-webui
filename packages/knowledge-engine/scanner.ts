import fs from "fs";
import path from "path";

export interface DirectoryInfo {
  name: string;
  path: string;
  summary: string;
}

export function scanRepo(root: string): DirectoryInfo[] {
  const directories: DirectoryInfo[] = [];
  if (!fs.existsSync(root)) return directories;

  const dirs = fs.readdirSync(root);

  for (const dir of dirs) {
    const full = path.join(root, dir);
    if (!fs.statSync(full).isDirectory() || dir.startsWith(".")) continue;

    const indexPath = path.join(full, "index.md");
    const summary = fs.existsSync(indexPath)
      ? fs.readFileSync(indexPath, "utf8")
      : "";

    directories.push({
      name: dir,
      path: full,
      summary
    });
  }

  return directories;
}
