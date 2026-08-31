// What the author wrote, and the only file a run of the tool scans here.
// dist/ holds what two real transforms made of it, and a profile's frames
// point INTO those: an `enum` cannot run under type stripping, so this file
// needs a transform to run at all, and transforming moves every line below
// the enum (BUGS TC-77). The interface and the type alias are erased
// entirely, which is what moves the lines up rather than down.
//
// dist/work.js and its .map: tsc --sourceMap --outDir dist --rootDir src
//   --target es2022 --module esnext src/work.ts
// dist/transform.js: stripTypeScriptTypes(this, { mode: 'transform',
//   sourceMap: true, sourceUrl: '../src/work.ts' }) — Node's own transform,
//   map inline. dist/unmapped.js is that output with the comment removed.
// Editing this file means regenerating all four.
export var Unit;
(function (Unit) {
    Unit[Unit["Cent"] = 1] = "Cent";
    Unit[Unit["Dollar"] = 100] = "Dollar";
})(Unit || (Unit = {}));
/**
 * Double the rows and keep the large ones.
 *
 * This doc comment is here because it is where the untranslated frame lands.
 * TC-77 was reported with V8 pointing at a line of somebody's prose.
 */
export function kernel(rows, unit) {
    return rows.map((r) => r * unit).filter((r) => r > 10);
}
//# sourceMappingURL=work.js.map