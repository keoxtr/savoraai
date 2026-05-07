import { cp, mkdir, rm } from "node:fs/promises";

await rm("public", { recursive: true, force: true });
await mkdir("public", { recursive: true });

for (const path of ["index.html", "styles.css", "app.js", "assets"]) {
  await cp(path, `public/${path}`, { recursive: true });
}

console.log("Savora static files copied to public");
