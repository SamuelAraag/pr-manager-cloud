// Minifica os arquivos .js do frontend in-place (uso no pipeline de deploy).
// Os HTML referenciam os módulos diretamente em src/, então a minificação
// in-place preserva todos os caminhos de import sem etapa de bundle.
//
// Uso: node scripts/minify-js.mjs [raiz]  (raiz padrão: diretório atual)

import { readFile, writeFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { minify } from "terser";

const root = process.argv[2] ?? process.cwd();

async function collectJsFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await collectJsFiles(fullPath)));
        } else if (entry.name.endsWith(".js")) {
            files.push(fullPath);
        }
    }
    return files;
}

const files = [join(root, "script-ping.js"), ...(await collectJsFiles(join(root, "src")))];

let totalBefore = 0;
let totalAfter = 0;

for (const file of files) {
    const source = await readFile(file, "utf8");
    const result = await minify(source, {
        module: relative(root, file).startsWith("src"),
        compress: true,
        mangle: true,
    });
    if (result.code == null) {
        throw new Error(`Falha ao minificar ${file}`);
    }
    await writeFile(file, result.code, "utf8");
    totalBefore += source.length;
    totalAfter += result.code.length;
    console.log(`${relative(root, file)}: ${source.length} -> ${result.code.length} bytes`);
}

const percent = ((1 - totalAfter / totalBefore) * 100).toFixed(1);
console.log(`Total: ${totalBefore} -> ${totalAfter} bytes (-${percent}%)`);
