import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function check(extraDirectory) {
  const root = mkdtempSync(join(tmpdir(), "vexa-dataflow-cache-"));
  try {
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "clients"));
    mkdirSync(join(root, "core/flows/src/known"), { recursive: true });
    if (extraDirectory) mkdirSync(join(root, "core/flows/src", extraDirectory));
    for (const name of ["gates.mjs", "arch-dsl.mjs"])
      copyFileSync(fileURLToPath(new URL(name, import.meta.url)), join(root, "scripts", name));
    writeFileSync(join(root, "architecture.calm.json"), JSON.stringify({
      nodes: [{ "unique-id": "known", "node-type": "module", name: "Known", metadata: [{ path: "core/flows/src/known" }] }],
      relationships: [], flows: [],
    }));
    execFileSync(process.execPath, ["scripts/arch-dsl.mjs", "--write"], { cwd: root, stdio: "pipe" });
    try {
      return { code: 0, output: execFileSync(process.execPath, ["scripts/gates.mjs", "dataflow"], { cwd: root, encoding: "utf8", stdio: "pipe" }) };
    } catch (error) {
      return { code: error.status, output: `${error.stdout}${error.stderr}` };
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
}
test("registered source module passes completeness", () => {
  const result = check();
  assert.equal(result.code, 0, result.output);
});
for (const directory of ["__pycache__", ".cache"]) {
  test(`generated directory ${directory} does not create an architecture module`, () => {
    const result = check(directory);
    assert.equal(result.code, 0, result.output);
  });
}
test("a real unregistered source module still fails completeness", () => {
  const result = check("unregistered_module");
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /completeness: 'core\/flows\/src\/unregistered_module'/);
});
