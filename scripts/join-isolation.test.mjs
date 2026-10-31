import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const checker = fileURLToPath(new URL("../core/meetings/modules/join/scripts/check-isolation.js", import.meta.url));
function check(specifier, dependencies = {}) {
  const root = mkdtempSync(join(tmpdir(), "vexa-join-isolation-"));
  try {
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "src"));
    copyFileSync(checker, join(root, "scripts/check-isolation.js"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies }));
    writeFileSync(join(root, "src/fixture.ts"), `import value from "${specifier}";\n`);
    try {
      return { code: 0, output: execFileSync(process.execPath, [join(root, "scripts/check-isolation.js")], { encoding: "utf8", stdio: "pipe" }) };
    } catch (error) {
      return { code: error.status, output: `${error.stdout}${error.stderr}` };
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
}

for (const specifier of ["node:assert/strict", "node:fs/promises", "assert", "fs/promises"]) {
  test(`accepts Node builtin ${specifier}`, () => {
    const result = check(specifier);
    assert.equal(result.code, 0, result.output);
  });
}
for (const specifier of ["node:not-a-builtin", "undeclared-package", "../outside"]) {
  test(`rejects unallowed import ${specifier}`, () => {
    const result = check(specifier);
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /ISOLATION BROKEN/);
  });
}
test("accepts a declared package subpath", () => {
  const result = check("declared-package/subpath", { "declared-package": "1.0.0" });
  assert.equal(result.code, 0, result.output);
});
